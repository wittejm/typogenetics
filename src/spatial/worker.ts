import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect.ts'
import { bind, runAll } from '../model/execution.ts'
import type { Enzyme } from '../model/types.ts'
import {
  pickRandom,
  activeTable,
  cachedTranslate as cachedTranslateShared,
  recordProduction,
  recordTriple,
  pruneGraph,
} from '../soup/shared.ts'
import type { SpatialConfig, SpatialStats } from './types.ts'
import {
  initGridClustered,
  diffuse,
  enforceCrowding,
  computeCellBases,
  flattenGrid,
  neighbors,
} from './grid.ts'

const config: SpatialConfig = {
  gridWidth: 32,
  gridHeight: 32,
  cellCapacity: 8,
  diffusionRate: 0.05,
  enforceCrowding: true,
  crowdingMode: 'death',
  numClusters: 3,
  consumeSource: false,
  filterInert: false,
  crossTable: false,
  batchSize: 100,
}

let running = false
let paused = false

const enzymeCache = new Map<string, Enzyme[]>()
const productionGraph = new Map<string, Map<string, number>>()
const tripleGraph = new Map<string, number>()

function translate(strand: string): Enzyme[] {
  return cachedTranslateShared(strand, enzymeCache, activeTable(config.crossTable))
}

function computeStats(grid: string[][], ops: number, attempts: number): SpatialStats {
  const pool = flattenGrid(grid)
  const freq = new Map<string, number>()
  for (const s of pool) {
    freq.set(s, (freq.get(s) || 0) + 1)
  }
  const topStrands = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  const poolSet = new Set(pool)

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

  const { baseA, baseC, baseG, baseT } = computeCellBases(grid, config.gridWidth, config.gridHeight)

  return {
    type: 'stats',
    ops,
    attempts,
    totalStrands: pool.length,
    uniqueCount: freq.size,
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    baseA,
    baseC,
    baseG,
    baseT,
    topStrands,
    topTriples: triples.slice(0, 20),
    mutualPairs: mutualPairs.slice(0, 10),
  }
}

