import { describe, expect, it } from 'vitest'
import { immediateToolSpeech } from './voice-response'

describe('voice tool responses', () => {
  it('uses the first interpretation after a successful action', () => {
    const result = { content: [{ type: 'text', text: JSON.stringify({ message: 'Settings opened.' }) }] }
    expect(immediateToolSpeech(result, 'Opening settings.')).toBe('Opening settings.')
  })

  it('waits for a grounded summary when the result contains data or an error', () => {
    const data = { content: [{ type: 'text', text: JSON.stringify({ rating: 1280 }) }] }
    const error = { content: [{ type: 'text', text: JSON.stringify({ error: 'That move is illegal.' }) }] }
    expect(immediateToolSpeech(data, 'Here you go.')).toBeNull()
    expect(immediateToolSpeech(error, 'Done.')).toBeNull()
  })

  it('falls back to the tool message when the interpretation has no speech', () => {
    const result = { content: [{ type: 'text', text: JSON.stringify({ message: 'Game paused.' }) }] }
    expect(immediateToolSpeech(result, '  ')).toBe('Game paused.')
  })
})
