import { writeFileSync, readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { availableParallelism } from 'node:os'
import { runOnSelf, flattenOps, categorize, generateStrands, findCycles } from './classify.ts'
import type { Bucket } from './classify.ts'

const DATA_DIR = join(import.meta.dirname, '../../data')
const PROGRESS_FILE = join(DATA_DIR, 'progress.json')
const WORKER_PATH = join(import.meta.dirname, 'shard-worker.ts')
const TSX_BIN = join(import.meta.dirname, '../../node_modules/.bin/tsx')

// Leave 2 cores free for OS / UI responsiveness
const MAX_CONCURRENT = Math.max(1, availableParallelism() - 2)
// Parallelism only helps above a threshold
const PARALLEL_MIN_LENGTH = 8
// More chunks than workers => granular checkpointing without idle time
const CHUNKS_MULTIPLIER = 4
// Checkpoint every N strands in sequential mode
const SEQ_CHECKPOINT_INTERVAL = 100_000

const INTERESTING_BUCKETS: Bucket[] = [
  'complement',
  'survivorComplementSingle',
  'survivorComplementMulti',
  'pairBond',
]

const BUCKET_FILES: Record<string, string> = {}
for (const b of INTERESTING_BUCKETS) {
  BUCKET_FILES[b] = join(DATA_DIR, `${b}.tsv`)
}

const HYPERCYCLES_FILE = join(DATA_DIR, 'hypercycles.tsv')

// Ensure data/ exists and bucket files have headers
mkdirSync(DATA_DIR, { recursive: true })
for (const b of INTERESTING_BUCKETS) {
  if (!existsSync(BUCKET_FILES[b])) {
    writeFileSync(BUCKET_FILES[b], 'strand\tresults\n')
  }
}
if (!existsSync(HYPERCYCLES_FILE)) {
  writeFileSync(HYPERCYCLES_FILE, 'strand\tcycle_length\tpath\n')
}

interface Progress {
  length: number
  index: number
}

function loadProgress(): Progress {
  if (!existsSync(PROGRESS_FILE)) return { length: 1, index: 0 }
  const raw = readFileSync(PROGRESS_FILE, 'utf-8')
  return JSON.parse(raw) as Progress
}

function saveProgress(p: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p) + '\n')
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function appendResult(bucket: Bucket, strand: string, results: string[]) {
  const file = BUCKET_FILES[bucket]
  if (file) {
    appendFileSync(file, `${strand}\t${results.join(',')}\n`)
  }
}

function appendCycle(strand: string, path: string[]) {
  // cycle_length = number of distinct strands in the cycle (path length minus 1, since last == first)
  const cycleLength = path.length - 1
  appendFileSync(HYPERCYCLES_FILE, `${strand}\t${cycleLength}\t${path.join(',')}\n`)
}

