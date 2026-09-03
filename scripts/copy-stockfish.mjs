import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/stockfish/bin')
const destination = resolve(root, 'public/stockfish')
await mkdir(destination, { recursive: true })
await Promise.all([
  copyFile(resolve(source, 'stockfish-18-lite-single.js'), resolve(destination, 'stockfish-18-lite-single.js')),
  copyFile(resolve(source, 'stockfish-18-lite-single.wasm'), resolve(destination, 'stockfish-18-lite-single.wasm')),
  copyFile(resolve(root, 'node_modules/stockfish/Copying.txt'), resolve(destination, 'Copying.txt')),
])
