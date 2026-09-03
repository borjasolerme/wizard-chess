import { describe, expect, it } from 'vitest'
import { completeOnboarding, onboardingSteps, parseCompletedOnboarding } from './onboarding'

describe('one-time path onboarding', () => {
  it('keeps only valid completed paths from browser storage', () => {
    expect(parseCompletedOnboarding('["academy","unknown","mentor","academy"]')).toEqual(['academy', 'mentor'])
    expect(parseCompletedOnboarding('broken')).toEqual([])
  })

  it('marks a path complete without duplicating it', () => {
    expect(completeOnboarding(['academy'], 'academy')).toEqual(['academy'])
    expect(completeOnboarding(['academy'], 'battle')).toEqual(['academy', 'battle'])
  })

  it('provides a short guided introduction for every path', () => {
    expect(Object.values(onboardingSteps).every(steps => steps.length === 2)).toBe(true)
    expect(onboardingSteps.mentor[1].body).toContain('board stays clear')
  })
})
