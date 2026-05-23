import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, relative, resolve} from 'node:path';

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(appDir, '..', '..');
const selfPath = resolve(fileURLToPath(import.meta.url));

const targets = [
  resolve(appDir, 'src'),
  resolve(appDir, 'scripts'),
  resolve(appDir, 'package.json'),
  resolve(workspaceRoot, 'App2-Campus-Service-Robot', 'robot_app2.jsx'),
  resolve(workspaceRoot, 'GITHUB_PAGES_DEMO.md'),
  resolve(workspaceRoot, 'scripts', 'build-github-pages.mjs'),
  resolve(workspaceRoot, 'docs', 'index.html'),
  resolve(workspaceRoot, 'docs', 'app2'),
];

const skippedDirs = new Set(['node_modules', 'dist', 'visual-check', '.git']);
const skippedExtensions = new Set(['.map', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.mp4', '.mov']);

const forbidden = [
  ['forbidden wording', /閉環|&#38281;&#29872;|模擬閉環/],
  ['legacy bridge port', /localhost:3202|[^0-9]3202[^0-9]/],
  ['legacy robot name', /Delta-04/],
  ['weak AI fallback wording', /AI 暫時無法回應|暫時覆寫/],
  ['engineering-only test wording', /假即時|抽幀測試|測試底盤|底盤測試|葉片測試|測試攝像頭|測試通過|點名測試/],
  ['replacement or private-use glyph', /�|ï¿½|Ã|Â|[\uE000-\uF8FF]/],
];

const requiredDocs = [
  ['verify command', /npm run verify:competition/],
  ['100-round coverage', /100-round browser stress test/],
  ['single robot story', /R-01/],
  ['robot display proof', /ROBOT display/],
  ['command log proof', /command logs/],
  ['offline hardware proof', /no Arduino required|Arduino is not connected/],
  ['bridge port proof', /localhost:3204/],
  ['talk track', /90-Second Talk Track/],
  ['hardware backup', /Hardware Backup Checklist/],
  ['judge q and a', /Judge Q&A/],
];

const requiredSourceChecks = [
  {
    file: resolve(appDir, 'package.json'),
    checks: [
      ['competition verify script', /"verify:competition": "npm run audit:competition && npm run check && npm run test:api && npm run test:e2e"/],
      ['competition audit script', /"audit:competition": "node scripts\/competition-audit\.mjs"/],
    ],
  },
  {
    file: resolve(appDir, 'scripts', 'e2e-stress.mjs'),
    checks: [
      ['100 round default', /APP2_E2E_ROUNDS \?\? '100'/],
      ['life flow coverage', /runLifeFlow/],
      ['delivery flow coverage', /runDeliveryFlow/],
      ['robot display flow coverage', /runRobotDisplayFlow/],
      ['route counter', /routeChecks/],
      ['flow counter', /flowChecks/],
      ['single robot assertion', /校園服務機 R-01/],
    ],
  },
  {
    file: resolve(appDir, 'scripts', 'api-smoke.mjs'),
    checks: [
      ['ready endpoint', /\/api\/ready/],
      ['display info endpoint', /\/api\/display\/info/],
      ['classroom analyze endpoint', /\/api\/ai\/classroom-analyze/],
      ['dispatch recommend endpoint', /\/api\/ai\/dispatch-recommend/],
      ['teacher reply endpoint', /\/api\/ai\/teacher-reply/],
      ['student report endpoint', /\/api\/ai\/student-report/],
      ['display emotion endpoint', /\/api\/display\/emotion/],
      ['robot display page check', /ROBOT display/],
    ],
  },
];

async function walk(path) {
  const entries = await readdir(path, {withFileTypes: true}).catch(() => null);
  if (!entries) return [path];

  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) files.push(...await walk(join(path, entry.name)));
      continue;
    }

    if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : '';
      if (!skippedExtensions.has(ext)) files.push(join(path, entry.name));
    }
  }
  return files;
}

const files = [...new Set((await Promise.all(targets.map(walk))).flat())];
const failures = [];

for (const file of files) {
  if (resolve(file) === selfPath) continue;
  let text = '';
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      failures.push(`${relative(workspaceRoot, file)}: ${label}`);
    }
  }
}

const guide = await readFile(resolve(workspaceRoot, 'GITHUB_PAGES_DEMO.md'), 'utf8');
for (const [label, pattern] of requiredDocs) {
  if (!pattern.test(guide)) failures.push(`GITHUB_PAGES_DEMO.md: missing ${label}`);
}

for (const source of requiredSourceChecks) {
  const text = await readFile(source.file, 'utf8');
  for (const [label, pattern] of source.checks) {
    if (!pattern.test(text)) failures.push(`${relative(workspaceRoot, source.file)}: missing ${label}`);
  }
}

if (failures.length) {
  console.error('competition audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`competition audit: ok (${files.length} files scanned)`);
}
