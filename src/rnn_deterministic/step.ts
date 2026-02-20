import type { BatchState } from './state'
import {
  BASE_NULL, BASE_A, BASE_C, BASE_G, BASE_T,
  COMPLEMENT, AMINO_NOP,
  AMINO_CUT, AMINO_DEL, AMINO_SWI, AMINO_MVR, AMINO_MVL,
  AMINO_COP, AMINO_OFF,
  AMINO_INA, AMINO_INC, AMINO_ING, AMINO_INT,
  AMINO_RPY, AMINO_RPU, AMINO_LPY, AMINO_LPU,
} from './constants'

/**
 * Apply one amino to each batch element. aminos[b] is the amino for element b.
 * Elements that are already terminated or receive AMINO_NOP are skipped.
 */
export function stepBatch(state: BatchState, aminos: Int8Array): void {
  const { B } = state
  for (let b = 0; b < B; b++) {
    if (state.terminated[b]) continue
    const amino = aminos[b]
    if (amino === AMINO_NOP) {
      state.terminated[b] = 1
      continue
    }
    applyAmino(state, b, amino)
    // Bounds check: cursor fell off?
    const c = state.cursor[b]
    if (c < 0 || c >= state.strandLen[b]) {
      state.terminated[b] = 1
    }
  }
}

function applyAmino(state: BatchState, b: number, amino: number): void {
  switch (amino) {
    case AMINO_MVR: applyMove(state, b, 1); break
    case AMINO_MVL: applyMove(state, b, -1); break
    case AMINO_COP: applyCop(state, b); break
    case AMINO_OFF: state.copyMode[b] = 0; break
    case AMINO_SWI: state.onSecondary[b] ^= 1; break
    case AMINO_CUT: applyCut(state, b); break
    case AMINO_DEL: applyDel(state, b); break
    case AMINO_INA: applyInsert(state, b, BASE_A); break
    case AMINO_INC: applyInsert(state, b, BASE_C); break
    case AMINO_ING: applyInsert(state, b, BASE_G); break
    case AMINO_INT: applyInsert(state, b, BASE_T); break
    case AMINO_RPY: {
      const dir = state.onSecondary[b] ? -1 : 1
      applySearch(state, b, dir, false)
      break
    }
    case AMINO_RPU: {
      const dir = state.onSecondary[b] ? -1 : 1
      applySearch(state, b, dir, true)
      break
    }
    case AMINO_LPY: {
      const dir = state.onSecondary[b] ? 1 : -1
      applySearch(state, b, dir, false)
      break
    }
    case AMINO_LPU: {
      const dir = state.onSecondary[b] ? 1 : -1
      applySearch(state, b, dir, true)
      break
    }
  }
}

function applyMove(state: BatchState, b: number, dir: number): void {
  const { L } = state
  const offset = b * L
  const newCursor = state.cursor[b] + dir
  if (state.copyMode[b] && !state.onSecondary[b] &&
      newCursor >= 0 && newCursor < state.strandLen[b]) {
    const p = state.primary[offset + newCursor]
    if (p !== BASE_NULL) {
      state.secondary[offset + newCursor] = COMPLEMENT[p]
    }
  }
  state.cursor[b] = newCursor
}

function applyCop(state: BatchState, b: number): void {
  const { L } = state
  const offset = b * L
  const cursor = state.cursor[b]
  if (!state.onSecondary[b]) {
    const p = state.primary[offset + cursor]
    if (p !== BASE_NULL) {
      state.secondary[offset + cursor] = COMPLEMENT[p]
    }
  }
  state.copyMode[b] = 1
}

function applyCut(state: BatchState, b: number): void {
  const { L, F } = state
  const offset = b * L
  const cursor = state.cursor[b]
  const len = state.strandLen[b]

  if (cursor + 1 >= len) return // nothing to the right

  const fc = state.fragCount[b]
  if (fc >= F) return // fragment buffer full

  const fragOffset = (b * F + fc) * L
  const rightLen = len - cursor - 1

  for (let i = 0; i < rightLen; i++) {
    state.fragPrimary[fragOffset + i] = state.primary[offset + cursor + 1 + i]
    state.fragSecondary[fragOffset + i] = state.secondary[offset + cursor + 1 + i]
    state.primary[offset + cursor + 1 + i] = BASE_NULL
    state.secondary[offset + cursor + 1 + i] = BASE_NULL
  }
  state.fragLen[b * F + fc] = rightLen
  state.fragCount[b] = fc + 1
  state.strandLen[b] = cursor + 1
}

function applyDel(state: BatchState, b: number): void {
  const { L } = state
  const offset = b * L
  const cursor = state.cursor[b]

  if (state.onSecondary[b]) {
    // Null out secondary at cursor
    state.secondary[offset + cursor] = BASE_NULL
  } else {
    // Remove cell: shift everything after cursor left by 1
    const len = state.strandLen[b]
    for (let i = cursor; i < len - 1; i++) {
      state.primary[offset + i] = state.primary[offset + i + 1]
      state.secondary[offset + i] = state.secondary[offset + i + 1]
    }
    state.primary[offset + len - 1] = BASE_NULL
    state.secondary[offset + len - 1] = BASE_NULL
    state.strandLen[b] = len - 1
  }
}

function applyInsert(state: BatchState, b: number, base: number): void {
  const { L } = state
  const offset = b * L
  const cursor = state.cursor[b]
  const len = state.strandLen[b]

  if (len >= L) return // can't grow past L_MAX

  // Shift everything after cursor right by 1
  for (let i = len; i > cursor + 1; i--) {
    state.primary[offset + i] = state.primary[offset + i - 1]
    state.secondary[offset + i] = state.secondary[offset + i - 1]
  }

  if (state.onSecondary[b]) {
    state.primary[offset + cursor + 1] = BASE_NULL
    state.secondary[offset + cursor + 1] = base
  } else {
    state.primary[offset + cursor + 1] = base
    state.secondary[offset + cursor + 1] = BASE_NULL
  }

  state.strandLen[b] = len + 1
  state.cursor[b] = cursor + 1
}

function applySearch(state: BatchState, b: number, dir: number, purine: boolean): void {
  const { L } = state
  const offset = b * L
  const onSec = state.onSecondary[b]
  const copyOn = state.copyMode[b]
  const len = state.strandLen[b]
  let pos = state.cursor[b] + dir

  while (pos >= 0 && pos < len) {
    // Copy complement if in copy mode on primary strand
    if (copyOn && !onSec) {
      const p = state.primary[offset + pos]
      if (p !== BASE_NULL) {
        state.secondary[offset + pos] = COMPLEMENT[p]
      }
    }
    // Check match
    const base = onSec ? state.secondary[offset + pos] : state.primary[offset + pos]
    if (base !== BASE_NULL) {
      const match = purine
        ? (base === BASE_A || base === BASE_G)
        : (base === BASE_C || base === BASE_T)
      if (match) {
        state.cursor[b] = pos
        return
      }
    }
    pos += dir
  }
  // Fell off — cursor goes out of bounds, step() will set terminated
  state.cursor[b] = pos
}
