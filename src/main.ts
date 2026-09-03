import './style.css'
import { Chess, type Move, type Square } from 'chess.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { StockfishEngine } from './stockfish'
import { VoiceController, type VoiceTool } from './voice'
import { normalizeOpenRouterKey, openRouterKeyStorageKey } from './api-key'
import { isGameActive, type GamePhase } from './game-session'
import { curriculum, isExpectedLessonMove, isLessonUnlocked, lessonById, lessons, nextLesson, pawnLesson, type Lesson } from './lesson'
import { parseProgress, recordGame, recordLesson, trophies, type GameHistory, type ProgressData } from './progress'
import { assessMove, createPostGameReview, inferMentorTier, rememberInsight, type MentorInsight, type PostGameReview } from './mentor'
import { completeOnboarding, onboardingSteps, parseCompletedOnboarding, type OnboardingPath } from './onboarding'
import { GameSounds, moveSoundCue } from './sound'

type Difficulty = 'apprentice' | 'duelist' | 'master'
type Mode = 'learn' | 'ranked'
type PlayerColor = 'white' | 'black'
type CameraView = 'white' | 'black' | 'top' | 'cinematic'
type ToolResult = { content: Array<{ type: 'text'; text: string }> }
type SavedGame = { fen: string; history?: string[]; mode: Mode; difficulty: Difficulty; playerColor: PlayerColor; outcome: string | null; coached?: boolean; lessonId?: string; lessonStep?: number; savedAt: string }

let game = new Chess()
let mode: Mode = 'learn'
let phase: GamePhase = 'entry'
let lessonStep = 0
let lessonRunning = false
let currentLesson: Lesson = pawnLesson
let difficulty: Difficulty = 'apprentice'
let selected: Square | null = null
let lastMove: Move | null = null
let rankedWins = Number(localStorage.getItem('wizard-chess-wins') ?? 0)
let playerColor: PlayerColor = 'white'
let paused = false
let outcome: string | null = null
const savedGamesKey = 'wizard-chess-saved-games'
const progressKey = 'wizard-chess-progress-v1'
const onboardingKey = 'wizard-chess-onboarding-v1'
let progress: ProgressData = parseProgress(localStorage.getItem(progressKey))
let completedOnboarding = parseCompletedOnboarding(localStorage.getItem(onboardingKey))
let activeOnboarding: { path: OnboardingPath; step: number } | null = null
let gameHistoryRecorded = false
let replay: { entry: GameHistory; index: number } | null = null
let mentorEnabled = true
let mentorInsight: MentorInsight | null = null
let currentGameInsights: MentorInsight[] = []
let postGameReview: PostGameReview | null = null
let turnBusy = false
const stockfish = new StockfishEngine()
const sounds = new GameSounds()
const gameTools: WebMCP.ModelContextTool[] = []
let voiceController: VoiceController | null = null

window.addEventListener('pointerdown', () => sounds.unlock(), { capture: true, once: true })

const icons = {
  microphone: `<svg class="game-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>`,
  academy: `<svg class="game-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-.8 5.5.1 8 2.1v11c-2.5-2-5-2.9-8-2.1V5.5ZM20 5.5c-3-.8-5.5.1-8 2.1v11c2.5-2 5-2.9 8-2.1V5.5Z"/><path d="M17.5 2v3M16 3.5h3"/></svg>`,
  mentor: `<svg class="game-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-6 13h12L12 3ZM7 16l-2 4h14l-2-4"/><path d="m12.5 8 .6 1.2 1.4.2-1 1 .3 1.4-1.3-.7-1.3.7.3-1.4-1-1 1.4-.2.6-1.2Z"/></svg>`,
  battle: `<svg class="game-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 6 6-2 2-6-6 2-2ZM19 4l-6 6 2 2 6-6-2-2ZM9 14l-5 5M15 14l5 5M3 21l3-3M21 21l-3-3"/></svg>`,
} as const

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
        <span id="lesson-position" class="eyebrow"></span>
        <h2 id="lesson-title"></h2>
        <p id="lesson-description"></p>
        <button id="start-lesson" class="primary-action">Begin lesson</button>
      </section>

      <section id="ranked-setup" class="context-card play-card" hidden>
        <span id="game-path" class="eyebrow">Mentor game</span>
        <h2 id="opponent-heading">Choose your opponent</h2>
        <label for="difficulty">Strength</label>
        <select id="difficulty"><option value="apprentice">Apprentice</option><option value="duelist">Duelist</option><option value="master">Master</option></select>
        <button id="new-game" class="primary-action">Begin game</button>
      </section>

      <section id="post-game" class="context-card post-game-card" hidden>
        <span class="eyebrow">The mentor's review</span>
        <h2 id="review-title">Battle complete</h2>
        <p id="review-summary"></p>
        <div class="review-notes"><span>Strength</span><strong id="review-strength"></strong><span>Next focus</span><strong id="review-focus"></strong></div>
        <button id="practice-focus" class="primary-action">Practise this skill</button>
        <button id="play-again" class="secondary-action">Play again</button>
      </section>

      <section id="lesson-complete" class="context-card completion-card" hidden>
        <span id="completion-position" class="eyebrow"></span>
        <h2>Lesson complete</h2>
        <p id="completion-message"></p>
        <button id="next-lesson" class="primary-action">Next lesson</button>
        <button id="repeat-lesson" class="secondary-action">Practice again</button>
      </section>

      <section id="replay-controls" class="context-card replay-card" hidden>
        <span class="eyebrow">Game replay</span>
        <h2 id="replay-title"></h2>
        <p id="replay-status"></p>
        <div class="replay-actions">
          <button id="replay-previous" class="secondary-action">Previous</button>
          <button id="replay-next" class="primary-action">Next</button>
        </div>
        <button id="exit-replay" class="replay-exit">Exit replay</button>
      </section>

      <section id="entry-screen" class="entry-screen">
        <div class="entry-card">
          <h2>Choose your path</h2>
          <p class="entry-intro">Learn a skill, play with a mentor, or face Stockfish alone.</p>
          <div class="entry-actions">
            <button id="choose-learn" class="recommended-path"><span class="path-icon">${icons.academy}</span><em>Continue</em><strong>Academy</strong><span id="next-lesson-copy">Learn one idea on the board</span></button>
            <button id="choose-mentor"><span class="path-icon">${icons.mentor}</span><em>Recommended</em><strong>Mentor game</strong><span>Play freely and ask the Wizard when you want advice</span></button>
            <button id="choose-play"><span class="path-icon">${icons.battle}</span><em>Quick</em><strong>Battle</strong><span>Face Stockfish without coaching</span></button>
          </div>
        </div>
      </section>

      <section id="onboarding-screen" class="onboarding-screen" hidden aria-live="polite">
        <div class="onboarding-card">
          <span id="onboarding-position" class="eyebrow"></span>
          <h2 id="onboarding-title"></h2>
          <p id="onboarding-copy"></p>
          <p class="onboarding-voice">Say “next” to continue · “guide me” to hear this again</p>
          <div class="onboarding-actions">
            <button id="onboarding-back" class="secondary-action">Back</button>
            <button id="onboarding-next" class="primary-action">Next</button>
          </div>
        </div>
      </section>

      <div class="voice-dock">
        <button id="voice-toggle" class="voice-button" aria-pressed="false">${icons.microphone}<span data-voice-label>Start voice</span></button>
        <div id="voice-status" class="voice-status">Voice ready</div>
        <div id="voice-transcript" class="voice-transcript" aria-live="polite"></div>
      </div>

      <details class="more-menu">
        <summary aria-label="More options">•••</summary>
        <div class="more-popover">
          <button id="restart-game" hidden>New game</button>
          <button id="open-progress">Progress</button>
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

      <dialog id="progress-dialog" class="progress-dialog" aria-labelledby="progress-title">
        <div class="progress-heading">
          <div><span class="eyebrow">Your journey</span><h2 id="progress-title">Progress</h2></div>
          <button id="close-progress" class="close-settings" type="button" aria-label="Close progress">×</button>
        </div>
        <div class="progress-summary"><strong id="lesson-count"></strong><span>academy</span><strong id="win-count"></strong><span>victories</span></div>
        <section><h3>Academy</h3><div id="academy-list" class="academy-list"></div></section>
        <section><h3>Trophies</h3><div id="trophy-list" class="trophy-list"></div></section>
        <section><h3>History</h3><div id="history-list" class="history-list"></div></section>
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
const moonlight = new THREE.PointLight(0x7189d8, 32, 20)
moonlight.position.set(6, 5, -5)
scene.add(moonlight)

