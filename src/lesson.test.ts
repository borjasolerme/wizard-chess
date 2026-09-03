import { describe, expect, it } from 'vitest'
import { isExpectedLessonMove, pawnLesson } from './lesson'

describe('pawn lesson', () => {
  it('progresses through movement, capture, and promotion', () => {
    expect(pawnLesson.steps.map(step => step.title)).toEqual([
      'Move forward',
      'Capture diagonally',
      'Promote the pawn',
    ])
  })

  it('accepts only the move taught by the current step', () => {
    expect(isExpectedLessonMove(pawnLesson.steps[0], 'e2', 'e4', 'q')).toBe(true)
    expect(isExpectedLessonMove(pawnLesson.steps[0], 'e1', 'd1', 'q')).toBe(false)
    expect(isExpectedLessonMove(pawnLesson.steps[1], 'e4', 'd5', 'q')).toBe(true)
    expect(isExpectedLessonMove(pawnLesson.steps[2], 'e7', 'e8', 'q')).toBe(true)
  })
})
