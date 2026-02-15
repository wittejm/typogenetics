import { runOnSelf, flattenOps, categorize, indexToStrand, findCycles } from './classify.ts'
import type { Bucket } from './classify.ts'

const INTERESTING_BUCKETS: Bucket[] = [
  'complement',
  'survivorComplementSingle',
  'survivorComplementMulti',
  'pairBond',
]

const PROGRESS_INTERVAL = 100_000

const cycleCache = new Map<string, string[]>()

const [length, startIndex, endIndex] = process.argv.slice(2).map(Number)

for (let i = startIndex; i < endIndex; i++) {
  if ((i - startIndex) % PROGRESS_INTERVAL === 0 && i > startIndex) {
    process.stdout.write(`PROGRESS\t${i}\n`)
  }

  const strand = indexToStrand(i, length)

  const ops = runOnSelf(strand)
  if (ops.length > 0) {
    const buckets = categorize(strand, ops)
    const unique = [...new Set(flattenOps(ops))]
    for (const bucket of buckets) {
      if (INTERESTING_BUCKETS.includes(bucket)) {
        process.stdout.write(`${bucket}\t${strand}\t${unique.join(',')}\n`)
      }
    }

    const cycles = findCycles(strand, 4, cycleCache)
    for (const cycle of cycles) {
      process.stdout.write(`CYCLE\t${strand}\t${cycle.path.join(',')}\n`)
    }
  }
}
