import { translate } from '../model/ribosome.ts'
import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect.ts'
import { bind, runAll } from '../model/execution.ts'
import type { Enzyme } from '../model/types.ts'

type EvictionRule = 'none' | 'random' | 'shortest' | 'oldest'

type Config = {
  capSize: number
  evictionRule: EvictionRule
  consumeSource: boolean
  filterInert: boolean
}

const config: Config = {
  capSize: 500,
  evictionRule: 'none',
  consumeSource: false,
  filterInert: false,
}

let running = false
let paused = false

// Translation cache: strand string → enzymes
const enzymeCache = new Map<string, Enzyme[]>()

function cachedTranslate(strand: string): Enzyme[] {
  let enzymes = enzymeCache.get(strand)
  if (enzymes === undefined) {
    enzymes = translate(strand)
    enzymeCache.set(strand, enzymes)
  }
  return enzymes
}

// Production graph: source → result → count
// "source's enzyme, operating on some target, produced result"
const productionGraph = new Map<string, Map<string, number>>()

function recordProduction(source: string, result: string) {
  let targets = productionGraph.get(source)
  if (!targets) {
    targets = new Map()
    productionGraph.set(source, targets)
  }
  targets.set(result, (targets.get(result) || 0) + 1)
}

function pruneGraph(poolSet: Set<string>) {
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
}

function pickRandom<T>(arr: T[]): [T, number] {
  const i = Math.floor(Math.random() * arr.length)
  return [arr[i], i]
}

function evict(pool: string[]) {
  if (config.evictionRule === 'none' || config.capSize <= 0 || pool.length <= config.capSize) return

  const excess = pool.length - config.capSize

  switch (config.evictionRule) {
    case 'random': {
      if (excess > pool.length / 2) {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        pool.length = config.capSize
      } else {
        for (let i = 0; i < excess; i++) {
          pool.splice(Math.floor(Math.random() * pool.length), 1)
        }
      }
      break
    }
    case 'shortest': {
      pool.sort((a, b) => b.length - a.length)
      pool.length = config.capSize
      break
    }
    case 'oldest': {
      pool.splice(0, excess)
      break
    }
  }
}

function computeStats(pool: string[], ops: number, attempts: number) {
  const freq = new Map<string, number>()
  for (const s of pool) {
    freq.set(s, (freq.get(s) || 0) + 1)
  }
  const topStrands = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  // Production graph analysis — only edges where both ends are in pool
  const poolSet = new Set(pool)
  const edges: [string, string, number][] = []

  for (const [src, targets] of productionGraph) {
    if (!poolSet.has(src)) continue
    for (const [tgt, count] of targets) {
      if (!poolSet.has(tgt)) continue
      edges.push([src, tgt, count])
    }
  }

  edges.sort((a, b) => b[2] - a[2])

  // Find mutual pairs: A→B and B→A both exist (among pool strands)
  const mutualPairs: [string, string, number, number][] = []
  for (const [src, targets] of productionGraph) {
    if (!poolSet.has(src)) continue
    for (const [tgt, fwdCount] of targets) {
      if (!poolSet.has(tgt)) continue
      if (src >= tgt) continue // deduplicate + skip self-loops
      const reverse = productionGraph.get(tgt)
      const revCount = reverse?.get(src)
      if (revCount != null) {
        mutualPairs.push([src, tgt, fwdCount, revCount])
      }
    }
  }
  mutualPairs.sort((a, b) => (b[2] + b[3]) - (a[2] + a[3]))

  return {
    type: 'stats' as const,
    ops,
    attempts,
    poolSize: pool.length,
    uniqueCount: freq.size,
    topStrands,
    topEdges: edges.slice(0, 20),
    mutualPairs: mutualPairs.slice(0, 10),
  }
}

async function run(initialPool: string[]) {
  running = true
  paused = false
  enzymeCache.clear()
  productionGraph.clear()
  const pool = [...initialPool]
  let ops = 0
  let attempts = 0
  let lastPrune = 0
  const BATCH = 100

  self.postMessage(computeStats(pool, ops, attempts))

  while (running && pool.length > 0) {
    // Pause loop: yield until resumed or stopped
    if (paused) {
      await new Promise(r => setTimeout(r, 50))
      continue
    }

    for (let b = 0; b < BATCH && running && !paused && pool.length > 0; b++) {
      attempts++

      const [source, sourceIdx] = pickRandom(pool)
      const enzymes = cachedTranslate(source)
      if (enzymes.length === 0) continue

      const [enzyme] = pickRandom(enzymes)

      const [target, targetIdx] = pickRandom(pool)

      const positions: number[] = []
      for (let i = 0; i < target.length; i++) {
        if (target[i] === enzyme.bindingPref) positions.push(i)
      }
      if (positions.length === 0) continue

      const [bindPos] = pickRandom(positions)

      const ds = parsePrimaryStrand(target)
      const state = bind(ds, bindPos)
      const final = runAll(state, enzyme)
      const results = collectResults(final).map(strandToString)

      if (config.consumeSource && sourceIdx !== targetIdx) {
        const hi = Math.max(sourceIdx, targetIdx)
        const lo = Math.min(sourceIdx, targetIdx)
        pool.splice(hi, 1)
        pool.splice(lo, 1)
      } else {
        pool.splice(targetIdx, 1)
      }

      for (const r of results) {
        if (r.length === 0) continue
        if (config.filterInert && cachedTranslate(r).length === 0) continue
        pool.push(r)
        recordProduction(source, r)
      }

      evict(pool)
      ops++
    }

    // Prune graph periodically to bound memory
    if (ops - lastPrune >= 1000) {
      pruneGraph(new Set(pool))
      lastPrune = ops
    }

    self.postMessage(computeStats(pool, ops, attempts))
    await new Promise(r => setTimeout(r, 0))
  }

  self.postMessage(computeStats(pool, ops, attempts))
  if (pool.length === 0) {
    self.postMessage({ type: 'done' })
  }
  running = false
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'start') {
    if (!running) run(e.data.pool)
  } else if (e.data.type === 'stop') {
    running = false
  } else if (e.data.type === 'pause') {
    paused = true
  } else if (e.data.type === 'resume') {
    paused = false
  } else if (e.data.type === 'config') {
    if (e.data.capSize != null) config.capSize = e.data.capSize
    if (e.data.evictionRule != null) config.evictionRule = e.data.evictionRule
    if (e.data.consumeSource != null) config.consumeSource = e.data.consumeSource
    if (e.data.filterInert != null) config.filterInert = e.data.filterInert
  }
}
