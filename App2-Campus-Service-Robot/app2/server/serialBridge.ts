// App 2 standalone Arduino serial bridge.
// Self-contained: no dependency on App 1 / App 3 or any sibling project.
// Frontend (src/services/hardwareBridge.ts) talks to this on http://localhost:<BRIDGE_PORT>.

import {createServer} from 'node:http';
import {execSync} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import express from 'express';
import {WebSocketServer, WebSocket} from 'ws';
import {getActivePath, getTelemetry, isConnected, onConnectionChange, queryCommand, sendCommand, tryAutoOpen} from './serialPort';
import {analyzeClassroomTeachingFrame, analyzeClassroomVisualAlerts, analyzeDeliveryTask, checkGeminiHealth, classifyVisionScene, detectClassroomPeople, generateRobotDisplayReply, generateTeachingText, getGeminiModel, isOllamaConfigured} from './aiService';
import {appendDeliveryLog, appendTaskLog, getRecentDeliveryLogs, getRecentTaskLogs, resetDemoData} from './storage';
import {getEV3Status, sendEV3Command, startEV3Manager} from './ev3Manager';
import {getSpikeStatus, sendSpikeCommand, startSpikeManager} from './spikeManager';

function getLanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function freeBridgePort(port: number) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, {encoding: 'utf8'}).trim();
    if (!pids) return;
    execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null || true`);
    console.log(`[bridge] freed port ${port} from stale pid(s) ${pids.replace(/\n/g, ' ')}`);
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const stillBusy = execSync(`lsof -ti :${port} 2>/dev/null`, {encoding: 'utf8'}).trim();
      if (!stillBusy) return;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  } catch {
    // nothing to free
  }
}

const bridgePort = Number(process.env.BRIDGE_PORT ?? 3204) || 3204;

const app = express();
app.disable('x-powered-by');

type WsEvent =
  | {type: 'arduino_status'; connected: boolean; port: string; simulated: boolean}
  | {type: 'command_ack'; command: string; ok: boolean; response?: string};

const httpServer = createServer(app);
const wss = new WebSocketServer({server: httpServer});

// Server-side keepalive: terminate ghost connections within 2 ping cycles (~50s)
const wsAlive = new WeakMap<WebSocket, boolean>();
const wsKeepalive = setInterval(() => {
  for (const ws of wss.clients) {
    if (wsAlive.get(ws) === false) { ws.terminate(); continue; }
    wsAlive.set(ws, false);
    ws.ping();
  }
}, 25000);

// Robot face display clients (iPad on robot, connected via LAN WebSocket)
const displayClients = new Set<WebSocket>();

wss.on('connection', (ws, req) => {
  wsAlive.set(ws, true);
  ws.on('pong', () => wsAlive.set(ws, true));
  if (req.url === '/display') {
    displayClients.add(ws);
    ws.send(JSON.stringify({type: 'display_ready'}));
    ws.on('close', () => displayClients.delete(ws));
  } else {
    ws.send(JSON.stringify({type: 'arduino_status', connected: isConnected(), port: getActivePath() ?? '', simulated: false}));
  }
});
httpServer.on('close', () => clearInterval(wsKeepalive));

function broadcast(event: WsEvent): void {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, (err) => { if (err) { /* ignore */ } });
    }
  }
}

onConnectionChange((connected, path) => {
  broadcast({type: 'arduino_status', connected, port: path ?? '', simulated: false});
});

const ALLOWED_ORIGINS_ENV = process.env.ALLOWED_ORIGINS ?? '';
const extraOrigins = ALLOWED_ORIGINS_ENV ? ALLOWED_ORIGINS_ENV.split(',').map((s) => s.trim()) : [];

app.use((req, res, next) => {
  const origin = req.get('origin') ?? '';
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const isPrivateLan = /^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/.test(origin);
  const isAllowed = extraOrigins.includes(origin);
  if (isLocal || isPrivateLan || isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Timeout middleware: command/task endpoints must respond within 6s
app.use('/api/robot', (req, res, next) => {
  if (req.method !== 'POST') { next(); return; }
  const t = setTimeout(() => {
    if (!res.headersSent) res.status(503).json({ok: false, error: 'request timeout — bridge busy'});
  }, 6000);
  res.on('finish', () => clearTimeout(t));
  next();
});

app.options('*', (_req, res) => res.sendStatus(204));
app.use(express.json({limit: '4mb'})); // vision-classify sends base64 JPEG; 320px @ q0.6 ≈ 40-120 kb but allow headroom

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    bridgePort,
    arduinoConnected: isConnected(),
    activePath: getActivePath(),
    uptimeSeconds: Math.round(process.uptime()),
    telemetry: getTelemetry(),
  });
});

app.post('/api/robot/command', async (req, res) => {
  const {command, source} = req.body ?? {};
  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({error: '缺少機器人指令'});
  }
  const normalized = command.trim().toUpperCase();
  const result = await sendCommand(normalized);
  if (res.headersSent) return;
  res.status(result.ok ? 200 : 503).json({
    ok: result.ok,
    response: result.ok ? `已送出 ${normalized}` : undefined,
    error: result.ok ? undefined : result.message,
    source: typeof source === 'string' ? source : undefined,
  });
  broadcast({type: 'command_ack', command: normalized, ok: result.ok, response: result.ok ? `已送出 ${normalized}` : result.message});
});

app.post('/api/robot/query', async (req, res) => {
  const {command, timeoutMs, source} = req.body ?? {};
  if (typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({error: '缺少機器人查詢指令'});
  }
  const normalized = command.trim().toUpperCase();
  const waitMs = typeof timeoutMs === 'number' ? Math.max(300, Math.min(3000, timeoutMs)) : 1200;
  const result = await queryCommand(normalized, waitMs);
  if (res.headersSent) return;
  res.status(result.ok ? 200 : 503).json({
    ok: result.ok,
    response: result.response,
    error: result.ok ? undefined : result.message,
    source: typeof source === 'string' ? source : undefined,
  });
  broadcast({type: 'command_ack', command: normalized, ok: result.ok, response: result.response ?? result.message});
});

app.get('/api/ready', (_req, res) => {
  res.json({
    ok: true,
    arduino: isConnected(),
    ai: isOllamaConfigured(),
    aiProvider: 'google-ai-studio',
    aiModel: getGeminiModel(),
    bridge_port: bridgePort,
  });
});

app.get('/api/llm/health', async (_req, res) => {
  try {
    const result = await checkGeminiHealth();
    res.json({
      ok: true,
      ...result,
      bridge_port: bridgePort,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      provider: 'google-ai-studio',
      model: getGeminiModel(),
      bridge_port: bridgePort,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/robot/task', async (req, res) => {
  const {taskType, description, destination, command} = req.body ?? {};
  if (typeof taskType !== 'string' || !taskType) {
    return res.status(400).json({error: 'taskType required'});
  }
  try {
    const logs = await appendTaskLog({
      taskType,
      description: typeof description === 'string' ? description : taskType,
      status: 'pending',
    });
    let commandOk: boolean | null = null;
    if (typeof command === 'string' && command.trim()) {
      const normalized = command.trim().toUpperCase();
      const result = await sendCommand(normalized);
      commandOk = result.ok;
      broadcast({type: 'command_ack', command: normalized, ok: result.ok});
      await appendDeliveryLog({
        command: normalized,
        destination: typeof destination === 'string' ? destination : undefined,
        status: result.ok ? 'sent' : 'failed',
        message: result.message,
      });
    }
    res.json({ok: true, logs, commandOk});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/campus', async (req, res) => {
  const {command, destination, taskDescription, userMessage} = req.body ?? {};
  try {
    const result = await analyzeDeliveryTask({
      command: typeof command === 'string' ? command : undefined,
      destination: typeof destination === 'string' ? destination : undefined,
      taskDescription: typeof taskDescription === 'string' ? taskDescription : undefined,
      userMessage: typeof userMessage === 'string' ? userMessage : undefined,
    });
    res.json({ok: true, reply: result.reply, source: result.source});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/teacher-reply', async (req, res) => {
  const {question, subject} = req.body ?? {};
  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ok: false, error: 'question required'});
    return;
  }
  try {
    const result = await generateTeachingText([
      '請幫老師產生一句可以直接回覆學生的繁體中文回答，語氣清楚、鼓勵、國小可懂。',
      subject ? `科目：${subject}` : '',
      `學生問題：${question}`,
    ].filter(Boolean).join('\n'));
    res.json({ok: true, reply: result.text, text: result.text, source: result.source, fallback: result.source === 'local'});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/dispatch-recommend', async (req, res) => {
  const {zone, taskType} = req.body ?? {};
  try {
    const result = await generateTeachingText([
      '請針對校園服務機器人的任務派遣給 1 句繁體中文建議，務必具體可執行。',
      `區域：${typeof zone === 'string' ? zone : '未指定'}`,
      `任務：${typeof taskType === 'string' ? taskType : '未指定'}`,
    ].join('\n'));
    res.json({ok: true, recommendation: result.text, text: result.text, source: result.source, fallback: result.source === 'local'});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/student-report', async (req, res) => {
  const {name, data} = req.body ?? {};
  try {
    const result = await generateTeachingText([
      '請根據學生資料產生一段 2 句以內的繁體中文學習建議，不要做醫療或心理診斷。',
      `學生：${typeof name === 'string' ? name : '學生'}`,
      `資料：${JSON.stringify(data ?? {}).slice(0, 1800)}`,
    ].join('\n'));
    res.json({ok: true, report: result.text, text: result.text, source: result.source, fallback: result.source === 'local'});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/robot-reply', async (req, res) => {
  const {message, kind} = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ok: false, error: 'message required'});
    return;
  }
  try {
    const result = await generateRobotDisplayReply({
      message,
      kind: typeof kind === 'string' ? kind : 'chat',
    });
    res.json({ok: true, ...result, fallback: result.source === 'local'});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/vision-classify', async (req, res) => {
  const {imageBase64} = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    res.status(400).json({ok: false, error: 'imageBase64 required'});
    return;
  }
  try {
    const result = await classifyVisionScene(imageBase64);
    res.json({ok: true, ...result});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/classroom-analyze', async (req, res) => {
  const {imageBase64, cv, yolo} = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    res.status(400).json({ok: false, error: 'imageBase64 required'});
    return;
  }
  if (!cv || typeof cv !== 'object') {
    res.status(400).json({ok: false, error: 'cv signals required'});
    return;
  }
  try {
    const yoloResult = yolo && typeof yolo === 'object' && typeof yolo.yoloPersonCount === 'number'
      ? {
          yoloPersonCount: Math.max(0, Math.min(60, Math.round(Number(yolo.yoloPersonCount) || 0))),
          imageSize: yolo.imageSize && typeof yolo.imageSize.width === 'number' && typeof yolo.imageSize.height === 'number'
            ? {width: Number(yolo.imageSize.width), height: Number(yolo.imageSize.height)}
            : undefined,
          detections: Array.isArray(yolo.detections) ? yolo.detections : [],
        }
      : null;
    const result = await analyzeClassroomTeachingFrame(imageBase64, {
      brightness: Number(cv.brightness ?? 50),
      edgeDensity: Number(cv.edgeDensity ?? 0),
      warmArea: Number(cv.warmArea ?? 0),
      motionLevel: Number(cv.motionLevel ?? 0),
      estimatedPeople: Number(cv.estimatedPeople ?? 0),
      postureSignal: cv.postureSignal === 'upright' || cv.postureSignal === 'low' ? cv.postureSignal : 'mixed',
      evidence: Array.isArray(cv.evidence) ? cv.evidence.slice(0, 6).map(String) : [],
    }, yoloResult);
    res.json({ok: true, ...result});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/classroom-track', async (req, res) => {
  const {imageBase64, yolo} = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    res.status(400).json({ok: false, error: 'imageBase64 required'});
    return;
  }
  try {
    const result = await detectClassroomPeople(imageBase64, yolo && typeof yolo === 'object' ? {
      confidence: typeof yolo.confidence === 'number' ? yolo.confidence : undefined,
      imageSize: typeof yolo.imageSize === 'number' ? yolo.imageSize : undefined,
      iou: typeof yolo.iou === 'number' ? yolo.iou : undefined,
    } : {});
    res.json({ok: true, ...result});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ai/classroom-alerts', async (req, res) => {
  const {imageBase64} = req.body ?? {};
  if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
    res.status(400).json({ok: false, error: 'imageBase64 required'});
    return;
  }
  try {
    const result = await analyzeClassroomVisualAlerts(imageBase64);
    res.json({ok: true, ...result});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.get('/api/logs', async (_req, res) => {
  try {
    const [deliveryLogs, taskLogs] = await Promise.all([getRecentDeliveryLogs(), getRecentTaskLogs()]);
    res.json({ok: true, deliveryLogs, taskLogs});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

app.post('/api/ops/reset', async (_req, res) => {
  try {
    await resetDemoData();
    res.json({ok: true, message: 'Demo data reset'});
  } catch (error) {
    res.status(500).json({ok: false, error: error instanceof Error ? error.message : String(error)});
  }
});

// EV3 endpoints
app.get('/api/ev3/status', (_req, res) => res.json(getEV3Status()));
app.post('/api/ev3/command', async (req, res) => {
  const command = String(req.body?.command ?? '').trim().toUpperCase();
  if (!command) { res.status(400).json({ok: false, error: '缺少 EV3 指令'}); return; }
  const result = await sendEV3Command(command);
  res.json(result);
});

// SPIKE Prime endpoints
app.get('/api/spike/status', (_req, res) => res.json(getSpikeStatus()));
app.post('/api/spike/command', async (req, res) => {
  const command = String(req.body?.command ?? '').trim().toUpperCase();
  if (!command) { res.status(400).json({ok: false, error: '缺少 SPIKE 指令'}); return; }
  const result = await sendSpikeCommand(command);
  res.json(result);
});

// Robot face display info — returns LAN IP + full robot-display URL for QR generation
app.get('/api/display/info', (_req, res) => {
  const ip = getLanIp();
  const vitePort = Number(process.env.VITE_PORT ?? 3000);
  res.json({
    ok: true,
    ip,
    bridgePort,
    robotDisplayUrl: `http://${ip}:${vitePort}/robot-display.html?bridge=${ip}:${bridgePort}`,
  });
});

