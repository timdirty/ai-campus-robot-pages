#!/usr/bin/env node
import {exec, execSync, spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagedAppDir = path.join(rootDir, 'app3');
const repoAppDir = path.join(rootDir, 'google ai studio', 'app_3（國中）', 'AI校園心靈守護者');
const appDir = fs.existsSync(packagedAppDir) ? packagedAppDir : repoAppDir;
const robotAppDir = fs.existsSync(path.join(rootDir, 'robot-app'))
  ? path.join(rootDir, 'robot-app')
  : path.join(rootDir, 'google ai studio', 'app_3（國中）', 'robot-app');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const webPort = Number(process.env.APP3_WEB_PORT ?? 11503);
const bridgePort = Number(process.env.APP3_BRIDGE_PORT ?? process.env.BRIDGE_PORT ?? 3203);
const pairingPort = Number(process.env.APP3_PAIRING_PORT ?? process.env.HTTPS_PAIRING_PORT ?? 3443);
const children = [];

function run(command, options = {}) {
  execSync(command, {
    cwd: options.cwd ?? rootDir,
    stdio: options.stdio ?? 'inherit',
    shell: true,
    env: {...process.env, ...options.env},
  });
}

function freePort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
      const pids = [...new Set(out.split(/\r?\n/).map((line) => line.trim().split(/\s+/).pop()).filter((pid) => /^\d+$/.test(pid ?? '') && pid !== '0'))];
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, {stdio: 'ignore'}); } catch {}
      }
      return;
    }
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, {encoding: 'utf8'}).trim();
    if (pids) execSync(`kill -9 ${pids.split('\n').join(' ')} 2>/dev/null || true`);
  } catch {
    // Port is already free.
  }
}

function openUrl(url) {
  const command = isWin ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {});
}

function findPython() {
  const candidates = isWin
    ? [{command: 'py', args: ['-3']}, {command: 'python', args: []}, {command: 'python3', args: []}]
    : [{command: 'python3', args: []}, {command: 'python', args: []}];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], {stdio: 'ignore', shell: isWin});
    if (result.status === 0) return candidate;
  }
  return null;
}

function runPython(python, args, cwd = appDir) {
  const result = spawnSync(python.command, [...python.args, ...args], {
    cwd,
    stdio: 'inherit',
    shell: isWin,
  });
  if (result.status !== 0) throw new Error(`${python.command} ${args.join(' ')} failed`);
}

function ensurePythonVisionDeps() {
  const python = findPython();
  if (!python) {
    console.log('[app3] 找不到 Python，情緒/YOLO 掃描會使用前端備援。');
    return;
  }
  const check = spawnSync(python.command, [...python.args, '-c', 'import cv2, numpy, ultralytics, websockets, openai'], {
    stdio: 'ignore',
    shell: isWin,
  });
  if (check.status === 0) {
    console.log('[app3] Python YOLO / 情緒掃描依賴已就緒。');
    return;
  }
  console.log('[app3] 安裝 Python 視覺依賴（ultralytics / opencv-python / numpy / websockets / openai）...');
  try {
    runPython(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], robotAppDir);
    runPython(python, ['-m', 'pip', 'install', 'ultralytics', 'opencv-python', 'numpy', 'websockets', 'openai'], robotAppDir);
  } catch {
    console.log('[app3] Python 視覺依賴安裝失敗，系統仍會用備援流程繼續啟動。');
  }
}

console.log('');
console.log('==============================================');
console.log('  App 3 AI 校園心靈守護者 - 單獨啟動');
console.log('==============================================');
console.log('');

try {
  run(`${isWin ? 'where' : 'command -v'} node`, {stdio: 'ignore'});
} catch {
  console.error('找不到 Node.js。請先安裝 Node.js 20+：https://nodejs.org/');
  process.exit(1);
}

console.log(`[app3] Web    http://localhost:${webPort}`);
console.log(`[app3] Bridge http://localhost:${bridgePort}`);
console.log(`[app3] Robot  https://localhost:${pairingPort}/robot-display.html`);
console.log('');

console.log('[app3] 檢查 npm 依賴...');
const envPath = path.join(appDir, '.env');
const envExamplePath = path.join(appDir, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('[app3] 已建立 app3/.env。若要啟用 Gemini，請填入 GEMINI_API_KEY。');
}
run(`${npm} install --prefer-offline --no-audit --no-fund`, {cwd: appDir});
ensurePythonVisionDeps();

console.log('[app3] 清理既有 port...');
freePort(webPort);
freePort(bridgePort);
freePort(pairingPort);

const env = {
  ...process.env,
  APP3_WEB_PORT: String(webPort),
  APP3_BRIDGE_PORT: String(bridgePort),
  APP3_PAIRING_PORT: String(pairingPort),
  BRIDGE_PORT: String(bridgePort),
  VITE_PORT: String(webPort),
  HTTPS_PAIRING_PORT: String(pairingPort),
  VITE_ARDUINO_BRIDGE_URL: `http://localhost:${bridgePort}`,
};

setTimeout(() => {
  openUrl(`http://localhost:${webPort}/`);
}, 4500);

console.log('[app3] 啟動中。關閉此視窗或按 Ctrl+C 可停止 App3。');
console.log('');

function spawnService(name, args) {
  const child = spawn(npm, args, {
    cwd: appDir,
    stdio: 'inherit',
    shell: isWin,
    env,
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[app3] ${name} stopped (${signal ?? code ?? 0})`);
    shutdown();
    process.exit(code ?? (signal ? 1 : 0));
  });
  return child;
}

let shuttingDown = false;
spawnService('web', ['run', 'dev:web', '--', '--port', String(webPort)]);
spawnService('bridge', ['run', 'dev:bridge']);
spawnService('robot-https', ['run', 'pair:https']);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
