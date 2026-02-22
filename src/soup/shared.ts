import type { DupletTable, Enzyme } from '../model/types.ts'
import { DUPLET_MAP, CROSS_TABLE } from '../model/types.ts'
import { translate } from '../model/ribosome.ts'

export type EvictionRule = 'none' | 'random' | 'shortest' | 'oldest'

export function pickRandom<T>(arr: T[]): [T, number] {
  const i = Math.floor(Math.random() * arr.length)
  return [arr[i], i]
}

export function activeTable(crossTable: boolean): DupletTable {
  return crossTable ? CROSS_TABLE : DUPLET_MAP
}

export function cachedTranslate(
  strand: string,
  cache: Map<string, Enzyme[]>,
  table: DupletTable,
): Enzyme[] {
  let enzymes = cache.get(strand)
  if (enzymes === undefined) {
    enzymes = translate(strand, table)
    cache.set(strand, enzymes)
  }
  return enzymes
}

export function recordProduction(
  graph: Map<string, Map<string, number>>,
  source: string,
  result: string,
) {
  let targets = graph.get(source)
  if (!targets) {
    targets = new Map()
    graph.set(source, targets)
  }
  targets.set(result, (targets.get(result) || 0) + 1)
}

export function recordTriple(
  tripleGraph: Map<string, number>,
  source: string,
  target: string,
  result: string,
) {
  const key = `${source}\t${target}\t${result}`
  tripleGraph.set(key, (tripleGraph.get(key) || 0) + 1)
}

export function pruneGraph(
  productionGraph: Map<string, Map<string, number>>,
  tripleGraph: Map<string, number>,
  poolSet: Set<string>,
) {
  for (const [src, targets] of productionGraph) {
    if (!poolSet.has(src)) {
      productionGraph.delete(src)
      continue
    }
    for (const [tgt] of targets) {
      if (!poolSet.has(tgt)) targets.delete(tgt)
    }
    if (targets.size === 0) productionGraph.delete(src)
  }
  for (const [key] of tripleGraph) {
    const [src, , res] = key.split('\t')
    if (!poolSet.has(src) || !poolSet.has(res)) {
      tripleGraph.delete(key)
    }
  }
}

export function detectTriangles(
  productionGraph: Map<string, Map<string, number>>,
  poolSet: Set<string>,
): [string, string, string, number][] {
  const seen = new Set<string>()
  const results: [string, string, string, number][] = []

  for (const [a, aTargets] of productionGraph) {
    if (!poolSet.has(a)) continue
    for (const [b, abCount] of aTargets) {
      if (!poolSet.has(b) || b === a) continue
      const bTargets = productionGraph.get(b)
      if (!bTargets) continue
      for (const [c, bcCount] of bTargets) {
        if (!poolSet.has(c) || c === a || c === b) continue
        const cTargets = productionGraph.get(c)
        const caCount = cTargets?.get(a)
        if (caCount == null) continue
        // Normalize: rotate so smallest strand is first
        const triple = [a, b, c]
        const minIdx = triple[0] <= triple[1] && triple[0] <= triple[2] ? 0
          : triple[1] <= triple[2] ? 1 : 2
        const norm = [triple[minIdx], triple[(minIdx + 1) % 3], triple[(minIdx + 2) % 3]]
        const key = norm.join('\t')
        if (seen.has(key)) continue
        seen.add(key)
        results.push([norm[0], norm[1], norm[2], Math.min(abCount, bcCount, caCount)])
      }
    }
  }

  results.sort((a, b) => b[3] - a[3])
  return results.slice(0, 5)
}

const HISTORY_CAP = 60

export function computeBaseStats(
  pool: string[],
  ops: number,
  attempts: number,
  productionGraph: Map<string, Map<string, number>>,
  tripleGraph: Map<string, number>,
  strandHistory: Map<string, number[]>,
) {
  const freq = new Map<string, number>()
  for (const s of pool) {
    freq.set(s, (freq.get(s) || 0) + 1)
  }
  const topStrands = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  const poolSet = new Set(pool)

  // Update strand history for all tracked strands
  const topSet = new Set(topStrands.map(e => e[0]))
  for (const strand of topSet) {
    if (!strandHistory.has(strand)) {
      strandHistory.set(strand, [])
    }
  }
  for (const [strand, history] of strandHistory) {
    const count = freq.get(strand) || 0
    history.push(count)
    if (history.length > HISTORY_CAP) {
      history.splice(0, history.length - HISTORY_CAP)
    }
  }
  // Prune strands that are no longer in top set and have been 0 for all entries
  for (const [strand, history] of strandHistory) {
    if (!topSet.has(strand) && history.every(v => v === 0)) {
      strandHistory.delete(strand)
    }
  }

  const topStrandsWithHistory: [string, number, number[]][] = topStrands.map(
    ([strand, count]) => [strand, count, strandHistory.get(strand) || [count]]
  )

  const triples: [string, string, string, number][] = []
  for (const [key, count] of tripleGraph) {
    const [src, tgt, res] = key.split('\t')
    if (poolSet.has(src) && poolSet.has(res)) {
      triples.push([src, tgt, res, count])
    }
  }
  triples.sort((a, b) => b[3] - a[3])

  const mutualPairs: [string, string, number, number][] = []
  for (const [src, targets] of productionGraph) {
    if (!poolSet.has(src)) continue
    for (const [tgt, fwdCount] of targets) {
      if (!poolSet.has(tgt)) continue
      if (src >= tgt) continue
      const reverse = productionGraph.get(tgt)
      const revCount = reverse?.get(src)
      if (revCount != null) {
        mutualPairs.push([src, tgt, fwdCount, revCount])
      }
    }
  }
  mutualPairs.sort((a, b) => (b[2] + b[3]) - (a[2] + a[3]))

  const triangles = detectTriangles(productionGraph, poolSet)

  return {
    type: 'stats' as const,
    ops,
    attempts,
    poolSize: pool.length,
    uniqueCount: freq.size,
    topStrands: topStrandsWithHistory,
    topTriples: triples.slice(0, 20),
    mutualPairs: mutualPairs.slice(0, 10),
    triangles,
  }
}
