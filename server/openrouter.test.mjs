import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleVoice } from './openrouter.mjs'

describe('voice understanding', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('understands audio and chooses a WebMCP action in one model request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        transcript: 'Move the knight to f3',
        language: 'en',
        tool_name: 'move_piece',
        arguments_json: '{"from":"g1","to":"f3"}',
        speech: 'Knight to f3.',
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleVoice({
      action: 'understand',
      audio: 'a'.repeat(500),
      format: 'webm',
      state: { legalMoves: ['g1f3'] },
      tools: [{ name: 'move_piece', description: 'Move a piece.', inputSchema: { type: 'object' } }],
    }, 'test-key')

    expect(result.status).toBe(200)
    expect(result.json.transcript).toBe('Move the knight to f3')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.model).toBe('google/gemini-3.1-flash-lite')
    expect(request.provider).toEqual({ sort: 'latency' })
    expect(request.messages[1].content[1]).toEqual({ type: 'input_audio', input_audio: { data: 'a'.repeat(500), format: 'webm' } })
  })

  it('speaks with the British male wizard voice in English', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleVoice({ action: 'speak', text: 'Your move.', language: 'en' }, 'test-key')

    expect(result.status).toBe(200)
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.voice).toBe('bm_george')
  })

  it('answers recommendation questions with the current move instead of generic praise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ language: 'en', speech: 'Play Nf3. It develops your knight and controls the centre.' }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await handleVoice({
      action: 'summarize', transcript: 'What do you recommend?', language: 'en', tool: 'get_mentor_guidance',
      result: { recommendation: { move: 'Nf3', reason: 'It develops a piece.' }, lastMove: { playedMove: 'e4', grade: 'excellent' } },
    }, 'test-key')

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.messages[0].content).toContain('lead with the recommended move')
    expect(request.messages[0].content).toContain('Do not praise the previous move')
  })

  it('keeps the full WebMCP surface available for voice navigation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        transcript: 'Open settings',
        language: 'en',
        tool_name: 'open_settings',
        arguments_json: '{}',
        speech: 'Opening settings.',
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const tools = Array.from({ length: 36 }, (_, index) => ({
      name: index === 35 ? 'open_settings' : `tool_${index}`,
      description: 'Available action.',
      inputSchema: { type: 'object', properties: {} },
    }))

    await handleVoice({ action: 'understand', audio: 'a'.repeat(500), format: 'webm', state: {}, tools }, 'test-key')

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    const context = JSON.parse(request.messages[1].content[0].text)
    expect(context.availableWebMcpTools).toHaveLength(36)
    expect(request.messages[0].content).toContain('interface navigation')
  })
})
