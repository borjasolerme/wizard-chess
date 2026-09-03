import { lessons, type Lesson } from './lesson'
import type { MentorMemory, PostGameReview } from './mentor'

export type LessonHistory = {
  id: string
  type: 'lesson'
  lessonId: string
  title: string
  trophy: string
  completedAt: string
}

export type GameHistory = {
  id: string
  type: 'game'
  result: string
  difficulty: string
  playerColor: 'white' | 'black'
  moves: string[]
  coached?: boolean
  review?: PostGameReview
  completedAt: string
}

export type HistoryEntry = LessonHistory | GameHistory
export type ProgressData = { completedLessonIds: string[]; history: HistoryEntry[]; mentorMemory: MentorMemory }
export type Trophy = { id: string; title: string; description: string; earned: boolean }

export function emptyProgress(): ProgressData {
  return { completedLessonIds: [], history: [], mentorMemory: { concepts: [], strengths: [], mistakes: [] } }
}

export function recordLesson(progress: ProgressData, lesson: Lesson, id: string, completedAt: string): ProgressData {
  const completedLessonIds = progress.completedLessonIds.includes(lesson.id)
    ? progress.completedLessonIds
    : [...progress.completedLessonIds, lesson.id]
  const entry: LessonHistory = { id, type: 'lesson', lessonId: lesson.id, title: lesson.title, trophy: lesson.trophy, completedAt }
  return { ...progress, completedLessonIds, history: [entry, ...progress.history].slice(0, 50) }
}

export function recordGame(progress: ProgressData, game: Omit<GameHistory, 'type'>): ProgressData {
  const entry: GameHistory = { ...game, type: 'game' }
  return { ...progress, history: [entry, ...progress.history].slice(0, 50) }
}

export function trophies(progress: ProgressData, rankedWins: number): Trophy[] {
  return [
    ...lessons.map(lesson => ({
      id: `lesson:${lesson.id}`,
      title: lesson.trophy,
      description: `Complete ${lesson.title}.`,
      earned: progress.completedLessonIds.includes(lesson.id),
    })),
    { id: 'ranked:first-win', title: 'First Victory', description: 'Win a ranked game.', earned: rankedWins >= 1 },
    { id: 'ranked:five-wins', title: 'Seasoned Duelist', description: 'Win five ranked games.', earned: rankedWins >= 5 },
  ]
}

export function parseProgress(value: string | null): ProgressData {
  if (!value) return emptyProgress()
  try {
    const parsed = JSON.parse(value) as Partial<ProgressData>
    return {
      completedLessonIds: Array.isArray(parsed.completedLessonIds) ? parsed.completedLessonIds.filter(id => typeof id === 'string') : [],
      history: Array.isArray(parsed.history) ? parsed.history.filter(entry => entry && typeof entry === 'object').slice(0, 50) as HistoryEntry[] : [],
      mentorMemory: parsed.mentorMemory && typeof parsed.mentorMemory === 'object' ? {
        concepts: Array.isArray(parsed.mentorMemory.concepts) ? parsed.mentorMemory.concepts.filter(item => typeof item === 'string').slice(-8) : [],
        strengths: Array.isArray(parsed.mentorMemory.strengths) ? parsed.mentorMemory.strengths.filter(item => typeof item === 'string').slice(-8) : [],
        mistakes: Array.isArray(parsed.mentorMemory.mistakes) ? parsed.mentorMemory.mistakes.filter(item => typeof item === 'string').slice(-8) : [],
      } : { concepts: [], strengths: [], mistakes: [] },
    }
  } catch { return emptyProgress() }
}
