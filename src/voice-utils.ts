const supportedVoiceLanguages = new Set(['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh'])

type AudioBufferLike = Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'length' | 'getChannelData'>

export function audioBufferToWav(audio: AudioBufferLike) {
  const bytes = new ArrayBuffer(44 + audio.length * 2)
  const view = new DataView(bytes)
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index))
  }

  write(0, 'RIFF')
  view.setUint32(4, 36 + audio.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, audio.length * 2, true)

  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index))
  for (let frame = 0; frame < audio.length; frame++) {
    const mixed = channels.reduce((sum, channel) => sum + channel[frame], 0) / channels.length
    const sample = Math.max(-1, Math.min(1, mixed))
    view.setInt16(44 + frame * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

export function voiceLanguage(language: string) {
  const base = language.toLowerCase().split(/[-_]/)[0]
  return supportedVoiceLanguages.has(base) ? base : 'en'
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
