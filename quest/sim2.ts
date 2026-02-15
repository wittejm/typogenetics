/**
 * Session 2 simulation: cross-alphabet table + Gillespie sampling + longer runs.
 * Run via: npx tsx quest/sim2.ts [config_name]
 */

import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect.ts'
import { bind, runAll } from '../src/model/execution.ts'
import type { Amino, Base, Enzyme } from '../src/model/types.ts'
import { DUPLET_MAP } from '../src/model/types.ts'
import { initialStrands } from '../src/model/strand.ts'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Duplet Tables ───────────────────────────────────────────────────

// Standard Hofstadter table
const STANDARD_TABLE = DUPLET_MAP

// Cross-alphabet table: swap insertion targets so C/G enzymes insert A/T
// and A/T enzymes insert C/G. Only changes the four insert aminos.
// Original: GA→ina, GC→inc, GG→ing, GT→int
// Swapped:  GA→inc, GC→ina, GG→int, GT→ing
const CROSS_TABLE = new Map<string, [Amino | 'pun', string | null]>([...DUPLET_MAP])
CROSS_TABLE.set('GC', ['ina', 'r'])  // was inc, now ina (insert A instead of C)
CROSS_TABLE.set('GG', ['int', 'r'])  // was ing, now int (insert T instead of G)
CROSS_TABLE.set('GA', ['inc', 's'])  // was ina, now inc (insert C instead of A)
CROSS_TABLE.set('GT', ['ing', 'l'])  // was int, now ing (insert G instead of T)

type DupletTable = Map<string, [Amino | 'pun', string | null]>

// ── Translation with custom table ───────────────────────────────────

const PREFS: readonly Base[] = ['A', 'G', 'T', 'C']

function translateWithTable(strand: string, table: DupletTable): Enzyme[] {
  const results: Enzyme[] = []
  let current: Amino[] = []
  let direction = 0

  for (let i = 0; i + 1 < strand.length; i += 2) {
    const duplet = strand.slice(i, i + 2)
    const entry = table.get(duplet)
    if (!entry) continue
    const [amino, turn] = entry

    if (amino === 'pun') {
      if (current.length > 0) {
        const dirMod = ((direction % 4) + 4) % 4
        results.push({ aminos: current, bindingPref: PREFS[dirMod] })
        current = []
        direction = 0
      }
    } else {
      current.push(amino as Amino)
      direction += turn === 'r' ? 1 : turn === 'l' ? -1 : 0
    }
  }

  if (current.length > 0) {
    const dirMod = ((direction % 4) + 4) % 4
    results.push({ aminos: current, bindingPref: PREFS[dirMod] })
  }

  return results
}

// ── Config ──────────────────────────────────────────────────────────

type EvictionRule = 'none' | 'random' | 'oldest'
type TableName = 'standard' | 'cross'

type SimConfig = {
  name: string
  totalOps: number
  capSize: number
  evictionRule: EvictionRule
  consumeSource: boolean
  filterInert: boolean
  initialPool: string[]
  snapshotInterval: number
  table: TableName
  gillespie: boolean  // use Gillespie-style rejection-free sampling
}

const diversePool = [
  'ACGC', 'ACGG', 'GCAC', 'GGAC', 'ACGCGG', 'GGACGC',
  'AGGC', 'AGGG', 'GCAG', 'CAACGC', 'TAACGC',
  'GC', 'GG', 'GCGG', 'ACGT', 'TGCA', 'ATCG',
  'GCACGGAC', 'ACGCAGGG', 'GGACGCAG',
]

const CONFIGS: SimConfig[] = [
  // Cross-alphabet table experiments
  {
    name: 'cross_r200',
    totalOps: 200_000,
    capSize: 200,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
    table: 'cross',
    gillespie: false,
  },
  {
    name: 'cross_r500',
    totalOps: 200_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
    table: 'cross',
    gillespie: false,
  },
  {
    name: 'cross_diverse_r500',
    totalOps: 200_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...diversePool],
    snapshotInterval: 1000,
    table: 'cross',
    gillespie: false,
  },
  // Gillespie versions (cross table)
  {
    name: 'cross_gillespie_r500',
    totalOps: 500_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 2000,
    table: 'cross',
    gillespie: true,
  },
  // Longer timescale with standard table for comparison
  {
    name: 'standard_gillespie_r500_500k',
    totalOps: 500_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 2000,
    table: 'standard',
    gillespie: true,
  },
]

