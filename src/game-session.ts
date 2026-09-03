export type GamePhase = 'entry' | 'setup' | 'active'

export function isGameActive(phase: GamePhase) {
  return phase === 'active'
}
