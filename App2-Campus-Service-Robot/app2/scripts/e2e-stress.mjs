import WebSocket from 'ws';

const STORAGE_KEY = 'campus-service-robot:v1';
const TOUR_STORAGE_KEY = 'tour-app2:v1';

const rawBaseUrl = process.env.APP2_E2E_URL ?? 'http://localhost:3000';
const appBaseUrl = rawBaseUrl.split('#')[0].replace(/\/$/, '');
const bridgeBaseUrl = (process.env.APP2_BRIDGE_URL ?? process.env.VITE_ARDUINO_BRIDGE_URL ?? 'http://localhost:3204').replace(/\/$/, '');
const cdpHost = process.env.CDP_HOST ?? '127.0.0.1';
const cdpPort = Number(process.env.CDP_PORT ?? '9222');
const rounds = Number(process.env.APP2_E2E_ROUNDS ?? '100');

const viewports = [
  { width: 1440, height: 900, mobile: false },
  { width: 1180, height: 780, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
];

const routes = [
  { hash: 'life', expected: ['放學降雨預警', '智慧廣播控制', '今日鐘聲時程'] },
  { hash: 'teach', expected: ['出缺席場域評估', '學習警示與氛圍分析', '影片辨識'] },
  { hash: 'delivery', expected: ['學生 / 教職員取件', '校園服務機 R-01', '即時配送狀態'] },
];

const term = (...parts) => parts.join('');
const forbiddenVisibleTerms = [
  term('閉', '環'),
  ['Delta', '04'].join(String.fromCharCode(45)),
  term('假', '即', '時'),
  term('抽', '幀', '測', '試'),
  term('測', '試', '底', '盤'),
  term('底', '盤', '測', '試'),
  term('葉', '片', '測', '試'),
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const routeUrl = (hash) => {
  const url = new URL(appBaseUrl);
  url.hash = hash.replace(/^#/, '');
  return url.href;
};

const robotDisplayUrl = () => {
  const appUrl = new URL(appBaseUrl);
  const bridgeUrl = new URL(bridgeBaseUrl);
  const url = new URL('robot-display.html', appUrl);
  url.searchParams.set('bridge', `${appUrl.hostname || bridgeUrl.hostname || 'localhost'}:${bridgeUrl.port || '3204'}`);
  return url.href;
};

async function chromeJson(path, init = {}) {
  const res = await fetch(`http://${cdpHost}:${cdpPort}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chrome DevTools ${path} failed: ${res.status} ${text.slice(0, 160)}`);
  }
  return res.json();
}

class CdpPage {
  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.logs = [];
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => this.handleMessage(raw));
  }

  handleMessage(raw) {
    const message = JSON.parse(raw.toString());
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
      else resolve(message.result ?? {});
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      this.exceptions.push(message.params?.exceptionDetails?.text ?? 'Runtime exception');
    }

    if (message.method === 'Log.entryAdded') {
      const entry = message.params?.entry;
      if (entry && ['error', 'warning'].includes(entry.level)) {
        this.logs.push(`${entry.level}: ${entry.text}`);
      }
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
    });
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
  }

  async setViewport(viewport) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
  }

  async navigate(hash) {
    await this.send('Page.navigate', { url: routeUrl(hash) });
    await waitFor(
      () => this.evaluate(`Boolean(document.body) && ['interactive', 'complete'].includes(document.readyState)`),
      12000,
      `route #${hash} ready`,
    );
    await delay(250);
  }

  async navigateUrl(url) {
    await this.send('Page.navigate', { url });
    await waitFor(
      () => this.evaluate(`Boolean(document.body) && ['interactive', 'complete'].includes(document.readyState)`),
      12000,
      `url ${url} ready`,
    );
    await delay(350);
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: true });
    await waitFor(
      () => this.evaluate(`Boolean(document.body) && ['interactive', 'complete'].includes(document.readyState)`),
      12000,
      'page reload',
    );
    await delay(400);
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime evaluate failed');
    }
    return result.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(160);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError})` : ''}`);
}