const starGeometry = new THREE.BufferGeometry()
const starPositions = new Float32Array(240)
for (let index = 0; index < starPositions.length; index += 3) {
  starPositions[index] = (Math.random() - .5) * 26
  starPositions[index + 1] = 3 + Math.random() * 10
  starPositions[index + 2] = (Math.random() - .5) * 24
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xc7a86b, size: .045, transparent: true, opacity: .62 })))

const boardGroup = new THREE.Group()
scene.add(boardGroup)
const boardPlinth = new THREE.Mesh(new THREE.BoxGeometry(9.15, .45, 9.15), new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: .7, metalness: .18 }))
boardPlinth.position.y = -.28
boardPlinth.castShadow = true
boardPlinth.receiveShadow = true
boardGroup.add(boardPlinth)
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
const effectsGroup = new THREE.Group()
boardGroup.add(effectsGroup)
const activeEffects: Array<{ object: THREE.Object3D; born: number; duration: number }> = []

function pieceMaterial(color: 'w' | 'b') {
  return new THREE.MeshStandardMaterial({
    color: color === 'w' ? 0xd8d0be : 0x252833,
    emissive: color === 'w' ? 0x261d0c : 0x08122c,
    emissiveIntensity: .24,
    roughness: .48,
    metalness: .34,
  })
}

function piecePart(geometry: THREE.BufferGeometry, material: THREE.Material, y: number, square: string) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = y
  mesh.userData.square = square
  mesh.castShadow = true
  return mesh
}

function createPiece(type: string, color: 'w' | 'b', square: string) {
  const group = new THREE.Group()
  const material = pieceMaterial(color)
  group.userData.square = square
  group.add(piecePart(new THREE.CylinderGeometry(.34, .4, .13, 18), material, .12, square))
  group.add(piecePart(new THREE.CylinderGeometry(.23, .31, .16, 18), material, .25, square))
  group.add(piecePart(new THREE.CylinderGeometry(.14, .23, .48, 16), material, .52, square))
  if (type === 'p') group.add(piecePart(new THREE.SphereGeometry(.22, 16, 12), material, .83, square))
  if (type === 'r') {
    group.add(piecePart(new THREE.CylinderGeometry(.28, .18, .3, 8), material, .82, square))
    for (let index = 0; index < 4; index++) {
      const crown = piecePart(new THREE.BoxGeometry(.13, .2, .13), material, 1.02, square)
      crown.position.x = Math.cos(index * Math.PI / 2) * .2
      crown.position.z = Math.sin(index * Math.PI / 2) * .2
      group.add(crown)
    }
  }
  if (type === 'n') {
    const neck = piecePart(new THREE.ConeGeometry(.25, .65, 7), material, .78, square)
    neck.rotation.z = color === 'w' ? -.24 : .24
    group.add(neck)
    const head = piecePart(new THREE.BoxGeometry(.25, .26, .38), material, 1.02, square)
    head.rotation.y = Math.PI / 4
    group.add(head)
  }
  if (type === 'b') {
    group.add(piecePart(new THREE.ConeGeometry(.24, .5, 16), material, .83, square))
    group.add(piecePart(new THREE.SphereGeometry(.16, 14, 10), material, 1.11, square))
  }
  if (type === 'q') {
    group.add(piecePart(new THREE.CylinderGeometry(.29, .16, .32, 12), material, .82, square))
    group.add(piecePart(new THREE.TorusGeometry(.2, .045, 8, 16), material, 1.02, square))
    for (let index = 0; index < 5; index++) {
      const point = piecePart(new THREE.ConeGeometry(.055, .26, 6), material, 1.13, square)
      point.position.x = Math.cos(index * Math.PI * 2 / 5) * .17
      point.position.z = Math.sin(index * Math.PI * 2 / 5) * .17
      group.add(point)
    }
  }
  if (type === 'k') {
    group.add(piecePart(new THREE.CylinderGeometry(.25, .16, .42, 12), material, .86, square))
    group.add(piecePart(new THREE.BoxGeometry(.1, .42, .1), material, 1.2, square))
    group.add(piecePart(new THREE.BoxGeometry(.3, .1, .1), material, 1.24, square))
  }
  return group
}

function squarePosition(square: string, height = .55) {
  return new THREE.Vector3(square.charCodeAt(0) - 97 - 3.5, height, Number(square[1]) - 1 - 3.5)
}

