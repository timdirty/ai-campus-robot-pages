import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';

const BACKOFF_MS = [0, 1000, 3000, 5000];
// Worst-case operation: EV3_TEST (~4.3s: pen down 2s + 0.3s pause + pen up 2s).
// EV3_DRAW_LINE is similar (~4.5s: pen down + arm 0.5s + pen up). 10s gives margin
// without making genuine hangs feel sluggish to the UI.
const EV3_TIMEOUT_MS = 10000;

type Ev3Response = {ok: boolean; response: string};
type Pending = {resolve: (r: Ev3Response) => void; timer: ReturnType<typeof setTimeout>};

let ws: WebSocket | null = null;
let connected = false;
let lastCommand = '';
let lastResponse = '';
let activeHost = '';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let currentHostIndex = 0;
let started = false;
const pending = new Map<string, Pending>();

function isSimulated() {
  return process.env.EV3_SIMULATE === '1' || process.env.DEMO_SIMULATE_HARDWARE === '1';
}

function normalizeHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return '';
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  return `ws://${trimmed.replace(/\/$/, '')}:8765`;
}

function getHosts(): string[] {
  const configuredHosts = [
    ...(process.env.EV3_HOSTS ?? '').split(','),
    process.env.EV3_HOST ?? '',
  ].map(normalizeHost).filter(Boolean);
  const hosts = [
    ...configuredHosts,
    'ws://192.168.0.1:8765',
    'ws://ev3dev.local:8765',
  ];
  const uniqueHosts = [...new Set(hosts)];
  return uniqueHosts.length > 0 ? uniqueHosts : ['ws://192.168.0.1:8765'];
}

function flushPending(reason: string) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ok: false, response: reason});
    pending.delete(id);
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  const delay = BACKOFF_MS[Math.min(reconnectAttempt, BACKOFF_MS.length - 1)];
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  const hosts = getHosts();
  const url = hosts[currentHostIndex % hosts.length];
  const socket = new WebSocket(url);

  socket.on('open', () => {
    ws = socket;
    connected = true;
    activeHost = url;
    reconnectAttempt = 0;
    console.log(`[ev3] connected to ${url}`);
  });

  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString()) as {id: string; ok: boolean; response: string};
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      lastResponse = msg.response ?? '';
      p.resolve({ok: msg.ok, response: lastResponse});
    } catch { /* ignore malformed messages */ }
  });

  socket.on('close', () => {
    if (ws === socket) {
      ws = null;
      connected = false;
      activeHost = '';
    }
    flushPending('EV3 disconnected');
    currentHostIndex++;
    scheduleReconnect();
  });

  socket.on('error', () => {
    // error always precedes close — handled there
  });
}

export function startEV3Manager() {
  if (started) return;
  started = true;
  if (isSimulated()) {
    connected = true;
    activeHost = 'simulated://ev3';
    lastResponse = 'EV3 simulation ready';
    console.log('[ev3] simulation mode enabled');
    return;
  }
  connect();
}

export function getEV3Status() {
  return {connected: connected || isSimulated(), activeHost: isSimulated() ? 'simulated://ev3' : activeHost, configuredHosts: getHosts(), lastCommand, lastResponse, simulated: isSimulated()};
}

export async function sendEV3Command(command: string): Promise<Ev3Response> {
  if (command === 'HEARTBEAT') return {ok: connected || isSimulated(), response: connected || isSimulated() ? 'alive' : 'not connected'};
  if (isSimulated()) {
    lastCommand = command;
    lastResponse = `SIMULATED_EV3_OK:${command}`;
    return {ok: true, response: lastResponse};
  }
  if (!ws || !connected) return {ok: false, response: 'EV3 not connected'};

  const id = randomUUID();
  lastCommand = command;

  return new Promise<Ev3Response>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ok: false, response: 'timeout'});
    }, EV3_TIMEOUT_MS);

    pending.set(id, {resolve, timer});
    try {
      ws!.send(JSON.stringify({id, type: command}));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ok: false, response: err instanceof Error ? err.message : 'send error'});
    }
  });
}
