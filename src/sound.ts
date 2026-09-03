export type SoundCue = 'move' | 'capture' | 'check' | 'complete' | 'start' | 'success'

type MoveSoundState = {
  captured: boolean
  inCheck: boolean
  gameOver: boolean
}

export function moveSoundCue(state: MoveSoundState): SoundCue {
  if (state.gameOver) return 'complete'
  if (state.inCheck) return 'check'
  return state.captured ? 'capture' : 'move'
}

export class GameSounds {
  private audioContext: AudioContext | null = null

  unlock() {
    void this.getContext()?.resume().catch(() => undefined)
  }

  play(cue: SoundCue) {
    const context = this.getContext()
    if (!context) return
    void context.resume().then(() => this.renderCue(context, cue)).catch(() => undefined)
  }

  private getContext() {
    if (typeof AudioContext === 'undefined') return null
    if (!this.audioContext && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null
    this.audioContext ??= new AudioContext()
    return this.audioContext
  }

  private tone(context: AudioContext, frequency: number, offset: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency = frequency) {
    const startsAt = context.currentTime + offset
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, startsAt)
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startsAt + duration)
    gain.gain.setValueAtTime(.0001, startsAt)
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + .008)
    gain.gain.exponentialRampToValueAtTime(.0001, startsAt + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(startsAt)
    oscillator.stop(startsAt + duration + .01)
  }

  private renderCue(context: AudioContext, cue: SoundCue) {
    if (cue === 'move') {
      this.tone(context, 125, 0, .09, .045, 'triangle', 82)
      return
    }
    if (cue === 'capture') {
      this.tone(context, 105, 0, .16, .065, 'triangle', 48)
      this.tone(context, 620, .015, .11, .025, 'square', 260)
      return
    }
    if (cue === 'check') {
      this.tone(context, 523.25, 0, .12, .035, 'triangle')
      this.tone(context, 783.99, .09, .2, .045, 'triangle')
      return
    }
    if (cue === 'complete') {
      this.tone(context, 220, 0, .28, .045, 'triangle', 174.61)
      this.tone(context, 164.81, .14, .38, .05, 'triangle', 110)
      return
    }
    const notes = cue === 'success' ? [392, 523.25, 659.25] : [146.83, 220]
    notes.forEach((frequency, index) => this.tone(context, frequency, index * .085, .24, .035, 'triangle'))
  }
}
