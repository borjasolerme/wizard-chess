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
})
