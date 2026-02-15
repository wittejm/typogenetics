/**
 * Design initial pools that might break the C/G trap.
 * Find strands that encode diverse enzyme operations.
 */

import { translate } from '../src/model/ribosome.ts'

// What duplets give us the interesting operations?
// AC → cut (s)   — cuts the strand at current position
// AG → del (s)   — deletes base at current position
// AT → swi (r)   — switches between primary/secondary
// CA → mvr (s)   — move right
// TA → rpy (r)   — search right for pyrimidine
// TC → rpu (l)   — search right for purine
// TG → lpy (l)   — search left for pyrimidine
// TT → lpu (l)   — search left for purine

console.log('=== ENZYME DESIGN ===\n')
console.log('Target: strands encoding enzymes with BOTH insertion and cutting/deletion')
console.log('Key duplets needed: AC (cut), AG (del), GC (inc), GG (ing)\n')

// Design strands and show their enzymes
function show(strand: string) {
  const enzymes = translate(strand)
  for (const e of enzymes) {
    console.log(`  ${strand.padEnd(20)} → [${e.aminos.join(', ')}] binds=${e.bindingPref}`)
  }
  if (enzymes.length === 0) {
    console.log(`  ${strand.padEnd(20)} → NO ENZYME`)
  }
}

console.log('--- Strands with cut + insert ---')
show('ACGC')    // cut, inc
show('ACGG')    // cut, ing
show('GCAC')    // inc, cut
show('GGAC')    // ing, cut
show('ACGCGG')  // cut, inc, ing
show('GGACGC')  // ing, cut, inc
show('GCGGAC')  // inc, ing, cut
show('ACGGAC')  // cut, ing, cut

console.log('\n--- Strands with del + insert ---')
show('AGGC')    // del, inc
show('AGGG')    // del, ing
show('GCAG')    // inc, del
show('GGAG')    // ing, del
show('AGGCGG')  // del, inc, ing
show('GCAGGG')  // inc, del, ing

console.log('\n--- Strands with move + cut + insert ---')
show('CAACGC')  // mvr, cut, inc
show('CAGCAC')  // mvr, inc, cut
show('CAGGAC')  // mvr, ing, cut
show('GCACCA')  // inc, cut, mvr (can inc then cut then move)

console.log('\n--- Strands with search + cut ---')
show('TAACGC')  // rpy, cut, inc
show('TCACGC')  // rpu, cut, inc

console.log('\n--- Longer diverse strands ---')
show('ACGCGGAC')    // cut, inc, ing, cut
show('GCACGGAG')    // inc, cut, ing, del
show('GGACGCAG')    // ing, cut, inc, del
show('CAACGGCAAC')  // mvr, cut, inc, mvr, cut (with AA pun splitting)
show('GCGGACACGC')  // inc, ing, cut, cut, inc

// Check what happens with strands that have AA (pun)
console.log('\n--- Strands with punctuation splits ---')
show('GCAAGC')  // inc, [pun], inc → two enzymes!
show('GGAAGG')  // ing, [pun], ing → two enzymes
show('ACAAGC')  // cut, [pun], inc → cut enzyme + inc enzyme

// Design a pool of 20 diverse strands
console.log('\n\n=== PROPOSED DIVERSE POOL ===\n')

const diversePool = [
  // Cut + insert combos (the key to cycle closure)
  'ACGC',     // [cut, inc]
  'ACGG',     // [cut, ing]
  'GCAC',     // [inc, cut]
  'GGAC',     // [ing, cut]
  'ACGCGG',   // [cut, inc, ing]
  'GGACGC',   // [ing, cut, inc]

  // Del + insert combos
  'AGGC',     // [del, inc]
  'AGGG',     // [del, ing]
  'GCAG',     // [inc, del]

  // Search + action combos
  'CAACGC',   // [mvr, cut, inc]
  'TAACGC',   // [rpy, cut, inc]

  // Pure insert (will these still dominate?)
  'GC',       // [inc]
  'GG',       // [ing]
  'GCGG',     // [inc, ing]

  // Substrates with diverse bases
  'ACGT',     // all 4 bases
  'TGCA',     // all 4 bases
  'ATCG',     // all 4 bases

  // Longer mixed strands
  'GCACGGAC',  // [inc, cut, ing, cut]
  'ACGCAGGG',  // [cut, inc, del, ing]
  'GGACGCAG',  // [ing, cut, inc, del]
]

console.log('Pool of', diversePool.length, 'strands:')
for (const s of diversePool) {
  show(s)
}

// Also test: what binding preferences do these have?
console.log('\n=== BINDING PREFERENCE DISTRIBUTION ===\n')
const prefCounts: Record<string, number> = { A: 0, C: 0, G: 0, T: 0 }
for (const s of diversePool) {
  for (const e of translate(s)) {
    prefCounts[e.bindingPref]++
  }
}
console.log('Binding preferences across all enzymes:')
for (const [base, count] of Object.entries(prefCounts)) {
  console.log(`  ${base}: ${count}`)
}
