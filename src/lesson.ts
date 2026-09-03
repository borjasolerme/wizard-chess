export type LessonStep = {
  title: string
  instruction: string
  fen: string
  moves: string[]
}

export const pawnLesson = {
  id: 'pawn-basics',
  title: 'Pawn movement',
  description: 'Learn how pawns move, capture, and promote.',
  steps: [
    {
      title: 'Move forward',
      instruction: 'Move the pawn from e2 to e3 or e4.',
      fen: '7k/8/8/8/8/8/4P3/4K3 w - - 0 1',
      moves: ['e2e3', 'e2e4'],
    },
    {
      title: 'Capture diagonally',
      instruction: 'Capture the black pawn: e4 to d5.',
      fen: '7k/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      moves: ['e4d5'],
    },
    {
      title: 'Promote the pawn',
      instruction: 'Move from e7 to e8 and promote to a queen.',
      fen: '7k/4P3/8/8/8/8/8/4K3 w - - 0 1',
      moves: ['e7e8q'],
    },
  ] satisfies LessonStep[],
}

export function isExpectedLessonMove(step: LessonStep, from: string, to: string, promotion = 'q') {
  return step.moves.includes(`${from}${to}${to[1] === '8' ? promotion : ''}`)
}