/** Spawn a single shard worker for the given range. Runs at lowered priority via nice. */
function runChunk(
  length: number, startIndex: number, endIndex: number,
  onProgress?: (currentIndex: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'nice', ['-n', '10', TSX_BIN, WORKER_PATH, String(length), String(startIndex), String(endIndex)],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    const rl = createInterface({ input: child.stdout! })
    rl.on('line', (line) => {
      if (line.startsWith('PROGRESS\t')) {
        onProgress?.(parseInt(line.split('\t')[1], 10))
      } else if (line.startsWith('CYCLE\t')) {
        const [, strand, pathStr] = line.split('\t')
        appendCycle(strand, pathStr.split(','))
      } else {
        const [bucket, strand, results] = line.split('\t')
        appendResult(bucket as Bucket, strand, results.split(','))
      }
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Shard ${startIndex}-${endIndex} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

/**
 * Run a length in parallel using a bounded worker pool.
 * Work is split into many small chunks so completed ones can be checkpointed
 * even while other chunks are still running.
 */
function runLengthParallel(length: number, resumeIndex: number): Promise<void> {
  const total = 4 ** length
  if (resumeIndex >= total) return Promise.resolve()

  const numChunks = Math.max(MAX_CONCURRENT, MAX_CONCURRENT * CHUNKS_MULTIPLIER)
  const baseChunkSize = Math.floor(total / numChunks)
  const remainder = total % numChunks

  // Build ordered list of chunk boundaries
  interface ChunkDef { start: number; end: number }
  const allChunks: ChunkDef[] = []
  let cursor = 0
  for (let i = 0; i < numChunks; i++) {
    const size = baseChunkSize + (i < remainder ? 1 : 0)
    if (size === 0) break
    allChunks.push({ start: cursor, end: cursor + size })
    cursor += size
  }

  // Track completed chunk indices for contiguous checkpoint calculation
  const completedSet = new Set<number>()

  // Mark already-completed chunks and build the pending work queue
  const pending: { chunkIdx: number; start: number; end: number }[] = []
  for (let i = 0; i < allChunks.length; i++) {
    const c = allChunks[i]
    if (c.end <= resumeIndex) {
      completedSet.add(i)
      continue
    }
    pending.push({
      chunkIdx: i,
      start: Math.max(c.start, resumeIndex),
      end: c.end,
    })
  }

  if (pending.length === 0) return Promise.resolve()

  // Track each in-progress worker's latest reported index for live progress
  const workerProgress = new Map<number, number>()

  function countProcessed(): number {
    let done = 0
    for (let i = 0; i < allChunks.length; i++) {
      const c = allChunks[i]
      if (completedSet.has(i)) {
        done += c.end - c.start
      } else if (workerProgress.has(i)) {
        done += workerProgress.get(i)! - c.start
      }
    }
    return done
  }

  const lengthStart = Date.now()
  const startProcessed = countProcessed() // account for resumed work

  const progressTimer = setInterval(() => {
    const processed = countProcessed()
    const pct = processed / total * 100
    let eta = ''
    const newWork = processed - startProcessed
    if (newWork > 0) {
      const elapsed = (Date.now() - lengthStart) / 1000
      const remaining = (total - processed) / (newWork / elapsed)
      eta = ` — ETA ${formatEta(remaining)}`
    }
    process.stdout.write(`\r  length ${length}: ${fmt(processed)} / ${fmt(total)} (${pct.toFixed(1)}%)${eta}`)
  }, 10_000)

  return new Promise<void>((resolve, reject) => {
    let qi = 0 // index into pending queue
    let running = 0
    let failed = false

    function checkpoint() {
      // Walk forward from chunk 0; checkpoint = end of last contiguous completed chunk
      let cp = 0
      for (let i = 0; i < allChunks.length; i++) {
        if (completedSet.has(i)) cp = allChunks[i].end
        else break
      }
      saveProgress({ length, index: cp })
    }

    function cleanup() {
      clearInterval(progressTimer)
      // Clear the progress line
      process.stdout.write('\r\x1b[K')
    }

    function drain() {
      if (failed) return
      // Fill up to MAX_CONCURRENT running workers
      while (running < MAX_CONCURRENT && qi < pending.length) {
        const p = pending[qi++]
        running++
        runChunk(length, p.start, p.end, (idx) => {
          workerProgress.set(p.chunkIdx, idx)
        })
          .then(() => {
            completedSet.add(p.chunkIdx)
            workerProgress.delete(p.chunkIdx)
            running--
            checkpoint()
            if (qi >= pending.length && running === 0) {
              cleanup()
              resolve()
            } else {
              drain()
            }
          })
          .catch((err) => {
            if (!failed) {
              failed = true
              cleanup()
              reject(err)
            }
          })
      }
    }

    drain()
  })
}

/** Run a length sequentially with periodic checkpointing and progress reporting */
function runLengthSequential(length: number, startIndex: number) {
  const total = 4 ** length
  const lengthStart = Date.now()
  let lastReport = lengthStart
  let count = 0
  const cycleCache = new Map<string, string[]>()
  for (const strand of generateStrands(length)) {
    if (count < startIndex) {
      count++
      continue
    }
    count++

    const ops = runOnSelf(strand)
    if (ops.length > 0) {
      const buckets = categorize(strand, ops)
      const unique = [...new Set(flattenOps(ops))]
      for (const bucket of buckets) {
        if (INTERESTING_BUCKETS.includes(bucket)) {
          appendResult(bucket, strand, unique)
        }
      }

      const cycles = findCycles(strand, 4, cycleCache)
      for (const cycle of cycles) {
        appendCycle(strand, cycle.path)
      }
    }

    if ((count - startIndex) % SEQ_CHECKPOINT_INTERVAL === 0) {
      saveProgress({ length, index: count })
    }

    const now = Date.now()
    if (now - lastReport >= 10_000) {
      const pct = count / total * 100
      let eta = ''
      const newWork = count - startIndex
      if (newWork > 0) {
        const elapsed = (now - lengthStart) / 1000
        const remaining = (total - count) / (newWork / elapsed)
        eta = ` — ETA ${formatEta(remaining)}`
      }
      process.stdout.write(`\r  length ${length}: ${fmt(count)} / ${fmt(total)} (${pct.toFixed(1)}%)${eta}`)
      lastReport = now
    }
  }
  process.stdout.write('\r\x1b[K')
}

let currentLength = 0

async function run() {
  const progress = loadProgress()
  currentLength = progress.length

  let totalChecked = 0
  for (let l = 1; l < currentLength; l++) totalChecked += 4 ** l
  totalChecked += progress.index

  console.log(`Resuming from length ${currentLength}, index ${fmt(progress.index)} (${fmt(totalChecked)} total)`)
  console.log(`Using up to ${MAX_CONCURRENT} workers (of ${availableParallelism()} cores) for lengths >= ${PARALLEL_MIN_LENGTH}`)

  // If resuming mid-length, continue with appropriate strategy (parallel now works for resume too)
  if (progress.index > 0) {
    const total = 4 ** currentLength
    console.log(`Resuming length ${currentLength}: ${fmt(progress.index)} / ${fmt(total)}...`)
    if (currentLength >= PARALLEL_MIN_LENGTH) {
      await runLengthParallel(currentLength, progress.index)
    } else {
      runLengthSequential(currentLength, progress.index)
    }
    totalChecked += total - progress.index
    currentLength++
    saveProgress({ length: currentLength, index: 0 })
    console.log(`Completed length ${currentLength - 1} — ${fmt(totalChecked)} total`)
  }

  // Main loop: full lengths
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const total = 4 ** currentLength
    const start = Date.now()

    if (currentLength >= PARALLEL_MIN_LENGTH) {
      await runLengthParallel(currentLength, 0)
    } else {
      runLengthSequential(currentLength, 0)
    }

    totalChecked += total
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    currentLength++
    saveProgress({ length: currentLength, index: 0 })
    console.log(`Completed length ${currentLength - 1}: ${fmt(total)} strands in ${elapsed}s — ${fmt(totalChecked)} total`)
  }
}

process.on('SIGINT', () => {
  // Progress is continuously checkpointed as chunks/batches complete.
  // In sequential mode we may lose up to SEQ_CHECKPOINT_INTERVAL strands — acceptable.
  console.log(`\nInterrupted — progress was saved continuously.`)
  process.exit(0)
})

run()
