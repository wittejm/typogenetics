/**
 * Verification script: compare rnn_deterministic executor against
 * the reference execution.ts implementation on random inputs.
 *
 * Run with: npx tsx scripts/verify_rnn.ts
 */

import { translate } from '../src/model/ribosome'
import { bind, runAll } from '../src/model/execution'
import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect'
import { executeBatch } from '../src/rnn_deterministic/execute'

function randomStrand(len: number): string {
  const bases = 'ACGT'
  let s = ''
  for (let i = 0; i < len; i++) s += bases[Math.floor(Math.random() * 4)]
  return s
}

const TRIALS = 10_000
let passed = 0
let failed = 0
let skipped = 0

for (let trial = 0; trial < TRIALS; trial++) {
  const sourceLen = 2 + Math.floor(Math.random() * 20)
  const targetLen = 2 + Math.floor(Math.random() * 20)
  const source = randomStrand(sourceLen)
  const target = randomStrand(targetLen)

  const enzymes = translate(source)
  if (enzymes.length === 0) { skipped++; continue }

  const ei = Math.floor(Math.random() * enzymes.length)
  const enzyme = enzymes[ei]

  // Find valid binding positions
  const positions: number[] = []
  for (let i = 0; i < target.length; i++) {
    if (target[i] === enzyme.bindingPref) positions.push(i)
  }
  if (positions.length === 0) { skipped++; continue }

  const bindPos = positions[Math.floor(Math.random() * positions.length)]

  // Reference implementation
  const ds = parsePrimaryStrand(target)
  const refState = runAll(bind(ds, bindPos), enzyme)
  const refResults = collectResults(refState).map(strandToString).sort()

  // Batched implementation (batch of 1)
  const batchResults = executeBatch([enzyme], [target], [bindPos])[0].sort()

  const refStr = refResults.join('|')
  const batchStr = batchResults.join('|')

  if (refStr === batchStr) {
    passed++
  } else {
    failed++
    console.log(`MISMATCH trial=${trial}`)
    console.log(`  source=${source} target=${target} bindPos=${bindPos}`)
    console.log(`  enzyme=[${enzyme.aminos.join(',')}] pref=${enzyme.bindingPref}`)
    console.log(`  ref:   [${refResults.join(', ')}]`)
    console.log(`  batch: [${batchResults.join(', ')}]`)
    if (failed >= 20) {
      console.log('Too many failures, stopping early.')
      break
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (no enzyme/binding) out of ${TRIALS} trials`)

if (failed === 0) {
  console.log('All tests passed!')

  // Benchmark
  const N = 50_000
  const batchEnzymes = []
  const batchTargets = []
  const batchBindPos = []

  for (let i = 0; i < N; i++) {
    const src = randomStrand(2 + Math.floor(Math.random() * 16))
    const tgt = randomStrand(2 + Math.floor(Math.random() * 16))
    const enz = translate(src)
    if (enz.length === 0) continue
    const e = enz[Math.floor(Math.random() * enz.length)]
    const positions: number[] = []
    for (let j = 0; j < tgt.length; j++) {
      if (tgt[j] === e.bindingPref) positions.push(j)
    }
    if (positions.length === 0) continue
    batchEnzymes.push(e)
    batchTargets.push(tgt)
    batchBindPos.push(positions[Math.floor(Math.random() * positions.length)])
  }

  const B = batchEnzymes.length
  console.log(`\nBenchmark: ${B} operations`)

  // Reference: one at a time
  const t0 = performance.now()
  for (let i = 0; i < B; i++) {
    const ds = parsePrimaryStrand(batchTargets[i])
    const st = runAll(bind(ds, batchBindPos[i]), batchEnzymes[i])
    collectResults(st)
  }
  const refMs = performance.now() - t0

  // Batched: all at once
  const t1 = performance.now()
  executeBatch(batchEnzymes, batchTargets, batchBindPos)
  const batchMs = performance.now() - t1

  console.log(`  Reference:  ${refMs.toFixed(1)}ms  (${(B / refMs * 1000).toFixed(0)} ops/sec)`)
  console.log(`  Batched:    ${batchMs.toFixed(1)}ms  (${(B / batchMs * 1000).toFixed(0)} ops/sec)`)
  console.log(`  Speedup:    ${(refMs / batchMs).toFixed(1)}x`)
}
