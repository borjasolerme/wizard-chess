export type LessonStep = {
  title: string
  instruction: string
  fen: string
  moves: string[]
}

export type Lesson = {
  id: string
  title: string
  description: string
  trophy: string
  steps: LessonStep[]
}

export type CurriculumLevel = {
  id: string
  title: string
  description: string
  lessons: Lesson[]
}

export const pawnLesson: Lesson = {
  id: 'pawn-basics',
  title: 'Pawn movement',
  description: 'Move, capture, and promote a pawn.',
  trophy: 'First Move',
  steps: [
    { title: 'Move forward', instruction: 'Move the pawn from e2 to e3 or e4.', fen: '7k/8/8/8/8/8/4P3/4K3 w - - 0 1', moves: ['e2e3', 'e2e4'] },
    { title: 'Capture diagonally', instruction: 'Capture the black pawn: e4 to d5.', fen: '7k/8/8/3p4/4P3/8/8/4K3 w - - 0 1', moves: ['e4d5'] },
    { title: 'Promote the pawn', instruction: 'Move from e7 to e8 and promote to a queen.', fen: '7k/4P3/8/8/8/8/8/4K3 w - - 0 1', moves: ['e7e8q'] },
  ],
}

const knightLesson: Lesson = {
  id: 'knight-jumps', title: 'Knight jumps', description: 'Learn the knight’s L-shaped movement.', trophy: 'The Jumper',
  steps: [
    { title: 'First jump', instruction: 'Move the knight from b1 to c3.', fen: '7k/8/8/8/8/8/8/1N2K3 w - - 0 1', moves: ['b1c3'] },
    { title: 'Change direction', instruction: 'Move the knight from c3 to d5.', fen: '7k/8/8/8/8/2N5/8/4K3 w - - 0 1', moves: ['c3d5'] },
  ],
}

const bishopLesson: Lesson = {
  id: 'bishop-lines', title: 'Bishop lines', description: 'Move and capture along diagonals.', trophy: 'Long Sight',
  steps: [
    { title: 'Open diagonal', instruction: 'Move the bishop from c1 to g5.', fen: '7k/8/8/8/8/8/8/2B1K3 w - - 0 1', moves: ['c1g5'] },
    { title: 'Distant capture', instruction: 'Capture the rook: g5 to d8.', fen: '3r3k/8/8/6B1/8/8/8/4K3 w - - 0 1', moves: ['g5d8'] },
  ],
}

const forkLesson: Lesson = {
  id: 'knight-fork', title: 'Knight fork', description: 'Attack two valuable pieces at once.', trophy: 'Double Threat',
  steps: [
    { title: 'Create the fork', instruction: 'Jump from e5 to c6 to check the king and attack the queen.', fen: '3q4/4k3/8/4N3/8/8/8/4K3 w - - 0 1', moves: ['e5c6'] },
    { title: 'Win the queen', instruction: 'Capture the queen: c6 to d8.', fen: '3q3k/8/2N5/8/8/8/8/4K3 w - - 0 1', moves: ['c6d8'] },
  ],
}

const castlingLesson: Lesson = {
  id: 'castle-safely', title: 'Castle safely', description: 'Protect the king and activate the rook.', trophy: 'Safe King',
  steps: [
    { title: 'Kingside castle', instruction: 'Castle by moving the king from e1 to g1.', fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1', moves: ['e1g1'] },
  ],
}

const mateLesson: Lesson = {
  id: 'mate-in-one', title: 'Checkmate', description: 'Finish with a protected major piece.', trophy: 'Checkmate',
  steps: [
    { title: 'Queen mate', instruction: 'Deliver checkmate by moving the queen from d1 to d8.', fen: '7k/8/6K1/8/8/8/8/3Q4 w - - 0 1', moves: ['d1d8'] },
    { title: 'Rook mate', instruction: 'Deliver checkmate by moving the rook from a1 to a8.', fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1', moves: ['a1a8'] },
  ],
}

export const curriculum: CurriculumLevel[] = [
  { id: 'foundations', title: 'I · Foundations', description: 'How the pieces move.', lessons: [pawnLesson, knightLesson] },
  { id: 'board-vision', title: 'II · Board vision', description: 'Lines, captures, and double attacks.', lessons: [bishopLesson, forkLesson] },
  { id: 'finishing', title: 'III · Finish the game', description: 'King safety and checkmate.', lessons: [castlingLesson, mateLesson] },
]

export const lessons = curriculum.flatMap(level => level.lessons)

export function lessonById(id: string) {
  return lessons.find(lesson => lesson.id === id)
}

export function isLessonUnlocked(id: string, completedLessonIds: string[]) {
  const index = lessons.findIndex(lesson => lesson.id === id)
  return index === 0 || (index > 0 && completedLessonIds.includes(lessons[index - 1].id))
}

export function nextLesson(completedLessonIds: string[]) {
  return lessons.find(lesson => !completedLessonIds.includes(lesson.id) && isLessonUnlocked(lesson.id, completedLessonIds)) ?? lessons.at(-1)!
}

export function isExpectedLessonMove(step: LessonStep, from: string, to: string, promotion = 'q') {
  const move = `${from}${to}`
  return step.moves.includes(move) || step.moves.includes(`${move}${promotion}`)
}