async function run(initialPool: string[], gridWidth: number, gridHeight: number, numClusters: number) {
  running = true
  paused = false
  enzymeCache.clear()
  productionGraph.clear()
  tripleGraph.clear()

  config.gridWidth = gridWidth
  config.gridHeight = gridHeight

  const grid = initGridClustered(initialPool, gridWidth, gridHeight, numClusters)
  let ops = 0
  let attempts = 0
  let lastPrune = 0

  self.postMessage(computeStats(grid, ops, attempts))

  // Build a list of non-empty cell indices for efficient random selection
  function nonEmptyCells(): number[] {
    const result: number[] = []
    for (let i = 0; i < grid.length; i++) {
      if (grid[i].length > 0) result.push(i)
    }
    return result
  }

  while (running) {
    if (paused) {
      await new Promise(r => setTimeout(r, 50))
      continue
    }

    const occupied = nonEmptyCells()
    if (occupied.length === 0) break

    for (let b = 0; b < config.batchSize && running && !paused; b++) {
      // Re-check occupancy periodically
      if (occupied.length === 0) break

      attempts++

      // 1. Pick a random non-empty cell
      const [cellIdx, occIdx] = pickRandom(occupied)
      const cell = grid[cellIdx]
      if (cell.length === 0) {
        // Cell became empty during batch; remove from occupied list
        occupied.splice(occIdx, 1)
        continue
      }

      // 2. Pick a random source strand from that cell
      const [source, sourceLocalIdx] = pickRandom(cell)
      const enzymes = translate(source)
      if (enzymes.length === 0) continue

      // 3. Pick random enzyme
      const [enzyme] = pickRandom(enzymes)

      // 4. Collect candidate targets: same cell + 8 toroidal neighbors
      const nbrs = neighbors(cellIdx, gridWidth, gridHeight)
      const candidateCells = [cellIdx, ...nbrs]

      // Build flat list of [candidateCellIdx, localIdx, strand]
      const candidates: [number, number, string][] = []
      for (const ci of candidateCells) {
        const c = grid[ci]
        for (let j = 0; j < c.length; j++) {
          candidates.push([ci, j, c[j]])
        }
      }
      if (candidates.length === 0) continue

      // 5. Pick random target
      const [picked] = pickRandom(candidates)
      const [targetCellIdx, targetLocalIdx, target] = picked

      // 6. Find binding positions
      const positions: number[] = []
      for (let i = 0; i < target.length; i++) {
        if (target[i] === enzyme.bindingPref) positions.push(i)
      }
      if (positions.length === 0) continue

      const [bindPos] = pickRandom(positions)

      // 7. Execute reaction
      const ds = parsePrimaryStrand(target)
      const state = bind(ds, bindPos)
      const final = runAll(state, enzyme)
      const results = collectResults(final).map(strandToString)

      // 8. Remove target from its cell
      grid[targetCellIdx].splice(targetLocalIdx, 1)

      // If consumeSource, also remove source (if different from target)
      if (config.consumeSource) {
        const sameCell = targetCellIdx === cellIdx
        const sameStrand = sameCell && targetLocalIdx === sourceLocalIdx
        if (!sameStrand) {
          // Adjust index if source is in same cell and after the removed target
          let adjIdx = sourceLocalIdx
          if (sameCell && sourceLocalIdx > targetLocalIdx) {
            adjIdx--
          }
          if (adjIdx >= 0 && adjIdx < grid[cellIdx].length) {
            grid[cellIdx].splice(adjIdx, 1)
          }
        }
      }

      // 9. Add products to source's cell
      for (const r of results) {
        if (r.length === 0) continue
        if (config.filterInert && translate(r).length === 0) continue
        grid[cellIdx].push(r)
        recordProduction(productionGraph, source, r)
        recordTriple(tripleGraph, source, target, r)
      }

      ops++
    }

    // After each batch: diffuse and enforce crowding
    diffuse(grid, gridWidth, gridHeight, config.diffusionRate)
    if (config.enforceCrowding) {
      enforceCrowding(grid, gridWidth, gridHeight, config.cellCapacity, config.crowdingMode)
    }

    // Prune graph periodically
    if (ops - lastPrune >= 1000) {
      const allStrands = flattenGrid(grid)
      pruneGraph(productionGraph, tripleGraph, new Set(allStrands))
      lastPrune = ops
    }

    self.postMessage(computeStats(grid, ops, attempts))
    await new Promise(r => setTimeout(r, 0))
  }

  self.postMessage(computeStats(grid, ops, attempts))
  if (flattenGrid(grid).length === 0) {
    self.postMessage({ type: 'done' })
  }
  running = false
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'start') {
    if (!running) {
      run(
        e.data.pool,
        e.data.gridWidth ?? config.gridWidth,
        e.data.gridHeight ?? config.gridHeight,
        e.data.numClusters ?? config.numClusters,
      )
    }
  } else if (e.data.type === 'stop') {
    running = false
  } else if (e.data.type === 'pause') {
    paused = true
  } else if (e.data.type === 'resume') {
    paused = false
  } else if (e.data.type === 'config') {
    if (e.data.cellCapacity != null) config.cellCapacity = e.data.cellCapacity
    if (e.data.diffusionRate != null) config.diffusionRate = e.data.diffusionRate
    if (e.data.enforceCrowding != null) config.enforceCrowding = e.data.enforceCrowding
    if (e.data.crowdingMode != null) config.crowdingMode = e.data.crowdingMode
    if (e.data.consumeSource != null) config.consumeSource = e.data.consumeSource
    if (e.data.filterInert != null) config.filterInert = e.data.filterInert
    if (e.data.batchSize != null) config.batchSize = e.data.batchSize
    if (e.data.crossTable != null) {
      const prev = config.crossTable
      config.crossTable = e.data.crossTable
      if (prev !== config.crossTable) enzymeCache.clear()
    }
  }
}
