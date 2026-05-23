import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const root = path.resolve('docs');
const port = 4100 + Math.floor(Math.random() * 400);
const cdpPort = 9200 + Math.floor(Math.random() * 500);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url ?? '/', 'http://local');
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(root, `.${p}`);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {'content-type': types[path.extname(file)] ?? 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

function listen() {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

async function waitForCdp() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (r.ok) return;
    } catch {
      // Chrome not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Chrome CDP unavailable');
}

let nextId = 1;

async function openPage(url, label) {
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'})
    .then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method) events.push(msg);
  };

  const send = (method, params = {}) => {
    const id = nextId;
    nextId += 1;
    ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolve) => pending.set(id, resolve));
  };

  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise((resolve) => setTimeout(resolve, 2200));

  return {
    label,
    ws,
    events,
    send,
    async text() {
      const r = await send('Runtime.evaluate', {expression: 'document.body.innerText', returnByValue: true});
      return r.result?.result?.value ?? '';
    },
    async eval(expression) {
      return send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    },
    async viewport(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
  };
}

async function waitFor(page, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = (await page.eval(expression)).result?.result?.value;
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

await listen();

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = path.join(process.env.TEMP ?? '.', `app-pages-e2e-profile-${Date.now()}`);
fs.mkdirSync(profile, {recursive: true});
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  {stdio: 'ignore'},
);

