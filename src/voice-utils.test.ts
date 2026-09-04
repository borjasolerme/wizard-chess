import { describe, expect, it } from 'vitest'
import { audioBufferToWav, voiceLanguage } from './voice-utils'

describe('audioBufferToWav', () => {
  it('encodes decoded browser audio as mono 16-bit WAV', async () => {
    const wav = audioBufferToWav({
      sampleRate: 24_000,
      numberOfChannels: 2,
      length: 2,
      getChannelData: channel => channel === 0 ? new Float32Array([1, -1]) : new Float32Array([0, 0]),
    })
    const bytes = new Uint8Array(await wav.arrayBuffer())
    const view = new DataView(bytes.buffer)

    expect(wav.type).toBe('audio/wav')
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint32(40, true)).toBe(4)
  })
})

describe('voiceLanguage', () => {
  it('keeps supported voice languages and falls back to English', () => {
    expect(voiceLanguage('it-IT')).toBe('it')
    expect(voiceLanguage('pt-BR')).toBe('pt')
    expect(voiceLanguage('de')).toBe('en')
  })
})