async function getProbe(page) {
  return page.evaluate(`(() => {
    const text = document.body?.innerText ?? '';
    const state = (() => {
      try { return JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}'); }
      catch { return {}; }
    })();
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    return {
      text,
      url: location.href,
      width: window.innerWidth,
      overflowX: Math.max(0, scrollWidth - window.innerWidth),
      robotCount: Array.isArray(state.robots) ? state.robots.length : 0,
      robotSerials: Array.isArray(state.robots) ? state.robots.map((robot) => robot.serial) : [],
      commands: Array.isArray(state.robotCommandLogs) ? state.robotCommandLogs.map((log) => log.command) : [],
      orders: Array.isArray(state.orders) ? state.orders.map((order) => order.status) : [],
    };
  })()`);
}

async function readState(page) {
  return page.evaluate(`(() => {
    try { return JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || '{}'); }
    catch { return {}; }
  })()`);
}

function countCommand(state, command) {
  return Array.isArray(state.robotCommandLogs)
    ? state.robotCommandLogs.filter((log) => log.command === command).length
    : 0;
}

function latestCommandId(state) {
  return Array.isArray(state.robotCommandLogs) ? state.robotCommandLogs[0]?.id : undefined;
}

function hasNewLatestCommand(state, previousId, command) {
  if (!Array.isArray(state.robotCommandLogs) || !state.robotCommandLogs[0]) return false;
  const latest = state.robotCommandLogs[0];
  return latest.id !== previousId && latest.command === command;
}

async function clickByText(page, fragments) {
  return page.evaluate(`((fragments) => {
    const isVisible = (element) => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && !element.disabled
        && Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    };
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
    for (const fragment of fragments) {
      const match = candidates.find((element) => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').includes(fragment));
      if (match) {
        match.scrollIntoView({ block: 'center', inline: 'center' });
        match.click();
        return { clicked: true, fragment, text: (match.innerText || match.textContent || '').trim().slice(0, 80) };
      }
    }
    return {
      clicked: false,
      available: candidates.map((element) => (element.innerText || element.textContent || '').trim()).filter(Boolean).slice(0, 30),
    };
  })(${JSON.stringify(fragments)})`);
}

async function clickSelector(page, selector) {
  return page.evaluate(`((selector) => {
    const element = document.querySelector(selector);
    if (!element) return { clicked: false };
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return { clicked: true, text: (element.innerText || element.textContent || '').trim().slice(0, 120) };
  })(${JSON.stringify(selector)})`);
}

async function clickFirstProductCard(page) {
  return page.evaluate(`(() => {
    const scope = document.querySelector('[data-tour="new-order-btn"]') || document.body;
    const cards = Array.from(scope.querySelectorAll('div, article, button')).filter((element) => {
      const text = element.innerText || element.textContent || '';
      return element.querySelector('img') && text.includes('NT$') && getComputedStyle(element).pointerEvents !== 'none';
    });
    const card = cards.find((element) => element.className && String(element.className).includes('cursor-pointer')) || cards[0];
    if (!card) return { clicked: false };
    card.scrollIntoView({ block: 'center', inline: 'center' });
    card.click();
    return { clicked: true, text: (card.innerText || card.textContent || '').trim().slice(0, 120) };
  })()`);
}

async function clickPrimaryModalButton(page) {
  return page.evaluate(`(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && !element.disabled;
    };
    const buttons = Array.from(document.querySelectorAll('button')).filter(isVisible);
    const candidates = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      const text = (button.innerText || button.textContent || '').trim();
      return rect.width >= 180
        && rect.height >= 44
        && !['+', '-'].includes(text)
        && !text.includes('關閉')
        && !text.includes('返回');
    });
    const button = candidates[candidates.length - 1];
    if (!button) {
      return {
        clicked: false,
        available: buttons.map((item) => ({
          text: (item.innerText || item.textContent || '').trim().slice(0, 80),
          rect: item.getBoundingClientRect().toJSON(),
        })).slice(-12),
      };
    }
    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.click();
    return { clicked: true, text: (button.innerText || button.textContent || '').trim().slice(0, 100) };
  })()`);
}

