const bridgeBaseUrl = (process.env.APP2_BRIDGE_URL ?? process.env.VITE_ARDUINO_BRIDGE_URL ?? 'http://localhost:3204').replace(/\/$/, '');
const appBaseUrl = (process.env.APP2_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const bridgeHost = new URL(bridgeBaseUrl).host;

const imageBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const cv = {
  brightness: 62,
  edgeDensity: 0.28,
  warmArea: 0.22,
  motionLevel: 36,
  estimatedPeople: 5,
  postureSignal: 'mixed',
  evidence: ['demo smoke frame'],
};

const yolo = {
  yoloPersonCount: 5,
  imageSize: { width: 640, height: 360 },
  detections: [],
};

const apiChecks = [
  ['GET', '/api/ready'],
  ['GET', '/api/health'],
  ['GET', '/api/display/info'],
  ['POST', '/api/ai/campus', { prompt: '請用校園服務機器人總控角度，摘要雨天放學與走廊安全的 demo 重點。' }],
  ['POST', '/api/ai/classroom-analyze', { imageBase64, cv, yolo }],
  ['POST', '/api/ai/classroom-track', { imageBase64, yolo }],
  ['POST', '/api/ai/classroom-alerts', { imageBase64 }],
  ['POST', '/api/ai/dispatch-recommend', { zone: 'B-4 走廊', issue: '下課人流密集且地面濕滑，請建議機器人巡查與廣播策略。' }],
  ['POST', '/api/ai/robot-reply', { message: '請用親切短句提醒學生放慢腳步並注意地面濕滑。' }],
  ['POST', '/api/ai/teacher-reply', { question: '學生注意力下降且有人舉手，老師下一步怎麼安排？', subject: '班級經營' }],
  ['POST', '/api/ai/student-report', { studentName: '林同學', focus: 82, attendance: '已到', note: '雨天放學 demo smoke' }],
  ['POST', '/api/display/emotion', { emotion: 'happy', message: 'Demo 驗證完成' }],
];

const pageChecks = [
  ['APP2 life', `${appBaseUrl}/#life`],
  ['ROBOT display', `${appBaseUrl}/robot-display.html?bridge=${bridgeHost}`],
];

async function checkPage(label, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} failed ${res.status}: ${url}`);
  console.log(`${label} ${res.status} ok`);
}

async function checkApi(method, path, body) {
  const res = await fetch(`${bridgeBaseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`${method} ${path} failed ${res.status}: ${JSON.stringify(json).slice(0, 240)}`);
  }

  if (path === '/api/ready' && json.ai !== true) {
    throw new Error('/api/ready reported AI unavailable');
  }

  if (path === '/api/display/info') {
    const url = String(json.robotDisplayUrl ?? '');
    if (!url.includes(':3204') || !url.includes('robot-display.html')) {
      throw new Error(`/api/display/info returned unexpected robotDisplayUrl: ${url}`);
    }
  }

  const tag = json.aiProvider || json.source || (json.clients ?? json.bridgePort ?? '');
  console.log(`${method} ${path} ${res.status} ok ${tag}`.trim());
}

try {
  for (const [label, url] of pageChecks) {
    await checkPage(label, url);
  }
  for (const [method, path, body] of apiChecks) {
    await checkApi(method, path, body);
  }
  console.log('api smoke: ok');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
