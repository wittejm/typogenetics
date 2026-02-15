/**
 * Trace the GA → GGAC → AC → GA cycle under the cross-alphabet table.
 */

import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect.ts'
import { bind, runAll } from '../src/model/execution.ts'
import type { Amino, Base, Enzyme } from '../src/model/types.ts'
import { DUPLET_MAP } from '../src/model/types.ts'

// Cross-alphabet table
const CROSS_TABLE = new Map([...DUPLET_MAP])
CROSS_TABLE.set('GC', ['ina', 'r'])
CROSS_TABLE.set('GG', ['int', 'r'])
CROSS_TABLE.set('GA', ['inc', 's'])
CROSS_TABLE.set('GT', ['ing', 'l'])

const PREFS: readonly Base[] = ['A', 'G', 'T', 'C']

function translateCross(strand: string): Enzyme[] {
  const results: Enzyme[] = []
  let current: Amino[] = []
  let direction = 0
  for (let i = 0; i + 1 < strand.length; i += 2) {
    const duplet = strand.slice(i, i + 2)
    const entry = CROSS_TABLE.get(duplet)
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

function traceAll(catalyst: string, substrate: string) {
  const enzymes = translateCross(catalyst)
  if (enzymes.length === 0) return
  for (const enz of enzymes) {
    for (let i = 0; i < substrate.length; i++) {
      if (substrate[i] !== enz.bindingPref) continue
      const ds = parsePrimaryStrand(substrate)
      const state = bind(ds, i)
      const final = runAll(state, enz)
      const results = collectResults(final).map(strandToString)
      const novel = results.filter(r => r !== substrate)
      if (novel.length > 0) {
        console.log(`  ${catalyst}[${enz.aminos}|${enz.bindingPref}] on "${substrate}" @${i} → [${results.join(', ')}] (novel: ${novel.join(', ')})`)
      }
    }
  }
}

console.log('=== CROSS-TABLE ENZYME CATALOG ===\n')
for (const s of ['GA', 'AC', 'GGAC', 'GGA', 'GAC', 'GAT', 'GT', 'GC', 'ACT', 'ACC', 'AGA', 'TTAC', 'GCT']) {
  const enz = translateCross(s)
  if (enz.length > 0) {
    for (const e of enz) console.log(`${s.padEnd(10)} → [${e.aminos.join(', ')}] binds=${e.bindingPref}`)
  } else {
    console.log(`${s.padEnd(10)} → NO ENZYME`)
  }
}

console.log('\n=== TOP CYCLE: GA → GGAC → AC → GA (weight 223) ===\n')

console.log('Step 1: GA [inc|A] producing GGAC:')
for (const sub of ['GGA', 'GA', 'GG', 'GGAC', 'GAC', 'TAC', 'CAC', 'TAA', 'GAG', 'GACT', 'TGGA', 'GGAT']) {
  traceAll('GA', sub)
}

console.log('\nStep 2: GGAC [int,cut|G] producing AC:')
for (const sub of ['GAC', 'GAT', 'GA', 'GGA', 'GACT', 'GGAC', 'GAG', 'GACG', 'TGAC', 'AGAC']) {
  traceAll('GGAC', sub)
}

console.log('\nStep 3: AC [cut|A] producing GA:')
for (const sub of ['GAT', 'GAC', 'GA', 'GGA', 'GAG', 'GACT', 'TGAT', 'AGAT', 'GAGA']) {
  traceAll('AC', sub)
}

console.log('\n=== CROSS-CHECK: WHAT SUBSTRATES ARE NEEDED? ===\n')
console.log('The cycle needs: GGA (for step 1), a G-substrate (step 2), an A-substrate (step 3)')
console.log('\nAre the substrates themselves produced by the cycle?')

console.log('\nWhat produces GGA?')
for (const cat of ['GA', 'AC', 'GGAC', 'GT', 'GC', 'GG', 'CC', 'TT']) {
  for (const sub of ['GA', 'GGA', 'GG', 'GC', 'GT', 'TGA', 'AGA', 'CGA', 'TGGA', 'GGA']) {
    const enzymes = translateCross(cat)
    for (const enz of enzymes) {
      for (let i = 0; i < sub.length; i++) {
        if (sub[i] !== enz.bindingPref) continue
        const ds = parsePrimaryStrand(sub)
        const state = bind(ds, i)
        const final = runAll(state, enz)
        const results = collectResults(final).map(strandToString)
        if (results.includes('GGA') && sub !== 'GGA') {
          console.log(`  ${cat}[${enz.aminos}|${enz.bindingPref}] on "${sub}" @${i} → [${results.join(', ')}] ← produces GGA!`)
        }
      }
    }
  }
}
