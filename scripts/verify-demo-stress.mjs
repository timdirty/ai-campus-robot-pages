import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = ''] = arg.split('=');
  return [key, value];
}));
const rounds = Math.max(100, Number(args.get('--rounds') || 100));
const root = path.resolve('docs');
const port = 4600 + Math.floor(Math.random() * 300);
const cdpPort = 9700 + Math.floor(Math.random() * 300);
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const staticChannel = 'app3-static-demo-sync';
const assignmentKey = 'app3:static-demo:robot-assignment';
const emotionEventKey = 'app3:static-demo:emotion-event';
const app2Channel = 'app2-robot-display';
const forbiddenNetworkPattern = /api\.anthropic\.com|(?:localhost|127\.0\.0\.1):(?:3000|3001|3203|3443)/;
const libraryName = '\u5716\u66f8\u9928';
const teacherHandoff = '\u8001\u5e2b\u63a5\u624b';
const teacherHandoffLine = `${libraryName} \u00b7 ${teacherHandoff}\u4e2d`;
const demoHighlights = [
  'AI \u591a\u6a21\u614b',
  '\u96b1\u79c1\u512a\u5148',
  'Robot \u9589\u74b0',
  '\u5373\u6642\u8072\u91cf',
];
const robotHudHighlights = [
  'Live Guardian Loop',
  'AI \u60c5\u7dd2',
  '\u8072\u91cf\u6307\u91dd',
  '\u4efb\u52d9\u9589\u74b0',
];
const requiredDocsFiles = [
  'index.html',
  'app2/index.html',
  'app2/robot-display.html',
  'app3/index.html',
  'app3/robot-display.html',
];
const robotDemoControls = [
  '\u8a9e\u97f3\u5c0d\u8a71',
  '\u958b\u59cb\u60c5\u7dd2\u5075\u6e2c',
  '\u81ea\u6211\u4ecb\u7d39',
];

