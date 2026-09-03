const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const models = {
  understanding: 'google/gemini-3.1-flash-lite',
  speech: 'hexgrad/kokoro-82m',
}
const voices = {
  en: 'af_heart', es: 'ef_dora', fr: 'ff_siwis', hi: 'hf_alpha',
  it: 'if_sara', ja: 'jf_alpha', pt: 'pf_dora', zh: 'zf_xiaoxiao',
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/borjasolerme/wizard-chess',
    'X-Title': 'Wizard Chess',
  }
}

async function openRouter(path, apiKey, body) {
  const response = await fetch(`${OPENROUTER_URL}${path}`, { method: 'POST', headers: headers(apiKey), body: JSON.stringify(body) })
  if (!response.ok) {
    const details = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${details.slice(0, 500)}`)
  }
  return response
}

function languageSchema(properties) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'wizard_voice_response',
      strict: true,
      schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
    },
  }
}

async function chatJson(apiKey, messages, responseFormat) {
  const response = await openRouter('/chat/completions', apiKey, {
    model: models.understanding,
    messages,
    response_format: responseFormat,
    temperature: 0.1,
    max_tokens: 220,
    provider: { sort: 'latency' },
  })
  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('The language model returned no usable response.')
  return JSON.parse(content)
}

function sanitizeTools(tools) {
  if (!Array.isArray(tools)) return []
  return tools.slice(0, 30).map(tool => ({
    name: String(tool?.name || '').slice(0, 128),
    description: String(tool?.description || '').slice(0, 600),
    inputSchema: tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object', properties: {} },
  })).filter(tool => tool.name)
}

export async function handleVoice(body, apiKey = process.env.OPENROUTER_API_KEY) {
  if (body?.action === 'status') return { status: 200, json: { configured: Boolean(apiKey), models } }
  if (!apiKey) return { status: 503, json: { error: 'Voice AI is not configured. Add an OpenRouter key in Settings.' } }
  if (!body || typeof body !== 'object') return { status: 400, json: { error: 'Invalid request.' } }

  if (body.action === 'understand') {
    const format = ['webm', 'm4a', 'ogg', 'wav', 'mp3', 'aac', 'flac'].includes(body.format) ? body.format : 'webm'
    if (typeof body.audio !== 'string' || body.audio.length < 100 || body.audio.length > 28_000_000) return { status: 400, json: { error: 'Invalid audio recording.' } }
    const tools = sanitizeTools(body.tools)
    if (!tools.length) return { status: 400, json: { error: 'WebMCP tools are required.' } }
    const toolNames = ['none', ...tools.map(tool => tool.name)]
    const result = await chatJson(apiKey, [
      {
        role: 'system',
        content: `You are the fast multilingual voice controller for Wizard Chess. Listen to the audio, transcribe the speaker in their original language, and select exactly one available WebMCP action when they ask to affect or inspect the game. Use the current state and legalMoves to resolve ambiguous piece names and coordinates, but do not invent a move. Return tool arguments as a JSON object encoded inside arguments_json. For ordinary conversation choose none. Keep speech natural, warm, and under 22 words in the user's language. Language must be one of en, es, fr, hi, it, ja, pt, zh; use en only when the user's language is unsupported.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: JSON.stringify({ currentGame: body.state, availableWebMcpTools: tools }) },
          { type: 'input_audio', input_audio: { data: body.audio, format } },
        ],
      },
    ], languageSchema({
      transcript: { type: 'string' },
      language: { type: 'string', enum: ['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh'] },
      tool_name: { type: 'string', enum: toolNames },
      arguments_json: { type: 'string' },
      speech: { type: 'string' },
    }))
    return { status: 200, json: result }
  }

  if (body.action === 'summarize') {
    const result = await chatJson(apiKey, [
      { role: 'system', content: 'You are the voice of Wizard Chess. Briefly and naturally confirm the actual WebMCP result in the requested language. Mention an error plainly. Use no more than 28 words.' },
      { role: 'user', content: JSON.stringify({ originalRequest: body.transcript, language: body.language, tool: body.tool, actualResult: body.result }) },
    ], languageSchema({
      language: { type: 'string', enum: ['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh'] },
      speech: { type: 'string' },
    }))
    return { status: 200, json: result }
  }

  if (body.action === 'coach') {
    const context = {
      tier: ['beginner', 'intermediate', 'advanced'].includes(body.tier) ? body.tier : 'beginner',
      insight: body.insight && typeof body.insight === 'object' ? body.insight : {},
      opponentMove: String(body.opponentMove || '').slice(0, 20),
      nextMove: String(body.nextMove || '').slice(0, 20),
      rememberedConcepts: Array.isArray(body.memory?.concepts) ? body.memory.concepts.slice(-8) : [],
      rememberedMistakes: Array.isArray(body.memory?.mistakes) ? body.memory.mistakes.slice(-8) : [],
    }
    const result = await chatJson(apiKey, [
      {
        role: 'system',
        content: 'You are a warm, concise chess mentor in a magical chess game. Use only the supplied Stockfish evidence. Never invent a move. Beginner language avoids notation jargon. Return a short grade headline, one explanation sentence, and one next-plan sentence. Each field must be under 24 words.',
      },
      { role: 'user', content: JSON.stringify(context) },
    ], languageSchema({
      headline: { type: 'string' },
      explanation: { type: 'string' },
      plan: { type: 'string' },
    }))
    return { status: 200, json: result }
  }

  if (body.action === 'speak') {
    const text = String(body.text || '').trim().slice(0, 600)
    const language = Object.hasOwn(voices, body.language) ? body.language : 'en'
    if (!text) return { status: 400, json: { error: 'Speech text is required.' } }
    const response = await openRouter('/audio/speech', apiKey, {
      model: models.speech,
      input: text,
      voice: voices[language],
      response_format: 'mp3',
    })
    return { status: 200, bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'audio/mpeg' }
  }

  return { status: 400, json: { error: 'Unknown voice action.' } }
}
