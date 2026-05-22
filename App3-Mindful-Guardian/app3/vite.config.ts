import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';

const payloadMarker = '__LLM_EMOTION_JSON__';
const macFrameworkPython = '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3';
const certPath = path.resolve(__dirname, '.certs/localhost.pem');
const keyPath = path.resolve(__dirname, '.certs/localhost-key.pem');
const useHttpsDevServer = process.env.VITE_DEV_HTTPS === '1';
const httpsOptions = useHttpsDevServer && existsSync(certPath) && existsSync(keyPath)
  ? {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    }
  : undefined;

function resolvePythonCommand(): {command: string; args: string[]} {
  const configured = process.env.LLM_EMOTION_PYTHON?.trim() || process.env.PYTHON_BIN?.trim() || process.env.PYTHON?.trim();
  const candidates: Array<{command: string; args: string[]}> = [
    ...(configured ? [{command: configured, args: []}] : []),
    ...(existsSync(macFrameworkPython) ? [{command: macFrameworkPython, args: []}] : []),
    ...(process.platform === 'win32'
      ? [
          {command: 'py', args: ['-3']},
          {command: 'python', args: []},
          {command: 'python3', args: []},
        ]
      : [
          {command: 'python3', args: []},
          {command: 'python', args: []},
        ]),
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    if (result.status === 0) return candidate;
  }
  return process.platform === 'win32' ? {command: 'py', args: ['-3']} : {command: 'python3', args: []};
}

function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 6_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function llmEmotionApi() {
  return {
    name: 'llm-emotion-api',
    configureServer(server) {
      server.middlewares.use('/api/scan-emotion', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({error: 'method not allowed'}));
          return;
        }

        let requestPayload = '{}';
        try {
          const body = await readRequestBody(req);
          if (body.trim()) {
            JSON.parse(body);
            requestPayload = body;
          }
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({error: error instanceof Error ? error.message : 'invalid request body'}));
          return;
        }

        const scriptPath = path.resolve(__dirname, '../robot-app/LLMEmotion.py');
        const python = resolvePythonCommand();
        const child = spawn(python.command, [...python.args, scriptPath, '--once', '--stdin-payload'], {
          cwd: path.dirname(scriptPath),
          env: {...process.env, PYTHONUNBUFFERED: '1'},
          shell: process.platform === 'win32',
        });
        child.stdin.write(requestPayload);
        child.stdin.end();

        let stdout = '';
        let stderr = '';
        let finished = false;

        const finish = (statusCode: number, body: Record<string, unknown>) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          res.statusCode = statusCode;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        };

        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          finish(504, {error: 'LLMEmotion.py timeout', stderr});
        }, 120000);

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        child.on('error', (error) => {
          finish(500, {error: error.message, stderr});
        });

        child.on('close', (code) => {
          const line = stdout
            .split(/\r?\n/)
            .find((item) => item.startsWith(payloadMarker));

          if (!line) {
            finish(500, {
              error: `LLMEmotion.py exited without frontend payload${code ? ` (code ${code})` : ''}`,
              stdout,
              stderr,
            });
            return;
          }

          try {
            const payload = JSON.parse(line.slice(payloadMarker.length));
            if (payload.error) {
              finish(500, {...payload, stdout, stderr});
              return;
            }
            finish(200, payload);
          } catch (error) {
            finish(500, {error: error instanceof Error ? error.message : String(error), stdout, stderr});
          }
        });
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [llmEmotionApi(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // robot_app3.jsx lives outside this app dir; pin React to this app's node_modules
        // so Rollup can resolve react/jsx-runtime during production build.
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
        'lucide-react': path.resolve(__dirname, 'node_modules/lucide-react'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify; file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      https: httpsOptions,
      proxy: useHttpsDevServer ? {
        '/display': {
          target: 'ws://localhost:3203',
          ws: true,
        },
        '/api/display': {
          target: 'http://localhost:3203',
        },
      } : undefined,
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          robotDisplay: path.resolve(__dirname, 'robot-display.html'),
        },
        output: {
          manualChunks: {
            'vendor-motion': ['motion/react'],
          },
        },
      },
    },
  };
});
