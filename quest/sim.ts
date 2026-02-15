/**
 * Headless soup simulation with full operation logging.
 * Run via: npx tsx quest/sim.ts
 */

import { translate } from '../src/model/ribosome.ts'
import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect.ts'
import { bind, runAll } from '../src/model/execution.ts'
import type { Enzyme } from '../src/model/types.ts'
import { initialStrands } from '../src/model/strand.ts'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ── Config ──────────────────────────────────────────────────────────

type EvictionRule = 'none' | 'random' | 'oldest'

type SimConfig = {
  name: string
  totalOps: number
  capSize: number
  evictionRule: EvictionRule
  consumeSource: boolean
  filterInert: boolean
  initialPool: string[]
  snapshotInterval: number  // pool snapshot every N ops
}

const CONFIGS: SimConfig[] = [
  {
    name: 'random200_filterInert',
    totalOps: 100_000,
    capSize: 200,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
  },
  {
    name: 'random500_filterInert',
    totalOps: 100_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
  },
  {
    name: 'oldest200_filterInert',
    totalOps: 100_000,
    capSize: 200,
    evictionRule: 'oldest',
    consumeSource: false,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
  },
  {
    name: 'random200_consumeSource',
    totalOps: 100_000,
    capSize: 200,
    evictionRule: 'random',
    consumeSource: true,
    filterInert: true,
    initialPool: [...initialStrands],
    snapshotInterval: 1000,
  },
  {
    name: 'diverse_r200_filterInert',
    totalOps: 100_000,
    capSize: 200,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [
      'ACGC', 'ACGG', 'GCAC', 'GGAC', 'ACGCGG', 'GGACGC',
      'AGGC', 'AGGG', 'GCAG', 'CAACGC', 'TAACGC',
      'GC', 'GG', 'GCGG', 'ACGT', 'TGCA', 'ATCG',
      'GCACGGAC', 'ACGCAGGG', 'GGACGCAG',
    ],
    snapshotInterval: 1000,
  },
  {
    name: 'diverse_r500_filterInert',
    totalOps: 100_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [
      'ACGC', 'ACGG', 'GCAC', 'GGAC', 'ACGCGG', 'GGACGC',
      'AGGC', 'AGGG', 'GCAG', 'CAACGC', 'TAACGC',
      'GC', 'GG', 'GCGG', 'ACGT', 'TGCA', 'ATCG',
      'GCACGGAC', 'ACGCAGGG', 'GGACGCAG',
    ],
    snapshotInterval: 1000,
  },
  {
    name: 'diverse_r200_noFilter',
    totalOps: 100_000,
    capSize: 200,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: false,
    initialPool: [
      'ACGC', 'ACGG', 'GCAC', 'GGAC', 'ACGCGG', 'GGACGC',
      'AGGC', 'AGGG', 'GCAG', 'CAACGC', 'TAACGC',
      'GC', 'GG', 'GCGG', 'ACGT', 'TGCA', 'ATCG',
      'GCACGGAC', 'ACGCAGGG', 'GGACGCAG',
    ],
    snapshotInterval: 1000,
  },
  {
    name: 'diverse_massive_r500',
    totalOps: 100_000,
    capSize: 500,
    evictionRule: 'random',
    consumeSource: false,
    filterInert: true,
    initialPool: [
      // 10 copies each of cut+insert and del+insert enzymes
      ...Array(10).fill('ACGC'),    // [cut, inc] binds=G
      ...Array(10).fill('ACGG'),    // [cut, ing] binds=G
      ...Array(10).fill('AGGC'),    // [del, inc] binds=G
      ...Array(10).fill('AGGG'),    // [del, ing] binds=G
      // 10 copies of A/T inserters
      ...Array(10).fill('GA'),      // [ina] binds=A — inserts A
      ...Array(10).fill('GT'),      // [int] binds=C — inserts T
      // insert C/G for balance
      ...Array(5).fill('GC'),       // [inc] binds=G
      ...Array(5).fill('GG'),       // [ing] binds=G
      // diverse substrates with A/T
      ...Array(5).fill('ACGT'),
      ...Array(5).fill('TGCA'),
      ...Array(5).fill('ATCG'),
      ...Array(5).fill('GCAT'),
      // longer cut+insert combos
      ...Array(5).fill('GCACGGAC'),  // [inc, cut, ing, cut]
      ...Array(5).fill('ACGCAGGG'),  // [cut, inc, del, ing]
    ],
    snapshotInterval: 1000,
  },
]

// ── Helpers ─────────────────────────────────────────────────────────

const enzymeCache = new Map<string, Enzyme[]>()

function cachedTranslate(strand: string): Enzyme[] {
  let enzymes = enzymeCache.get(strand)
  if (enzymes === undefined) {
    enzymes = translate(strand)
    enzymeCache.set(strand, enzymes)
  }
  return enzymes
}

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

