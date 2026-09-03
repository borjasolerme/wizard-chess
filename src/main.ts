import './style.css'
import { Chess, type Move, type Square } from 'chess.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type Difficulty = 'apprentice' | 'duelist' | 'master'
type Mode = 'learn' | 'ranked'
type ToolResult = { content: Array<{ type: 'text'; text: string }> }

const lessons = [{ id: 'pawn-basics', title: 'How a pawn moves', description: 'Move a pawn forward one square, or two from its starting rank. Pawns capture diagonally.' }]
const game = new Chess()
let mode: Mode = 'learn'
let difficulty: Difficulty = 'apprentice'
let selected: Square | null = null
let lastMove: Move | null = null
let rankedWins = Number(localStorage.getItem('wizard-chess-wins') ?? 0)

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <section class="stage">
      <canvas id="board" aria-label="Interactive 3D chessboard"></canvas>
      <div class="brand"><h1>Wizard Chess</h1><p>Human and agent. One board.</p></div>
    </section>
    <aside class="panel">
      <div class="modes"><button id="learn" class="active">Learn</button><button id="ranked">Ranked</button></div>
      <section id="lesson" class="card"><h2>How a pawn moves</h2><p>${lessons[0].description}</p><button id="start-lesson">Start lesson</button></section>
      <section class="card controls">
        <label for="difficulty">Opponent</label>
        <select id="difficulty"><option value="apprentice">Apprentice</option><option value="duelist">Duelist</option><option value="master">Master</option></select>
        <button id="new-game">Start ranked game</button>
        <div id="status" class="status">Select a white piece, then its destination.</div>
        <div id="webmcp" class="small"></div>
        <div class="small">Local victories: <span id="wins">${rankedWins}</span></div>
      </section>
    </aside>
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
}
function finishMove(move: Move) {
  lastMove = move
  selected = null
  renderPosition()
  updateStatus(describeMove(lastMove))
  if (game.isCheckmate() && lastMove.color === 'w' && mode === 'ranked') {
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
function chooseAiMove() {
  const moves = game.moves({ verbose: true })
  const noise = difficulty === 'apprentice' ? 8 : difficulty === 'duelist' ? 3 : .5
  return moves.sort((a, b) => ((values[b.captured ?? ''] ?? 0) + Math.random() * noise) - ((values[a.captured ?? ''] ?? 0) + Math.random() * noise))[0]
}
async function maybeAiTurn() {
  if (mode !== 'ranked' || game.turn() !== 'b' || game.isGameOver()) return null
  updateStatus(`${difficulty} is thinking…`)
  return new Promise<Move | null>(resolve => window.setTimeout(() => {
    const move = chooseAiMove()
    resolve(move ? playMove(move.from, move.to, move.promotion) : null)
  }, 450))
}
function startGame() { game.reset(); lastMove = null; selected = null; renderPosition(); updateStatus('New ranked game. White to move.'); }

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
canvas.addEventListener('click', event => {
  if (game.turn() !== 'w' || game.isGameOver()) return
  const rect = canvas.getBoundingClientRect()
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects([...pieceGroup.children, ...squareMeshes])[0]
  const square = hit?.object.userData.square as Square | undefined
  if (!square) return
  const piece = game.get(square)
  if (!selected && piece?.color === 'w') selected = square
  else if (selected) {
    if (piece?.color === 'w') selected = square
    else if (playMove(selected, square)) void maybeAiTurn()
    else updateStatus('That move is not legal. Choose again.')
  }
  renderPosition()
})

document.querySelector('#learn')!.addEventListener('click', () => setMode('learn'))
document.querySelector('#ranked')!.addEventListener('click', () => setMode('ranked'))
document.querySelector('#start-lesson')!.addEventListener('click', () => { setMode('learn'); game.load('8/8/8/8/8/8/4P3/4K2k w - - 0 1'); renderPosition(); updateStatus('Lesson: move the pawn from e2 to e3 or e4.') })
document.querySelector('#new-game')!.addEventListener('click', () => { setMode('ranked'); startGame() })
document.querySelector<HTMLSelectElement>('#difficulty')!.addEventListener('change', event => { difficulty = (event.target as HTMLSelectElement).value as Difficulty; updateStatus(`Difficulty set to ${difficulty}.`) })
function setMode(next: Mode) {
  mode = next
  document.querySelector('#learn')!.classList.toggle('active', next === 'learn')
  document.querySelector('#ranked')!.classList.toggle('active', next === 'ranked')
  document.querySelector<HTMLElement>('#lesson')!.hidden = next !== 'learn'
  updateStatus(next === 'learn' ? 'Choose a lesson and practise on the board.' : 'Start a game. You play White.')
}

function gameState() {
  return {
    mode,
    difficulty,
    fen: game.fen(),
    sideToMove: game.turn() === 'w' ? 'white' : 'black',
    gameOver: game.isGameOver(),
    check: game.inCheck(),
    lastMove: lastMove ? { san: lastMove.san, from: lastMove.from, to: lastMove.to } : null,
    legalMoves: game.moves(),
    localVictories: rankedWins,
  }
}

function defineTool<const Schema extends object>(tool: WebMCP.ModelContextToolFromSchema<Schema>) { return tool }

async function registerTools() {
  const context = document.modelContext
  const indicator = document.querySelector<HTMLDivElement>('#webmcp')!
  if (!context) { indicator.textContent = 'WebMCP is not available in this browser. The board still works normally.'; return }
  const emptySchema = { type: 'object', properties: {}, additionalProperties: false } as const
  const controller = new AbortController()
  const registrations: Promise<void>[] = []
  const addTool = <Schema extends object>(tool: WebMCP.ModelContextToolFromSchema<Schema>) => registrations.push(context.registerTool(tool, { signal: controller.signal }))
  addTool(defineTool({ name: 'list_lessons', title: 'List chess lessons', description: 'Lists every guided chess lesson with the lesson ID required by start_lesson.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(lessons) }))
  addTool(defineTool({ name: 'start_lesson', title: 'Start a chess lesson', description: 'Starts the selected guided lesson and visibly loads its position on the shared 3D board.', inputSchema: { type: 'object', properties: { lesson_id: { type: 'string', enum: ['pawn-basics'], description: 'Lesson ID returned by list_lessons.' } }, required: ['lesson_id'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ lesson_id }) => { if (lesson_id !== lessons[0].id) return textResult({ error: 'Unknown lesson.', availableLessons: lessons.map(lesson => lesson.id) }); setMode('learn'); game.load('8/8/8/8/8/8/4P3/4K2k w - - 0 1'); lastMove = null; selected = null; renderPosition(); updateStatus('Lesson: move the pawn from e2 to e3 or e4.'); return textResult({ message: 'Pawn lesson started. Move e2 to e3 or e4.', state: gameState() }) } }))
  addTool(defineTool({ name: 'make_move', title: 'Play a chess move', description: 'Plays one legal move on the visible shared board. Accepts standard algebraic notation such as e4, Nf3, or O-O, and UCI notation such as e2e4 or e7e8q. In ranked mode, waits for the local opponent to reply before returning.', inputSchema: { type: 'object', properties: { move: { type: 'string', minLength: 2, maxLength: 7, description: 'A legal move in SAN or UCI notation.' } }, required: ['move'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ move: notation }) => {
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
  addTool(defineTool({ name: 'start_ranked_game', title: 'Start a ranked game', description: 'Starts or restarts a ranked game against the selected local opponent and visibly resets the shared board. The player is White.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => { setMode('ranked'); startGame(); return textResult({ message: 'Ranked game started. You are White.', state: gameState() }) } }))
  try {
    await Promise.all(registrations)
    indicator.textContent = `WebMCP ready: ${registrations.length} tools registered. You can control the whole game by voice through your agent.`
  } catch (error) {
    controller.abort()
    const message = error instanceof Error ? error.message : String(error)
    indicator.textContent = `WebMCP registration failed: ${message}`
    console.error('WebMCP registration failed', error)
  }
}

function resize() {
  const { clientWidth, clientHeight } = canvas
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}
function animate() { resize(); controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate) }
renderPosition(); void registerTools(); animate()
