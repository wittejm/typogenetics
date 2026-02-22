import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect.ts'
import { bind, runAll } from '../model/execution.ts'
import type { Enzyme } from '../model/types.ts'
import {
  type EvictionRule,
  pickRandom,
  activeTable,
  cachedTranslate,
  recordProduction,
  recordTriple,
  pruneGraph,
  computeBaseStats,
} from './shared.ts'

type Config = {
  capSize: number
  evictionRule: EvictionRule
  consumeSource: boolean
  filterInert: boolean
  crossTable: boolean
}

const config: Config = {
  capSize: 500,
  evictionRule: 'none',
  consumeSource: false,
  filterInert: false,
  crossTable: false,
}

let running = false
let paused = false

const enzymeCache = new Map<string, Enzyme[]>()
const productionGraph = new Map<string, Map<string, number>>()
const tripleGraph = new Map<string, number>()
const strandHistory = new Map<string, number[]>()

function translate(strand: string): Enzyme[] {
  return cachedTranslate(strand, enzymeCache, activeTable(config.crossTable))
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

async function run(initialPool: string[]) {
  running = true
  paused = false
  enzymeCache.clear()
  productionGraph.clear()
  tripleGraph.clear()
  strandHistory.clear()
  const pool = [...initialPool]
  let ops = 0
  let attempts = 0
  let lastPrune = 0
  const BATCH = 100

  self.postMessage(computeBaseStats(pool, ops, attempts, productionGraph, tripleGraph, strandHistory))

  while (running && pool.length > 0) {
    if (paused) {
      await new Promise(r => setTimeout(r, 50))
      continue
    }

    for (let b = 0; b < BATCH && running && !paused && pool.length > 0; b++) {
      attempts++

      const [source, sourceIdx] = pickRandom(pool)
      const enzymes = translate(source)
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
        if (config.filterInert && translate(r).length === 0) continue
        pool.push(r)
        recordProduction(productionGraph, source, r)
        recordTriple(tripleGraph, source, target, r)
      }

      evict(pool)
      ops++
    }

    if (ops - lastPrune >= 1000) {
      pruneGraph(productionGraph, tripleGraph, new Set(pool))
      lastPrune = ops
    }

    self.postMessage(computeBaseStats(pool, ops, attempts, productionGraph, tripleGraph, strandHistory))
    await new Promise(r => setTimeout(r, 0))
  }

  self.postMessage(computeBaseStats(pool, ops, attempts, productionGraph, tripleGraph, strandHistory))
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
    if (e.data.crossTable != null) {
      const prev = config.crossTable
      config.crossTable = e.data.crossTable
      if (prev !== config.crossTable) enzymeCache.clear()
    }
  }
}
