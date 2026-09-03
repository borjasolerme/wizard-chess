export type EngineDifficulty = 'apprentice' | 'duelist' | 'master'

const settings: Record<EngineDifficulty, { elo: number; time: number }> = {
  apprentice: { elo: 1320, time: 120 },
  duelist: { elo: 1750, time: 250 },
  master: { elo: 2400, time: 500 },
}

export class StockfishEngine {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private pending: ((move: string | null) => void) | null = null

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
            this.pending?.(move === '(none)' ? null : move)
            this.pending = null
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
      this.pending = resolve
      this.worker!.postMessage(`go movetime ${time}`)
    })
  }
}