function castMoveSpell(move: Move) {
  const start = squarePosition(move.from, .7)
  const end = squarePosition(move.to, .7)
  const curve = new THREE.QuadraticBezierCurve3(start, start.clone().lerp(end, .5).add(new THREE.Vector3(0, 1.35, 0)), end)
  const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)), new THREE.LineBasicMaterial({ color: move.captured ? 0xffb06a : 0x9eb7ff, transparent: true, opacity: .9 }))
  effectsGroup.add(trail)
  activeEffects.push({ object: trail, born: performance.now(), duration: 780 })
  const sparks = move.captured ? 18 : 8
  for (let index = 0; index < sparks; index++) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .025, 6, 4), new THREE.MeshBasicMaterial({ color: move.captured ? 0xffc276 : 0xc8d4ff, transparent: true }))
    spark.position.copy(end).add(new THREE.Vector3((Math.random() - .5) * .7, Math.random() * .8, (Math.random() - .5) * .7))
    spark.userData.velocity = new THREE.Vector3((Math.random() - .5) * .012, .006 + Math.random() * .008, (Math.random() - .5) * .012)
    effectsGroup.add(spark)
    activeEffects.push({ object: spark, born: performance.now(), duration: 650 + Math.random() * 300 })
  }
}

function renderPosition() {
  pieceGroup.clear()
  for (const row of game.board()) for (const piece of row) if (piece) {
    const file = piece.square.charCodeAt(0) - 97
    const rank = Number(piece.square[1]) - 1
    const model = createPiece(piece.type, piece.color, piece.square)
    model.position.set(file - 3.5, 0, rank - 3.5)
    pieceGroup.add(model)
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
  status.parentElement?.toggleAttribute('data-alert', phase === 'complete' || (phase !== 'replay' && !lessonRunning && (game.inCheck() || game.isGameOver() || outcome !== null)))
}
function lessonInstruction() {
  const step = currentLesson.steps[lessonStep]
  return `${lessonStep + 1} of ${currentLesson.steps.length} · ${step.instruction}`
}
function loadLessonStep() {
  game.load(currentLesson.steps[lessonStep].fen)
  selected = null
  lastMove = null
  renderPosition()
  updateStatus(lessonInstruction())
}
function historyId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
function persistProgress() {
  localStorage.setItem(progressKey, JSON.stringify(progress))
}
function recordCurrentGame(result: string) {
  if (gameHistoryRecorded || mode !== 'ranked') return
  postGameReview = createPostGameReview(currentGameInsights, result, progress.completedLessonIds)
  progress = recordGame(progress, {
    id: historyId('game'),
    result,
    difficulty,
    playerColor,
    moves: game.history(),
    coached: mentorEnabled,
    review: postGameReview,
    completedAt: new Date().toISOString(),
  })
  gameHistoryRecorded = true
  persistProgress()
  renderPostGameReview(result)
}
function renderLessonSetup(lesson = nextLesson(progress.completedLessonIds)) {
  currentLesson = lesson
  const index = lessons.findIndex(candidate => candidate.id === lesson.id)
  document.querySelector('#lesson-position')!.textContent = `Lesson ${index + 1} of ${lessons.length}`
  document.querySelector('#lesson-title')!.textContent = lesson.title
  document.querySelector('#lesson-description')!.textContent = lesson.description
  document.querySelector('#start-lesson')!.textContent = progress.completedLessonIds.includes(lesson.id) ? 'Practice lesson' : 'Begin lesson'
}
function beginLesson(lesson: Lesson = currentLesson) {
  if (!isLessonUnlocked(lesson.id, progress.completedLessonIds)) return
  setMode('learn')
  currentLesson = lesson
  lessonStep = 0
  lessonRunning = true
  phase = 'active'
  syncProgression()
  document.querySelector('.shell')!.classList.add('lesson-active')
  paused = false
  outcome = null
  loadLessonStep()
  sounds.play('start')
}
function lessonAllowsMove(from: string, to: string, promotion = 'q') {
  return !lessonRunning || isExpectedLessonMove(currentLesson.steps[lessonStep], from, to, promotion)
}
function advanceLesson() {
  if (lessonStep < currentLesson.steps.length - 1) {
    lessonStep += 1
    loadLessonStep()
    return
  }
  const firstCompletion = !progress.completedLessonIds.includes(currentLesson.id)
  progress = recordLesson(progress, currentLesson, historyId('lesson'), new Date().toISOString())
  persistProgress()
  phase = 'complete'
  selected = null
  syncProgression()
  document.querySelector('.shell')!.classList.remove('lesson-active')
  const lessonIndex = lessons.findIndex(lesson => lesson.id === currentLesson.id)
  document.querySelector('#completion-position')!.textContent = `Lesson ${lessonIndex + 1} of ${lessons.length}`
  document.querySelector('#completion-message')!.textContent = firstCompletion ? `Trophy earned: ${currentLesson.trophy}.` : `${currentLesson.title} completed again.`
  const nextButton = document.querySelector<HTMLButtonElement>('#next-lesson')!
  const nextUnlocked = lessons.find(lesson => !progress.completedLessonIds.includes(lesson.id) && isLessonUnlocked(lesson.id, progress.completedLessonIds))
  nextButton.hidden = !nextUnlocked
  updateStatus(`Lesson complete · ${currentLesson.title}`)
  sounds.play('success')
}
function finishMove(move: Move) {
  lastMove = move
  selected = null
  castMoveSpell(move)
  renderPosition()
  updateStatus(describeMove(lastMove))
  sounds.play(moveSoundCue({ captured: Boolean(move.captured), inCheck: game.inCheck(), gameOver: game.isGameOver() }))
  if (game.isCheckmate() && lastMove.color === (playerColor === 'white' ? 'w' : 'b') && mode === 'ranked') {
    rankedWins += 1
    localStorage.setItem('wizard-chess-wins', String(rankedWins))
    document.querySelector('#wins')!.textContent = String(rankedWins)
  }
  return lastMove
}
function playMove(from: string, to: string, promotion = 'q') {
  if (!lessonAllowsMove(from, to, promotion)) return null
  try {
    const move = finishMove(game.move({ from, to, promotion }))
    if (lessonRunning) advanceLesson()
    return move
  }
  catch { return null }
}
function playSanMove(notation: string) {
  try {
    if (lessonRunning) {
      const preview = new Chess(game.fen()).move(notation)
      if (!lessonAllowsMove(preview.from, preview.to, preview.promotion ?? 'q')) return null
    }
    const move = finishMove(game.move(notation))
    if (lessonRunning) advanceLesson()
    return move
  }
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
    const move = playMove(uci.slice(0, 2), uci.slice(2, 4), uci.slice(4) || 'q')
    if (move && game.isGameOver()) recordCurrentGame(game.isCheckmate() ? `${move.color === 'w' ? 'White' : 'Black'} won by checkmate` : 'Draw')
    return move
  } catch (error) {
    console.warn('Stockfish unavailable; using the lightweight fallback.', error)
    const move = chooseFallbackMove()
    const played = move ? playMove(move.from, move.to, move.promotion) : null
    if (played && game.isGameOver()) recordCurrentGame(game.isCheckmate() ? `${played.color === 'w' ? 'White' : 'Black'} won by checkmate` : 'Draw')
    return played
  }
}

