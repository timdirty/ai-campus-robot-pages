// Resilient serial-port helper for the App 2 service-robot bridge.
// - 自動偵測 Arduino-like 串口（R4 WiFi / Minima 都能配對）
// - 拔掉 USB / Arduino 重啟後會自動重連（exponential backoff）
// - Port busy 會嘗試清掉佔用者再重試一次
// - 對外暴露 health telemetry 給 /api/health 用

import {execSync} from 'node:child_process';
import {SerialPort} from 'serialport';
import {ReadlineParser} from '@serialport/parser-readline';

export interface PortInfo {
  path: string;
  manufacturer?: string;
  pnpId?: string;
  friendlyName?: string;
  vendorId?: string;
  productId?: string;
}

export interface BridgeTelemetry {
  connected: boolean;
  activePath: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastError: string | null;
  reconnectAttempts: number;
}

const baudRate = 115200;
const requestedPath = process.env.ARDUINO_PORT?.trim() || undefined;

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

let activePort: SerialPort | null = null;
let activePath: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
let isOpening = false;
let cleanupAttempted = false;
const pendingReads: Array<(line: string) => void> = [];

const telemetry: BridgeTelemetry = {
  connected: false,
  activePath: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  reconnectAttempts: 0,
};

type ConnectionChangeHandler = (connected: boolean, path: string | null) => void;
const connectionHandlers: ConnectionChangeHandler[] = [];

export function onConnectionChange(handler: ConnectionChangeHandler): void {
  connectionHandlers.push(handler);
}

function notifyConnectionChange(connected: boolean, path: string | null): void {
  for (const h of connectionHandlers) {
    try { h(connected, path); } catch { /* ignore */ }
  }
}

export async function listPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list();
  return ports.map((port) => ({
    path: port.path,
    manufacturer: port.manufacturer,
    pnpId: port.pnpId,
    friendlyName: port.friendlyName,
    vendorId: port.vendorId,
    productId: port.productId,
  }));
}

export function isArduinoLikePort(port: PortInfo) {
  const text = `${port.path} ${port.manufacturer ?? ''} ${port.friendlyName ?? ''} ${port.pnpId ?? ''}`.toLowerCase();
  const vendorId = port.vendorId?.toLowerCase();
  const pnpId = port.pnpId?.toLowerCase() ?? '';
  const isUsbDevice = Boolean(vendorId) || pnpId.startsWith('usb\\');
  const knownArduinoUsbVendor = vendorId && ['2341', '2a03', '1a86', '10c4', '0403', '239a'].includes(vendorId);
  return (
    text.includes('arduino') ||
    text.includes('usbmodem') ||
    text.includes('uno') ||
    Boolean(knownArduinoUsbVendor) ||
    (isUsbDevice && text.includes('usb serial')) ||
    (isUsbDevice && text.includes('usb 序列'))
  );
}

async function pickPortPath(): Promise<string | null> {
  if (requestedPath) return requestedPath;
  const ports = await listPorts();
  const match = ports.find(isArduinoLikePort);
  return match?.path ?? null;
}

export function getActivePath(): string | null {
  return activePath;
}

export function isConnected(): boolean {
  return Boolean(activePort?.isOpen);
}

export function getTelemetry(): BridgeTelemetry {
  return {...telemetry, connected: isConnected(), activePath};
}

function scheduleReconnect(reason: string) {
  if (activePort?.isOpen) return;
  if (reconnectTimer) return;
  telemetry.reconnectAttempts += 1;
  telemetry.lastError = reason;
  console.log(`[bridge] reconnect in ${reconnectDelay}ms (${reason})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void tryAutoOpen();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function attachListeners(port: SerialPort, parser: ReadlineParser) {
  parser.on('data', (raw: string) => {
    const line = raw.toString().trim();
    if (!line) return;
    process.stdout.write(`[arduino] ${line}\n`);
    const waiters = pendingReads.splice(0);
    for (const resolve of waiters) resolve(line);
  });
  port.on('close', () => {
    if (activePort === port) {
      activePort = null;
      activePath = null;
      telemetry.connected = false;
      telemetry.activePath = null;
      telemetry.lastDisconnectedAt = new Date().toISOString();
      console.log('[bridge] arduino disconnected');
      notifyConnectionChange(false, null);
      scheduleReconnect('port closed');
    }
  });
  port.on('error', (error) => {
    console.error(`[arduino] port error: ${error.message}`);
    telemetry.lastError = error.message;
    if (activePort === port) {
      try {
        port.close(() => {});
      } catch {
        // ignore — close handler will fire scheduleReconnect
      }
    }
  });
}

function waitForNextLine(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = pendingReads.indexOf(done);
      if (idx !== -1) pendingReads.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    const done = (line: string) => {
      clearTimeout(timer);
      resolve(line);
    };
    pendingReads.push(done);
  });
}

function killPortHolders(portPath: string): boolean {
  try {
    const pids = execSync(`lsof -ti "${portPath}" 2>/dev/null`, {encoding: 'utf8'}).trim();
    if (!pids) return false;
    execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null || true`);
    console.log(`[bridge] cleared stale holder(s) on ${portPath}: ${pids.replace(/\n/g, ' ')}`);
    return true;
  } catch {
    return false;
  }
}

