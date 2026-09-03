const supportedVoiceLanguages = new Set(['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh'])

export function audioFormatFromMime(mime: string) {
  const normalized = mime.toLowerCase()
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('wav')) return 'wav'
  return 'webm'
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
