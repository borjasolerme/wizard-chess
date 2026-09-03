import { describe, expect, it } from 'vitest'
import { moveSoundCue } from './sound'

describe('game sound cues', () => {
  it('uses a quiet move sound for an ordinary move', () => {
    expect(moveSoundCue({ captured: false, inCheck: false, gameOver: false })).toBe('move')
  })

  it('uses a stronger sound when a piece is captured', () => {
    expect(moveSoundCue({ captured: true, inCheck: false, gameOver: false })).toBe('capture')
  })

  it('uses the check sound even when the move captures', () => {
    expect(moveSoundCue({ captured: true, inCheck: true, gameOver: false })).toBe('check')
  })

  it('uses the completion sound when a move ends the game', () => {
    expect(moveSoundCue({ captured: true, inCheck: true, gameOver: true })).toBe('complete')
  })
})
