import type { Enzyme } from '../model/types'
import { AMINO_ENCODE, AMINO_NOP, L_MAX } from './constants'
import { allocate, initElement } from './state'
import { stepBatch } from './step'
import { collectElement } from './collect'

export { allocate, initElement, type BatchState } from './state'
export { stepBatch } from './step'
export { collectElement } from './collect'

/**
 * Execute a batch of enzyme-on-strand operations and return output strands.
 * Drop-in replacement for running bind() + runAll() + collectResults() on
 * each (enzyme, target, bindPos) triple, but using flat typed arrays.
 */
export function executeBatch(
  enzymes: Enzyme[],
  targets: string[],
  bindPositions: number[],
): string[][] {
  const B = enzymes.length

  // Find max enzyme length and max strand length
  let maxAminos = 0
  let maxStrandLen = 0
  for (let b = 0; b < B; b++) {
    if (enzymes[b].aminos.length > maxAminos) maxAminos = enzymes[b].aminos.length
    if (targets[b].length > maxStrandLen) maxStrandLen = targets[b].length
  }

  // L must fit strand + possible inserts (one insert per amino, max)
  const L = Math.min(Math.max(maxStrandLen + maxAminos, 16), L_MAX)

  // Encode all enzyme amino sequences
  const encoded: Int8Array[] = new Array(B)
  for (let b = 0; b < B; b++) {
    const aminos = enzymes[b].aminos
    const arr = new Int8Array(maxAminos).fill(AMINO_NOP)
    for (let i = 0; i < aminos.length; i++) {
      arr[i] = AMINO_ENCODE[aminos[i]]
    }
    encoded[b] = arr
  }

  // Allocate and initialize state
  const state = allocate(B, L)
  for (let b = 0; b < B; b++) {
    initElement(state, b, targets[b], bindPositions[b])
  }

  // Recurrent loop: step through amino sequence
  const aminoBuf = new Int8Array(B)
  for (let t = 0; t < maxAminos; t++) {
    for (let b = 0; b < B; b++) {
      aminoBuf[b] = encoded[b][t]
    }
    stepBatch(state, aminoBuf)
  }

  // Collect results
  const results: string[][] = new Array(B)
  for (let b = 0; b < B; b++) {
    results[b] = collectElement(state, b)
  }

  return results
}
