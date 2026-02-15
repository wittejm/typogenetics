/**
 * Trace specific enzyme operations to understand cycle mechanisms.
 * Answers: when catalyst X acts on substrate S, what products emerge and why?
 *
 * Usage: npx tsx quest/trace.ts
 */

import { translate } from '../src/model/ribosome.ts'
import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect.ts'
import { bind, runAll } from '../src/model/execution.ts'
import type { Enzyme } from '../src/model/types.ts'

function traceInteraction(catalyst: string, substrate: string) {
  const enzymes = translate(catalyst)
  if (enzymes.length === 0) {
    console.log(`  ${catalyst} encodes NO enzymes`)
    return
  }

  for (let ei = 0; ei < enzymes.length; ei++) {
    const enz = enzymes[ei]
    console.log(`  Enzyme ${ei}: [${enz.aminos.join(', ')}] binds=${enz.bindingPref}`)

    // Find all binding positions
    const positions: number[] = []
    for (let i = 0; i < substrate.length; i++) {
      if (substrate[i] === enz.bindingPref) positions.push(i)
    }

    if (positions.length === 0) {
      console.log(`    No binding sites for '${enz.bindingPref}' in "${substrate}"`)
      continue
    }

    for (const pos of positions) {
      const ds = parsePrimaryStrand(substrate)
      const state = bind(ds, pos)
      const final = runAll(state, enz)
      const results = collectResults(final).map(strandToString)

      const nonTrivial = results.filter(r => r !== substrate)
      const marker = nonTrivial.length > 0 ? ' ←' : ''
      console.log(`    Bind @${pos}: "${substrate}" → [${results.map(r => `"${r}"`).join(', ')}]${marker}`)
    }
  }
}

// ── Trace the top cycles from random200_filterInert ──

console.log('=== UNDERSTANDING THE KEY STRANDS ===\n')

const keyStrands = ['CG', 'GC', 'GG', 'GCC', 'CGC', 'CGG', 'GGG', 'CGCC', 'GCCC']

for (const s of keyStrands) {
  const enzymes = translate(s)
  console.log(`${s}: encodes ${enzymes.length} enzyme(s)`)
  for (let i = 0; i < enzymes.length; i++) {
    console.log(`  [${enzymes[i].aminos.join(', ')}] binds=${enzymes[i].bindingPref}`)
  }
}

console.log('\n=== TOP CYCLE: CG → GC → GCC → CGC → CG ===\n')

console.log('Step 1: CG catalyzes → produces GC?')
console.log('CG acting on various substrates:')
for (const sub of keyStrands) {
  traceInteraction('CG', sub)
}

console.log('\nStep 2: GC catalyzes → produces GCC?')
console.log('GC acting on various substrates:')
for (const sub of keyStrands) {
  traceInteraction('GC', sub)
}

console.log('\nStep 3: GCC catalyzes → produces CGC?')
console.log('GCC acting on various substrates:')
for (const sub of keyStrands) {
  traceInteraction('GCC', sub)
}

console.log('\nStep 4: CGC catalyzes → produces CG?')
console.log('CGC acting on various substrates:')
for (const sub of keyStrands) {
  traceInteraction('CGC', sub)
}

// Now let's also look at what produces CG from longer strands
console.log('\n=== WHAT PRODUCES CG? ===\n')
console.log('Testing catalysts on substrates that might yield CG:')

const longerStrands = ['ACGT', 'CGATCG', 'CGATAAGCGT', 'TACAAACCCG', 'ACCAAAGATG',
                        'CGCG', 'GCGC', 'CGCGC', 'GCGCG', 'CCGG', 'GGCC',
                        'CGGC', 'GCCG', 'CGCC', 'GCCG']

for (const catalyst of ['CG', 'GC', 'GCC', 'CGC', 'GG', 'CGG', 'GGG']) {
  console.log(`\nCatalyst: ${catalyst}`)
  for (const sub of longerStrands) {
    const enzymes = translate(catalyst)
    for (const enz of enzymes) {
      for (let i = 0; i < sub.length; i++) {
        if (sub[i] === enz.bindingPref) {
          const ds = parsePrimaryStrand(sub)
          const state = bind(ds, i)
          const final = runAll(state, enz)
          const results = collectResults(final).map(strandToString)
          if (results.some(r => r === 'CG' || r === 'GC' || r === 'CGC' || r === 'GCC')) {
            console.log(`  ${catalyst} on "${sub}" @${i} → [${results.join(', ')}]`)
          }
        }
      }
    }
  }
}