// ── Helpers ─────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): [T, number] {
  const i = Math.floor(Math.random() * arr.length)
  return [arr[i], i]
}

function evict(pool: string[], rule: EvictionRule, cap: number) {
  if (rule === 'none' || cap <= 0 || pool.length <= cap) return
  const excess = pool.length - cap
  switch (rule) {
    case 'random': {
      if (excess > pool.length / 2) {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        pool.length = cap
      } else {
        for (let i = 0; i < excess; i++) {
          pool.splice(Math.floor(Math.random() * pool.length), 1)
        }
      }
      break
    }
    case 'oldest': {
      pool.splice(0, excess)
      break
    }
  }
}

// ── Types ───────────────────────────────────────────────────────────

type Snapshot = {
  op: number
  pool: Record<string, number>
  poolSize: number
  uniqueCount: number
}

type ProductionEdge = {
  catalyst: string
  product: string
  count: number
}

type SimResult = {
  config: SimConfig
  totalAttempts: number
  totalProductiveOps: number
  snapshots: Snapshot[]
  productionEdges: ProductionEdge[]
}

// ── Gillespie Index ─────────────────────────────────────────────────

type GillespieIndex = {
  // Strands that can produce enzymes, with their enzyme info cached
  catalysts: Map<string, { enzymes: Enzyme[]; indices: number[] }>
  // For each binding base, which pool indices have that base
  bindingTargets: Map<Base, number[]>
  dirty: boolean
}

function buildGillespieIndex(pool: string[], table: DupletTable, enzymeCache: Map<string, Enzyme[]>): GillespieIndex {
  const catalysts = new Map<string, { enzymes: Enzyme[]; indices: number[] }>()
  const bindingTargets = new Map<Base, number[]>([['A', []], ['C', []], ['G', []], ['T', []]])

  for (let i = 0; i < pool.length; i++) {
    const strand = pool[i]

    // Cache enzyme translation
    let enzymes = enzymeCache.get(strand)
    if (enzymes === undefined) {
      enzymes = translateWithTable(strand, table)
      enzymeCache.set(strand, enzymes)
    }

    if (enzymes.length > 0) {
      let entry = catalysts.get(strand)
      if (!entry) {
        entry = { enzymes, indices: [] }
        catalysts.set(strand, entry)
      }
      entry.indices.push(i)
    }

    // Index by which bases this strand contains (for binding targets)
    const bases = new Set(strand)
    for (const b of bases) {
      bindingTargets.get(b as Base)?.push(i)
    }
  }

  return { catalysts, bindingTargets, dirty: false }
}

// ── Simulation ──────────────────────────────────────────────────────

