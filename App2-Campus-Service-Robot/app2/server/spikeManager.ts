// spikeManager.ts — LEGO SPIKE Prime USB Serial bridge
// SPIKE Prime exposes a USB CDC serial port (VID 0x0694) at 115200 baud.
// Pre-install scripts/spike_program.py on the hub so it reads newline-terminated
// commands and replies "OK:<CMD>" or "ERR:<CMD>".
// Set SPIKE_PORT=<path> to pin a port; otherwise auto-detected by LEGO VID.
// Set SPIKE_SIMULATE=1 or DEMO_SIMULATE_HARDWARE=1 for sim mode.

import {SerialPort} from 'serialport';
import {ReadlineParser} from '@serialport/parser-readline';

const SPIKE_VID = '0694'; // LEGO Group
const BAUD = 115200;
const CMD_TIMEOUT_MS = 5000;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 8000;
const QUEUE_MAX = 8; // drop oldest if queue overflows

type SpikeResponse = {ok: boolean; response: string};
type Pending = {resolve: (r: SpikeResponse) => void; timer: ReturnType<typeof setTimeout>};
type Queued = {command: string; resolve: (r: SpikeResponse) => void};

let activePort: SerialPort | null = null;
let connected = false;
let activePath = '';
let lastCommand = '';
let lastResponse = '';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = RECONNECT_MIN_MS;
let pending: Pending | null = null;
let cmdQueue: Queued[] = [];
let started = false;

function isSimulated() {
  return process.env.SPIKE_SIMULATE === '1' || process.env.DEMO_SIMULATE_HARDWARE === '1';
}

function isSpikeLikePort(p: {vendorId?: string; manufacturer?: string; path: string}): boolean {
  if (p.vendorId?.toLowerCase() === SPIKE_VID) return true;
  const text = `${p.manufacturer ?? ''} ${p.path}`.toLowerCase();
  return text.includes('lego') || text.includes('spike');
}

async function detectSpikePort(): Promise<string | null> {
  const envPort = process.env.SPIKE_PORT?.trim();
  if (envPort) return envPort;
  const ports = await SerialPort.list();
  const match = ports.find(isSpikeLikePort);
  return match?.path ?? null;
}

function flushQueue() {
  if (pending || !activePort || !connected || cmdQueue.length === 0) return;
  const next = cmdQueue.shift()!;
  lastCommand = next.command;
  const timer = setTimeout(() => {
    pending = null;
    next.resolve({ok: false, response: 'timeout'});
    flushQueue();
  }, CMD_TIMEOUT_MS);
  pending = {resolve: (r) => { next.resolve(r); flushQueue(); }, timer};
  activePort.write(`${next.command}\n`, (err) => {
    if (err) {
      clearTimeout(timer);
      pending = null;
      next.resolve({ok: false, response: err.message});
      flushQueue();
    }
  });
}

function clearPending(reason: string) {
  if (pending) {
    clearTimeout(pending.timer);
    pending.resolve({ok: false, response: reason});
    pending = null;
  }
  for (const q of cmdQueue) q.resolve({ok: false, response: reason});
  cmdQueue = [];
}

function scheduleReconnect(reason: string) {
  if (reconnectTimer) return;
  clearPending(`SPIKE disconnected: ${reason}`);
  console.log(`[spike] reconnect in ${reconnectDelay}ms (${reason})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

async function connect() {
  const portPath = await detectSpikePort();
  if (!portPath) {
    scheduleReconnect('no SPIKE port found');
    return;
  }

  const sp = new SerialPort({path: portPath, baudRate: BAUD, autoOpen: false});
  const parser = sp.pipe(new ReadlineParser({delimiter: '\n'}));

  sp.open((err) => {
    if (err) {
      console.error(`[spike] open failed: ${err.message}`);
      scheduleReconnect(err.message);
      return;
    }
    activePort = sp;
    connected = true;
    activePath = portPath;
    reconnectDelay = RECONNECT_MIN_MS;
    console.log(`[spike] connected to ${portPath}`);
    flushQueue();
  });

  parser.on('data', (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    if (process.env.DEBUG) console.log(`[spike] rx: ${line}`);
    lastResponse = line;
    if (pending && (line.startsWith('OK:') || line.startsWith('ERR:') || line === 'SPIKE_READY')) {
      const p = pending;
      pending = null;
      clearTimeout(p.timer);
      p.resolve({ok: line.startsWith('OK:'), response: line});
    }
  });

  sp.on('close', () => {
    if (activePort === sp) {
      activePort = null;
      connected = false;
      activePath = '';
    }
    scheduleReconnect('port closed');
  });

  sp.on('error', (err) => {
    console.error(`[spike] port error: ${err.message}`);
  });
}

export function startSpikeManager() {
  if (started) return;
  started = true;
  if (isSimulated()) {
    connected = true;
    activePath = 'simulated://spike';
    lastResponse = 'SPIKE_READY (sim)';
    console.log('[spike] simulation mode enabled');
    return;
  }
  void connect();
}

export function getSpikeStatus() {
  return {
    connected: connected || isSimulated(),
    activePath: isSimulated() ? 'simulated://spike' : activePath,
    lastCommand,
    lastResponse,
    simulated: isSimulated(),
    queueLength: cmdQueue.length,
  };
}

export async function sendSpikeCommand(command: string): Promise<SpikeResponse> {
  if (command === 'HEARTBEAT') return {ok: connected || isSimulated(), response: connected || isSimulated() ? 'alive' : 'not connected'};
  if (isSimulated()) {
    lastCommand = command;
    lastResponse = `OK:${command}`;
    return {ok: true, response: lastResponse};
  }

  if (!activePort || !connected) {
    return {ok: false, response: 'SPIKE not connected'};
  }

  return new Promise<SpikeResponse>((resolve) => {
    if (cmdQueue.length >= QUEUE_MAX) {
      // Drop oldest non-critical command to make room
      const dropped = cmdQueue.shift();
      dropped?.resolve({ok: false, response: 'dropped — queue full'});
    }
    cmdQueue.push({command, resolve});
    flushQueue();
  });
}
