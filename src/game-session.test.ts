import { describe, expect, it } from 'vitest'
import { isGameActive } from './game-session'

describe('game progression', () => {
  it('locks moves before a lesson or game has started', () => {
    expect(isGameActive('entry')).toBe(false)
    expect(isGameActive('onboarding')).toBe(false)
    expect(isGameActive('setup')).toBe(false)
    expect(isGameActive('active')).toBe(true)
    expect(isGameActive('complete')).toBe(false)
    expect(isGameActive('replay')).toBe(false)
  })
})