function runSim(config: SimConfig): SimResult {
  const pool = [...config.initialPool]
  const table = config.table === 'cross' ? CROSS_TABLE : STANDARD_TABLE
  const enzymeCache = new Map<string, Enzyme[]>()

  const productionGraph = new Map<string, Map<string, number>>()
  const snapshots: Snapshot[] = []
  let ops = 0
  let attempts = 0

  snapshots.push(takeSnapshot(pool, 0))

  function cachedTranslate(strand: string): Enzyme[] {
    let enzymes = enzymeCache.get(strand)
    if (enzymes === undefined) {
      enzymes = translateWithTable(strand, table)
      enzymeCache.set(strand, enzymes)
    }
    return enzymes
  }

  if (config.gillespie) {
    // ── Gillespie-style: pick catalyst first, then find compatible target ──
    while (ops < config.totalOps && pool.length > 0) {
      attempts++

      // Pick a random strand; skip if it has no enzymes
      const [source, sourceIdx] = pickRandom(pool)
      const enzymes = cachedTranslate(source)
      if (enzymes.length === 0) continue

      // Pick a random enzyme from this catalyst
      const [enzyme] = pickRandom(enzymes)

      // Find all pool strands that contain the binding base
      // (Gillespie optimization: only consider compatible targets)
      const compatibleIndices: number[] = []
      for (let i = 0; i < pool.length; i++) {
        if (pool[i].includes(enzyme.bindingPref)) {
          compatibleIndices.push(i)
        }
      }
      if (compatibleIndices.length === 0) continue

      // Pick a random compatible target
      const [targetIdx] = pickRandom(compatibleIndices)
      const target = pool[targetIdx]

      // Pick a random binding position on the target
      const positions: number[] = []
      for (let i = 0; i < target.length; i++) {
        if (target[i] === enzyme.bindingPref) positions.push(i)
      }
      const [bindPos] = pickRandom(positions)

      // Execute
      const ds = parsePrimaryStrand(target)
      const state = bind(ds, bindPos)
      const final = runAll(state, enzyme)
      const results = collectResults(final).map(strandToString)

      // Remove consumed strands
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
        if (r !== target) {
          let targets = productionGraph.get(source)
          if (!targets) { targets = new Map(); productionGraph.set(source, targets) }
          targets.set(r, (targets.get(r) || 0) + 1)
        }
      }

      evict(pool, config.evictionRule, config.capSize)
      ops++

      if (ops % 5000 === 0) {
        const poolSet = new Set(pool)
        for (const [src, tgts] of productionGraph) {
          if (!poolSet.has(src)) { productionGraph.delete(src); continue }
          for (const [tgt] of tgts) { if (!poolSet.has(tgt)) tgts.delete(tgt) }
          if (tgts.size === 0) productionGraph.delete(src)
        }
      }

      if (ops % config.snapshotInterval === 0) snapshots.push(takeSnapshot(pool, ops))
      if (ops % 50000 === 0) {
        console.log(`  [${config.name}] ${ops}/${config.totalOps} ops, pool=${pool.length}, unique=${new Set(pool).size}, attempts=${attempts}`)
      }
    }
  } else {
    // ── Standard random×random sampling ──
    while (ops < config.totalOps && pool.length > 0) {
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
        if (r !== target) {
          let targets = productionGraph.get(source)
          if (!targets) { targets = new Map(); productionGraph.set(source, targets) }
          targets.set(r, (targets.get(r) || 0) + 1)
        }
      }

      evict(pool, config.evictionRule, config.capSize)
      ops++

      if (ops % 5000 === 0) {
        const poolSet = new Set(pool)
        for (const [src, tgts] of productionGraph) {
          if (!poolSet.has(src)) { productionGraph.delete(src); continue }
          for (const [tgt] of tgts) { if (!poolSet.has(tgt)) tgts.delete(tgt) }
          if (tgts.size === 0) productionGraph.delete(src)
        }
      }

      if (ops % config.snapshotInterval === 0) snapshots.push(takeSnapshot(pool, ops))
      if (ops % 50000 === 0) {
        console.log(`  [${config.name}] ${ops}/${config.totalOps} ops, pool=${pool.length}, unique=${new Set(pool).size}, attempts=${attempts}`)
      }
    }
  }

  snapshots.push(takeSnapshot(pool, ops))

  const productionEdges: ProductionEdge[] = []
  for (const [catalyst, tgts] of productionGraph) {
    for (const [product, count] of tgts) {
      productionEdges.push({ catalyst, product, count })
    }
  }
  productionEdges.sort((a, b) => b.count - a.count)

  return { config, totalAttempts: attempts, totalProductiveOps: ops, snapshots, productionEdges }
}

function takeSnapshot(pool: string[], op: number): Snapshot {
  const freq: Record<string, number> = {}
  for (const s of pool) freq[s] = (freq[s] || 0) + 1
  return { op, pool: freq, poolSize: pool.length, uniqueCount: Object.keys(freq).length }
}

// ── Main ────────────────────────────────────────────────────────────

const outDir = join(import.meta.dirname!, '..', 'data', 'quest_findings')
mkdirSync(outDir, { recursive: true })

const selectedName = process.argv[2]
const configs = selectedName
  ? CONFIGS.filter(c => c.name === selectedName)
  : CONFIGS

if (configs.length === 0) {
  console.error(`Unknown config: ${selectedName}`)
  console.error(`Available: ${CONFIGS.map(c => c.name).join(', ')}`)
  process.exit(1)
}

for (const config of configs) {
  console.log(`\n=== Running: ${config.name} ===`)
  console.log(`  ${config.totalOps} ops, cap=${config.capSize}, table=${config.table}, gillespie=${config.gillespie}`)

  const t0 = Date.now()
  const result = runSim(config)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  const lastSnap = result.snapshots[result.snapshots.length - 1]
  console.log(`  Done in ${elapsed}s. ${result.totalAttempts} attempts, ${result.totalProductiveOps} productive ops`)
  console.log(`  Final pool: ${lastSnap.poolSize} strands, ${lastSnap.uniqueCount} unique`)
  console.log(`  Production edges: ${result.productionEdges.length}`)

  const outPath = join(outDir, `${config.name}.json`)
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`  Saved to ${outPath}`)
}

console.log('\nAll done.')
