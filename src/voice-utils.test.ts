import { describe, expect, it } from 'vitest'
import { audioFormatFromMime, voiceLanguage } from './voice-utils'

describe('audioFormatFromMime', () => {
  it('maps browser recorder MIME types to OpenRouter formats', () => {
    expect(audioFormatFromMime('audio/webm;codecs=opus')).toBe('webm')
    expect(audioFormatFromMime('audio/mp4')).toBe('m4a')
    expect(audioFormatFromMime('audio/ogg;codecs=opus')).toBe('ogg')
  })
})

describe('voiceLanguage', () => {
  it('keeps Kokoro-supported languages and falls back to English', () => {
    expect(voiceLanguage('it-IT')).toBe('it')
    expect(voiceLanguage('pt-BR')).toBe('pt')
    expect(voiceLanguage('de')).toBe('en')
  })
})
