export const openRouterKeyStorageKey = 'wizard-chess-openrouter-key'

export function normalizeOpenRouterKey(value: string) {
  const key = value.trim()
  return key.length >= 10 && key.length <= 512 ? key : null
}

export function voiceRequestHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-OpenRouter-Api-Key': apiKey } : {}),
  }
}
