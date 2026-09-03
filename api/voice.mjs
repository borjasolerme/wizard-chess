import { handleVoice } from '../server/openrouter.mjs'

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body)
  let raw = ''
  for await (const chunk of request) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  try {
    const requestKey = request.headers['x-openrouter-api-key']
    const result = await handleVoice(await readBody(request), typeof requestKey === 'string' ? requestKey : undefined)
    response.statusCode = result.status
    if (result.bytes) {
      response.setHeader('Content-Type', result.contentType)
      return response.end(Buffer.from(result.bytes))
    }
    response.setHeader('Content-Type', 'application/json')
    return response.end(JSON.stringify(result.json))
  } catch (error) {
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json')
    return response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
}