const mime = {
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
    res.writeHead(200, {'content-type': mime[path.extname(file)] ?? 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listen() {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

async function waitForCdp() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(200);
  }
  throw new Error('Chrome CDP unavailable');
}

let nextId = 1;

async function openPage(url, label) {
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'})
    .then((response) => response.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const pending = new Map();
  const events = [];
  ws.onmessage = (messageEvent) => {
    const msg = JSON.parse(messageEvent.data);
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
  await send('Log.enable');
  await send('Page.enable');
  await delay(1200);

  return {
    label,
    ws,
    events,
    send,
    async text() {
      const result = await send('Runtime.evaluate', {expression: 'document.body.innerText', returnByValue: true});
      return result.result?.result?.value ?? '';
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
      await delay(200);
    },
  };
}

async function waitFor(page, expression, timeoutMs = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await page.eval(expression);
    if (result.result?.result?.value) return true;
    await delay(80);
  }
  return false;
}

function postApp3StaticEvent(page, payload) {
  return page.eval(`(() => {
    const payload = ${JSON.stringify(payload)};
    const key = payload.type === 'robot_assignment' ? ${JSON.stringify(assignmentKey)} : ${JSON.stringify(emotionEventKey)};
    localStorage.setItem(key, JSON.stringify(payload));
    try {
      const channel = new BroadcastChannel(${JSON.stringify(staticChannel)});
      channel.postMessage(payload);
      setTimeout(() => channel.close(), 50);
    } catch {}
    return true;
  })()`);
}

function postApp2Event(page, message) {
  return page.eval(`(() => {
    const payload = {type: 'display_emotion', emotion: 'happy', message: ${JSON.stringify(message)}, source: 'stress'};
    const channel = new BroadcastChannel(${JSON.stringify(app2Channel)});
    channel.postMessage(payload);
    setTimeout(() => channel.close(), 50);
    return true;
  })()`);
}

function makeAssignment(round) {
  const now = new Date(Date.now() + round * 2000).toISOString();
  return {
    type: 'robot_assignment',
    zoneId: 'zone-library',
    zoneName: libraryName,
    location: libraryName,
    riskLevel: round % 3 === 0 ? 'high' : 'medium',
    statusLabel: round % 3 === 0 ? '\u9ad8\u98a8\u96aa' : '\u6ce8\u610f',
    stage: '\u73fe\u5834\u5f85\u547d',
    missionId: `S-${String(round).padStart(3, '0')}`,
    active: true,
    moving: false,
    updatedAt: now,
  };
}

function makeEmotion(round, emotion) {
  const teacher = emotion === 'teacher_called';
  return {
    type: 'robot_emotion_event',
    id: `stress-${emotion}-${round}-${Date.now().toString(36)}`,
    zoneId: 'zone-library',
    zoneName: libraryName,
    location: libraryName,
    emotion,
    emotionLabel: teacher ? teacherHandoff : '\u4e8b\u4ef6\u5df2\u89e3\u9664',
    riskLevel: teacher ? 'high' : 'medium',
    description: teacher
      ? `Stress round ${round}: teacher handoff synced.`
      : `Stress round ${round}: incident resolved synced.`,
    source: 'robot-arrival-prompt',
    updatedAt: new Date(Date.now() + round * 2000 + (teacher ? 500 : 1000)).toISOString(),
  };
}

function collectErrors(pages) {
  const badRequests = [];
  const misses = [];
  const hardErrors = [];
  for (const page of pages) {
    for (const event of page.events) {
      const url = event.params?.request?.url ?? event.params?.response?.url ?? event.params?.entry?.url ?? '';
      if (forbiddenNetworkPattern.test(url)) {
        badRequests.push(`${page.label}: ${url}`);
      }
      if (event.method === 'Network.responseReceived' && event.params.response.status >= 400 && !/favicon/.test(url)) {
        misses.push(`${page.label} ${event.params.response.status} ${url}`);
      }
      if (event.method === 'Runtime.exceptionThrown') hardErrors.push(`${page.label}: runtime exception`);
      if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
        const text = event.params.entry.text ?? '';
        if (!/favicon/i.test(text) && !/Failed to load resource:.*404/i.test(text)) {
          hardErrors.push(`${page.label}: ${text}`);
        }
      }
    }
  }
  return {badRequests, misses, hardErrors};
}

await listen();
const profile = path.join(process.env.TEMP ?? '.', `app-demo-stress-profile-${Date.now()}`);
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
  const failures = [];
  const docsBaseline = Object.fromEntries(requiredDocsFiles.map((file) => [file, fs.existsSync(path.join(root, file))]));
  const counters = {
    app2Sync: 0,
    assignmentSync: 0,
    teacherHandoff: 0,
    incidentResolved: 0,
    panelFit: 0,
    mobileFit: 0,
    mainFit: 0,
  };

  const portal = await openPage(`${base}/`, 'portal');
  const app2 = await openPage(`${base}/app2/`, 'app2');
  const robot2 = await openPage(`${base}/app2/robot-display.html`, 'robot2');
  const app3 = await openPage(`${base}/app3/`, 'app3');
  const robot3 = await openPage(`${base}/app3/robot-display.html`, 'robot3');
  pages.push(portal, app2, robot2, app3, robot3);

  await app3.viewport(1920, 927, false);
  await robot3.viewport(1366, 768, false);
  await waitFor(app2, 'document.querySelectorAll("button").length > 5', 7000);
  await waitFor(app3, 'document.querySelectorAll("button").length > 5', 7000);
  await waitFor(robot2, 'document.body.innerText.length > 60', 7000);
  await waitFor(robot3, 'document.body.innerText.length > 200', 7000);

  const panelPages = [];
  for (const panel of ['alerts', 'sensing', 'care']) {
    const page = await openPage(`${base}/app3/#${panel}`, `app3-panel-${panel}`);
    await page.viewport(1366, 768, false);
    await waitFor(page, '!!document.querySelector(".app3-work-drawer")', 7000);
    panelPages.push(page);
    pages.push(page);
  }

  const mobilePages = [];
  for (const [label, url] of [
    ['app2-mobile', `${base}/app2/`],
    ['app3-mobile', `${base}/app3/`],
    ['robot2-mobile', `${base}/app2/robot-display.html`],
    ['robot3-mobile', `${base}/app3/robot-display.html`],
  ]) {
    const page = await openPage(url, label);
    await page.viewport(390, 844, true);
    mobilePages.push(page);
    pages.push(page);
  }

  const portalText = await portal.text();
  const portalBaseline = (await portal.eval(`(() => {
    const links = [...document.querySelectorAll('a')].map((link) => link.getAttribute('href') || '');
    return {
      hasApp2: links.some((href) => href.includes('app2/')),
      hasApp3: links.some((href) => href.includes('app3/')),
      hasRobot2: links.some((href) => href.includes('app2/robot-display.html')),
      hasRobot3: links.some((href) => href.includes('app3/robot-display.html')),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  })()`)).result.result.value;
  const baseline = (await app3.eval(`(() => {
    const text = document.body.innerText;
    return {
      portal: ${JSON.stringify(portalText)}.includes('App2') && ${JSON.stringify(portalText)}.includes('App3'),
      highlights: ${JSON.stringify(demoHighlights)}.every((item) => text.includes(item)),
      pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      hasBadScriptText: text.includes('\u5b78\u751f\u64cd\u4f5c\u4e3b\u7dda') || text.includes('AI \u6574\u7406') || text.includes('\u5c55\u793a\u6b65\u9a5f'),
    };
  })()`)).result.result.value;
  const robotHudReady = await waitFor(robot3, `document.body.textContent.includes('Live Guardian Loop') || document.body.textContent.includes('LIVE GUARDIAN LOOP')`, 7000);
  const robotBaseline = (await robot3.eval(`(() => {
    const text = document.body.textContent || '';
    const controls = document.querySelector('.robot-display-controls');
    const rect = controls?.getBoundingClientRect();
    const groups = controls ? [...controls.children] : [];
    const controlStates = ${JSON.stringify(robotDemoControls)}.map((label) => {
      const group = groups.find((item) => (item.textContent || '').includes(label) || (item.querySelector('button')?.getAttribute('title') || '').includes(label));
      const button = group?.querySelector('button');
      const buttonRect = button?.getBoundingClientRect();
      return {
        label,
        found: Boolean(group && button),
        visible: Boolean(buttonRect && buttonRect.width >= 44 && buttonRect.height >= 44 && buttonRect.left >= -2 && buttonRect.right <= window.innerWidth + 2 && buttonRect.bottom <= window.innerHeight + 2),
      };
    });
    return {
      hasControls: ${JSON.stringify(robotDemoControls)}.every((item) => text.includes(item)),
      allControlButtonsVisible: controlStates.every((item) => item.found && item.visible),
      controlStates,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      controlsOffscreen: !rect || rect.left < -2 || rect.right > window.innerWidth + 2 || rect.bottom > window.innerHeight + 2,
      buttons: document.querySelectorAll('button').length,
      hudHighlights: ${JSON.stringify(robotHudHighlights)}.every((item) => text.includes(item)),
    };
  })()`)).result.result.value;

  if (Object.values(docsBaseline).some((exists) => !exists)) {
    failures.push(`required docs files missing ${JSON.stringify(docsBaseline)}`);
  }
  if (!baseline.portal || !portalBaseline.hasApp2 || !portalBaseline.hasApp3 || !portalBaseline.hasRobot2 || !portalBaseline.hasRobot3 || portalBaseline.horizontalOverflow) {
    failures.push(`portal demo links failed ${JSON.stringify(portalBaseline)}`);
  }
  if (!baseline.highlights) failures.push('App3 demo highlights missing');
  if (baseline.pageOverflow > 2 || baseline.horizontalOverflow) failures.push(`App3 main overflow ${JSON.stringify(baseline)}`);
  if (baseline.hasBadScriptText) failures.push('App3 main still contains script-step wording');
  if (!robotHudReady) failures.push('App3 robot HUD missing Live Guardian Loop');
  if (!robotBaseline.hasControls || !robotBaseline.allControlButtonsVisible || !robotBaseline.hudHighlights || robotBaseline.horizontalOverflow || robotBaseline.controlsOffscreen || robotBaseline.buttons < 5) {
    failures.push(`App3 robot demo controls failed ${JSON.stringify(robotBaseline)}`);
  }

  for (let round = 1; round <= rounds; round += 1) {
    const assignment = makeAssignment(round);
    await postApp3StaticEvent(robot3, assignment);
    const assignmentOk = await waitFor(robot3, `document.body.innerText.includes(${JSON.stringify(assignment.missionId)}) || document.body.innerText.includes(${JSON.stringify(libraryName)})`);
    if (assignmentOk) counters.assignmentSync += 1;
    else failures.push(`round ${round}: robot assignment did not render`);

    await postApp3StaticEvent(robot3, makeEmotion(round, 'teacher_called'));
    const teacherOk = await waitFor(
      app3,
      `document.body.innerText.includes(${JSON.stringify(teacherHandoffLine)}) || document.body.innerText.includes(${JSON.stringify(libraryName + '\u5df2\u7531\u6a5f\u5668\u4eba\u901a\u5831\u8001\u5e2b\u63a5\u624b')})`,
    );
    if (teacherOk) counters.teacherHandoff += 1;
    else failures.push(`round ${round}: teacher handoff did not sync to App3`);

    await postApp3StaticEvent(robot3, makeEmotion(round, 'incident_resolved'));
    const resolvedOk = await waitFor(app3, `!document.body.innerText.includes(${JSON.stringify(teacherHandoffLine)})`);
    if (resolvedOk) counters.incidentResolved += 1;
    else failures.push(`round ${round}: incident resolved did not clear handoff`);

    const app2Message = `App2 stress round ${round}`;
    await postApp2Event(app2, app2Message);
    const app2Ok = await waitFor(robot2, `window.__APP2_LAST_DISPLAY_EVENT?.message === ${JSON.stringify(app2Message)}`);
    if (app2Ok) counters.app2Sync += 1;
    else failures.push(`round ${round}: App2 robot sync failed`);

    const panelPage = panelPages[(round - 1) % panelPages.length];
    const panelMetrics = (await panelPage.eval(`(() => {
      const drawer = document.querySelector('.app3-work-drawer');
      const rect = drawer?.getBoundingClientRect();
      return {
        ok: !!rect && rect.top >= -2 && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.bottom <= window.innerHeight + 2 && document.documentElement.scrollWidth <= window.innerWidth + 2,
        buttons: drawer ? drawer.querySelectorAll('button').length : 0,
      };
    })()`)).result.result.value;
    if (panelMetrics.ok && panelMetrics.buttons >= 2) counters.panelFit += 1;
    else failures.push(`round ${round}: panel fit failed ${JSON.stringify(panelMetrics)}`);

    const mainMetrics = (await app3.eval(`(() => ({
      ok: document.documentElement.scrollHeight - window.innerHeight <= 2 && document.documentElement.scrollWidth <= window.innerWidth + 2,
      textLength: document.body.innerText.length,
    }))()`)).result.result.value;
    if (mainMetrics.ok && mainMetrics.textLength > 100) counters.mainFit += 1;
    else failures.push(`round ${round}: App3 main fit failed ${JSON.stringify(mainMetrics)}`);

    if (round % 10 === 0) {
      for (const page of mobilePages) {
        const mobileMetrics = (await page.eval(`(() => ({
          ok: document.documentElement.scrollWidth <= window.innerWidth + 2 && document.body.innerText.length > 20,
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }))()`)).result.result.value;
        if (mobileMetrics.ok) counters.mobileFit += 1;
        else failures.push(`round ${round}: ${page.label} mobile fit failed ${JSON.stringify(mobileMetrics)}`);
      }
    }
  }

  const {badRequests, misses, hardErrors} = collectErrors(pages);
  const result = {
    rounds,
    counters,
    docsBaseline,
    portalBaseline,
    baseline,
    robotBaseline,
    robotHudReady,
    badRequests,
    misses,
    hardErrors,
    failures: failures.slice(0, 20),
    failureCount: failures.length + badRequests.length + misses.length + hardErrors.length,
  };
  console.log(JSON.stringify(result, null, 2));

  pages.forEach((page) => page.ws.close());
  if (result.failureCount > 0) process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
}
