import { describe, expect, it } from 'vitest'
import { lessons } from './lesson'
import { emptyProgress, parseProgress, recordGame, recordLesson, trophies } from './progress'

describe('player progress', () => {
  it('starts new and existing players at 1200 Elo', () => {
    expect(emptyProgress().rating).toBe(1200)
    expect(parseProgress(JSON.stringify({ completedLessonIds: [], history: [] })).rating).toBe(1200)
  })

  it('records completed lessons and awards their trophies', () => {
    const progress = recordLesson(emptyProgress(), lessons[0], 'lesson-1', '2026-01-01T00:00:00.000Z')
    expect(progress.completedLessonIds).toEqual([lessons[0].id])
    expect(progress.history[0]).toMatchObject({ type: 'lesson', lessonId: lessons[0].id })
    expect(trophies(progress, 0).find(trophy => trophy.id === `lesson:${lessons[0].id}`)?.earned).toBe(true)
  })

  it('stores completed games with their moves for replay', () => {
    const progress = recordGame(emptyProgress(), {
      id: 'game-1', result: 'White won by checkmate', difficulty: 'apprentice', playerColor: 'white',
      moves: ['e4', 'e5', 'Qh5'], completedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(progress.history[0]).toMatchObject({ type: 'game', moves: ['e4', 'e5', 'Qh5'] })
  })

  it('awards ranked milestones', () => {
    expect(trophies(emptyProgress(), 1).find(trophy => trophy.id === 'ranked:first-win')?.earned).toBe(true)
    expect(trophies(emptyProgress(), 5).find(trophy => trophy.id === 'ranked:five-wins')?.earned).toBe(true)
  })
})
