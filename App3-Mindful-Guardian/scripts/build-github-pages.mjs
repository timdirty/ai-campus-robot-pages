#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(rootDir, 'app3');
const distDir = path.join(appDir, 'dist');
const docsDir = path.join(rootDir, 'docs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.rmSync(docsDir, {recursive: true, force: true});

run(npm, ['run', 'build'], {
  cwd: appDir,
  env: {
    VITE_STATIC_DEMO: '1',
    VITE_AI_PROXY_DISABLED: '1',
  },
});

fs.cpSync(distDir, docsDir, {recursive: true});
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '');
fs.writeFileSync(
  path.join(docsDir, 'README-GITHUB-PAGES.txt'),
  [
    'App3 GitHub Pages 線上練習版',
    '',
    'GitHub Pages 請設定 Source = Deploy from a branch，Branch = main，Folder = /docs。',
    '此版本不需要 Arduino、Bridge 或 Gemini API；會自動使用 Demo 感測器與本機 AI 備援。',
    '主控台：index.html',
    'Robot 練習頁：robot-display.html',
    '',
  ].join('\n'),
);

console.log('');
console.log(`[pages] GitHub Pages build ready: ${docsDir}`);
console.log('[pages] Publish /docs from your GitHub repository settings.');