function sanFromUci(fen: string, uci: string | null) {
  if (!uci) return null
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || 'q' }).san
  } catch { return uci }
}

function renderMentorInsight(insight: MentorInsight | null) {
  mentorInsight = insight
}

async function completePlayerTurn(move: Move, beforeFen: string) {
  if (mode !== 'ranked') return null
  turnBusy = true
  try {
  let bestMove: string | null = null
  let bestMoveSan: string | null = null
  let lossCp = 55
  if (mentorEnabled) {
    renderMentorInsight(null)
    try {
      const before = await stockfish.analyze(beforeFen)
      const after = await stockfish.analyze(game.fen())
      bestMove = before.bestMove
      bestMoveSan = sanFromUci(beforeFen, bestMove)
      lossCp = Math.max(0, before.scoreCp + after.scoreCp)
      if (`${move.from}${move.to}${move.promotion ?? ''}` === bestMove) lossCp = 0
    } catch (error) {
      console.warn('Mentor analysis unavailable; using local move context.', error)
    }
    const insight = assessMove({ move, bestMove, bestMoveSan, lossCp, tier: inferMentorTier(progress.completedLessonIds.length) })
    currentGameInsights.push(insight)
    progress = { ...progress, mentorMemory: rememberInsight(progress.mentorMemory, insight) }
    persistProgress()
    renderMentorInsight(insight)
  }
  if (game.isGameOver()) {
    recordCurrentGame(game.isCheckmate() ? `${move.color === 'w' ? 'White' : 'Black'} won by checkmate` : 'Draw')
    return null
  }
    return await maybeAiTurn()
  } finally {
    turnBusy = false
  }
}

function renderPostGameReview(result: string) {
  if (!postGameReview) return
  document.querySelector('#review-title')!.textContent = result
  document.querySelector('#review-summary')!.textContent = postGameReview.summary
  document.querySelector('#review-strength')!.textContent = postGameReview.strength
  document.querySelector('#review-focus')!.textContent = postGameReview.focus
  document.querySelector<HTMLElement>('#post-game')!.hidden = false
  syncProgression()
}

async function startGame(color: PlayerColor = playerColor) {
  playerColor = color
  lessonRunning = false
  gameHistoryRecorded = false
  replay = null
  paused = false
  outcome = null
  postGameReview = null
  mentorInsight = null
  currentGameInsights = []
  turnBusy = false
  game.reset()
  lastMove = null
  selected = null
  phase = 'active'
  syncProgression()
  document.querySelector('.shell')!.classList.add('playing')
  setCameraView(playerColor)
  renderPosition()
  updateStatus(`New ranked game. You play ${playerColor}.`)
  sounds.play('start')
  renderMentorInsight(null)
  return await maybeAiTurn()
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
canvas.addEventListener('click', event => {
  if (!isGameActive(phase)) return
  const humanTurn = mode === 'learn' ? game.turn() : playerColor === 'white' ? 'w' : 'b'
  if (game.turn() !== humanTurn || (!lessonRunning && game.isGameOver()) || paused || outcome || turnBusy) return
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
    else {
      const beforeFen = game.fen()
      const move = playMove(selected, square)
      if (move) void completePlayerTurn(move, beforeFen)
      else updateStatus(lessonRunning ? `Try this: ${currentLesson.steps[lessonStep].instruction}` : 'That move is not legal. Choose again.')
    }
  }
  renderPosition()
})

function onboardingGuidance() {
  if (!activeOnboarding) return 'No introduction is open.'
  const step = onboardingSteps[activeOnboarding.path][activeOnboarding.step]
  return `${step.title}. ${step.body}`
}

function renderOnboarding() {
  if (!activeOnboarding) return
  const steps = onboardingSteps[activeOnboarding.path]
  const step = steps[activeOnboarding.step]
  document.querySelector('#onboarding-position')!.textContent = step.eyebrow
  document.querySelector('#onboarding-title')!.textContent = step.title
  document.querySelector('#onboarding-copy')!.textContent = step.body
  document.querySelector<HTMLButtonElement>('#onboarding-back')!.textContent = activeOnboarding.step ? 'Back' : 'Choose another path'
  document.querySelector<HTMLButtonElement>('#onboarding-next')!.textContent = activeOnboarding.step === steps.length - 1 ? 'Continue' : 'Next'
  void voiceController?.narrate(onboardingGuidance())
}

function showOnboarding(path: OnboardingPath) {
  activeOnboarding = { path, step: 0 }
  phase = 'onboarding'
  document.querySelector<HTMLElement>('#entry-screen')!.hidden = true
  document.querySelector<HTMLElement>('#lesson')!.hidden = true
  document.querySelector<HTMLElement>('#ranked-setup')!.hidden = true
  document.querySelector<HTMLElement>('#onboarding-screen')!.hidden = false
  syncProgression()
  renderOnboarding()
}

function routeToPath(path: OnboardingPath) {
  if (path === 'academy') setMode('learn')
  else prepareRankedGame(path === 'mentor')
}

function choosePath(path: OnboardingPath) {
  if (completedOnboarding.includes(path)) routeToPath(path)
  else showOnboarding(path)
}

function advanceOnboarding() {
  if (!activeOnboarding) return 'No introduction is open.'
  const steps = onboardingSteps[activeOnboarding.path]
  if (activeOnboarding.step < steps.length - 1) {
    activeOnboarding.step += 1
    renderOnboarding()
    return onboardingGuidance()
  }
  const path = activeOnboarding.path
  completedOnboarding = completeOnboarding(completedOnboarding, path)
  localStorage.setItem(onboardingKey, JSON.stringify(completedOnboarding))
  activeOnboarding = null
  routeToPath(path)
  return `${path === 'academy' ? 'Academy' : path === 'mentor' ? 'Mentor game' : 'Battle'} setup is ready.`
}

function leaveOnboarding() {
  if (!activeOnboarding) return
  if (activeOnboarding.step > 0) {
    activeOnboarding.step -= 1
    renderOnboarding()
    return
  }
  activeOnboarding = null
  phase = 'entry'
  document.querySelector<HTMLElement>('#onboarding-screen')!.hidden = true
  document.querySelector<HTMLElement>('#entry-screen')!.hidden = false
  syncProgression()
}