async function resetDemoState(page) {
  await page.navigate('life');
  await page.evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(STORAGE_KEY)});
    localStorage.setItem(${JSON.stringify(TOUR_STORAGE_KEY)}, 'done');
    return true;
  })()`);
  await page.reload();
  await waitFor(async () => {
    const state = await readState(page);
    return Array.isArray(state.robots) && state.robots.length === 1;
  }, 8000, 'demo state hydration');
}

async function assertRoute(page, route, round) {
  const probe = await waitFor(async () => {
    const current = await getProbe(page);
    return route.expected.every((text) => current.text.includes(text)) ? current : false;
  }, 10000, `#${route.hash} expected text`);

  const missing = route.expected.filter((text) => !probe.text.includes(text));
  if (missing.length) {
    throw new Error(`Round ${round} #${route.hash} missing expected text: ${missing.join(', ')}`);
  }

  const forbidden = forbiddenVisibleTerms.filter((term) => probe.text.includes(term));
  if (forbidden.length) {
    throw new Error(`Round ${round} #${route.hash} shows forbidden text: ${forbidden.join(', ')}`);
  }

  if (probe.overflowX > 8) {
    throw new Error(`Round ${round} #${route.hash} horizontal overflow ${probe.overflowX}px at width ${probe.width}`);
  }

  if (probe.robotCount !== 1 || !probe.robotSerials.includes('校園服務機 R-01')) {
    throw new Error(`Round ${round} robot identity drift: ${JSON.stringify(probe.robotSerials)}`);
  }
}

async function runLifeFlow(page) {
  await page.setViewport(viewports[0]);
  await page.navigate('life');
  const before = await readState(page);
  const beforeLatestId = latestCommandId(before);

  const demoClick = await clickSelector(page, '[data-e2e="life-demo-rain"]');
  if (!demoClick.clicked) {
    throw new Error('Life flow could not find rain demo button');
  }

  try {
    await waitFor(async () => hasNewLatestCommand(await readState(page), beforeLatestId, 'BROADCAST_START'), 3500, 'rain broadcast command');
  } catch {
    const fallbackClick = await clickByText(page, ['發送廣播任務', '再按一次確認安全警示']);
    if (!fallbackClick.clicked) throw new Error('Life flow could not trigger broadcast fallback');
    await waitFor(async () => hasNewLatestCommand(await readState(page), beforeLatestId, 'BROADCAST_START'), 5000, 'broadcast command');
  }

  const state = await readState(page);
  if (!state.robotCommandLogs?.some((log) => log.command === 'BROADCAST_START')) {
    throw new Error('Life flow did not record BROADCAST_START');
  }
  if (state.robots?.length !== 1 || state.robots[0]?.serial !== '校園服務機 R-01') {
    throw new Error(`Life flow robot mismatch: ${JSON.stringify(state.robots)}`);
  }
}

async function runDeliveryFlow(page) {
  await page.setViewport(viewports[1]);
  await page.navigate('delivery');
  const before = await readState(page);
  const beforeStartId = latestCommandId(before);

  if (!before.orders?.some((order) => order.status === 'in_transit')) {
    const cardClick = await clickSelector(page, '[data-e2e="delivery-product-card"]');
    if (!cardClick.clicked) {
      throw new Error('Delivery flow could not find a product card');
    }
    await delay(300);

    const orderClick = await clickSelector(page, '[data-e2e="delivery-order-submit"]');
    if (!orderClick.clicked) {
      throw new Error(`Delivery flow could not find order button: ${JSON.stringify(orderClick.available)}`);
    }
    await waitFor(async () => hasNewLatestCommand(await readState(page), beforeStartId, 'DELIVERY_START'), 6000, 'delivery start command');
  }

  const activeState = await readState(page);
  if (!activeState.orders?.some((order) => order.status === 'in_transit')) {
    throw new Error('Delivery flow did not create an active order');
  }
  if (activeState.robots?.length !== 1 || activeState.robots[0]?.serial !== '校園服務機 R-01') {
    throw new Error(`Delivery flow robot mismatch: ${JSON.stringify(activeState.robots)}`);
  }

  await page.navigate('delivery');
  const beforeDoneId = latestCommandId(await readState(page));
  const completeClick = await clickSelector(page, '[data-e2e="delivery-complete-pickup"]');
  if (!completeClick.clicked) {
    throw new Error('Delivery flow could not find complete button');
  }
  await waitFor(async () => hasNewLatestCommand(await readState(page), beforeDoneId, 'DELIVERY_DONE'), 6000, 'delivery done command');
}

