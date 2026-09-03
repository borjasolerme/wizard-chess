import { describe, expect, it } from 'vitest'
import { gameScore, updateElo } from './rating'

describe('Elo rating', () => {
  it('awards 16 points for beating an equally rated opponent', () => {
    expect(updateElo(1200, 1200, 1)).toEqual({ rating: 1216, change: 16 })
  })

  it('derives the player score from the recorded game result', () => {
    expect(gameScore('White won by checkmate', 'white')).toBe(1)
    expect(gameScore('Black won by resignation', 'white')).toBe(0)
    expect(gameScore('Draw by agreement', 'black')).toBe(.5)
  })

  it('reports the actual change when the rating reaches its floor', () => {
    expect(updateElo(100, 100, 0)).toEqual({ rating: 100, change: 0 })
  })
})
