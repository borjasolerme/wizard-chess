import { describe, expect, it } from 'vitest'
import { normalizeOpenRouterKey, voiceRequestHeaders } from './api-key'

describe('OpenRouter key settings', () => {
  it('trims a usable key and rejects empty or implausible values', () => {
    expect(normalizeOpenRouterKey('  sk-or-v1-example-key  ')).toBe('sk-or-v1-example-key')
    expect(normalizeOpenRouterKey('')).toBeNull()
    expect(normalizeOpenRouterKey('short')).toBeNull()
  })

  it('sends the key only when one is configured', () => {
    expect(voiceRequestHeaders('sk-or-v1-example-key')).toEqual({
      'Content-Type': 'application/json',
      'X-OpenRouter-Api-Key': 'sk-or-v1-example-key',
    })
    expect(voiceRequestHeaders('')).toEqual({ 'Content-Type': 'application/json' })
  })
})
