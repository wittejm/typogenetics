import type { BatchState } from './state'
import { BASE_NULL, BASE_DECODE } from './constants'

/**
 * Extract output strand strings from a single batch element.
 * Matches the behavior of model/collect.ts collectResults():
 *  - Primary: all non-null bases as a single strand
 *  - Secondary: contiguous non-null runs, each reversed (antiparallel)
 *  - Then same for each fragment
 */
export function collectElement(state: BatchState, b: number): string[] {
  const { L, F } = state
  const results: string[] = []

  // Main strand
  collectFromDual(state.primary, state.secondary, b * L, state.strandLen[b], results)

  // Fragments
  const fc = state.fragCount[b]
  for (let f = 0; f < fc; f++) {
    const fragOffset = (b * F + f) * L
    const fragLen = state.fragLen[b * F + f]
    collectFromDual(state.fragPrimary, state.fragSecondary, fragOffset, fragLen, results)
  }

  return results
}

function collectFromDual(
  primary: Int8Array, secondary: Int8Array,
  offset: number, len: number,
  results: string[],
): void {
  // Primary: collect non-null bases left to right
  let pStr = ''
  for (let i = 0; i < len; i++) {
    const base = primary[offset + i]
    if (base !== BASE_NULL) pStr += BASE_DECODE[base]
  }
  if (pStr.length > 0) results.push(pStr)

  // Secondary: contiguous non-null runs, each reversed
  let run = ''
  for (let i = 0; i < len; i++) {
    const base = secondary[offset + i]
    if (base !== BASE_NULL) {
      run += BASE_DECODE[base]
    } else {
      if (run.length > 0) {
        results.push(reverseStr(run))
        run = ''
      }
    }
  }
  if (run.length > 0) results.push(reverseStr(run))
}

function reverseStr(s: string): string {
  let r = ''
  for (let i = s.length - 1; i >= 0; i--) r += s[i]
  return r
}
