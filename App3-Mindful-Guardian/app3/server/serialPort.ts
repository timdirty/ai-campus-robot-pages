// Resilient serial-port helper for the App 3 guardian bridge.
// - 自動偵測 Arduino-like 串口（R4 WiFi / Minima 都能配對）
// - 拔掉 USB / Arduino 重啟後會自動重連（exponential backoff）
// - Port busy 會嘗試清掉佔用者再重試一次
// - 解析 SENSORS:... 行給 zone 資料用
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

export interface SensorSnapshot {
  temp: number | null;
  hum: number | null;
  light: number | null;
  receivedAt: string;
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
const maxSensorPorts = Math.max(1, Number(process.env.SENSOR_PORT_LIMIT ?? 3) || 3);

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

let activePort: SerialPort | null = null;
let activePath: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
let isOpening = false;
let cleanupAttempted = false;
let pendingSensorResolvers: Array<(value: SensorSnapshot) => void> = [];
let lastSensorSnapshot: SensorSnapshot | null = null;

const sensorPorts = new Map<string, SerialPort>();
const sensorSnapshots = new Map<string, SensorSnapshot>();
const pendingSensorResolversByPath = new Map<string, Array<(value: SensorSnapshot) => void>>();
let drivePort: SerialPort | null = null;
let drivePortPath: string | null = process.env.DRIVE_ARDUINO_PORT?.trim() || null;

type ConnectionChangeHandler = (connected: boolean, path: string | null) => void;
const connectionHandlers: ConnectionChangeHandler[] = [];

export function onConnectionChange(handler: ConnectionChangeHandler): void {
  connectionHandlers.push(handler);
}

function notifyConnectionChange(connected: boolean, path: string | null): void {
  for (const handler of connectionHandlers) {
    try { handler(connected, path); } catch { /* ignore */ }
  }
}

const telemetry: BridgeTelemetry = {
  connected: false,
  activePath: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  reconnectAttempts: 0,
};

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

function cleanIdentifier(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getPortDeviceKey(port: PortInfo): string {
  const pnpId = cleanIdentifier(port.pnpId);
  if (pnpId) return `pnp:${pnpId}`;

  const vendorId = cleanIdentifier(port.vendorId);
  const productId = cleanIdentifier(port.productId);
  const manufacturer = cleanIdentifier(port.manufacturer);
  const friendlyName = cleanIdentifier(port.friendlyName);
  const hardwareParts = [vendorId && `vid:${vendorId}`, productId && `pid:${productId}`, manufacturer, friendlyName].filter(Boolean);
  if (hardwareParts.length >= 2) return `usb:${hardwareParts.join('|')}`;

  return `path:${cleanIdentifier(port.path)}`;
}

export async function resolvePortPathByIdentity(
  assignment: {portPath?: string | null; deviceKey?: string | null},
  role: 'sensor' | 'drive' = 'sensor',
): Promise<string | null> {
  const ports = role === 'drive' ? await listDrivePorts() : await listSensorPorts();
  const requestedPortPath = assignment.portPath?.trim();
  if (requestedPortPath && ports.some((port) => port.path === requestedPortPath)) return requestedPortPath;

  const requestedDeviceKey = assignment.deviceKey?.trim();
  if (requestedDeviceKey) {
    const match = ports.find((port) => getPortDeviceKey(port) === requestedDeviceKey);
    if (match) return match.path;
  }

  return null;
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

export async function listSensorPorts(): Promise<PortInfo[]> {
  const ports = await listPorts();
  return ports.filter((port) => isArduinoLikePort(port) && port.path !== drivePortPath).slice(0, maxSensorPorts);
}

export async function listDrivePorts(): Promise<PortInfo[]> {
  const ports = await listPorts();
  return ports.filter(isArduinoLikePort);
}

async function pickPortPath(): Promise<string | null> {
  if (requestedPath) return requestedPath;
  const ports = await listSensorPorts();
  const match = ports[0];
  return match?.path ?? null;
}

export function getActivePath(): string | null {
  return activePath;
}

export function isConnected(): boolean {
  return Boolean(activePort?.isOpen);
}

export function getLastSensorSnapshot(): SensorSnapshot | null {
  return lastSensorSnapshot;
}

export function getSensorSnapshot(portPath: string): SensorSnapshot | null {
  if (portPath === activePath) return lastSensorSnapshot;
  return sensorSnapshots.get(portPath) ?? null;
}

export function isSensorPortConnected(portPath: string): boolean {
  if (portPath === activePath) return isConnected();
  return Boolean(sensorPorts.get(portPath)?.isOpen);
}

export function getDrivePortPath(): string | null {
  return drivePortPath;
}

export function isDrivePortConnected(): boolean {
  return Boolean(drivePort?.isOpen);
}

export function getTelemetry(): BridgeTelemetry {
  return {...telemetry, connected: isConnected(), activePath};
}

function parseSensorLine(line: string): SensorSnapshot | null {
  if (!line.startsWith('SENSORS:')) return null;
  const body = line.slice('SENSORS:'.length).trim();
  if (body === 'ERR' || body === 'NONE') {
    return {temp: null, hum: null, light: null, receivedAt: new Date().toISOString()};
  }
  const fields: Record<string, number> = {};
  for (const part of body.split(',')) {
    const [key, raw] = part.split(':');
    if (!key || raw == null) continue;
    const num = Number(raw);
    if (Number.isFinite(num)) fields[key.trim().toUpperCase()] = num;
  }
  return {
    temp: fields.TEMP ?? null,
    hum: fields.HUM ?? null,
    light: fields.LIGHT ?? null,
    receivedAt: new Date().toISOString(),
  };
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
    const snapshot = parseSensorLine(line);
    if (snapshot) {
      lastSensorSnapshot = snapshot;
      const resolvers = pendingSensorResolvers;
      pendingSensorResolvers = [];
      for (const resolve of resolvers) resolve(snapshot);
    }
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
      // Flush dangling resolvers so callers don't leak on reconnect
      const stale = pendingSensorResolvers;
      pendingSensorResolvers = [];
      const nullSnap: SensorSnapshot = {temp: null, hum: null, light: null, receivedAt: new Date().toISOString()};
      for (const resolve of stale) resolve(nullSnap);
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

function resolveSensorPathSnapshot(portPath: string, snapshot: SensorSnapshot) {
  sensorSnapshots.set(portPath, snapshot);
  const resolvers = pendingSensorResolversByPath.get(portPath) ?? [];
  pendingSensorResolversByPath.delete(portPath);
  for (const resolve of resolvers) resolve(snapshot);
}

function attachSensorPortListeners(portPath: string, port: SerialPort, parser: ReadlineParser) {
  parser.on('data', (raw: string) => {
    const line = raw.toString().trim();
    if (!line) return;
    process.stdout.write(`[sensor:${portPath}] ${line}\n`);
    const snapshot = parseSensorLine(line);
    if (snapshot) resolveSensorPathSnapshot(portPath, snapshot);
  });

  const markDisconnected = () => {
    if (sensorPorts.get(portPath) === port) {
      sensorPorts.delete(portPath);
      const nullSnap: SensorSnapshot = {temp: null, hum: null, light: null, receivedAt: new Date().toISOString()};
      resolveSensorPathSnapshot(portPath, nullSnap);
    }
  };

  port.on('close', markDisconnected);
  port.on('error', (error) => {
    console.error(`[sensor:${portPath}] port error: ${error.message}`);
    markDisconnected();
    try {
      port.close(() => {});
    } catch {
      // ignore
    }
  });
}

function attachDrivePortListeners(portPath: string, port: SerialPort, parser: ReadlineParser) {
  parser.on('data', (raw: string) => {
    const line = raw.toString().trim();
    if (!line) return;
    process.stdout.write(`[drive:${portPath}] ${line}\n`);
  });

  const markDisconnected = () => {
    if (drivePort === port) {
      drivePort = null;
    }
  };

  port.on('close', markDisconnected);
  port.on('error', (error) => {
    console.error(`[drive:${portPath}] port error: ${error.message}`);
    markDisconnected();
    try {
      port.close(() => {});
    } catch {
      // ignore
    }
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

async function openSensorPortOnce(portPath: string): Promise<SerialPort> {
  const port = new SerialPort({path: portPath, baudRate, autoOpen: false});
  await new Promise<void>((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
  const parser = port.pipe(new ReadlineParser({delimiter: '\n'}));
  attachSensorPortListeners(portPath, port, parser);
  return port;
}

async function openDrivePortOnce(portPath: string): Promise<SerialPort> {
  const port = new SerialPort({path: portPath, baudRate, autoOpen: false});
  await new Promise<void>((resolve, reject) => {
    port.open((error) => (error ? reject(error) : resolve()));
  });
  const parser = port.pipe(new ReadlineParser({delimiter: '\n'}));
  attachDrivePortListeners(portPath, port, parser);
  return port;
}

async function openSensorPort(portPath: string): Promise<SerialPort | null> {
  if (portPath === drivePortPath) return null;
  if (portPath === activePath && activePort?.isOpen) return activePort;

  const existing = sensorPorts.get(portPath);
  if (existing?.isOpen) return existing;

  try {
    const port = await openSensorPortOnce(portPath);
    sensorPorts.set(portPath, port);
    return port;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/resource busy|cannot lock|in use/i.test(message) && killPortHolders(portPath)) {
      try {
        const port = await openSensorPortOnce(portPath);
        sensorPorts.set(portPath, port);
        return port;
      } catch {
        // fall through to disconnected snapshot
      }
    }
    const nullSnap: SensorSnapshot = {temp: null, hum: null, light: null, receivedAt: new Date().toISOString()};
    resolveSensorPathSnapshot(portPath, nullSnap);
    return null;
  }
}

async function openDrivePort(): Promise<SerialPort | null> {
  if (!drivePortPath) return null;
  if (drivePort?.isOpen) return drivePort;

  if (drivePortPath === activePath && activePort?.isOpen) {
    activePort.close(() => {});
    activePort = null;
    activePath = null;
  }

  const sensorPort = sensorPorts.get(drivePortPath);
  if (sensorPort?.isOpen) {
    sensorPort.close(() => {});
    sensorPorts.delete(drivePortPath);
  }

  try {
    const port = await openDrivePortOnce(drivePortPath);
    drivePort = port;
    return port;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/resource busy|cannot lock|in use/i.test(message) && killPortHolders(drivePortPath)) {
      try {
        const port = await openDrivePortOnce(drivePortPath);
        drivePort = port;
        return port;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function assignDrivePort(portPath: string | null): Promise<{ok: boolean; message: string}> {
  const nextPath = typeof portPath === 'string' && portPath.trim() ? portPath.trim() : null;

  if (drivePort?.isOpen) {
    drivePort.close(() => {});
  }
  drivePort = null;
  drivePortPath = nextPath;

  if (!drivePortPath) return {ok: true, message: 'drive port unassigned'};

  if (activePath === drivePortPath && activePort?.isOpen) {
    activePort.close(() => {});
    activePort = null;
    activePath = null;
  }

  const sensorPort = sensorPorts.get(drivePortPath);
  if (sensorPort?.isOpen) {
    sensorPort.close(() => {});
    sensorPorts.delete(drivePortPath);
  }

  const opened = await openDrivePort();
  return opened?.isOpen
    ? {ok: true, message: `drive port assigned: ${drivePortPath}`}
    : {ok: false, message: `drive port unavailable: ${drivePortPath}`};
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
      notifyConnectionChange(true, portPath);
      return port;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      telemetry.lastError = message;
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
            notifyConnectionChange(true, portPath);
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

export async function sendSensorCommand(portPath: string, command: string): Promise<{ok: boolean; message: string}> {
  const normalized = command.trim().toUpperCase();
  if (!normalized) return {ok: false, message: 'command required'};

  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    return {ok: true, message: `[SIM:${portPath}] ${normalized}`};
  }

  try {
    if (portPath === activePath) {
      return sendCommand(normalized);
    }

    const port = await openSensorPort(portPath);
    if (!port?.isOpen) {
      return {ok: false, message: `sensor port unavailable: ${portPath}`};
    }

    await new Promise<void>((resolve, reject) => {
      port.write(`${normalized}\n`, (error) => {
        if (error) {
          reject(error);
          return;
        }
        port.drain((drainError) => drainError ? reject(drainError) : resolve());
      });
    });

    return {ok: true, message: `Sent ${normalized} to ${portPath}`};
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)};
  }
}

export async function sendDriveCommand(command: string): Promise<{ok: boolean; message: string}> {
  const normalized = command.trim().toUpperCase();
  if (!normalized) return {ok: false, message: 'command required'};

  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    return {ok: true, message: `[SIM:drive] ${normalized}`};
  }

  if (!drivePortPath) {
    return {ok: false, message: 'drive Arduino is not assigned'};
  }

  try {
    const port = await openDrivePort();
    if (!port?.isOpen) {
      return {ok: false, message: `drive port unavailable: ${drivePortPath}`};
    }

    await new Promise<void>((resolve, reject) => {
      port.write(`${normalized}\n`, (error) => {
        if (error) {
          reject(error);
          return;
        }
        port.drain((drainError) => drainError ? reject(drainError) : resolve());
      });
    });

    return {ok: true, message: `Sent ${normalized} to drive ${drivePortPath}`};
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)};
  }
}

export async function requestSensorRead(timeoutMs = 1500): Promise<SensorSnapshot | null> {
  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    return {temp: 25.5, hum: 60, light: 512, receivedAt: new Date().toISOString()};
  }
  const port = await openPort().catch(() => null);
  if (!port) return null;

  const deferred = new Promise<SensorSnapshot>((resolve) => {
    pendingSensorResolvers.push(resolve);
  });

  await new Promise<void>((resolve) => {
    port.write('READ_SENSORS\n', () => resolve());
  });

  return Promise.race([
    deferred,
    new Promise<SensorSnapshot | null>((resolve) => setTimeout(() => resolve(lastSensorSnapshot), timeoutMs)),
  ]);
}

export async function requestSensorReadForPort(portPath: string, timeoutMs = 1500): Promise<SensorSnapshot | null> {
  if (process.env.DEMO_SIMULATE_HARDWARE === '1') {
    const hash = Array.from(portPath).reduce((total, char) => total + char.charCodeAt(0), 0);
    return {
      temp: 24 + (hash % 45) / 10,
      hum: 45 + (hash % 30),
      light: 420 + (hash % 480),
      receivedAt: new Date().toISOString(),
    };
  }

  if (portPath === activePath) {
    return requestSensorRead(timeoutMs);
  }

  const port = await openSensorPort(portPath);
  if (!port) return sensorSnapshots.get(portPath) ?? null;

  const deferred = new Promise<SensorSnapshot>((resolve) => {
    const resolvers = pendingSensorResolversByPath.get(portPath) ?? [];
    resolvers.push(resolve);
    pendingSensorResolversByPath.set(portPath, resolvers);
  });

  await new Promise<void>((resolve) => {
    port.write('READ_SENSORS\n', () => resolve());
  });

  return Promise.race([
    deferred,
    new Promise<SensorSnapshot | null>((resolve) => setTimeout(() => resolve(sensorSnapshots.get(portPath) ?? null), timeoutMs)),
  ]);
}

export async function requestAllSensorReads(timeoutMs = 1500): Promise<Map<string, SensorSnapshot | null>> {
  const ports = await listSensorPorts();
  const entries = await Promise.all(ports.map(async (port) => {
    const snapshot = await requestSensorReadForPort(port.path, timeoutMs).catch(() => null);
    return [port.path, snapshot] as const;
  }));
  return new Map(entries);
}

export async function tryAutoOpen(): Promise<boolean> {
  const port = await openPort();
  return Boolean(port?.isOpen);
}
