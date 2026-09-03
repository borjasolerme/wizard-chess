import { audioFormatFromMime, blobToBase64, voiceLanguage } from './voice-utils'

export type VoiceTool = {
  name: string
  title?: string
  description: string
  inputSchema?: object
}

type VoiceControllerOptions = {
  button: HTMLButtonElement
  status: HTMLElement
  transcript: HTMLElement
  getState: () => unknown
  getTools: () => VoiceTool[]
  executeTool: (name: string, argumentsObject: Record<string, unknown>) => Promise<unknown>
}

type Interpretation = {
  language: string
  tool_name: string
  arguments_json: string
  speech: string
}

const recorderTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']

async function postJson<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
    throw new Error(error.error || `Voice request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export class VoiceController {
  private enabled = false
  private cancelled = false
  private recorder: MediaRecorder | null = null
  private audio: HTMLAudioElement | null = null

  constructor(private readonly options: VoiceControllerOptions) {
    options.button.addEventListener('click', () => this.toggle())
    this.renderButton()
  }

  private renderButton() {
    this.options.button.textContent = this.enabled ? 'Stop voice' : 'Start voice'
    this.options.button.classList.toggle('active', this.enabled)
    this.options.button.setAttribute('aria-pressed', String(this.enabled))
  }

  private setStatus(message: string, state: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle') {
    this.options.status.textContent = message
    this.options.status.dataset.state = state
  }

  async toggle() {
    if (this.enabled) {
      this.enabled = false
      this.cancelled = true
      if (this.recorder?.state && this.recorder.state !== 'inactive') this.recorder.stop()
      this.audio?.pause()
      this.setStatus('Voice stopped.')
      this.renderButton()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.setStatus('This browser cannot record microphone audio.')
      return
    }
    try {
      const { configured } = await postJson<{ configured: boolean }>({ action: 'status' })
      if (!configured) {
        this.setStatus('Add OPENROUTER_API_KEY to .env.local, then restart the app.')
        return
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error))
      return
    }
    this.enabled = true
    this.cancelled = false
    this.renderButton()
    await this.runLoop()
  }

  private async runLoop() {
    while (this.enabled) {
      try {
        const recording = await this.recordUtterance()
        if (!this.enabled || this.cancelled) break
        if (!recording || recording.blob.size < 500) continue
        await this.process(recording.blob, recording.mime)
      } catch (error) {
        this.enabled = false
        this.setStatus(error instanceof Error ? error.message : String(error))
      }
    }
    this.renderButton()
  }

  private async recordUtterance(): Promise<{ blob: Blob; mime: string } | null> {
    this.setStatus('Listening… speak naturally.', 'listening')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    const mime = recorderTypes.find(type => MediaRecorder.isTypeSupported(type)) ?? ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    this.recorder = recorder
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const startedAt = performance.now()
    let heardSpeech = false
    let lastSpeechAt = startedAt
    let frame = 0

    const stopped = new Promise<void>(resolve => recorder.addEventListener('stop', () => resolve(), { once: true }))
    recorder.start(250)
    const monitor = () => {
      if (recorder.state === 'inactive') return
      analyser.getByteTimeDomainData(samples)
      let energy = 0
      for (const sample of samples) {
        const value = (sample - 128) / 128
        energy += value * value
      }
      if (Math.sqrt(energy / samples.length) > 0.025) {
        heardSpeech = true
        lastSpeechAt = performance.now()
      }
      const now = performance.now()
      if ((heardSpeech && now - lastSpeechAt > 950) || now - startedAt > 12_000 || (!heardSpeech && now - startedAt > 7_000)) recorder.stop()
      else frame = requestAnimationFrame(monitor)
    }
    frame = requestAnimationFrame(monitor)
    await stopped
    cancelAnimationFrame(frame)
    stream.getTracks().forEach(track => track.stop())
    source.disconnect()
    await audioContext.close()
    this.recorder = null
    if (!heardSpeech) return null
    const actualMime = recorder.mimeType || mime || 'audio/webm'
    return { blob: new Blob(chunks, { type: actualMime }), mime: actualMime }
  }

  private async process(blob: Blob, mime: string) {
    this.setStatus('Understanding…', 'thinking')
    const { text } = await postJson<{ text: string }>({
      action: 'transcribe',
      audio: await blobToBase64(blob),
      format: audioFormatFromMime(mime),
    })
    if (!text.trim()) return
    this.options.transcript.textContent = `You: ${text}`

    const tools = this.options.getTools()
    const interpretation = await postJson<Interpretation>({
      action: 'interpret',
      transcript: text,
      state: this.options.getState(),
      tools,
    })

    let result: unknown = null
    if (interpretation.tool_name !== 'none') {
      try {
        const args = JSON.parse(interpretation.arguments_json || '{}') as Record<string, unknown>
        result = await this.options.executeTool(interpretation.tool_name, args)
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) }
      }
    }

    const response = result === null
      ? { language: interpretation.language, speech: interpretation.speech }
      : await postJson<{ language: string; speech: string }>({
          action: 'summarize',
          transcript: text,
          language: interpretation.language,
          tool: interpretation.tool_name,
          result,
        })
    this.options.transcript.textContent = `You: ${text}\nWizard: ${response.speech}`
    await this.speak(response.speech, response.language)
  }

  private async speak(text: string, language: string) {
    this.setStatus('Speaking…', 'speaking')
    const response = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'speak', text, language: voiceLanguage(language) }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
      throw new Error(error.error || 'Speech generation failed.')
    }
    const url = URL.createObjectURL(await response.blob())
    const audio = new Audio(url)
    this.audio = audio
    await audio.play()
    await new Promise<void>(resolve => {
      audio.addEventListener('ended', () => resolve(), { once: true })
      audio.addEventListener('error', () => resolve(), { once: true })
    })
    URL.revokeObjectURL(url)
    this.audio = null
    if (this.enabled) this.setStatus('Listening…', 'listening')
  }
}
