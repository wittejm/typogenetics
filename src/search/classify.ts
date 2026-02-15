import { translate } from '../model/ribosome.ts'
import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect.ts'
import { bind, runAll } from '../model/execution.ts'
import { COMPLEMENT } from '../model/types.ts'
import type { Base } from '../model/types.ts'

const BASES: Base[] = ['A', 'C', 'G', 'T']

export function reverseComplement(s: string): string {
  let result = ''
  for (let i = s.length - 1; i >= 0; i--) {
    result += COMPLEMENT.get(s[i] as Base) ?? s[i]
  }
  return result
}

/** Returns per-operation result sets (one string[] per enzyme+bindIndex). */
export function runOnSelf(strand: string): string[][] {
  const enzymes = translate(strand)
  if (enzymes.length === 0) return []

  const ops: string[][] = []

  for (const enzyme of enzymes) {
    for (let i = 0; i < strand.length; i++) {
      if (strand[i] === enzyme.bindingPref) {
        const ds = parsePrimaryStrand(strand)
        const state = bind(ds, i)
        const final = runAll(state, enzyme)
        const results = collectResults(final).map(strandToString)
        if (results.length > 0) {
          ops.push(results)
        }
      }
    }
  }

  return ops
}

export function flattenOps(ops: string[][]): string[] {
  const all: string[] = []
  for (const op of ops) {
    for (const s of op) all.push(s)
  }
  return all
}

export type Bucket = 'survivor' | 'complement' | 'survivorComplementSingle' | 'survivorComplementMulti' | 'pairBond' | 'novel'

export function categorize(strand: string, ops: string[][]): Bucket[] {
  const buckets: Bucket[] = []
  const all = flattenOps(ops)
  const resultSet = new Set(all)
  const rc = reverseComplement(strand)
  const isSelfComplement = rc === strand

  const hasSelf = resultSet.has(strand)
  const hasComplement = !isSelfComplement && resultSet.has(rc)

  // Single-op produces both self and complement
  const hasBothInOneOp = hasSelf && hasComplement && ops.some(op => {
    const s = new Set(op)
    return s.has(strand) && s.has(rc)
  })

  // Check pair bond
  let isPairBond = false
  if (hasComplement) {
    const rcOps = runOnSelf(rc)
    const rcAll = flattenOps(rcOps)
    isPairBond = new Set(rcAll).has(strand)
  }

  // Exclusive complement-related buckets: pair bond > survivor+complement (single) > survivor+complement (multi) > complement > survivor
  if (isPairBond) {
    buckets.push('pairBond')
  } else if (hasBothInOneOp) {
    buckets.push('survivorComplementSingle')
  } else if (hasSelf && hasComplement) {
    buckets.push('survivorComplementMulti')
  } else if (hasComplement) {
    buckets.push('complement')
  } else if (hasSelf) {
    buckets.push('survivor')
  }

  // Novel is independent
  if (all.some(r => r !== strand && r !== rc)) {
    buckets.push('novel')
  }

  return buckets
}

export interface Cycle {
  path: string[]   // e.g. ["ACGT", "TGCA", "ACGT"] for a 2-cycle
}

/**
 * BFS from `strand` up to `maxDepth` levels, looking for cycles back to `strand`.
 * Uses a shared cache to amortize runOnSelf computations across strands in a shard.
 * Self-replicators (strand produces itself directly) are NOT reported as cycles.
 */
export function findCycles(
  strand: string,
  maxDepth: number,
  cache: Map<string, string[]>,
): Cycle[] {
  const cycles: Cycle[] = []

  // Get or compute the unique flattened runOnSelf results for a strand
  function getResults(s: string): string[] {
    let cached = cache.get(s)
    if (cached === undefined) {
      const ops = runOnSelf(s)
      cached = [...new Set(flattenOps(ops))]
      cache.set(s, cached)
    }
    return cached
  }

  // BFS: each frontier entry tracks the full path from the start
  // frontier = list of [currentStrand, pathSoFar]
  const visited = new Set<string>()
  visited.add(strand)

  // Start with the direct results of the starting strand
  const startResults = getResults(strand)
  if (startResults.length === 0) return cycles

  // Build initial frontier (depth 1): strands produced by the starting strand
  // Exclude the starting strand itself (self-replicators aren't hypercycles)
  let frontier: Array<{ current: string; path: string[] }> = []
  for (const r of startResults) {
    if (r !== strand) {
      frontier.push({ current: r, path: [strand, r] })
      visited.add(r)
    }
  }

  // BFS levels 2..maxDepth
  for (let depth = 2; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: Array<{ current: string; path: string[] }> = []

    for (const { current, path } of frontier) {
      const results = getResults(current)
      for (const r of results) {
        if (r === strand) {
          // Found a cycle back to start
          cycles.push({ path: [...path, r] })
        } else if (!visited.has(r)) {
          visited.add(r)
          nextFrontier.push({ current: r, path: [...path, r] })
        }
      }
    }

    frontier = nextFrontier
  }

  return cycles
}

export function* generateStrands(length: number): Generator<string> {
  const total = 4 ** length
  for (let i = 0; i < total; i++) {
    let s = ''
    let n = i
    for (let j = 0; j < length; j++) {
      s += BASES[n % 4]
      n = Math.floor(n / 4)
    }
    yield s
  }
}

/** Convert a strand string to its index within its length group. */
export function strandToIndex(strand: string): number {
  const baseMap: Record<string, number> = { A: 0, C: 1, G: 2, T: 3 }
  let n = 0
  for (let i = strand.length - 1; i >= 0; i--) {
    n = n * 4 + baseMap[strand[i]]
  }
  return n
}

/** Convert an index back to a strand of the given length. */
export function indexToStrand(index: number, length: number): string {
  const BASES_STR = 'ACGT'
  let s = ''
  let n = index
  for (let j = 0; j < length; j++) {
    s += BASES_STR[n % 4]
    n = Math.floor(n / 4)
  }
  return s
}
