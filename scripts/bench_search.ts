/**
 * Benchmark: current search (runOnSelf per strand) vs batched executor.
 *
 * Run with: npx tsx scripts/bench_search.ts
 */

import { translate } from '../src/model/ribosome'
import { runOnSelf, flattenOps, generateStrands } from '../src/search/classify'
import type { Enzyme } from '../src/model/types'
import { executeBatch } from '../src/rnn_deterministic/execute'

// ---------- chunked batched version ----------

const CHUNK_SIZE = 2048

function batchRunOnSelf(strands: string[]): string[][][] {
  // Phase 1: enumerate all (enzyme, strand, bindPos) triples
  const enzymes: Enzyme[] = []
  const targets: string[] = []
  const bindPositions: number[] = []
  const strandIdx: number[] = []

  for (let si = 0; si < strands.length; si++) {
    const strand = strands[si]
    const enz = translate(strand)
    if (enz.length === 0) continue
    for (const enzyme of enz) {
      for (let i = 0; i < strand.length; i++) {
        if (strand[i] === enzyme.bindingPref) {
          enzymes.push(enzyme)
          targets.push(strand)
          bindPositions.push(i)
          strandIdx.push(si)
        }
      }
    }
  }

  const opsPerStrand: string[][][] = strands.map(() => [])
  if (enzymes.length === 0) return opsPerStrand

  // Phase 2: execute in chunks
  for (let start = 0; start < enzymes.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, enzymes.length)
    const results = executeBatch(
      enzymes.slice(start, end),
      targets.slice(start, end),
      bindPositions.slice(start, end),
    )
    for (let i = 0; i < results.length; i++) {
      if (results[i].length > 0) {
        opsPerStrand[strandIdx[start + i]].push(results[i])
      }
    }
  }

  return opsPerStrand
}

// ---------- benchmark ----------

for (const LENGTH of [6, 8, 10, 12]) {
  const allStrands = [...generateStrands(LENGTH)]

  let totalOps = 0
  for (const strand of allStrands) {
    const enz = translate(strand)
    for (const e of enz) {
      for (let i = 0; i < strand.length; i++) {
        if (strand[i] === e.bindingPref) totalOps++
      }
    }
  }

  console.log(`\n=== Length ${LENGTH}: ${allStrands.length} strands, ${totalOps} ops ===`)

  // Warm up
  for (let i = 0; i < Math.min(100, allStrands.length); i++) runOnSelf(allStrands[i])
  batchRunOnSelf(allStrands.slice(0, Math.min(100, allStrands.length)))

  // Reference
  const t0 = performance.now()
  for (const strand of allStrands) runOnSelf(strand)
  const refMs = performance.now() - t0

  // Batched
  const t1 = performance.now()
  const batchOps = batchRunOnSelf(allStrands)
  const batchMs = performance.now() - t1

  // Quick correctness spot-check (first 500)
  let mismatches = 0
  for (let si = 0; si < Math.min(500, allStrands.length); si++) {
    const refOps = runOnSelf(allStrands[si])
    const refFlat = [...new Set(flattenOps(refOps))].sort().join('|')
    const bFlat = [...new Set(flattenOps(batchOps[si]))].sort().join('|')
    if (refFlat !== bFlat) mismatches++
  }

  const opsPerSec = (n: number, ms: number) => (totalOps / ms * 1000).toFixed(0)
  console.log(`  Reference: ${refMs.toFixed(0)}ms  (${opsPerSec(totalOps, refMs)} ops/sec)`)
  console.log(`  Batched:   ${batchMs.toFixed(0)}ms  (${opsPerSec(totalOps, batchMs)} ops/sec)`)
  console.log(`  Speedup:   ${(refMs / batchMs).toFixed(2)}x`)
  if (mismatches > 0) console.log(`  *** ${mismatches} MISMATCHES ***`)

  // Stop if taking too long
  if (refMs > 30000) { console.log('  (skipping longer lengths)'); break }
}
