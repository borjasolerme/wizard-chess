export type GamePhase = 'entry' | 'setup' | 'active' | 'complete'

export function isGameActive(phase: GamePhase) {
  return phase === 'active'
}
