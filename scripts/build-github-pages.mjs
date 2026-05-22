import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docsDir = join(root, 'docs');
const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';

const apps = [
  {
    name: 'App2 &#26657;&#22290;&#26381;&#21209;&#27231;&#22120;&#20154;',
    id: 'app2',
    dir: join(root, 'App2-Campus-Service-Robot', 'app2'),
    dist: join(root, 'App2-Campus-Service-Robot', 'app2', 'dist'),
    appPath: 'app2/',
    robotPath: 'app2/robot-display.html',
  },
  {
    name: 'App3 Mindful Guardian',
    id: 'app3',
    dir: join(root, 'App3-Mindful-Guardian', 'app3'),
    dist: join(root, 'App3-Mindful-Guardian', 'app3', 'dist'),
    appPath: 'app3/',
    robotPath: 'app3/robot-display.html',
  },
];

function run(command, args, cwd, env = {}) {
  return new Promise((resolveRun, reject) => {
    const finalArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', ['npm', ...args].join(' ')]
      : args;
    const child = spawn(command, finalArgs, {
      cwd,
      stdio: 'inherit',
      env: {...process.env, ...env},
      shell: false,
    });
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${finalArgs.join(' ')} failed with ${code}`));
    });
  });
}

async function copyDir(from, to) {
  if (!existsSync(from)) throw new Error(`Missing build output: ${from}`);
  await rm(to, {recursive: true, force: true});
  await cp(from, to, {recursive: true});
}

function portalHtml() {
  const cards = apps.map((app) => `
    <article class="card">
      <div>
        <p class="eyebrow">${app.id.toUpperCase()} ONLINE DEMO</p>
        <h2>${app.name}</h2>
        <p>&#32218;&#19978;&#32244;&#32722;&#27169;&#24335;&#24050;&#20839;&#24314; AI &#20633;&#25588;&#12289;&#30828;&#39636;&#27169;&#25836;&#12289;Robot display &#21516;&#27493;&#65292;&#21487;&#30452;&#25509;&#32102;&#23416;&#29983;&#33287;&#35413;&#23529;&#25805;&#20316;&#12290;</p>
      </div>
      <div class="actions">
        <a class="primary" href="${app.appPath}">&#38283;&#21855;&#20027;&#25511; App</a>
        <a href="${app.robotPath}">&#38283;&#21855; Robot Display</a>
      </div>
    </article>
  `).join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI &#26657;&#22290;&#27231;&#22120;&#20154;&#23637;&#31034;&#20837;&#21475;</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Noto Sans TC", "Segoe UI", system-ui, sans-serif;
      background: #eef7fb;
      color: #102033;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 12% 12%, rgba(20, 184, 166, 0.20), transparent 34%),
        radial-gradient(circle at 85% 18%, rgba(59, 130, 246, 0.16), transparent 32%),
        linear-gradient(135deg, #f8fcff 0%, #e9f7f2 100%);
    }
    main {
      width: min(1080px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0;
    }
    header { margin-bottom: 28px; }
    .eyebrow {
      margin: 0 0 8px;
      color: #008b83;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .18em;
    }
    h1, h2, p { margin: 0; }
    h1 {
      font-size: clamp(34px, 5vw, 64px);
      line-height: 1;
      letter-spacing: 0;
    }
    header p {
      margin-top: 14px;
      color: #50657f;
      font-size: 18px;
      line-height: 1.7;
      max-width: 760px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .card {
      min-height: 280px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 24px;
      padding: 28px;
      border: 1px solid rgba(16, 32, 51, .12);
      border-radius: 8px;
      background: rgba(255, 255, 255, .82);
      box-shadow: 0 18px 54px rgba(31, 64, 96, .13);
      backdrop-filter: blur(14px);
    }
    .card h2 { font-size: 28px; line-height: 1.15; }
    .card p:not(.eyebrow) {
      margin-top: 12px;
      color: #5a6c82;
      line-height: 1.7;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    a {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 16px;
      border: 1px solid rgba(16, 32, 51, .16);
      border-radius: 8px;
      color: #102033;
      text-decoration: none;
      font-weight: 800;
      background: #fff;
    }
    a.primary {
      color: #fff;
      border-color: #081126;
      background: #081126;
    }
    footer {
      margin-top: 22px;
      color: #63758c;
      font-size: 13px;
      line-height: 1.7;
    }
    @media (max-width: 760px) {
      main { width: min(100% - 24px, 560px); padding: 28px 0; }
      .grid { grid-template-columns: 1fr; }
      .card { min-height: 240px; padding: 22px; }
      header p { font-size: 16px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">GITHUB PAGES DEMO</p>
      <h1>AI &#26657;&#22290;&#27231;&#22120;&#20154;&#23637;&#31034;&#20837;&#21475;</h1>
      <p>App2 &#33287; App3 &#37117;&#21487;&#22312;&#27794;&#26377; Arduino&#12289;EV3&#12289;SPIKE &#25110;&#26412;&#27231;&#27211;&#25509;&#20282;&#26381;&#22120;&#26178;&#23436;&#25972;&#28436;&#32244;&#65307;&#30828;&#39636;&#25351;&#20196;&#26371;&#22238;&#21040;&#27169;&#25836;&#38281;&#29872;&#65292;QR code &#26371;&#36899;&#21040;&#23565;&#25033; Robot Display&#12290;</p>
    </header>
    <section class="grid">${cards}</section>
    <footer>&#37096;&#32626; GitHub Pages &#26178;&#35531;&#36984;&#25799;&#27492;&#23560;&#26696;&#30340; <strong>docs</strong> &#36039;&#26009;&#22846;&#12290;&#32218;&#19978;&#27169;&#24335;&#26371;&#33258;&#21205;&#20572;&#29992;&#26412;&#27231; WebSocket &#33287; localhost API&#12290;</footer>
  </main>
</body>
</html>`;
}

await rm(docsDir, {recursive: true, force: true});
await mkdir(docsDir, {recursive: true});

for (const app of apps) {
  console.log(`\nBuilding ${app.id}...`);
  await run(npmCmd, ['run', 'build'], app.dir, {
    VITE_STATIC_DEMO: '1',
    VITE_AI_PROXY_DISABLED: '1',
  });
  await copyDir(app.dist, join(docsDir, app.id));
}

await writeFile(join(docsDir, '.nojekyll'), '');
await writeFile(join(docsDir, 'index.html'), portalHtml(), 'utf8');
await writeFile(join(docsDir, 'README-GITHUB-PAGES.txt'), [
  'GitHub Pages static demo build',
  '',
  'Publish source: /docs',
  'App2: /app2/',
  'App2 Robot Display: /app2/robot-display.html',
  'App3: /app3/',
  'App3 Robot Display: /app3/robot-display.html',
  '',
  'This build enables VITE_STATIC_DEMO=1 and VITE_AI_PROXY_DISABLED=1.',
].join('\n'), 'utf8');

console.log(`\nDone. GitHub Pages output: ${docsDir}`);
