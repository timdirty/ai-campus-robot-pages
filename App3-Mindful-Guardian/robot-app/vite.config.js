import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptPath = resolve(__dirname, 'LLMEmotion.py')
const payloadMarker = '__LLM_EMOTION_JSON__'
const macFrameworkPython = '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3'
const pythonBin = process.env.LLM_EMOTION_PYTHON || (existsSync(macFrameworkPython) ? macFrameworkPython : 'python3')

function llmEmotionApi() {
  return {
    name: 'llm-emotion-api',
    configureServer(server) {
      server.middlewares.use('/api/scan-emotion', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'method not allowed' }))
          return
        }

        const child = spawn(pythonBin, [scriptPath, '--once'], {
          cwd: __dirname,
          env: {...process.env, PYTHONUNBUFFERED: '1'},
        })

        let stdout = ''
        let stderr = ''
        let finished = false

        const finish = (statusCode, body) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          res.statusCode = statusCode
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }

        const timer = setTimeout(() => {
          child.kill('SIGTERM')
          finish(504, { error: 'LLMEmotion.py timeout', stderr })
        }, 120000)

        child.stdout.on('data', chunk => {
          stdout += chunk.toString()
        })

        child.stderr.on('data', chunk => {
          stderr += chunk.toString()
        })

        child.on('error', error => {
          finish(500, { error: error.message, stderr })
        })

        child.on('close', code => {
          const line = stdout
            .split(/\r?\n/)
            .find(item => item.startsWith(payloadMarker))

          if (!line) {
            finish(500, {
              error: `LLMEmotion.py exited without frontend payload${code ? ` (code ${code})` : ''}`,
              stdout,
              stderr,
            })
            return
          }

          try {
            const payload = JSON.parse(line.slice(payloadMarker.length))
            if (payload.error) {
              finish(500, { ...payload, stdout, stderr })
              return
            }
            finish(200, payload)
          } catch (error) {
            finish(500, { error: error.message, stdout, stderr })
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    llmEmotionApi(),
    react(),
    tailwindcss(),
  ],
})
