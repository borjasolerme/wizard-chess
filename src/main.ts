import './style.css'
import { Chess, type Move, type Square } from 'chess.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { StockfishEngine } from './stockfish'
import { VoiceController, type VoiceTool } from './voice'
import { normalizeOpenRouterKey, openRouterKeyStorageKey } from './api-key'
import { isGameActive, type GamePhase } from './game-session'

type Difficulty = 'apprentice' | 'duelist' | 'master'
type Mode = 'learn' | 'ranked'
type PlayerColor = 'white' | 'black'
type CameraView = 'white' | 'black' | 'top' | 'cinematic'
type ToolResult = { content: Array<{ type: 'text'; text: string }> }
type SavedGame = { fen: string; history?: string[]; mode: Mode; difficulty: Difficulty; playerColor: PlayerColor; outcome: string | null; savedAt: string }

const lessons = [{ id: 'pawn-basics', title: 'How a pawn moves', description: 'Move a pawn forward one square, or two from its starting rank. Pawns capture diagonally.' }]
let game = new Chess()
let mode: Mode = 'learn'
let phase: GamePhase = 'entry'
let difficulty: Difficulty = 'apprentice'
let selected: Square | null = null
let lastMove: Move | null = null
let rankedWins = Number(localStorage.getItem('wizard-chess-wins') ?? 0)
let playerColor: PlayerColor = 'white'
let paused = false
let outcome: string | null = null
const savedGamesKey = 'wizard-chess-saved-games'
const stockfish = new StockfishEngine()
const gameTools: WebMCP.ModelContextTool[] = []

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell awaiting-choice">
    <section class="stage">
      <canvas id="board" aria-label="Interactive 3D chessboard" aria-disabled="true"></canvas>
      <header class="brand"><h1>Wizard Chess</h1><p>Chess by voice or touch</p></header>
      <nav class="modes" aria-label="Game mode"><button id="learn">Learn</button><button id="ranked">Play</button></nav>
      <div class="game-hud" aria-live="polite">
        <span class="turn-dot" aria-hidden="true"></span>
        <span id="status" class="status">Choose a lesson</span>
      </div>

      <section id="lesson" class="context-card lesson-card" hidden>
        <span class="eyebrow">First lesson</span>
        <h2>Pawn movement</h2>
        <p>${lessons[0].description}</p>
        <button id="start-lesson" class="primary-action">Begin lesson</button>
      </section>

      <section id="ranked-setup" class="context-card play-card" hidden>
        <span class="eyebrow">New game</span>
        <h2>Choose your opponent</h2>
        <label for="difficulty">Strength</label>
        <select id="difficulty"><option value="apprentice">Apprentice</option><option value="duelist">Duelist</option><option value="master">Master</option></select>
        <button id="new-game" class="primary-action">Begin game</button>
      </section>

      <section id="entry-screen" class="entry-screen">
        <div class="entry-card">
          <span class="eyebrow">Choose a path</span>
          <h2>How do you want to begin?</h2>
          <div class="entry-actions">
            <button id="choose-learn"><strong>Learn</strong><span>Start with a guided lesson</span></button>
            <button id="choose-play"><strong>Play</strong><span>Face the computer</span></button>
          </div>
        </div>
      </section>

      <div class="voice-dock">
        <button id="voice-toggle" class="voice-button" aria-pressed="false">Start voice</button>
        <div id="voice-status" class="voice-status">Voice ready</div>
        <div id="voice-transcript" class="voice-transcript" aria-live="polite"></div>
      </div>

      <details class="more-menu">
        <summary aria-label="More options">•••</summary>
        <div class="more-popover">
          <button id="restart-game" hidden>New game</button>
          <button id="open-settings">Settings</button>
          <div class="meta-row"><span>Victories</span><strong id="wins">${rankedWins}</strong></div>
        </div>
      </details>

      <dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title">
        <form id="settings-form">
          <div class="settings-heading">
            <div><span class="eyebrow">AI provider</span><h2 id="settings-title">Settings</h2></div>
            <button id="close-settings" class="close-settings" type="button" aria-label="Close settings">×</button>
          </div>
          <div class="provider-row"><span>OpenRouter</span><span id="key-state"></span></div>
          <label for="openrouter-key">API key</label>
          <input id="openrouter-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="sk-or-v1-…">
          <p class="settings-note">Saved in this browser and sent only with voice requests.</p>
          <p id="settings-status" class="settings-status" aria-live="polite"></p>
          <div class="settings-actions">
            <button id="remove-key" class="secondary-action" type="button">Remove key</button>
            <button class="primary-action" type="submit">Save</button>
          </div>
          <a class="get-key" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">Get an OpenRouter key ↗</a>
        </form>
      </dialog>
    </section>
  </main>`

const canvas = document.querySelector<HTMLCanvasElement>('#board')!
const status = document.querySelector<HTMLDivElement>('#status')!
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x090b10)
scene.fog = new THREE.Fog(0x090b10, 12, 25)
const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100)
camera.position.set(8, 10, 10)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0, 0)
controls.enabled = false
controls.maxPolarAngle = Math.PI / 2.1
controls.minDistance = 8
controls.maxDistance = 20
controls.enableDamping = true
scene.add(new THREE.HemisphereLight(0xaaa8c8, 0x20170e, 2.1))
const torch = new THREE.PointLight(0xd99a54, 50, 18)
torch.position.set(-5, 7, 3)
torch.castShadow = true
scene.add(torch)

const boardGroup = new THREE.Group()
scene.add(boardGroup)
const squareMeshes: THREE.Mesh[] = []
for (let rank = 0; rank < 8; rank++) for (let file = 0; file < 8; file++) {
  const square = new THREE.Mesh(new THREE.BoxGeometry(1, .18, 1), new THREE.MeshStandardMaterial({ color: (rank + file) % 2 ? 0x252830 : 0x82745f, roughness: .9 }))
  square.position.set(file - 3.5, 0, rank - 3.5)
  square.userData.square = `${'abcdefgh'[file]}${rank + 1}`
  square.receiveShadow = true
  boardGroup.add(square)
  squareMeshes.push(square)
}

const coordinateMaterials = new Map<string, THREE.SpriteMaterial>()
function coordinateSprite(label: string) {
  let material = coordinateMaterials.get(label)
  if (!material) {
    const labelCanvas = document.createElement('canvas')
    labelCanvas.width = 128
    labelCanvas.height = 128
    const context = labelCanvas.getContext('2d')!
    context.fillStyle = '#d8c393'
    context.font = '600 64px Georgia'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, 64, 64)
    const texture = new THREE.CanvasTexture(labelCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: .88 })
    coordinateMaterials.set(label, material)
  }
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(.34, .34, 1)
  sprite.renderOrder = 2
  return sprite
}

for (let index = 0; index < 8; index++) {
  const file = index - 3.5
  const rank = index - 3.5
  for (const edge of [-4.15, 4.15]) {
    const fileLabel = coordinateSprite('abcdefgh'[index])
    fileLabel.position.set(file, .18, edge)
    boardGroup.add(fileLabel)

    const rankLabel = coordinateSprite(String(index + 1))
    rankLabel.position.set(edge, .18, rank)
    boardGroup.add(rankLabel)
  }
}

const pieceGroup = new THREE.Group()
boardGroup.add(pieceGroup)
const pieceGeometry: Record<string, THREE.BufferGeometry> = {
  p: new THREE.CylinderGeometry(.2, .28, .7, 12), r: new THREE.BoxGeometry(.52, .8, .52),
  n: new THREE.ConeGeometry(.32, .95, 5), b: new THREE.ConeGeometry(.3, 1.05, 12),
  q: new THREE.CylinderGeometry(.18, .36, 1.15, 8), k: new THREE.CylinderGeometry(.28, .38, 1.3, 8)
}

function renderPosition() {
  pieceGroup.clear()
  for (const row of game.board()) for (const piece of row) if (piece) {
    const file = piece.square.charCodeAt(0) - 97
    const rank = Number(piece.square[1]) - 1
    const material = new THREE.MeshStandardMaterial({ color: piece.color === 'w' ? 0xbdb6a8 : 0x33343b, roughness: .85, metalness: .08 })
    const mesh = new THREE.Mesh(pieceGeometry[piece.type], material)
    mesh.position.set(file - 3.5, .55, rank - 3.5)
    mesh.userData.square = piece.square
    mesh.castShadow = true
    pieceGroup.add(mesh)
  }
  squareMeshes.forEach(mesh => (mesh.material as THREE.MeshStandardMaterial).emissive.set(mesh.userData.square === selected ? 0x80621e : 0x000000))
}

function textResult(value: unknown): ToolResult { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] } }
function describeMove(move: Move | null) {
  if (!move) return 'No move has been played yet.'
  return `${move.color === 'w' ? 'White' : 'Black'} moved ${move.piece} from ${move.from} to ${move.to}${move.captured ? `, capturing a ${move.captured}` : ''}${move.san.includes('+') ? ' with check' : ''}.`
}
function updateStatus(message?: string) {
  status.textContent = message ?? (game.isGameOver() ? `Game over: ${game.isCheckmate() ? 'checkmate' : 'draw'}.` : `${game.turn() === 'w' ? 'White' : 'Black'} to move.`)
  status.parentElement?.toggleAttribute('data-alert', game.inCheck() || game.isGameOver() || outcome !== null)
}
function finishMove(move: Move) {
  lastMove = move
  selected = null
  renderPosition()
  updateStatus(describeMove(lastMove))
  if (game.isCheckmate() && lastMove.color === (playerColor === 'white' ? 'w' : 'b') && mode === 'ranked') {
    rankedWins += 1
    localStorage.setItem('wizard-chess-wins', String(rankedWins))
    document.querySelector('#wins')!.textContent = String(rankedWins)
  }
  return lastMove
}
function playMove(from: string, to: string, promotion = 'q') {
  try { return finishMove(game.move({ from, to, promotion })) }
  catch { return null }
}
function playSanMove(notation: string) {
  try { return finishMove(game.move(notation)) }
  catch { return null }
}

const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
function chooseFallbackMove() {
  const moves = game.moves({ verbose: true })
  const noise = difficulty === 'apprentice' ? 8 : difficulty === 'duelist' ? 3 : .5
  return moves.sort((a, b) => ((values[b.captured ?? ''] ?? 0) + Math.random() * noise) - ((values[a.captured ?? ''] ?? 0) + Math.random() * noise))[0]
}
async function maybeAiTurn() {
  const humanTurn = playerColor === 'white' ? 'w' : 'b'
  if (mode !== 'ranked' || game.turn() === humanTurn || game.isGameOver() || paused || outcome) return null
  updateStatus(`${difficulty} Stockfish is thinking…`)
  try {
    const uci = await stockfish.bestMove(game.fen(), difficulty)
    if (!uci) return null
    return playMove(uci.slice(0, 2), uci.slice(2, 4), uci.slice(4) || 'q')
  } catch (error) {
    console.warn('Stockfish unavailable; using the lightweight fallback.', error)
    const move = chooseFallbackMove()
    return move ? playMove(move.from, move.to, move.promotion) : null
  }
}
async function startGame(color: PlayerColor = playerColor) {
  playerColor = color
  paused = false
  outcome = null
  game.reset()
  lastMove = null
  selected = null
  phase = 'active'
  syncProgression()
  document.querySelector('.shell')!.classList.add('playing')
  renderPosition()
  updateStatus(`New ranked game. You play ${playerColor}.`)
  return maybeAiTurn()
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
canvas.addEventListener('click', event => {
  if (!isGameActive(phase)) return
  const humanTurn = mode === 'learn' ? 'w' : playerColor === 'white' ? 'w' : 'b'
  if (game.turn() !== humanTurn || game.isGameOver() || paused || outcome) return
  const rect = canvas.getBoundingClientRect()
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects([...pieceGroup.children, ...squareMeshes])[0]
  const square = hit?.object.userData.square as Square | undefined
  if (!square) return
  const piece = game.get(square)
  if (!selected && piece?.color === humanTurn) selected = square
  else if (selected) {
    if (piece?.color === humanTurn) selected = square
    else if (playMove(selected, square)) void maybeAiTurn()
    else updateStatus('That move is not legal. Choose again.')
  }
  renderPosition()
})

document.querySelector('#learn')!.addEventListener('click', () => setMode('learn'))
document.querySelector('#ranked')!.addEventListener('click', () => setMode('ranked'))
document.querySelector('#choose-learn')!.addEventListener('click', () => setMode('learn'))
document.querySelector('#choose-play')!.addEventListener('click', () => setMode('ranked'))
document.querySelector('#start-lesson')!.addEventListener('click', () => { setMode('learn'); phase = 'active'; syncProgression(); document.querySelector('.shell')!.classList.add('lesson-active'); game.load('8/8/8/8/8/8/4P3/4K2k w - - 0 1'); renderPosition(); updateStatus('Your move · pawn e2 to e3 or e4') })
document.querySelector('#new-game')!.addEventListener('click', () => { setMode('ranked'); void startGame() })
document.querySelector('#restart-game')!.addEventListener('click', () => { setMode('ranked'); void startGame() })
document.querySelector<HTMLSelectElement>('#difficulty')!.addEventListener('change', event => { difficulty = (event.target as HTMLSelectElement).value as Difficulty; updateStatus(`Difficulty set to ${difficulty}.`) })

const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!
const settingsForm = document.querySelector<HTMLFormElement>('#settings-form')!
const keyInput = document.querySelector<HTMLInputElement>('#openrouter-key')!
const keyState = document.querySelector<HTMLElement>('#key-state')!
const settingsStatus = document.querySelector<HTMLElement>('#settings-status')!
const removeKeyButton = document.querySelector<HTMLButtonElement>('#remove-key')!

function openRouterKey() { return localStorage.getItem(openRouterKeyStorageKey) ?? '' }
function renderKeyState() {
  const saved = Boolean(openRouterKey())
  keyState.textContent = saved ? 'Saved' : 'Not set'
  keyState.dataset.saved = String(saved)
  removeKeyButton.hidden = !saved
}
document.querySelector('#open-settings')!.addEventListener('click', () => {
  document.querySelector('.more-menu')!.removeAttribute('open')
  keyInput.value = openRouterKey()
  settingsStatus.textContent = ''
  renderKeyState()
  settingsDialog.showModal()
})
document.querySelector('#close-settings')!.addEventListener('click', () => settingsDialog.close())
settingsForm.addEventListener('submit', event => {
  event.preventDefault()
  const key = normalizeOpenRouterKey(keyInput.value)
  if (!key) {
    settingsStatus.textContent = 'Enter a valid OpenRouter key.'
    return
  }
  localStorage.setItem(openRouterKeyStorageKey, key)
  keyInput.value = key
  settingsStatus.textContent = 'Saved. Voice is ready.'
  renderKeyState()
})
removeKeyButton.addEventListener('click', () => {
  localStorage.removeItem(openRouterKeyStorageKey)
  keyInput.value = ''
  settingsStatus.textContent = 'Key removed.'
  renderKeyState()
})

function syncProgression() {
  const active = isGameActive(phase)
  const shell = document.querySelector<HTMLElement>('.shell')!
  shell.classList.toggle('awaiting-choice', phase === 'entry')
  shell.classList.toggle('setting-up', phase === 'setup')
  canvas.setAttribute('aria-disabled', String(!active))
  controls.enabled = active
  document.querySelector<HTMLButtonElement>('#restart-game')!.hidden = !active || mode !== 'ranked'
}

function setMode(next: Mode) {
  mode = next
  phase = 'setup'
  syncProgression()
  document.querySelector('.shell')!.classList.remove('playing', 'lesson-active')
  document.querySelector<HTMLElement>('#entry-screen')!.hidden = true
  document.querySelector('#learn')!.classList.toggle('active', next === 'learn')
  document.querySelector('#ranked')!.classList.toggle('active', next === 'ranked')
  document.querySelector<HTMLElement>('#lesson')!.hidden = next !== 'learn'
  document.querySelector<HTMLElement>('#ranked-setup')!.hidden = next !== 'ranked'
  updateStatus(next === 'learn' ? 'Choose a lesson' : 'Choose an opponent')
}

function gameState() {
  return {
    mode: phase === 'entry' ? null : mode,
    phase,
    difficulty,
    playerColor,
    paused,
    outcome,
    fen: game.fen(),
    sideToMove: game.turn() === 'w' ? 'white' : 'black',
    gameOver: game.isGameOver() || outcome !== null,
    check: game.inCheck(),
    lastMove: lastMove ? { san: lastMove.san, from: lastMove.from, to: lastMove.to } : null,
    legalMoves: game.moves(),
    localVictories: rankedWins,
  }
}

function readSavedGames(): Record<string, SavedGame> {
  try { return JSON.parse(localStorage.getItem(savedGamesKey) ?? '{}') as Record<string, SavedGame> }
  catch { return {} }
}

function writeSavedGames(savedGames: Record<string, SavedGame>) {
  localStorage.setItem(savedGamesKey, JSON.stringify(savedGames))
}

function restoreLastMove() {
  const history = game.history({ verbose: true })
  lastMove = history.length ? history[history.length - 1] : null
}

function setCameraView(view: CameraView) {
  const positions: Record<CameraView, [number, number, number]> = {
    white: [0, 9, 10],
    black: [0, 9, -10],
    top: [0, 14, 0.01],
    cinematic: [8, 10, 10],
  }
  camera.position.set(...positions[view])
  controls.target.set(0, 0, 0)
  controls.update()
}

function defineTool<const Schema extends object>(tool: WebMCP.ModelContextToolFromSchema<Schema>) { return tool }

async function registerTools() {
  const emptySchema = { type: 'object', properties: {}, additionalProperties: false } as const
  const addTool = <Schema extends object>(tool: WebMCP.ModelContextToolFromSchema<Schema>) => gameTools.push(tool as unknown as WebMCP.ModelContextTool)
  addTool(defineTool({ name: 'list_lessons', title: 'List chess lessons', description: 'Lists every guided chess lesson with the lesson ID required by start_lesson.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(lessons) }))
  addTool(defineTool({ name: 'start_lesson', title: 'Start a chess lesson', description: 'Starts the selected guided lesson and visibly loads its position on the shared 3D board.', inputSchema: { type: 'object', properties: { lesson_id: { type: 'string', enum: ['pawn-basics'], description: 'Lesson ID returned by list_lessons.' } }, required: ['lesson_id'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ lesson_id }) => { if (lesson_id !== lessons[0].id) return textResult({ error: 'Unknown lesson.', availableLessons: lessons.map(lesson => lesson.id) }); setMode('learn'); phase = 'active'; syncProgression(); document.querySelector('.shell')!.classList.add('lesson-active'); paused = false; outcome = null; game.load('8/8/8/8/8/8/4P3/4K2k w - - 0 1'); lastMove = null; selected = null; renderPosition(); updateStatus('Your move · pawn e2 to e3 or e4'); return textResult({ message: 'Pawn lesson started. Move e2 to e3 or e4.', state: gameState() }) } }))
  addTool(defineTool({ name: 'make_move', title: 'Play a chess move', description: 'Plays one legal move on the visible shared board. Accepts standard algebraic notation such as e4, Nf3, or O-O, and UCI notation such as e2e4 or e7e8q. In ranked mode, waits for the local opponent to reply before returning.', inputSchema: { type: 'object', properties: { move: { type: 'string', minLength: 2, maxLength: 7, description: 'A legal move in SAN or UCI notation.' } }, required: ['move'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ move: notation }) => {
      if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game before making a move.', state: gameState() })
      if (paused) return textResult({ error: 'The game is paused. Resume it before moving.', state: gameState() })
      if (outcome) return textResult({ error: `The game has ended: ${outcome}. Start or load a game before moving.`, state: gameState() })
      const playableColor = mode === 'learn' ? 'w' : playerColor === 'white' ? 'w' : 'b'
      if (game.turn() !== playableColor) return textResult({ error: `It is ${game.turn() === 'w' ? 'White' : 'Black'} to move; the player controls ${mode === 'learn' ? 'White in this lesson' : playerColor}.`, state: gameState() })
      const normalized = notation.trim()
      const uci = normalized.toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/)
      const move = uci ? playMove(uci[1], uci[2], uci[3] ?? 'q') : playSanMove(normalized)
      if (!move) return textResult({ error: `"${notation}" is not legal in the current position.`, state: gameState() })
      const opponentMove = await maybeAiTurn()
      if (mode === 'learn') updateStatus('Lesson complete. The pawn moved legally.')
      return textResult({ played: move.san, opponentReply: opponentMove?.san ?? null, state: gameState() })
    } }))
  addTool(defineTool({ name: 'get_game_state', title: 'Inspect the chess game', description: 'Returns the complete current game state needed to coach or play: mode, difficulty, position, side to move, checks, last move, legal moves, and local victories.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(gameState()) }))
  addTool(defineTool({ name: 'explain_last_move', title: 'Explain the last move', description: 'Explains the most recent move on the shared board in plain language.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(describeMove(lastMove)) }))
  addTool(defineTool({ name: 'set_difficulty', title: 'Set opponent difficulty', description: 'Sets the ranked opponent to Apprentice, Duelist, or Master and updates the visible selector.', inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['apprentice', 'duelist', 'master'], description: 'Opponent strength.' } }, required: ['level'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ level }) => { if (level !== 'apprentice' && level !== 'duelist' && level !== 'master') return textResult({ error: 'Difficulty must be apprentice, duelist, or master.', state: gameState() }); difficulty = level; document.querySelector<HTMLSelectElement>('#difficulty')!.value = level; updateStatus(`Difficulty set to ${level}.`); return textResult({ message: `Difficulty set to ${level}.`, state: gameState() }) } }))
  addTool(defineTool({ name: 'get_leaderboard', title: 'View local leaderboard', description: 'Returns the player\'s local ranked victory count from this browser.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult([{ rank: 1, player: 'You', wins: rankedWins }]) }))
  addTool(defineTool({ name: 'set_game_paused', title: 'Pause or resume the game', description: 'Pauses or resumes the current game. Moves are blocked while paused, and the visible status is updated.', inputSchema: { type: 'object', properties: { paused: { type: 'boolean', description: 'True to pause; false to resume.' } }, required: ['paused'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ paused: shouldPause }) => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game first.', state: gameState() })
    if (outcome) return textResult({ error: `The game has ended: ${outcome}.`, state: gameState() })
    paused = shouldPause
    updateStatus(paused ? 'Game paused.' : 'Game resumed.')
    const opponentMove = paused ? null : await maybeAiTurn()
    return textResult({ message: paused ? 'Game paused.' : 'Game resumed.', opponentMove: opponentMove?.san ?? null, state: gameState() })
  } }))
  addTool(defineTool({ name: 'undo_last_turn', title: 'Undo the last turn', description: 'Rewinds the previous player turn. In ranked mode it normally removes both the opponent reply and the player move so the player can choose again.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game first.', state: gameState() })
    const undone: string[] = []
    const first = game.undo()
    if (!first) return textResult({ error: 'There are no moves to undo.', state: gameState() })
    undone.push(first.san)
    if (mode === 'ranked') {
      const second = game.undo()
      if (second) undone.push(second.san)
    }
    outcome = null
    paused = false
    restoreLastMove()
    renderPosition()
    updateStatus(`Undid ${undone.reverse().join(' and ')}.`)
    return textResult({ message: 'Previous turn undone.', undone, state: gameState() })
  } }))
  addTool(defineTool({ name: 'resign_game', title: 'Resign the current game', description: 'Ends the current ranked game as a resignation by the player and updates the visible status.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a ranked game first.', state: gameState() })
    if (mode !== 'ranked') return textResult({ error: 'Resignation is available in ranked mode.', state: gameState() })
    if (outcome || game.isGameOver()) return textResult({ error: 'The game has already ended.', state: gameState() })
    outcome = `${playerColor} resigned`
    selected = null
    updateStatus(`Game over: ${playerColor} resigned.`)
    return textResult({ message: `You resigned as ${playerColor}.`, state: gameState() })
  } }))
  addTool(defineTool({ name: 'offer_draw', title: 'Offer a draw', description: 'Offers a draw to the local opponent. In this prototype the opponent accepts, ending the ranked game as a draw.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a ranked game first.', state: gameState() })
    if (mode !== 'ranked') return textResult({ error: 'Draw offers are available in ranked mode.', state: gameState() })
    if (outcome || game.isGameOver()) return textResult({ error: 'The game has already ended.', state: gameState() })
    outcome = 'draw by agreement'
    selected = null
    updateStatus('Game over: draw by agreement.')
    return textResult({ message: 'Draw offered and accepted by the local opponent.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'save_game', title: 'Save the current game', description: 'Saves the current position and game settings under a spoken name in this browser.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 40, description: 'Short name for the saved game.' } }, required: ['name'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ name }) => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game first.', state: gameState() })
    const normalizedName = name.trim()
    if (!normalizedName || normalizedName.length > 40) return textResult({ error: 'Save name must contain 1 to 40 characters.' })
    const savedGames = readSavedGames()
    savedGames[normalizedName] = { fen: game.fen(), history: game.history(), mode, difficulty, playerColor, outcome, savedAt: new Date().toISOString() }
    writeSavedGames(savedGames)
    updateStatus(`Game saved as ${normalizedName}.`)
    return textResult({ message: `Game saved as ${normalizedName}.`, save: savedGames[normalizedName] })
  } }))
  addTool(defineTool({ name: 'list_saved_games', title: 'List saved games', description: 'Lists saved games available in this browser with their names, modes, colors, and save times.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(Object.entries(readSavedGames()).map(([name, saved]) => ({ name, mode: saved.mode, playerColor: saved.playerColor, savedAt: saved.savedAt }))) }))
  addTool(defineTool({ name: 'load_saved_game', title: 'Load a saved game', description: 'Loads a named saved game, restoring its position and settings on the visible board.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 40, description: 'Exact saved-game name returned by list_saved_games.' } }, required: ['name'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ name }) => {
    const saved = readSavedGames()[name]
    if (!saved) return textResult({ error: `No saved game named "${name}".`, available: Object.keys(readSavedGames()) })
    try {
      const restoredGame = new Chess()
      if (saved.history?.length) {
        for (const move of saved.history) restoredGame.move(move)
        if (restoredGame.fen() !== saved.fen) throw new Error('Saved history does not match its position.')
      } else restoredGame.load(saved.fen)
      game = restoredGame
    } catch { return textResult({ error: `Saved game "${name}" contains invalid or inconsistent data.` }) }
    mode = saved.mode
    difficulty = saved.difficulty
    playerColor = saved.playerColor
    outcome = saved.outcome
    paused = false
    selected = null
    restoreLastMove()
    document.querySelector<HTMLSelectElement>('#difficulty')!.value = difficulty
    setMode(mode)
    phase = 'active'
    syncProgression()
    if (mode === 'ranked') document.querySelector('.shell')!.classList.add('playing')
    renderPosition()
    updateStatus(`Loaded ${name}.`)
    return textResult({ message: `Loaded ${name}.`, state: gameState() })
  } }))
  addTool(defineTool({ name: 'delete_saved_game', title: 'Delete a saved game', description: 'Deletes one named saved game from this browser without changing the current board.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 40, description: 'Exact saved-game name returned by list_saved_games.' } }, required: ['name'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ name }) => {
    const savedGames = readSavedGames()
    if (!savedGames[name]) return textResult({ error: `No saved game named "${name}".`, available: Object.keys(savedGames) })
    delete savedGames[name]
    writeSavedGames(savedGames)
    return textResult({ message: `Deleted saved game ${name}.`, remaining: Object.keys(savedGames) })
  } }))
  addTool(defineTool({ name: 'load_custom_position', title: 'Load a custom chess position', description: 'Loads a valid FEN position onto the visible board for analysis or practice.', inputSchema: { type: 'object', properties: { fen: { type: 'string', minLength: 1, description: 'A complete Forsyth-Edwards Notation position.' } }, required: ['fen'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ fen }) => {
    try { game.load(fen) } catch { return textResult({ error: 'The supplied FEN position is invalid.', state: gameState() }) }
    mode = 'learn'
    paused = false
    outcome = null
    selected = null
    lastMove = null
    setMode('learn')
    phase = 'active'
    syncProgression()
    document.querySelector('.shell')!.classList.add('lesson-active')
    renderPosition()
    updateStatus('Custom position loaded for analysis.')
    return textResult({ message: 'Custom position loaded.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'set_camera_view', title: 'Change the board camera', description: 'Changes the visible 3D board camera to the White side, Black side, top-down, or cinematic view.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['white', 'black', 'top', 'cinematic'], description: 'Desired board viewpoint.' } }, required: ['view'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ view }) => {
    if (view !== 'white' && view !== 'black' && view !== 'top' && view !== 'cinematic') return textResult({ error: 'Camera view must be white, black, top, or cinematic.' })
    setCameraView(view)
    return textResult({ message: `Camera changed to ${view} view.` })
  } }))
  addTool(defineTool({ name: 'start_ranked_game', title: 'Start a ranked game', description: 'Starts or restarts a ranked game and visibly resets the board. The player may choose White or Black and an opponent difficulty.', inputSchema: { type: 'object', properties: { color: { type: 'string', enum: ['white', 'black'], description: 'Color the player wants to control.' }, level: { type: 'string', enum: ['apprentice', 'duelist', 'master'], description: 'Optional opponent strength.' } }, additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ color, level }) => {
    const chosenColor = color ?? playerColor
    if (chosenColor !== 'white' && chosenColor !== 'black') return textResult({ error: 'Color must be white or black.', state: gameState() })
    if (level && level !== 'apprentice' && level !== 'duelist' && level !== 'master') return textResult({ error: 'Difficulty must be apprentice, duelist, or master.', state: gameState() })
    if (level) difficulty = level
    document.querySelector<HTMLSelectElement>('#difficulty')!.value = difficulty
    setMode('ranked')
    const openingMove = await startGame(chosenColor)
    if (chosenColor === 'black') setCameraView('black')
    return textResult({ message: `Ranked game started. You are ${chosenColor}.`, opponentOpeningMove: openingMove?.san ?? null, state: gameState() })
  } }))
  const context = document.modelContext
  if (!context) return
  const controller = new AbortController()
  const registrations = gameTools.map(tool => context.registerTool(tool, { signal: controller.signal }))
  try {
    await Promise.all(registrations)
  } catch (error) {
    controller.abort()
    console.error('WebMCP registration failed', error)
  }
}

function voiceToolDefinitions(): VoiceTool[] {
  return gameTools.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema }))
}

async function executeGameTool(name: string, argumentsObject: Record<string, unknown>) {
  const tool = gameTools.find(candidate => candidate.name === name)
  if (!tool) return textResult({ error: `Unknown WebMCP tool: ${name}` })
  return tool.execute(argumentsObject, { signal: new AbortController().signal })
}

function setupVoice() {
  new VoiceController({
    button: document.querySelector<HTMLButtonElement>('#voice-toggle')!,
    status: document.querySelector<HTMLElement>('#voice-status')!,
    transcript: document.querySelector<HTMLElement>('#voice-transcript')!,
    getState: gameState,
    getTools: voiceToolDefinitions,
    getApiKey: openRouterKey,
    executeTool: executeGameTool,
  })
}

function resize() {
  const { clientWidth, clientHeight } = canvas
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}
function animate() { resize(); controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate) }
async function initialize() {
  renderPosition()
  await registerTools()
  setupVoice()
  animate()
}
void initialize()