// ── Types for logged data ───────────────────────────────────────────

type OpRecord = {
  op: number
  catalyst: string
  enzymeAminos: string[]
  substrate: string
  bindPos: number
  products: string[]
}

type Snapshot = {
  op: number
  pool: Record<string, number>  // strand → count
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
  // We don't store all ops in memory — write them streaming
}

// ── Simulation ──────────────────────────────────────────────────────

function runSim(config: SimConfig): SimResult {
  const pool = [...config.initialPool]
  enzymeCache.clear()

  const productionGraph = new Map<string, Map<string, number>>()
  const snapshots: Snapshot[] = []
  let ops = 0
  let attempts = 0

  // Take initial snapshot
  snapshots.push(takeSnapshot(pool, 0))

  const opLog: OpRecord[] = []

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

    // Remove consumed strands
    if (config.consumeSource && sourceIdx !== targetIdx) {
      const hi = Math.max(sourceIdx, targetIdx)
      const lo = Math.min(sourceIdx, targetIdx)
      pool.splice(hi, 1)
      pool.splice(lo, 1)
    } else {
      pool.splice(targetIdx, 1)
    }

    const producedStrands: string[] = []
    for (const r of results) {
      if (r.length === 0) continue
      if (config.filterInert && cachedTranslate(r).length === 0) continue
      pool.push(r)
      producedStrands.push(r)

      // Record production edge — ONLY for genuinely novel products
      // Skip identity operations where the result is the same as the substrate
      if (r !== target) {
        let targets = productionGraph.get(source)
        if (!targets) {
          targets = new Map()
          productionGraph.set(source, targets)
        }
        targets.set(r, (targets.get(r) || 0) + 1)
      }
    }

    ops++

    // Log first 5000 ops in detail for tracing
    if (ops <= 5000) {
      opLog.push({
        op: ops,
        catalyst: source,
        enzymeAminos: enzyme.aminos,
        substrate: target,
        bindPos,
        products: producedStrands,
      })
    }

    // Evict
    evict(pool, config.evictionRule, config.capSize)

    // Snapshot
    if (ops % config.snapshotInterval === 0) {
      snapshots.push(takeSnapshot(pool, ops))
    }

    // Prune production graph periodically
    if (ops % 5000 === 0) {
      const poolSet = new Set(pool)
      for (const [src, tgts] of productionGraph) {
        if (!poolSet.has(src)) {
          productionGraph.delete(src)
          continue
        }
        for (const [tgt] of tgts) {
          if (!poolSet.has(tgt)) tgts.delete(tgt)
        }
        if (tgts.size === 0) productionGraph.delete(src)
      }
    }

    // Progress
    if (ops % 10000 === 0) {
      console.log(`  [${config.name}] ${ops}/${config.totalOps} ops, pool=${pool.length}, unique=${new Set(pool).size}`)
    }
  }

  // Final snapshot
  snapshots.push(takeSnapshot(pool, ops))

  // Flatten production graph
  const productionEdges: ProductionEdge[] = []
  for (const [catalyst, tgts] of productionGraph) {
    for (const [product, count] of tgts) {
      productionEdges.push({ catalyst, product, count })
    }
  }
  productionEdges.sort((a, b) => b.count - a.count)

  return {
    config,
    totalAttempts: attempts,
    totalProductiveOps: ops,
    snapshots,
    productionEdges,
  }
}

function takeSnapshot(pool: string[], op: number): Snapshot {
  const freq: Record<string, number> = {}
  for (const s of pool) {
    freq[s] = (freq[s] || 0) + 1
  }
  return {
    op,
    pool: freq,
    poolSize: pool.length,
    uniqueCount: Object.keys(freq).length,
  }
}

// ── Main ────────────────────────────────────────────────────────────

const outDir = join(import.meta.dirname!, '..', 'data', 'quest_findings')
mkdirSync(outDir, { recursive: true })

// Allow running a single config by name: npx tsx quest/sim.ts random200_filterInert
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
  console.log(`  ${config.totalOps} ops, cap=${config.capSize}, eviction=${config.evictionRule}, consumeSource=${config.consumeSource}, filterInert=${config.filterInert}`)

  const t0 = Date.now()
  const result = runSim(config)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`  Done in ${elapsed}s. ${result.totalAttempts} attempts, ${result.totalProductiveOps} productive ops`)
  console.log(`  Final pool: ${result.snapshots[result.snapshots.length - 1].poolSize} strands, ${result.snapshots[result.snapshots.length - 1].uniqueCount} unique`)
  console.log(`  Production edges: ${result.productionEdges.length}`)

  const outPath = join(outDir, `${config.name}.json`)
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`  Saved to ${outPath}`)
}

console.log('\nAll done.')
