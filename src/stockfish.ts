import { opponentRatings } from './rating'

export type EngineDifficulty = 'apprentice' | 'duelist' | 'master'
export type EngineAnalysis = { bestMove: string | null; scoreCp: number }

const settings: Record<EngineDifficulty, { elo: number; time: number }> = {
  apprentice: { elo: opponentRatings.apprentice, time: 120 },
  duelist: { elo: opponentRatings.duelist, time: 250 },
  master: { elo: opponentRatings.master, time: 500 },
}

export class StockfishEngine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private pending: { resolve: (analysis: EngineAnalysis) => void; scoreCp: number } | null = null

  private initialize() {
    if (this.ready) return this.ready
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        const worker = new Worker('/stockfish/stockfish-18-lite-single.js')
        this.worker = worker
        const timeout = window.setTimeout(() => reject(new Error('Stockfish did not start in time.')), 10_000)
        worker.addEventListener('message', event => {
          const message = String(event.data)
          if (message === 'uciok') worker.postMessage('isready')
          if (message === 'readyok') {
            window.clearTimeout(timeout)
            resolve()
          }
          if (message.startsWith('bestmove ')) {
            const move = message.split(/\s+/)[1]
            this.pending?.resolve({ bestMove: move === '(none)' ? null : move, scoreCp: this.pending.scoreCp })
            this.pending = null
          }
          if (message.startsWith('info ') && message.includes(' score ') && this.pending) {
            const centipawns = message.match(/ score cp (-?\d+)/)
            const mate = message.match(/ score mate (-?\d+)/)
            if (centipawns) this.pending.scoreCp = Number(centipawns[1])
            else if (mate) this.pending.scoreCp = Math.sign(Number(mate[1])) * 100_000
          }
        })
        worker.addEventListener('error', event => reject(new Error(event.message || 'Stockfish failed to load.')), { once: true })
        worker.postMessage('uci')
      } catch (error) {
        reject(error)
      }
    })
    return this.ready
  }

  async bestMove(fen: string, difficulty: EngineDifficulty) {
    await this.initialize()
    if (!this.worker) throw new Error('Stockfish is unavailable.')
    if (this.pending) throw new Error('Stockfish is already calculating.')
    const { elo, time } = settings[difficulty]
    this.worker.postMessage('setoption name UCI_LimitStrength value true')
    this.worker.postMessage(`setoption name UCI_Elo value ${elo}`)
    this.worker.postMessage(`position fen ${fen}`)
    return new Promise<string | null>(resolve => {
      this.pending = { resolve: analysis => resolve(analysis.bestMove), scoreCp: 0 }
      this.worker!.postMessage(`go movetime ${time}`)
    })
  }

  async analyze(fen: string, time = 180): Promise<EngineAnalysis> {
    await this.initialize()
    if (!this.worker) throw new Error('Stockfish is unavailable.')
    if (this.pending) throw new Error('Stockfish is already calculating.')
    this.worker.postMessage('setoption name UCI_LimitStrength value false')
    this.worker.postMessage(`position fen ${fen}`)
    return new Promise<EngineAnalysis>(resolve => {
      this.pending = { resolve, scoreCp: 0 }
      this.worker!.postMessage(`go movetime ${time}`)
    })
  }
}