document.querySelector('#learn')!.addEventListener('click', () => choosePath('academy'))
document.querySelector('#ranked')!.addEventListener('click', () => choosePath('battle'))
document.querySelector('#choose-learn')!.addEventListener('click', () => choosePath('academy'))
document.querySelector('#choose-mentor')!.addEventListener('click', () => choosePath('mentor'))
document.querySelector('#choose-play')!.addEventListener('click', () => choosePath('battle'))
document.querySelector('#onboarding-back')!.addEventListener('click', leaveOnboarding)
document.querySelector('#onboarding-next')!.addEventListener('click', advanceOnboarding)
document.querySelector('#start-lesson')!.addEventListener('click', () => beginLesson())
document.querySelector('#repeat-lesson')!.addEventListener('click', () => beginLesson(currentLesson))
document.querySelector('#next-lesson')!.addEventListener('click', () => {
  const lesson = lessons.find(candidate => !progress.completedLessonIds.includes(candidate.id) && isLessonUnlocked(candidate.id, progress.completedLessonIds))
  if (lesson) beginLesson(lesson)
})
document.querySelector('#new-game')!.addEventListener('click', () => { setMode('ranked'); void startGame() })
document.querySelector('#restart-game')!.addEventListener('click', () => { setMode('ranked'); void startGame() })
document.querySelector<HTMLSelectElement>('#difficulty')!.addEventListener('change', event => { difficulty = (event.target as HTMLSelectElement).value as Difficulty; updateStatus(`Difficulty set to ${difficulty}.`) })

const settingsDialog = document.querySelector<HTMLDialogElement>('#settings-dialog')!
const settingsForm = document.querySelector<HTMLFormElement>('#settings-form')!
const keyInput = document.querySelector<HTMLInputElement>('#openrouter-key')!
const keyState = document.querySelector<HTMLElement>('#key-state')!
const settingsStatus = document.querySelector<HTMLElement>('#settings-status')!
const removeKeyButton = document.querySelector<HTMLButtonElement>('#remove-key')!
const progressDialog = document.querySelector<HTMLDialogElement>('#progress-dialog')!

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

function actionButton(label: string, action: () => void, disabled = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  if (!disabled) button.addEventListener('click', action)
  return button
}
function renderProgress() {
  document.querySelector('#lesson-count')!.textContent = `${progress.completedLessonIds.length}/${lessons.length}`
  document.querySelector('#win-count')!.textContent = String(rankedWins)
  const academyList = document.querySelector<HTMLElement>('#academy-list')!
  academyList.replaceChildren()
  for (const level of curriculum) {
    const levelElement = document.createElement('div')
    levelElement.className = 'academy-level'
    const heading = document.createElement('div')
    heading.className = 'level-heading'
    const title = document.createElement('strong')
    title.textContent = level.title
    const description = document.createElement('span')
    description.textContent = level.description
    heading.append(title, description)
    levelElement.append(heading)
    for (const lesson of level.lessons) {
      const completed = progress.completedLessonIds.includes(lesson.id)
      const unlocked = isLessonUnlocked(lesson.id, progress.completedLessonIds)
      const row = document.createElement('div')
      row.className = 'lesson-row'
      row.dataset.locked = String(!unlocked)
      const copy = document.createElement('div')
      const lessonTitle = document.createElement('strong')
      lessonTitle.textContent = lesson.title
      const lessonMeta = document.createElement('span')
      lessonMeta.textContent = completed ? `Trophy: ${lesson.trophy}` : lesson.description
      copy.append(lessonTitle, lessonMeta)
      const button = actionButton(unlocked ? (completed ? 'Replay' : 'Start') : 'Locked', () => {
        progressDialog.close()
        beginLesson(lesson)
      }, !unlocked)
      row.append(copy, button)
      levelElement.append(row)
    }
    academyList.append(levelElement)
  }

  const trophyList = document.querySelector<HTMLElement>('#trophy-list')!
  trophyList.replaceChildren(...trophies(progress, rankedWins).map(trophy => {
    const item = document.createElement('div')
    item.className = 'trophy'
    item.dataset.earned = String(trophy.earned)
    const mark = document.createElement('span')
    mark.textContent = trophy.earned ? '◆' : '◇'
    const copy = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = trophy.title
    const description = document.createElement('span')
    description.textContent = trophy.description
    copy.append(title, description)
    item.append(mark, copy)
    return item
  }))

  const historyList = document.querySelector<HTMLElement>('#history-list')!
  historyList.replaceChildren()
  if (!progress.history.length) {
    const empty = document.createElement('p')
    empty.className = 'empty-history'
    empty.textContent = 'Completed lessons and games will appear here.'
    historyList.append(empty)
  } else for (const entry of progress.history) {
    const row = document.createElement('div')
    row.className = 'history-row'
    const copy = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = entry.type === 'lesson' ? entry.title : entry.result
    const meta = document.createElement('span')
    meta.textContent = `${entry.type === 'lesson' ? 'Lesson' : `${entry.difficulty} · ${entry.moves.length} moves${entry.review ? ` · Focus: ${entry.review.focus}` : ''}`} · ${new Date(entry.completedAt).toLocaleDateString()}`
    copy.append(title, meta)
    row.append(copy, actionButton('Replay', () => {
      progressDialog.close()
      if (entry.type === 'lesson') {
        const lesson = lessonById(entry.lessonId)
        if (lesson) beginLesson(lesson)
      } else startReplay(entry)
    }))
    historyList.append(row)
  }
}

function renderReplay() {
  if (!replay) return
  game.reset()
  for (const move of replay.entry.moves.slice(0, replay.index)) game.move(move)
  restoreLastMove()
  renderPosition()
  document.querySelector('#replay-title')!.textContent = replay.entry.result
  document.querySelector('#replay-status')!.textContent = replay.index === 0 ? `Start position · ${replay.entry.moves.length} moves` : `${replay.index} of ${replay.entry.moves.length} · ${replay.entry.moves[replay.index - 1]}`
  document.querySelector<HTMLButtonElement>('#replay-previous')!.disabled = replay.index === 0
  document.querySelector<HTMLButtonElement>('#replay-next')!.disabled = replay.index === replay.entry.moves.length
  updateStatus(`Replay · ${replay.index} of ${replay.entry.moves.length}`)
}
function startReplay(entry: GameHistory) {
  replay = { entry, index: 0 }
  postGameReview = entry.review ?? null
  mode = 'ranked'
  phase = 'replay'
  lessonRunning = false
  paused = false
  outcome = null
  document.querySelector<HTMLElement>('#entry-screen')!.hidden = true
  document.querySelector<HTMLElement>('#lesson')!.hidden = true
  document.querySelector<HTMLElement>('#ranked-setup')!.hidden = true
  document.querySelector('#learn')!.classList.remove('active')
  document.querySelector('#ranked')!.classList.add('active')
  syncProgression()
  renderReplay()
}
function stepReplay(change: number) {
  if (!replay) return
  replay.index = Math.min(Math.max(replay.index + change, 0), replay.entry.moves.length)
  renderReplay()
}

