import { defineConfig, loadEnv, type Plugin } from 'vite'
import { handleVoice } from './server/openrouter.mjs'

function voiceApi(apiKey: string): Plugin {
  return {
    name: 'wizard-chess-voice-api',
    configureServer(server) {
      server.middlewares.use('/api/voice', async (request, response) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          return response.end(JSON.stringify({ error: 'Method not allowed.' }))
        }
        try {
          let raw = ''
          for await (const chunk of request) raw += chunk
          const requestKey = request.headers['x-openrouter-api-key']
          const result = await handleVoice(raw ? JSON.parse(raw) : {}, typeof requestKey === 'string' ? requestKey : apiKey)
          response.statusCode = result.status
          response.setHeader('Content-Type', result.contentType || 'application/json')
          response.end(result.bytes ? Buffer.from(result.bytes) : JSON.stringify(result.json))
        } catch (error) {
          response.statusCode = 502
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [voiceApi(env.OPENROUTER_API_KEY || '')] }
})
