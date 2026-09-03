import { describe, expect, it } from 'vitest'
import { canReturnToMainMenu, isGameActive } from './game-session'

describe('game progression', () => {
  it('locks moves before a lesson or game has started', () => {
    expect(isGameActive('entry')).toBe(false)
    expect(isGameActive('onboarding')).toBe(false)
    expect(isGameActive('setup')).toBe(false)
    expect(isGameActive('active')).toBe(true)
    expect(isGameActive('complete')).toBe(false)
    expect(isGameActive('replay')).toBe(false)
  })

  it('offers the main menu after a path has been selected', () => {
    expect(canReturnToMainMenu('entry')).toBe(false)
    expect(canReturnToMainMenu('onboarding')).toBe(true)
    expect(canReturnToMainMenu('setup')).toBe(true)
    expect(canReturnToMainMenu('active')).toBe(true)
    expect(canReturnToMainMenu('complete')).toBe(true)
    expect(canReturnToMainMenu('replay')).toBe(true)
  })
})