document.querySelector('#open-progress')!.addEventListener('click', () => {
  document.querySelector('.more-menu')!.removeAttribute('open')
  renderProgress()
  progressDialog.showModal()
})
document.querySelector('#close-progress')!.addEventListener('click', () => progressDialog.close())
document.querySelector('#replay-previous')!.addEventListener('click', () => stepReplay(-1))
document.querySelector('#replay-next')!.addEventListener('click', () => stepReplay(1))
document.querySelector('#exit-replay')!.addEventListener('click', () => { replay = null; setMode('ranked') })
document.querySelector('#practice-focus')!.addEventListener('click', () => {
  const lesson = postGameReview ? lessonById(postGameReview.recommendedLessonId) : undefined
  if (lesson && isLessonUnlocked(lesson.id, progress.completedLessonIds)) beginLesson(lesson)
  else setMode('learn')
})
document.querySelector('#play-again')!.addEventListener('click', () => void startGame())

function syncProgression() {
  const active = isGameActive(phase)
  const gameFinished = mode === 'ranked' && (game.isGameOver() || outcome !== null)
  const shell = document.querySelector<HTMLElement>('.shell')!
  shell.classList.toggle('awaiting-choice', phase === 'entry')
  shell.classList.toggle('setting-up', phase === 'setup' || phase === 'onboarding')
  shell.classList.toggle('onboarding', phase === 'onboarding')
  shell.classList.toggle('lesson-finished', phase === 'complete')
  shell.classList.toggle('replaying', phase === 'replay')
  canvas.setAttribute('aria-disabled', String(!active || gameFinished))
  controls.enabled = active && !gameFinished
  document.querySelector<HTMLButtonElement>('#restart-game')!.hidden = !active || mode !== 'ranked'
  document.querySelector<HTMLElement>('#lesson-complete')!.hidden = phase !== 'complete'
  document.querySelector<HTMLElement>('#replay-controls')!.hidden = phase !== 'replay'
  document.querySelector<HTMLElement>('#post-game')!.hidden = !active || !gameFinished || !postGameReview
}

function setMode(next: Mode) {
  mode = next
  lessonRunning = false
  replay = null
  phase = 'setup'
  activeOnboarding = null
  syncProgression()
  document.querySelector('.shell')!.classList.remove('playing', 'lesson-active')
  document.querySelector<HTMLElement>('#entry-screen')!.hidden = true
  document.querySelector<HTMLElement>('#onboarding-screen')!.hidden = true
  document.querySelector('#learn')!.classList.toggle('active', next === 'learn')
  document.querySelector('#ranked')!.classList.toggle('active', next === 'ranked')
  document.querySelector<HTMLElement>('#lesson')!.hidden = next !== 'learn'
  document.querySelector<HTMLElement>('#ranked-setup')!.hidden = next !== 'ranked'
  if (next === 'learn') renderLessonSetup()
  if (next === 'ranked') {
    document.querySelector('#game-path')!.textContent = mentorEnabled ? 'Mentor game' : 'Quick battle'
    document.querySelector('#opponent-heading')!.textContent = mentorEnabled ? 'Choose your training opponent' : 'Choose your opponent'
  }
  updateStatus(next === 'learn' ? 'Choose a lesson' : 'Choose an opponent')
}

function prepareRankedGame(coached: boolean) {
  mentorEnabled = coached
  setMode('ranked')
}

function gameState() {
  return {
    mode: phase === 'entry' || phase === 'onboarding' ? null : mode,
    phase,
    difficulty,
    playerColor,
    paused,
    thinking: turnBusy,
    outcome,
    fen: game.fen(),
    sideToMove: game.turn() === 'w' ? 'white' : 'black',
    gameOver: phase === 'complete' || (phase !== 'replay' && !lessonRunning && (game.isGameOver() || outcome !== null)),
    check: game.inCheck(),
    lastMove: lastMove ? { san: lastMove.san, from: lastMove.from, to: lastMove.to } : null,
    lesson: lessonRunning && phase !== 'entry' && phase !== 'setup' ? {
      lessonId: currentLesson.id,
      step: lessonStep + 1,
      totalSteps: currentLesson.steps.length,
      title: currentLesson.steps[lessonStep].title,
      instruction: phase === 'complete' ? 'Lesson complete.' : currentLesson.steps[lessonStep].instruction,
    } : null,
    replay: replay ? { historyId: replay.entry.id, move: replay.index, totalMoves: replay.entry.moves.length } : null,
    onboarding: activeOnboarding ? { path: activeOnboarding.path, step: activeOnboarding.step + 1, totalSteps: onboardingSteps[activeOnboarding.path].length, guidance: onboardingGuidance() } : null,
    mentor: mode === 'ranked' ? { enabled: mentorEnabled, tier: inferMentorTier(progress.completedLessonIds.length), insight: mentorInsight, review: postGameReview } : null,
    legalMoves: phase !== 'active' ? [] : lessonRunning ? currentLesson.steps[lessonStep].moves : game.moves(),
    localVictories: rankedWins,
  }
}

