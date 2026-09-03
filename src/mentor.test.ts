import { describe, expect, it } from 'vitest'
import { assessMove, createPostGameReview, explainRecommendation, inferMentorTier, rememberInsight } from './mentor'

describe('chess mentor', () => {
  it('adapts its teaching language to academy progress', () => {
    expect(inferMentorTier(0)).toBe('beginner')
    expect(inferMentorTier(3)).toBe('intermediate')
    expect(inferMentorTier(6)).toBe('advanced')
  })

  it('grades a move from its Stockfish evaluation loss', () => {
    const insight = assessMove({
      move: { san: 'e4', from: 'e2', to: 'e4', piece: 'p' },
      bestMove: 'e2e4',
      bestMoveSan: 'e4',
      lossCp: 8,
      tier: 'beginner',
    })
    expect(insight).toMatchObject({ grade: 'excellent', concept: 'center control', recommendedMove: 'e4' })
    expect(insight.explanation).toContain('centre')
  })

  it('gives a concrete reason for the recommended move', () => {
    expect(explainRecommendation({ san: 'Nf3', from: 'g1', to: 'f3', piece: 'n' })).toBe('It develops your knight.')
  })

  it('remembers strengths and mistakes without repeating concepts', () => {
    const strong = assessMove({ move: { san: 'Nf3', from: 'g1', to: 'f3', piece: 'n' }, bestMove: 'g1f3', bestMoveSan: 'Nf3', lossCp: 5, tier: 'beginner' })
    const weak = assessMove({ move: { san: 'Qh5', from: 'd1', to: 'h5', piece: 'q' }, bestMove: 'g1f3', bestMoveSan: 'Nf3', lossCp: 185, tier: 'beginner' })
    const memory = rememberInsight(rememberInsight(undefined, strong), weak)
    expect(memory.concepts).toEqual(['piece development', 'queen safety'])
    expect(memory.strengths).toContain('piece development')
    expect(memory.mistakes).toContain('queen safety')
  })

  it('turns game evidence into one next lesson', () => {
    const weak = assessMove({ move: { san: 'Qh5', from: 'd1', to: 'h5', piece: 'q' }, bestMove: 'e2e4', bestMoveSan: 'e4', lossCp: 330, tier: 'beginner' })
    expect(createPostGameReview([weak], 'Black won', ['pawn-basics'])).toMatchObject({
      focus: 'queen safety',
      recommendedLessonId: 'knight-jumps',
    })
  })
})
