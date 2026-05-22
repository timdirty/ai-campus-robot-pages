import {createServer as createHttpsServer} from 'node:https';
import {createReadStream, existsSync, readFileSync} from 'node:fs';
import {extname, join, normalize, resolve} from 'node:path';
import {request as httpRequest} from 'node:http';
import {fileURLToPath} from 'node:url';
import {WebSocket, WebSocketServer} from 'ws';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');
const certPath = resolve(rootDir, '.certs/localhost.pem');
const keyPath = resolve(rootDir, '.certs/localhost-key.pem');
const pairingPort = Number(process.env.HTTPS_PAIRING_PORT ?? 3443) || 3443;
const bridgeHost = process.env.BRIDGE_HOST ?? '127.0.0.1';
const bridgePort = Number(process.env.BRIDGE_PORT ?? 3203) || 3203;

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendStaticFile(pathname: string, res: import('node:http').ServerResponse) {
  const cleanPath = pathname === '/' ? '/robot-display.html' : pathname;
  const safePath = normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = resolve(join(distDir, safePath));
  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

function proxyHttp(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  const upstream = httpRequest({
    hostname: bridgeHost,
    port: bridgePort,
    path: req.url,
    method: req.method,
    headers: {...req.headers, host: `${bridgeHost}:${bridgePort}`},
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', (error) => {
    res.writeHead(502, {'content-type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok: false, error: error.message}));
  });
  req.pipe(upstream);
}

if (!existsSync(certPath) || !existsSync(keyPath)) {
  throw new Error(`HTTPS certificate missing: ${certPath}`);
}

const server = createHttpsServer({
  cert: readFileSync(certPath),
  key: readFileSync(keyPath),
}, (req, res) => {
  const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/display')) {
    proxyHttp(req, res);
    return;
  }
  sendStaticFile(url.pathname, res);
});

const wss = new WebSocketServer({noServer: true});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/display') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(`ws://${bridgeHost}:${bridgePort}/display`);
    const pending: Buffer[] = [];
    client.on('message', (data) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data);
      } else if (Buffer.isBuffer(data)) {
        pending.push(data);
      } else {
        pending.push(Buffer.from(data.toString()));
      }
    });
    upstream.on('open', () => {
      pending.splice(0).forEach((data) => upstream.send(data));
    });
    upstream.on('message', (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
    upstream.on('close', () => client.close());
    upstream.on('error', () => client.close());
    client.on('close', () => upstream.close());
    client.on('error', () => upstream.close());
  });
});

server.listen(pairingPort, '0.0.0.0', () => {
  console.log(`[pairing] HTTPS robot frontend listening on https://0.0.0.0:${pairingPort}`);
  console.log(`[pairing] Proxying display traffic to http://${bridgeHost}:${bridgePort}`);
});