// Robot face display: push emotion to all connected iPad display clients
app.post('/api/display/emotion', (req, res) => {
  const {emotion, message} = req.body as {emotion?: string; message?: string};
  if (!emotion || typeof emotion !== 'string') {
    res.status(400).json({ok: false, error: 'missing emotion'});
    return;
  }
  const data = JSON.stringify({
    type: 'display_emotion',
    emotion,
    message: typeof message === 'string' && message.trim() ? message.trim().slice(0, 120) : undefined,
  });
  let sent = 0;
  for (const client of displayClients) {
    if (client.readyState === WebSocket.OPEN) { client.send(data); sent++; }
  }
  res.json({ok: true, emotion, message: typeof message === 'string' ? message : undefined, clients: sent});
});

app.get('/api/display/status', (_req, res) => {
  res.json({ok: true, clients: displayClients.size});
});

app.use('/api', (_req, res) => {
  res.status(404).json({error: 'API route not found'});
});

freeBridgePort(bridgePort);

httpServer.listen(bridgePort, () => {
  console.log(`[bridge] App 2 service-robot serial bridge listening on http://localhost:${bridgePort}`);
  console.log(`[bridge] Baud rate: 115200`);
  void tryAutoOpen();
  startEV3Manager();
  startSpikeManager();
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[bridge] port ${bridgePort} already in use, exiting.`);
    process.exit(1);
  }
  console.error(`[bridge] server error: ${error.message}`);
});

process.on('uncaughtException', (err) => {
  console.error('[bridge] uncaughtException (bridge stays up):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[bridge] unhandledRejection (bridge stays up):', reason);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[bridge] received ${signal}, shutting down`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
