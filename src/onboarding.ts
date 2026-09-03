export type OnboardingPath = 'academy' | 'mentor' | 'battle'
export type OnboardingStep = { eyebrow: string; title: string; body: string }

const paths: OnboardingPath[] = ['academy', 'mentor', 'battle']

export const onboardingSteps: Record<OnboardingPath, OnboardingStep[]> = {
  academy: [
    { eyebrow: 'Academy · 1 of 2', title: 'Learn on the board', body: 'Each lesson shows only the pieces you need. Follow the instruction, then make the move by voice or touch.' },
    { eyebrow: 'Academy · 2 of 2', title: 'Ask whenever you need help', body: 'Say a move such as “pawn from e2 to e4.” Say “guide me” to hear the current instruction again.' },
  ],
  mentor: [
    { eyebrow: 'Mentor game · 1 of 2', title: 'Play a complete game', body: 'Face Stockfish while the Wizard quietly studies your choices and remembers the ideas worth practising.' },
    { eyebrow: 'Mentor game · 2 of 2', title: 'Advice only when you ask', body: 'The board stays clear while you play. Say “guide me” for advice; your complete review appears when the game ends.' },
  ],
  battle: [
    { eyebrow: 'Battle · 1 of 2', title: 'No interruptions', body: 'Play a clean game against Stockfish without coaching cards or commentary covering the board.' },
    { eyebrow: 'Battle · 2 of 2', title: 'Choose your challenge', body: 'Select an opponent strength, begin the game, then move by voice or touch. Say “next” to continue.' },
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
