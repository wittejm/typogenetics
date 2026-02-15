/**
 * Track which strands persist in the pool over time.
 * Identifies long-lived strands and stable relationships.
 *
 * Usage: npx tsx quest/persistence.ts <config_name>
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(import.meta.dirname!, '..', 'data', 'quest_findings')

const name = process.argv[2] || 'random200_filterInert'
const data = JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf-8'))

const snapshots = data.snapshots as { op: number; pool: Record<string, number>; poolSize: number; uniqueCount: number }[]

// Track how many consecutive snapshots each strand appears in
console.log(`=== Strand Persistence Analysis: ${name} ===\n`)
console.log(`${snapshots.length} snapshots over ${snapshots[snapshots.length - 1].op} ops\n`)

// For each strand, find all snapshot indices where it appears
const strandPresence = new Map<string, number[]>()
for (let i = 0; i < snapshots.length; i++) {
  for (const strand of Object.keys(snapshots[i].pool)) {
    if (!strandPresence.has(strand)) strandPresence.set(strand, [])
    strandPresence.get(strand)!.push(i)
  }
}

// Find longest consecutive run for each strand
type StrandStats = {
  strand: string
  totalSnapshots: number
  longestRun: number
  runStart: number
  runEnd: number
  maxCount: number
  lastSeen: number
}

const stats: StrandStats[] = []
for (const [strand, indices] of strandPresence) {
  let longestRun = 1, currentRun = 1
  let bestStart = indices[0], bestEnd = indices[0]
  let runStart = indices[0]

  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) {
      currentRun++
      if (currentRun > longestRun) {
        longestRun = currentRun
        bestStart = runStart
        bestEnd = indices[i]
      }
    } else {
      currentRun = 1
      runStart = indices[i]
    }
  }

  let maxCount = 0
  for (const idx of indices) {
    const count = snapshots[idx].pool[strand] || 0
    if (count > maxCount) maxCount = count
  }

  stats.push({
    strand,
    totalSnapshots: indices.length,
    longestRun,
    runStart: bestStart,
    runEnd: bestEnd,
    maxCount,
    lastSeen: indices[indices.length - 1],
  })
}

// Sort by longest consecutive run
stats.sort((a, b) => b.longestRun - a.longestRun || b.totalSnapshots - a.totalSnapshots)

console.log('TOP 30 MOST PERSISTENT STRANDS (by longest consecutive run):')
console.log('─'.repeat(90))
console.log('Strand'.padEnd(20), 'Run'.padStart(5), 'Total'.padStart(6), 'MaxCt'.padStart(6),
            'RunOps'.padEnd(20), 'LastSeen'.padStart(8))
console.log('─'.repeat(90))

for (const s of stats.slice(0, 30)) {
  const runOps = `${snapshots[s.runStart].op}-${snapshots[s.runEnd].op}`
  const lastOp = snapshots[s.lastSeen].op
  console.log(
    s.strand.padEnd(20).slice(0, 20),
    String(s.longestRun).padStart(5),
    String(s.totalSnapshots).padStart(6),
    String(s.maxCount).padStart(6),
    runOps.padEnd(20),
    String(lastOp).padStart(8),
  )
}

// Now look at mutual pairs over time
console.log('\n\n=== MUTUAL PAIR PERSISTENCE ===\n')

const edges = data.productionEdges as { catalyst: string; product: string; count: number }[]

// Find mutual pairs in the production graph
const edgeMap = new Map<string, number>()
for (const e of edges) {
  edgeMap.set(`${e.catalyst}→${e.product}`, e.count)
}

const mutualPairs: { a: string; b: string; fwd: number; rev: number }[] = []
const seen = new Set<string>()
for (const e of edges) {
  const key = [e.catalyst, e.product].sort().join('|')
  if (seen.has(key)) continue
  const rev = edgeMap.get(`${e.product}→${e.catalyst}`)
  if (rev != null) {
    mutualPairs.push({ a: e.catalyst, b: e.product, fwd: e.count, rev })
    seen.add(key)
  }
}

mutualPairs.sort((a, b) => (b.fwd + b.rev) - (a.fwd + a.rev))

console.log('Mutual pairs (both A→B and B→A exist as genuine novel productions):')
console.log('─'.repeat(80))
for (const p of mutualPairs) {
  // Check co-occurrence in snapshots
  const aIndices = new Set(strandPresence.get(p.a) || [])
  const bIndices = new Set(strandPresence.get(p.b) || [])
  let coOccurrence = 0
  for (const idx of aIndices) {
    if (bIndices.has(idx)) coOccurrence++
  }

  console.log(`${p.a} ↔ ${p.b}`)
  console.log(`  Forward (${p.a}→${p.b}): ${p.fwd}x, Reverse (${p.b}→${p.a}): ${p.rev}x`)
  console.log(`  Co-present in ${coOccurrence}/${snapshots.length} snapshots`)
  console.log()
}