function progressSnapshot() {
  return {
    completedLessons: progress.completedLessonIds.length,
    totalLessons: lessons.length,
    rankedWins,
    levels: curriculum.map(level => ({
      id: level.id,
      title: level.title,
      lessons: level.lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        unlocked: isLessonUnlocked(lesson.id, progress.completedLessonIds),
        completed: progress.completedLessonIds.includes(lesson.id),
      })),
    })),
    trophies: trophies(progress, rankedWins),
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
    white: [0, 9, -10],
    black: [0, 9, 10],
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
  addTool(defineTool({ name: 'advance_onboarding', title: 'Continue the introduction', description: 'Moves the visible one-time onboarding to its next screen when the player says next, continue, or move to the next step.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => activeOnboarding ? textResult({ message: advanceOnboarding(), state: gameState() }) : textResult({ error: 'No introduction is open.', state: gameState() }) }))
  addTool(defineTool({ name: 'get_onboarding_guidance', title: 'Repeat onboarding guidance', description: 'Repeats and narrates the current onboarding screen when the player says guide me, help me, or repeat that.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult({ message: onboardingGuidance(), state: gameState() }) }))
  addTool(defineTool({ name: 'list_lessons', title: 'List chess lessons', description: 'Lists the academy levels, lessons, unlock state, and completion state.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(curriculum.map(level => ({ ...level, lessons: level.lessons.map(lesson => ({ id: lesson.id, title: lesson.title, description: lesson.description, trophy: lesson.trophy, unlocked: isLessonUnlocked(lesson.id, progress.completedLessonIds), completed: progress.completedLessonIds.includes(lesson.id) })) }))) }))
  addTool(defineTool({ name: 'start_lesson', title: 'Start a chess lesson', description: 'Starts any unlocked academy lesson and loads its first exercise on the shared 3D board. Opens the one-time Academy introduction first when needed.', inputSchema: { type: 'object', properties: { lesson_id: { type: 'string', enum: ['pawn-basics', 'knight-jumps', 'bishop-lines', 'knight-fork', 'castle-safely', 'mate-in-one'], description: 'Lesson ID returned by list_lessons.' } }, required: ['lesson_id'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ lesson_id }) => { const lesson = lessonById(lesson_id); if (!lesson) return textResult({ error: 'Unknown lesson.', availableLessons: lessons.map(candidate => candidate.id) }); if (!isLessonUnlocked(lesson.id, progress.completedLessonIds)) return textResult({ error: 'Complete the previous lesson to unlock this one.', state: gameState() }); if (!completedOnboarding.includes('academy')) { showOnboarding('academy'); return textResult({ message: onboardingGuidance(), state: gameState() }) } beginLesson(lesson); return textResult({ message: lesson.steps[0].instruction, state: gameState() }) } }))
  addTool(defineTool({ name: 'make_move', title: 'Play a chess move', description: 'Plays one legal move on the visible shared board. Accepts standard algebraic notation such as e4, Nf3, or O-O, and UCI notation such as e2e4 or e7e8q. In ranked mode, waits for the local opponent to reply before returning.', inputSchema: { type: 'object', properties: { move: { type: 'string', minLength: 2, maxLength: 7, description: 'A legal move in SAN or UCI notation.' } }, required: ['move'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ move: notation }) => {
      if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game before making a move.', state: gameState() })
      if (paused) return textResult({ error: 'The game is paused. Resume it before moving.', state: gameState() })
      if (turnBusy) return textResult({ error: 'The mentor or opponent is still thinking. Wait for the turn to finish.', state: gameState() })
      if (outcome) return textResult({ error: `The game has ended: ${outcome}. Start or load a game before moving.`, state: gameState() })
      const playableColor = mode === 'learn' ? game.turn() : playerColor === 'white' ? 'w' : 'b'
      if (game.turn() !== playableColor) return textResult({ error: `It is ${game.turn() === 'w' ? 'White' : 'Black'} to move; the player controls ${mode === 'learn' ? 'White in this lesson' : playerColor}.`, state: gameState() })
      const normalized = notation.trim()
      const uci = normalized.toLowerCase().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/)
      const beforeFen = game.fen()
      const move = uci ? playMove(uci[1], uci[2], uci[3] ?? 'q') : playSanMove(normalized)
      if (!move) return textResult({ error: lessonRunning ? `Try this: ${currentLesson.steps[lessonStep].instruction}` : `"${notation}" is not legal in the current position.`, state: gameState() })
      const opponentMove = await completePlayerTurn(move, beforeFen)
      return textResult({ played: move.san, opponentReply: opponentMove?.san ?? null, mentor: mentorEnabled ? mentorInsight : null, state: gameState() })
    } }))
  addTool(defineTool({ name: 'get_game_state', title: 'Inspect the chess game', description: 'Returns the complete current game state needed to coach or play: mode, difficulty, position, side to move, checks, last move, legal moves, and local victories.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(gameState()) }))
  addTool(defineTool({ name: 'explain_last_move', title: 'Explain the last move', description: 'Explains the most recent move on the shared board in plain language.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(describeMove(lastMove)) }))
  addTool(defineTool({ name: 'get_mentor_guidance', title: 'Ask the chess mentor', description: 'Returns the current Stockfish-grounded move grade, explanation, next plan, skill tier, and remembered learning themes.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult({ enabled: mentorEnabled, tier: inferMentorTier(progress.completedLessonIds.length), insight: mentorInsight, memory: progress.mentorMemory }) }))
  addTool(defineTool({ name: 'set_mentor_enabled', title: 'Turn chess mentor on or off', description: 'Enables or disables quiet move analysis for the current or next computer game.', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean', description: 'True for on-demand guidance and a post-game review; false for a quick battle.' } }, required: ['enabled'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ enabled }) => {
    mentorEnabled = enabled
    syncProgression()
    updateStatus(enabled ? 'The mentor has joined the board.' : 'Mentor hidden. Pure battle mode.')
    return textResult({ message: enabled ? 'Mentor enabled.' : 'Mentor disabled.', state: gameState() })
  } }))
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
    recordCurrentGame(`${playerColor === 'white' ? 'Black' : 'White'} won by resignation`)
    sounds.play('complete')
    return textResult({ message: `You resigned as ${playerColor}.`, state: gameState() })
  } }))
  addTool(defineTool({ name: 'offer_draw', title: 'Offer a draw', description: 'Offers a draw to the local opponent. In this prototype the opponent accepts, ending the ranked game as a draw.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a ranked game first.', state: gameState() })
    if (mode !== 'ranked') return textResult({ error: 'Draw offers are available in ranked mode.', state: gameState() })
    if (outcome || game.isGameOver()) return textResult({ error: 'The game has already ended.', state: gameState() })
    outcome = 'draw by agreement'
    selected = null
    updateStatus('Game over: draw by agreement.')
    recordCurrentGame('Draw by agreement')
    sounds.play('complete')
    return textResult({ message: 'Draw offered and accepted by the local opponent.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'save_game', title: 'Save the current game', description: 'Saves the current position and game settings under a spoken name in this browser.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 40, description: 'Short name for the saved game.' } }, required: ['name'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ name }) => {
    if (!isGameActive(phase)) return textResult({ error: 'Start a lesson or game first.', state: gameState() })
    const normalizedName = name.trim()
    if (!normalizedName || normalizedName.length > 40) return textResult({ error: 'Save name must contain 1 to 40 characters.' })
    const savedGames = readSavedGames()
    savedGames[normalizedName] = { fen: game.fen(), history: game.history(), mode, difficulty, playerColor, outcome, coached: mode === 'ranked' ? mentorEnabled : undefined, lessonId: lessonRunning ? currentLesson.id : undefined, lessonStep: lessonRunning ? lessonStep : undefined, savedAt: new Date().toISOString() }
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
    mentorEnabled = saved.coached ?? false
    outcome = saved.outcome
    paused = false
    selected = null
    restoreLastMove()
    document.querySelector<HTMLSelectElement>('#difficulty')!.value = difficulty
    setMode(mode)
    const savedLesson = saved.lessonId ? lessonById(saved.lessonId) : undefined
    lessonRunning = mode === 'learn' && Boolean(savedLesson) && Number.isInteger(saved.lessonStep)
    currentLesson = savedLesson ?? pawnLesson
    lessonStep = lessonRunning ? Math.min(Math.max(saved.lessonStep ?? 0, 0), currentLesson.steps.length - 1) : 0
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
    lessonRunning = false
    phase = 'active'
    syncProgression()
    document.querySelector('.shell')!.classList.add('lesson-active')
    renderPosition()
    updateStatus('Custom position loaded for analysis.')
    return textResult({ message: 'Custom position loaded.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'get_progress', title: 'View academy progress and trophies', description: 'Returns every level and lesson with unlock and completion status, plus earned trophies and ranked victories.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(progressSnapshot()) }))
  addTool(defineTool({ name: 'get_post_game_review', title: 'Review the completed game', description: 'Returns the mentor recap, strongest theme, next focus, and recommended lesson for the latest completed game.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(postGameReview ?? { error: 'Complete a game before requesting its review.' }) }))
  addTool(defineTool({ name: 'start_recommended_lesson', title: 'Practise the mentor recommendation', description: 'Starts the unlocked academy lesson recommended by the latest post-game review.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    const lesson = postGameReview ? lessonById(postGameReview.recommendedLessonId) : undefined
    if (!lesson) return textResult({ error: 'Complete a game to receive a lesson recommendation.' })
    if (!isLessonUnlocked(lesson.id, progress.completedLessonIds)) {
      setMode('learn')
      return textResult({ message: 'The recommended skill is later in the academy. Continue with your next unlocked lesson.', state: gameState() })
    }
    beginLesson(lesson)
    return textResult({ message: `${lesson.title} started from your game review.`, state: gameState() })
  } }))
  addTool(defineTool({ name: 'list_history', title: 'List lesson and game history', description: 'Lists completed lessons and ranked games. Game entries include their moves and history ID for replay.', inputSchema: emptySchema, annotations: { readOnlyHint: true }, execute: async () => textResult(progress.history) }))
  addTool(defineTool({ name: 'start_replay', title: 'Replay a lesson or game', description: 'Restarts a completed lesson or opens a completed ranked game at its starting position.', inputSchema: { type: 'object', properties: { history_id: { type: 'string', minLength: 1, description: 'History ID returned by list_history.' } }, required: ['history_id'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ history_id }) => {
    const entry = progress.history.find(candidate => candidate.id === history_id)
    if (!entry) return textResult({ error: 'History entry not found.', availableHistoryIds: progress.history.map(candidate => candidate.id) })
    if (entry.type === 'lesson') {
      const lesson = lessonById(entry.lessonId)
      if (!lesson) return textResult({ error: 'That lesson no longer exists.' })
      beginLesson(lesson)
      return textResult({ message: `${lesson.title} restarted.`, state: gameState() })
    }
    startReplay(entry)
    return textResult({ message: 'Game replay opened at the starting position.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'step_replay', title: 'Step through a game replay', description: 'Moves one step forward or backward through the open game replay.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['next', 'previous'], description: 'Replay direction.' } }, required: ['direction'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ direction }) => {
    if (!replay || phase !== 'replay') return textResult({ error: 'Open a game replay first.' })
    stepReplay(direction === 'next' ? 1 : -1)
    return textResult({ message: `Replay moved ${direction}.`, state: gameState() })
  } }))
  addTool(defineTool({ name: 'exit_replay', title: 'Exit game replay', description: 'Closes the current replay and returns to ranked-game setup.', inputSchema: emptySchema, annotations: { readOnlyHint: false }, execute: async () => {
    if (!replay || phase !== 'replay') return textResult({ error: 'No replay is open.' })
    replay = null
    setMode('ranked')
    return textResult({ message: 'Replay closed.', state: gameState() })
  } }))
  addTool(defineTool({ name: 'set_camera_view', title: 'Change the board camera', description: 'Changes the visible 3D board camera to the White side, Black side, top-down, or cinematic view.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['white', 'black', 'top', 'cinematic'], description: 'Desired board viewpoint.' } }, required: ['view'], additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ view }) => {
    if (view !== 'white' && view !== 'black' && view !== 'top' && view !== 'cinematic') return textResult({ error: 'Camera view must be white, black, top, or cinematic.' })
    setCameraView(view)
    return textResult({ message: `Camera changed to ${view} view.` })
  } }))
  addTool(defineTool({ name: 'start_ranked_game', title: 'Start a computer game', description: 'Starts or restarts a computer game with optional quiet mentor analysis. The player may choose White or Black and an opponent difficulty. Opens the chosen path introduction once when needed.', inputSchema: { type: 'object', properties: { color: { type: 'string', enum: ['white', 'black'], description: 'Color the player wants to control.' }, level: { type: 'string', enum: ['apprentice', 'duelist', 'master'], description: 'Optional opponent strength.' }, coached: { type: 'boolean', description: 'True for on-demand guidance and a post-game review; false for an uninterrupted battle.' } }, additionalProperties: false } as const, annotations: { readOnlyHint: false }, execute: async ({ color, level, coached }) => {
    const chosenColor = color ?? playerColor
    if (chosenColor !== 'white' && chosenColor !== 'black') return textResult({ error: 'Color must be white or black.', state: gameState() })
    if (level && level !== 'apprentice' && level !== 'duelist' && level !== 'master') return textResult({ error: 'Difficulty must be apprentice, duelist, or master.', state: gameState() })
    if (level) difficulty = level
    if (typeof coached === 'boolean') mentorEnabled = coached
    const path: OnboardingPath = mentorEnabled ? 'mentor' : 'battle'
    if (!completedOnboarding.includes(path)) {
      showOnboarding(path)
      return textResult({ message: onboardingGuidance(), state: gameState() })
    }
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
  voiceController = new VoiceController({
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
function animate(now = performance.now()) {
  resize()
  controls.update()
  for (let index = activeEffects.length - 1; index >= 0; index--) {
    const effect = activeEffects[index]
    const progress = (now - effect.born) / effect.duration
    const material = (effect.object as THREE.Mesh).material as THREE.Material & { opacity?: number }
    if (typeof material?.opacity === 'number') material.opacity = Math.max(0, 1 - progress)
    const velocity = effect.object.userData.velocity as THREE.Vector3 | undefined
    if (velocity) effect.object.position.add(velocity)
    if (progress >= 1) {
      effectsGroup.remove(effect.object)
      const disposable = effect.object as THREE.Mesh
      disposable.geometry?.dispose()
      if (Array.isArray(disposable.material)) disposable.material.forEach(item => item.dispose())
      else disposable.material?.dispose()
      activeEffects.splice(index, 1)
    }
  }
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
async function initialize() {
  const recommendedLesson = nextLesson(progress.completedLessonIds)
  document.querySelector('#next-lesson-copy')!.textContent = `${progress.completedLessonIds.includes(recommendedLesson.id) ? 'Replay' : 'Next'}: ${recommendedLesson.title}`
  renderPosition()
  await registerTools()
  setupVoice()
  animate()
}
void initialize()
