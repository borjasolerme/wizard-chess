import { audioBufferToWav, blobToBase64, voiceLanguage } from './voice-utils'
import { voiceRequestHeaders } from './api-key'
import { immediateToolSpeech } from './voice-response'

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
  getApiKey: () => string
  executeTool: (name: string, argumentsObject: Record<string, unknown>) => Promise<unknown>
}

type Interpretation = {
  transcript: string
  language: string
  tool_name: string
  arguments_json: string
  speech: string
}

const recorderTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']

async function postJson<T>(body: Record<string, unknown>, apiKey: string): Promise<T> {
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: voiceRequestHeaders(apiKey),
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
  private starting = false
  private cancelled = false
  private recorder: MediaRecorder | null = null
  private audio: HTMLAudioElement | null = null
  private finishAudio: (() => void) | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null

  constructor(private readonly options: VoiceControllerOptions) {
    options.button.addEventListener('click', () => this.toggle())
    this.renderButton()
  }

  private renderButton() {
    const label = this.options.button.querySelector<HTMLElement>('[data-voice-label]')
    if (label) label.textContent = this.enabled ? 'Stop voice' : 'Start voice'
    else this.options.button.textContent = this.enabled ? 'Stop voice' : 'Start voice'
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
      this.finishAudio?.()
      this.setStatus('Voice stopped.')
      this.renderButton()
      return
    }
    await this.start()
  }

  async start() {
    if (this.enabled || this.starting) return
    this.starting = true
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.setStatus('This browser cannot record microphone audio.')
      this.starting = false
      return
    }
    try {
      const { configured } = await postJson<{ configured: boolean }>({ action: 'status' }, this.options.getApiKey())
      if (!configured) {
        this.setStatus('Add an OpenRouter key in Settings.')
        this.starting = false
        return
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error))
      this.starting = false
      return
    }
    this.enabled = true
    this.cancelled = false
    this.renderButton()
    try {
      await this.runLoop()
    } finally {
      this.starting = false
    }
  }

  async narrate(text: string, language = 'en') {
    if (this.enabled || !text.trim()) return
    try { await this.speak(text, language) }
    catch { this.setStatus('Voice ready') }
  }

  private async runLoop() {
    while (this.enabled) {
      try {
        const recording = await this.recordUtterance()
        if (!this.enabled || this.cancelled) break
        if (!recording || recording.size < 300) continue
        await this.process(recording)
      } catch (error) {
        this.enabled = false
        this.setStatus(error instanceof Error ? error.message : String(error))
      }
    }
    await this.releaseInput()
    this.renderButton()
  }

  private async ensureInput() {
    if (this.stream?.active && this.analyser) return
    this.setStatus('Connecting microphone…')
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    this.audioContext = new AudioContext()
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    this.source.connect(this.analyser)
  }

  private async releaseInput() {
    const stream = this.stream
    const source = this.source
    const context = this.audioContext
    this.stream = null
    this.source = null
    this.analyser = null
    this.audioContext = null
    stream?.getTracks().forEach(track => track.stop())
    source?.disconnect()
    if (context && context.state !== 'closed') await context.close()
  }

  private async recordUtterance(): Promise<Blob | null> {
    await this.ensureInput()
    if (!this.enabled || this.cancelled) return null
    this.setStatus('Listening… speak naturally.', 'listening')
    const mime = recorderTypes.find(type => MediaRecorder.isTypeSupported(type)) ?? ''
    const recorder = new MediaRecorder(this.stream!, mime ? { mimeType: mime } : undefined)
    this.recorder = recorder
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data) })

    const analyser = this.analyser!
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
      if (Math.sqrt(energy / samples.length) > 0.015) {
        heardSpeech = true
        lastSpeechAt = performance.now()
      }
      const now = performance.now()
      if ((heardSpeech && now - lastSpeechAt > 700) || now - startedAt > 8_000 || (!heardSpeech && now - startedAt > 4_000)) recorder.stop()
      else frame = requestAnimationFrame(monitor)
    }
    frame = requestAnimationFrame(monitor)
    await stopped
    cancelAnimationFrame(frame)
    this.recorder = null
    if (!heardSpeech) return null
    const actualMime = recorder.mimeType || mime || 'audio/webm'
    return new Blob(chunks, { type: actualMime })
  }

  private async process(blob: Blob) {
    this.setStatus('Understanding…', 'thinking')
    if (!this.audioContext) throw new Error('The microphone session ended before the recording could be processed.')
    const decodedAudio = await this.audioContext.decodeAudioData(await blob.arrayBuffer())
    const wav = audioBufferToWav(decodedAudio)
    const tools = this.options.getTools()
    const interpretation = await postJson<Interpretation>({
      action: 'understand',
      audio: await blobToBase64(wav),
      format: 'wav',
      state: this.options.getState(),
      tools,
    }, this.options.getApiKey())
    const text = interpretation.transcript
    if (!text.trim()) return
    this.options.transcript.textContent = `You: ${text}`

    let result: unknown = null
    if (interpretation.tool_name !== 'none') {
      try {
        const args = JSON.parse(interpretation.arguments_json || '{}') as Record<string, unknown>
        result = await this.options.executeTool(interpretation.tool_name, args)
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) }
      }
    }

    const immediateSpeech = result === null ? null : immediateToolSpeech(result, interpretation.speech)
    const response = result === null || immediateSpeech
      ? { language: interpretation.language, speech: immediateSpeech ?? interpretation.speech }
      : await postJson<{ language: string; speech: string }>({
          action: 'summarize',
          transcript: text,
          language: interpretation.language,
          tool: interpretation.tool_name,
          result,
        }, this.options.getApiKey())
    this.options.transcript.textContent = `You: ${text}\nWizard: ${response.speech}`
    await this.speak(response.speech, response.language)
  }

  private async speak(text: string, language: string) {
    this.setStatus('Speaking…', 'speaking')
    const response = await fetch('/api/voice', {
      method: 'POST',
      headers: voiceRequestHeaders(this.options.getApiKey()),
      body: JSON.stringify({ action: 'speak', text, language: voiceLanguage(language) }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
      throw new Error(error.error || 'Speech generation failed.')
    }
    const url = URL.createObjectURL(await response.blob())
    const audio = new Audio(url)
    this.audio = audio
    try {
      await audio.play()
      await new Promise<void>(resolve => {
        let finished = false
        const finish = () => {
          if (finished) return
          finished = true
          resolve()
        }
        this.finishAudio = finish
        audio.addEventListener('ended', finish, { once: true })
        audio.addEventListener('error', finish, { once: true })
      })
    } finally {
      URL.revokeObjectURL(url)
      this.audio = null
      this.finishAudio = null
    }
    if (this.enabled) this.setStatus('Listening…', 'listening')
  }
}
