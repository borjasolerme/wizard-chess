export type MentorTier = 'beginner' | 'intermediate' | 'advanced'
export type MoveGrade = 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export type MentorMove = {
  san: string
  from: string
  to: string
  piece: string
  captured?: string
}

export type MentorInsight = {
  grade: MoveGrade
  concept: string
  explanation: string
  playedMove: string
  recommendedMove: string | null
  lossCp: number
}

export type MentorMemory = {
  concepts: string[]
  strengths: string[]
  mistakes: string[]
}

export type PostGameReview = {
  summary: string
  strength: string
  focus: string
  recommendedLessonId: string
}

const gradeLimit: Array<[MoveGrade, number]> = [
  ['excellent', 20],
  ['good', 70],
  ['inaccuracy', 140],
  ['mistake', 300],
  ['blunder', Number.POSITIVE_INFINITY],
]

const lessonForConcept: Record<string, string> = {
  'center control': 'pawn-basics',
  'piece development': 'knight-jumps',
  'diagonal vision': 'bishop-lines',
  'tactical pressure': 'knight-fork',
  'king safety': 'castle-safely',
  'queen safety': 'knight-jumps',
  'finishing attacks': 'mate-in-one',
}

export function inferMentorTier(completedLessons: number): MentorTier {
  if (completedLessons >= 5) return 'advanced'
  if (completedLessons >= 2) return 'intermediate'
  return 'beginner'
}

function conceptForMove(move: MentorMove) {
  if (move.san.includes('#')) return 'finishing attacks'
  if (move.san === 'O-O' || move.san === 'O-O-O' || move.piece === 'k') return 'king safety'
  if (move.piece === 'q' && move.from[1] === '1') return 'queen safety'
  if (move.piece === 'n') return move.captured || move.san.includes('+') ? 'tactical pressure' : 'piece development'
  if (move.piece === 'b') return 'diagonal vision'
  if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) return 'center control'
  if (move.captured || move.san.includes('+')) return 'tactical pressure'
  return 'piece development'
}

function explanationFor(grade: MoveGrade, concept: string, tier: MentorTier, bestMove: string | null) {
  const beginnerConcepts: Record<string, string> = {
    'center control': 'You claimed space in the centre, giving your pieces more useful paths.',
    'piece development': 'You brought a piece into the game where it can help the rest of your army.',
    'diagonal vision': 'Your bishop now sees farther across the board.',
    'tactical pressure': 'You created an immediate threat your opponent must answer.',
    'king safety': 'You improved the safety of your king.',
    'queen safety': 'The queen is powerful, but moving it early can let smaller pieces chase it.',
    'finishing attacks': 'You found the final attack against the king.',
  }
  const prefix: Record<MoveGrade, string> = {
    excellent: 'Excellent.', good: 'Good.', inaccuracy: 'Playable, but slightly loose.', mistake: 'That gives your opponent a chance.', blunder: 'Danger — that loses too much ground.',
  }
  if (tier === 'beginner') return `${prefix[grade]} ${beginnerConcepts[concept]}`
  if (tier === 'intermediate') return `${prefix[grade]} This is about ${concept}.${bestMove ? ` The cleaner continuation was ${bestMove}.` : ''}`
  return `${prefix[grade]} The position changed through ${concept}.${bestMove ? ` Stockfish preferred ${bestMove}.` : ''}`
}

export function assessMove(input: { move: MentorMove; bestMove: string | null; bestMoveSan: string | null; lossCp: number; tier: MentorTier }): MentorInsight {
  const lossCp = Math.max(0, Math.round(input.lossCp))
  const grade = gradeLimit.find(([, limit]) => lossCp <= limit)![0]
  const concept = conceptForMove(input.move)
  return {
    grade,
    concept,
    explanation: explanationFor(grade, concept, input.tier, input.bestMoveSan),
    playedMove: input.move.san,
    recommendedMove: input.bestMoveSan,
    lossCp,
  }
}

function unique(items: string[]) {
  return [...new Set(items)].slice(-8)
}

export function rememberInsight(memory: MentorMemory | undefined, insight: MentorInsight): MentorMemory {
  const current = memory ?? { concepts: [], strengths: [], mistakes: [] }
  const isStrong = insight.grade === 'excellent' || insight.grade === 'good'
  return {
    concepts: unique([...current.concepts, insight.concept]),
    strengths: unique([...current.strengths, ...(isStrong ? [insight.concept] : [])]),
    mistakes: unique([...current.mistakes, ...(!isStrong ? [insight.concept] : [])]),
  }
}

export function createPostGameReview(insights: MentorInsight[], result: string, completedLessonIds: string[]): PostGameReview {
  const strongest = insights.find(insight => insight.grade === 'excellent' || insight.grade === 'good')?.concept ?? 'staying in the game'
  const weakest = [...insights].reverse().find(insight => ['inaccuracy', 'mistake', 'blunder'].includes(insight.grade))?.concept ?? 'piece development'
  let recommendedLessonId = lessonForConcept[weakest] ?? 'pawn-basics'
  if (completedLessonIds.includes(recommendedLessonId)) {
    recommendedLessonId = ['pawn-basics', 'knight-jumps', 'bishop-lines', 'knight-fork', 'castle-safely', 'mate-in-one']
      .find(id => !completedLessonIds.includes(id)) ?? recommendedLessonId
  }
  return {
    summary: `${result}. Your next game can improve through one clear idea: ${weakest}.`,
    strength: strongest,
    focus: weakest,
    recommendedLessonId,
  }
}
