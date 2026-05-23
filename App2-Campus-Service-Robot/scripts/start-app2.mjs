#!/usr/bin/env node
import {exec, execSync, spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagedAppDir = path.join(rootDir, 'app2');
const repoAppDir = path.join(rootDir, 'google ai studio', 'app_2（國小）', '校園服務機器人 app');
const appDir = fs.existsSync(packagedAppDir) ? packagedAppDir : repoAppDir;
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const webPort = Number(process.env.APP2_WEB_PORT ?? 3000);
const bridgePort = Number(process.env.APP2_BRIDGE_PORT ?? process.env.BRIDGE_PORT ?? 3204);
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
  const candidates = isWin ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], {stdio: 'ignore', shell: isWin});
    if (result.status === 0) return candidate;
  }
  return null;
}

function ensurePythonYoloDeps() {
  const python = findPython();
  if (!python) {
    console.log('[app2] 找不到 Python，YOLO 會使用前端 CV 備援。');
    return;
  }
  const check = spawnSync(python, ['-c', 'import cv2, numpy, ultralytics'], {stdio: 'ignore', shell: isWin});
  if (check.status === 0) {
    console.log('[app2] Python YOLO 依賴已就緒。');
    return;
  }
  console.log('[app2] 安裝 Python YOLO 依賴（ultralytics / opencv-python / numpy）...');
  try {
    run(`${python} -m pip install --upgrade pip`, {cwd: appDir});
    run(`${python} -m pip install ultralytics opencv-python numpy`, {cwd: appDir});
  } catch {
    console.log('[app2] Python YOLO 依賴安裝失敗，系統仍會用 CV 備援繼續啟動。');
  }
}

console.log('');
console.log('==============================================');
console.log('  App 2 校園服務機器人 - 單獨啟動');
console.log('==============================================');
console.log('');

try {
  run(`${isWin ? 'where' : 'command -v'} node`, {stdio: 'ignore'});
} catch {
  console.error('找不到 Node.js。請先安裝 Node.js 20+：https://nodejs.org/');
  process.exit(1);
}

console.log(`[app2] Web    http://localhost:${webPort}`);
console.log(`[app2] Bridge http://localhost:${bridgePort}`);
console.log('');

console.log('[app2] 檢查 npm 依賴...');
const envPath = path.join(appDir, '.env');
const envExamplePath = path.join(appDir, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log('[app2] 已建立 app2/.env。若要啟用 Gemini，請填入 GEMINI_API_KEY。');
}
run(`${npm} install --prefer-offline --no-audit --no-fund`, {cwd: appDir});
ensurePythonYoloDeps();

console.log('[app2] 清理既有 port...');
freePort(webPort);
freePort(bridgePort);

const env = {
  ...process.env,
  APP2_WEB_PORT: String(webPort),
  APP2_BRIDGE_PORT: String(bridgePort),
  BRIDGE_PORT: String(bridgePort),
  VITE_ARDUINO_BRIDGE_URL: `http://localhost:${bridgePort}`,
};

setTimeout(() => {
  openUrl(`http://localhost:${webPort}/`);
}, 4500);

console.log('[app2] 啟動中。關閉此視窗或按 Ctrl+C 可停止 App2。');
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
    console.log(`[app2] ${name} stopped (${signal ?? code ?? 0})`);
    shutdown();
    process.exit(code ?? (signal ? 1 : 0));
  });
  return child;
}

let shuttingDown = false;
spawnService('web', ['run', 'dev:web', '--', '--port', String(webPort)]);
spawnService('bridge', ['run', 'dev:bridge']);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