async function openPortOnce(portPath: string): Promise<SerialPort> {
  const port = new SerialPort({path: portPath, baudRate, autoOpen: false});
  await new Promise<void>((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
  const parser = port.pipe(new ReadlineParser({delimiter: '\n'}));
  attachListeners(port, parser);
  return port;
}

async function openPort(): Promise<SerialPort | null> {
  if (activePort?.isOpen) return activePort;
  if (isOpening) return null;
  isOpening = true;
  try {
    const portPath = await pickPortPath();
    if (!portPath) {
      telemetry.lastError = 'no Arduino-like serial port found';
      scheduleReconnect('no port detected');
      return null;
    }
    try {
      const port = await openPortOnce(portPath);
      activePort = port;
      activePath = portPath;
      telemetry.connected = true;
      telemetry.activePath = portPath;
      telemetry.lastConnectedAt = new Date().toISOString();
      telemetry.lastError = null;
      reconnectDelay = RECONNECT_MIN_MS;
      cleanupAttempted = false;
      console.log(`[bridge] connected to ${portPath}`);
      notifyConnectionChange(true, activePath);
      return port;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      telemetry.lastError = message;
      // Resource busy / device in use: try kill holder once then retry
      if (!cleanupAttempted && /resource busy|cannot lock|in use/i.test(message)) {
        cleanupAttempted = true;
        if (killPortHolders(portPath)) {
          try {
            const port = await openPortOnce(portPath);
            activePort = port;
            activePath = portPath;
            telemetry.connected = true;
            telemetry.activePath = portPath;
            telemetry.lastConnectedAt = new Date().toISOString();
            telemetry.lastError = null;
            reconnectDelay = RECONNECT_MIN_MS;
            console.log(`[bridge] connected after cleanup to ${portPath}`);
            notifyConnectionChange(true, activePath);
            return port;
          } catch (retryError) {
            telemetry.lastError = retryError instanceof Error ? retryError.message : String(retryError);
          }
        }
      }
      console.error(`[bridge] open failed: ${message}`);
      scheduleReconnect(message);
      return null;
    }
  } finally {
    isOpening = false;
  }
}

export async function sendCommand(command: string): Promise<{ok: boolean; message: string}> {
  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    return {ok: true, message: `[SIM] ${command}`};
  }
  try {
    const port = await openPort();
    if (!port) {
      return {ok: false, message: telemetry.lastError ?? 'No Arduino available. Plug in the UNO R4 (WiFi or Minima) or set ARDUINO_PORT.'};
    }
    await new Promise<void>((resolve, reject) => {
      port.write(`${command}\n`, (error) => (error ? reject(error) : resolve()));
    });
    return {ok: true, message: `Sent ${command}`};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.lastError = message;
    return {ok: false, message};
  }
}

export async function queryCommand(command: string, timeoutMs = 1200): Promise<{ok: boolean; message: string; response: string | null}> {
  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    return {ok: true, message: `[SIM] ${command}`, response: `SIM:${command}`};
  }
  try {
    const port = await openPort();
    if (!port) {
      return {
        ok: false,
        message: telemetry.lastError ?? 'No Arduino available. Plug in the UNO R4 (WiFi or Minima) or set ARDUINO_PORT.',
        response: null,
      };
    }
    const responsePromise = waitForNextLine(timeoutMs);
    await new Promise<void>((resolve, reject) => {
      port.write(`${command}\n`, (error) => (error ? reject(error) : resolve()));
    });
    const response = await responsePromise;
    return {
      ok: response !== null,
      message: response === null ? `No serial response for ${command}` : `Received ${response}`,
      response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    telemetry.lastError = message;
    return {ok: false, message, response: null};
  }
}

export async function tryAutoOpen(): Promise<boolean> {
  const port = await openPort();
  return Boolean(port?.isOpen);
}
