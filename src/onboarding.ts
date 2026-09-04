export type OnboardingPath = 'academy' | 'mentor' | 'battle'
export type OnboardingStep = { title: string; body: string }

const paths: OnboardingPath[] = ['academy', 'mentor', 'battle']

export const onboardingSteps: Record<OnboardingPath, OnboardingStep[]> = {
  academy: [
    { title: 'Learn on the board', body: 'Each lesson shows only the pieces you need. Follow the instruction, then make the move by voice or touch.' },
    { title: 'Ask whenever you need help', body: 'Say a move such as “pawn from e2 to e4.” Say “guide me” to hear the current instruction again.' },
  ],
  mentor: [
    { title: 'Play a complete game', body: 'Play Stockfish while the Wizard tracks your moves for the final review.' },
    { title: 'Ask when you need help', body: 'The board stays clear while you play. Say “guide me” for advice. Your full review appears after the game.' },
  ],
  battle: [
    { title: 'Play on your own', body: 'Play Stockfish without coaching or messages over the board.' },
    { title: 'Choose your challenge', body: 'Select an opponent strength, begin the game, then move by voice or touch.' },
  ],
}

export function parseCompletedOnboarding(value: string | null): OnboardingPath[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return paths.filter(path => parsed.includes(path))
  } catch { return [] }
}

export function completeOnboarding(completed: OnboardingPath[], path: OnboardingPath) {
  return completed.includes(path) ? completed : [...completed, path]
}
