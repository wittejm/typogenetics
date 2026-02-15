/**
 * Trace the mechanism of the top mutual pairs.
 * Specifically: GGG ↔ GGC, GCG ↔ GCC, and the self-producers.
 */

import { translate } from '../src/model/ribosome.ts'
import { parsePrimaryStrand, collectResults, strandToString } from '../src/model/collect.ts'
import { bind, runAll } from '../src/model/execution.ts'

function traceAll(catalyst: string, substrate: string) {
  const enzymes = translate(catalyst)
  if (enzymes.length === 0) return
  const enz = enzymes[0]
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

console.log('=== MUTUAL PAIR: GGG ↔ GGC ===')
console.log('Both encode [ing] binds=G\n')

console.log('GGG producing GGC:')
// GGG's enzyme [ing] inserts G. What substrate → GGC?
for (const sub of ['GC', 'GG', 'CC', 'CG', 'GGC', 'GCC', 'CGC', 'CGG']) {
  traceAll('GGG', sub)
}

console.log('\nGGC producing GGG:')
for (const sub of ['GG', 'GC', 'CC', 'CG', 'GGG', 'GCC', 'CGC', 'CGG']) {
  traceAll('GGC', sub)
}

console.log('\n=== MUTUAL PAIR: GCG ↔ GCC ===')
console.log('GCG encodes:', translate('GCG').map(e => `[${e.aminos}|${e.bindingPref}]`).join(', '))
console.log('GCC encodes:', translate('GCC').map(e => `[${e.aminos}|${e.bindingPref}]`).join(', '))
console.log()

console.log('GCG producing GCC:')
for (const sub of ['GC', 'GG', 'CC', 'CG', 'GCC', 'GGC', 'CGC', 'CGG', 'GCCC', 'GCCG']) {
  traceAll('GCG', sub)
}

console.log('\nGCC producing GCG:')
for (const sub of ['GC', 'GG', 'CC', 'CG', 'GCG', 'GGC', 'CGC', 'CGG', 'GCG', 'GCGG']) {
  traceAll('GCC', sub)
}

console.log('\n=== SELF-PRODUCERS ===')
console.log('\nGCC self-production (GCC → GCC):')
console.log('GCC = [inc] binds=G. Needs to produce GCC from some substrate.')
for (const sub of ['GC', 'GG', 'CC', 'CG']) {
  traceAll('GCC', sub)
}

console.log('\nGGG self-production (GGG → GGG):')
for (const sub of ['GG', 'GC', 'CC', 'CG']) {
  traceAll('GGG', sub)
}

console.log('\n=== BIGGER CYCLE: CGGCCGCCCG → GG → GGG → CCCGGGCGG → CGGCCGCCCG ===')
console.log('\nCGGCCGCCCG encodes:', translate('CGGCCGCCCG').map(e => `[${e.aminos}|${e.bindingPref}]`).join(', '))
console.log('CCCGGGCGG encodes:', translate('CCCGGGCGG').map(e => `[${e.aminos}|${e.bindingPref}]`).join(', '))

console.log('\nCGGCCGCCCG producing GG:')
for (const sub of ['GG', 'GC', 'CG', 'CC', 'GGG', 'GGC', 'CGG', 'GCC', 'GGCC', 'CCGG', 'GCGC', 'CGCG', 'AGC', 'GAG', 'TAG', 'GAT', 'GACG', 'AGCG']) {
  traceAll('CGGCCGCCCG', sub)
}

console.log('\nGG producing GGG:')
traceAll('GG', 'GG')
traceAll('GG', 'GC')
traceAll('GG', 'CG')

console.log('\nGGG producing CCCGGGCGG:')
for (const sub of ['CCCGGCGG', 'CCGGGCGG', 'CCCGGGCG', 'CCCGGCG', 'CCGGCGG', 'CCCGGGCGG']) {
  traceAll('GGG', sub)
}

console.log('\nCCCGGGCGG producing CGGCCGCCCG:')
for (const sub of ['CGGCCGCCG', 'CGGCCGCCCG', 'CGGCGCCCG', 'CGCCGCCCG', 'CGGCCGCCC', 'CGGCCGCCCG']) {
  traceAll('CCCGGGCGG', sub)
}
