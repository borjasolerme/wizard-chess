type TextContent = { type?: string; text?: string }
type ToolResult = { content?: TextContent[] }

export function immediateToolSpeech(result: unknown, interpretedSpeech: string) {
  if (!result || typeof result !== 'object') return null
  const content = (result as ToolResult).content
  const text = content?.find(item => item.type === 'text' && typeof item.text === 'string')?.text
  if (!text) return null
  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
    if (payload.error || typeof payload.message !== 'string' || !payload.message.trim()) return null
    return interpretedSpeech.trim() || payload.message.trim()
  } catch {
    return null
  }
}