try {
  await waitForCdp();
  const base = `http://127.0.0.1:${port}`;
  const pages = [];

  const portal = await openPage(`${base}/`, 'portal');
  pages.push(portal);
  const portalText = await portal.text();

  const app2 = await openPage(`${base}/app2/`, 'app2');
  pages.push(app2);
  await waitFor(app2, 'document.querySelectorAll("button").length > 5');
  const app2Buttons = (await app2.eval('document.querySelectorAll("button").length')).result.result.value;
  const app2DesktopMetrics = (await app2.eval(`(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    mounted: document.querySelectorAll('button').length,
  }))()`)).result.result.value;

  const robot2 = await openPage(`${base}/app2/robot-display.html`, 'robot2');
  pages.push(robot2);
  await waitFor(robot2, 'document.body.innerText.length > 60');
  const app2SyncMessage = 'App2 pages sync ok';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await app2.eval(`(() => {
      const ch = new BroadcastChannel('app2-robot-display');
      ch.postMessage({type: 'display_emotion', emotion: 'happy', message: ${JSON.stringify(app2SyncMessage)}, source: 'e2e'});
      setTimeout(() => ch.close(), 140);
      return true;
    })()`);
    const synced = await waitFor(robot2, `window.__APP2_LAST_DISPLAY_EVENT?.message === ${JSON.stringify(app2SyncMessage)}`, 1800);
    if (synced) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const robot2Text = await robot2.text();
  const robot2LastEvent = (await robot2.eval('window.__APP2_LAST_DISPLAY_EVENT || null')).result.result.value;

  const app3 = await openPage(`${base}/app3/`, 'app3');
  pages.push(app3);
  await app3.viewport(1920, 927, false);
  await waitFor(app3, 'document.querySelectorAll("button").length > 5');
  const app3Buttons = (await app3.eval('document.querySelectorAll("button").length')).result.result.value;
  const app3DesktopMetrics = (await app3.eval(`(() => {
    const text = document.body.innerText;
    const map = document.querySelector('[data-e2e="campus-map-image"]');
    const mapRect = map?.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      hasScriptSteps: text.includes('學生操作主線') || text.includes('AI 整理') || text.includes('展示步驟'),
      mainTop: Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? -1),
      mainBottom: Math.round(document.querySelector('main')?.getBoundingClientRect().bottom ?? -1),
      mapVisible: Boolean(mapRect && mapRect.height >= 280 && mapRect.width >= 600 && mapRect.top >= -2 && mapRect.top < window.innerHeight - 160),
      mapHeight: Math.round(mapRect?.height ?? 0),
      mapTop: Math.round(mapRect?.top ?? -1),
    };
  })()`)).result.result.value;

  const app3PanelChecks = [];
  for (const panelName of ['alerts', 'sensing', 'care']) {
    const page = await openPage(`${base}/app3/#${panelName}`, `app3-panel-${panelName}`);
    pages.push(page);
    await page.viewport(1366, 768, false);
    await waitFor(page, '!!document.querySelector(".app3-work-drawer")');
    const metrics = (await page.eval(`(() => {
      const drawer = document.querySelector('.app3-work-drawer');
      const rect = drawer?.getBoundingClientRect();
      return {
        panel: ${JSON.stringify(panelName)},
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        drawerOffscreen: !rect || rect.top < -2 || rect.left < -2 || rect.right > window.innerWidth + 2 || rect.bottom > window.innerHeight + 2,
        drawerHeight: rect ? Math.round(rect.height) : 0,
        buttons: drawer ? drawer.querySelectorAll('button').length : 0,
      };
    })()`)).result.result.value;
    app3PanelChecks.push(metrics);
  }

  const robot3 = await openPage(`${base}/app3/robot-display.html`, 'robot3');
  pages.push(robot3);
  const robot3Text = await robot3.text();
  await robot3.eval(`(() => {
    const payload = {
      type: 'robot_emotion_event',
      id: 'e2e-teacher-called-' + Date.now().toString(36),
      zoneId: 'zone-library',
      zoneName: '圖書館',
      location: '圖書館',
      emotion: 'teacher_called',
      emotionLabel: '老師接手',
      riskLevel: 'high',
      description: '機器人已在圖書館通知老師接手協助確認。',
      source: 'robot-arrival-prompt',
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('app3:static-demo:emotion-event', JSON.stringify(payload));
    try {
      const channel = new BroadcastChannel('app3-static-demo-sync');
      channel.postMessage(payload);
      setTimeout(() => channel.close(), 100);
    } catch {}
    return true;
  })()`);
  const teacherHandoffSynced = await waitFor(
    app3,
    `document.body.innerText.includes('圖書館 · 老師接手中') || document.body.innerText.includes('圖書館已由機器人通報老師接手')`,
    7000,
  );

  const mobileChecks = [];
  for (const [pathName, pathUrl] of [
    ['portal-mobile', `${base}/`],
    ['app2-mobile', `${base}/app2/`],
    ['app3-mobile', `${base}/app3/`],
    ['robot2-mobile', `${base}/app2/robot-display.html`],
    ['robot3-mobile', `${base}/app3/robot-display.html`],
  ]) {
    const page = await openPage(pathUrl, pathName);
    pages.push(page);
    await page.viewport(390, 844, true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const metrics = (await page.eval(`(() => ({
      path: ${JSON.stringify(pathName)},
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      textLength: document.body.innerText.length,
      buttons: document.querySelectorAll('button').length,
    }))()`)).result.result.value;
    mobileChecks.push(metrics);
  }

  const badRequests = [];
  const misses = [];
  const hardErrors = [];
  for (const page of pages) {
    for (const event of page.events) {
      const url = event.params?.request?.url ?? event.params?.response?.url ?? event.params?.entry?.url ?? '';
      if (/localhost:32|127\.0\.0\.1:32|api\.anthropic\.com/.test(url)) {
        badRequests.push(`${page.label}: ${url}`);
      }
      if (event.method === 'Network.responseReceived' && event.params.response.status >= 400 && !/favicon/.test(url)) {
        misses.push(`${page.label} ${event.params.response.status} ${url}`);
      }
      if (event.method === 'Runtime.exceptionThrown') hardErrors.push(`${page.label}: runtime exception`);
      if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
        hardErrors.push(`${page.label}: ${event.params.entry.text}`);
      }
    }
  }

  const result = {
    portalLoaded: portalText.includes('App2') && portalText.includes('App3'),
    app2Buttons,
    app2DesktopMetrics,
    robot2Synced: robot2Text.includes('App2 pages sync ok') || robot2Text.includes('HAPPY') || robot2LastEvent?.message === 'App2 pages sync ok',
    robot2LastEvent,
    app3Buttons,
    app3DesktopMetrics,
    app3PanelChecks,
    robot3Loaded: robot3Text.length > 200,
    teacherHandoffSynced: Boolean(teacherHandoffSynced),
    mobileChecks,
    badRequests,
    misses,
    hardErrors,
  };
  console.log(JSON.stringify(result, null, 2));

  pages.forEach((page) => page.ws.close());
  if (
    !result.portalLoaded ||
    app2Buttons < 5 ||
    app2DesktopMetrics.horizontalOverflow ||
    !result.robot2Synced ||
    app3Buttons < 5 ||
    app3DesktopMetrics.pageOverflow > 2 ||
    app3DesktopMetrics.horizontalOverflow ||
    app3DesktopMetrics.hasScriptSteps ||
    !app3DesktopMetrics.mapVisible ||
    app3PanelChecks.some((item) => item.horizontalOverflow || item.drawerOffscreen || item.buttons < 2) ||
    !result.robot3Loaded ||
    !result.teacherHandoffSynced ||
    mobileChecks.some((item) => item.horizontalOverflow || item.textLength < 20) ||
    badRequests.length ||
    misses.length ||
    hardErrors.length
  ) {
    process.exitCode = 1;
  }
} finally {
  chrome.kill();
  server.close();
}