async function runRobotDisplayFlow() {
  const target = await chromeJson(`/json/new?${encodeURIComponent(robotDisplayUrl())}`, { method: 'PUT' });
  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools did not return a robot-display websocket URL.');
  }

  const displayPage = new CdpPage(target);
  const message = `R-01 display sync ${Date.now().toString(36)}`;

  try {
    await displayPage.init();
    await displayPage.setViewport({ width: 1024, height: 768, mobile: false });
    await displayPage.navigateUrl(robotDisplayUrl());

    await waitFor(async () => {
      const probe = await getProbe(displayPage);
      return probe.text.includes('SYNCED') || probe.text.includes('LOCAL');
    }, 12000, 'robot display page sync indicator');

    await waitFor(async () => {
      const res = await fetch(`${bridgeBaseUrl}/api/display/status`);
      if (!res.ok) return false;
      const json = await res.json().catch(() => ({}));
      return Number(json.clients ?? 0) >= 1;
    }, 10000, 'robot display websocket client');

    const res = await fetch(`${bridgeBaseUrl}/api/display/emotion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emotion: 'excited', message }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false || Number(payload.clients ?? 0) < 1) {
      throw new Error(`robot display emotion push failed: ${res.status} ${JSON.stringify(payload).slice(0, 160)}`);
    }

    await waitFor(async () => {
      const eventProbe = await displayPage.evaluate(`((message) => {
        const log = Array.isArray(window.__APP2_DISPLAY_EVENT_LOG) ? window.__APP2_DISPLAY_EVENT_LOG : [];
        return log.some((item) => item && item.message === message);
      })(${JSON.stringify(message)})`);
      const probe = await getProbe(displayPage);
      if (probe.overflowX > 8) {
        throw new Error(`robot display horizontal overflow ${probe.overflowX}px`);
      }
      return eventProbe || probe.text.includes(message);
    }, 10000, 'robot display sync event');
  } finally {
    displayPage.close();
    await chromeJson(`/json/close/${target.id}`, { method: 'PUT' }).catch(() => undefined);
  }
}

async function main() {
  const target = await chromeJson(`/json/new?${encodeURIComponent(routeUrl('life'))}`, { method: 'PUT' });
  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools did not return a page websocket URL.');
  }

  const page = new CdpPage(target);
  let routeChecks = 0;
  let flowChecks = 0;

  try {
    await page.init();
    await resetDemoState(page);

    for (let round = 1; round <= rounds; round += 1) {
      const viewport = viewports[(round - 1) % viewports.length];
      const route = routes[(round - 1) % routes.length];
      await page.setViewport(viewport);
      await page.navigate(route.hash);
      await assertRoute(page, route, round);
      routeChecks += 1;

      if (round % 10 === 0) {
        await runLifeFlow(page);
        flowChecks += 1;
      }

      if (round % 25 === 0) {
        await runDeliveryFlow(page);
        flowChecks += 1;
      }

      if (round % 50 === 0) {
        await runRobotDisplayFlow();
        flowChecks += 1;
      }

      if (round % 20 === 0) {
        console.log(JSON.stringify({ round, routeChecks, flowChecks }));
      }
    }

    if (page.exceptions.length) {
      throw new Error(`Runtime exceptions detected: ${page.exceptions.slice(0, 3).join(' | ')}`);
    }

    console.log(JSON.stringify({ ok: true, rounds, routeChecks, flowChecks }, null, 2));
  } finally {
    page.close();
    await chromeJson(`/json/close/${target.id}`, { method: 'PUT' }).catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  if (/Chrome DevTools|ECONNREFUSED|websocket|CDP/i.test(message)) {
    console.error(`Make sure Chrome is running with remote debugging on ${cdpHost}:${cdpPort}.`);
  }
  process.exitCode = 1;
});
