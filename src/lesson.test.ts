import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { curriculum, isExpectedLessonMove, isLessonUnlocked, lessons, pawnLesson } from './lesson'

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
    expect(isExpectedLessonMove(lessons[2].steps[1], 'g5', 'd8', 'q')).toBe(true)
  })

  it('has three sequential levels and six playable lessons', () => {
    expect(curriculum).toHaveLength(3)
    expect(lessons).toHaveLength(6)
    for (const lesson of lessons) for (const step of lesson.steps) for (const move of step.moves) {
      const game = new Chess(step.fen)
      expect(() => game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4) || 'q' })).not.toThrow()
    }
  })

  it('unlocks lessons in order', () => {
    expect(isLessonUnlocked(lessons[0].id, [])).toBe(true)
    expect(isLessonUnlocked(lessons[1].id, [])).toBe(false)
    expect(isLessonUnlocked(lessons[1].id, [lessons[0].id])).toBe(true)
  })
})
