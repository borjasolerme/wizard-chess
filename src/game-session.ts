export type GamePhase = 'entry' | 'setup' | 'active' | 'complete' | 'replay'

export function isGameActive(phase: GamePhase) {
  return phase === 'active'
}
