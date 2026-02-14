import type { Base, DualStrand } from './types'
import type { ExecState } from './execution'

export function parsePrimaryStrand(s: string): DualStrand {
  return s.split('').map(ch => ({
    primary: ch as Base,
    secondary: null,
  }))
}

export function strandToString(bases: Base[]): string {
  return bases.join('')
}

export function collectResults(state: ExecState): Base[][] {
  const results: Base[][] = []
  collectFromDualStrand(state.strand, results)
  for (const frag of state.fragments) {
    collectFromDualStrand(frag, results)
  }
  return results
}

function collectFromDualStrand(ds: DualStrand, results: Base[][]) {
  // Primary strand: collect non-null primaries
  const primary: Base[] = []
  for (const cell of ds) {
    if (cell.primary != null) primary.push(cell.primary)
  }
  if (primary.length > 0) results.push(primary)

  // Secondary strand: collect contiguous runs of non-null secondaries, reversed (antiparallel)
  let run: Base[] = []
  for (let i = 0; i < ds.length; i++) {
    if (ds[i].secondary != null) {
      run.push(ds[i].secondary!)
    } else {
      if (run.length > 0) {
        results.push(run.reverse())
        run = []
      }
    }
  }
  if (run.length > 0) {
    results.push(run.reverse())
  }
}
