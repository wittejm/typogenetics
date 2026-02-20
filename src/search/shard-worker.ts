import { runOnSelf, flattenOps, categorize, indexToStrand, findCycles, categorizeCycles } from './classify.ts'
import type { Bucket } from './classify.ts'

const INTERESTING_BUCKETS: Bucket[] = [
  'complement',
  'survivorComplementSingle',
  'survivorComplementMulti',
  'pairBond',
  'hypercycle2',
  'hypercycle2NonTrivial',
  'hypercycle3',
  'hypercycle4',
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

    cycleCache.set(strand, unique)
    const cycles = findCycles(strand, 4, cycleCache)
    const cycleBuckets = categorizeCycles(strand, cycles)
    for (const bucket of cycleBuckets) {
      if (INTERESTING_BUCKETS.includes(bucket)) {
        const cycle = cycles.find(c => {
          const len = c.path.length - 1
          if (bucket === 'hypercycle2' || bucket === 'hypercycle2NonTrivial') return len === 2
          if (bucket === 'hypercycle3') return len === 3
          if (bucket === 'hypercycle4') return len === 4
          return false
        })
        const results = cycle ? cycle.path.slice(1) : unique
        process.stdout.write(`${bucket}\t${strand}\t${results.join(',')}\n`)
      }
    }
  }
}
