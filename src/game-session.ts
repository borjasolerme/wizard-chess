export type GamePhase = 'entry' | 'onboarding' | 'setup' | 'active' | 'complete' | 'replay'

export function isGameActive(phase: GamePhase) {
  return phase === 'active'
}

export function canReturnToMainMenu(phase: GamePhase) {
  return phase !== 'entry'
}
