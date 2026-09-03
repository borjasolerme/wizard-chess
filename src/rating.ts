export type GameScore = 0 | .5 | 1
export type PlayerColor = 'white' | 'black'

export const startingRating = 1200
export const opponentRatings = { apprentice: 1320, duelist: 1750, master: 2400 } as const

export function gameScore(result: string, playerColor: PlayerColor): GameScore {
  if (result.toLowerCase().startsWith('draw')) return .5
  return result.startsWith(playerColor === 'white' ? 'White won' : 'Black won') ? 1 : 0
}

export function updateElo(playerRating: number, opponentRating: number, score: GameScore) {
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400))
  const rating = Math.max(100, playerRating + Math.round(32 * (score - expected)))
  return { rating, change: rating - playerRating }
}
