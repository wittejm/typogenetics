import { BASE_NULL, BASE_ENCODE, L_MAX, F_MAX } from './constants'

export type BatchState = {
  B: number
  L: number
  F: number
  primary: Int8Array       // B * L
  secondary: Int8Array     // B * L
  strandLen: Int32Array    // B
  cursor: Int32Array       // B
  copyMode: Uint8Array     // B
  onSecondary: Uint8Array  // B
  terminated: Uint8Array   // B
  fragPrimary: Int8Array   // B * F * L
  fragSecondary: Int8Array // B * F * L
  fragLen: Int32Array      // B * F
  fragCount: Int32Array    // B
}

export function allocate(B: number, L = L_MAX, F = F_MAX): BatchState {
  return {
    B, L, F,
    primary: new Int8Array(B * L).fill(BASE_NULL),
    secondary: new Int8Array(B * L).fill(BASE_NULL),
    strandLen: new Int32Array(B),
    cursor: new Int32Array(B),
    copyMode: new Uint8Array(B),
    onSecondary: new Uint8Array(B),
    terminated: new Uint8Array(B),
    fragPrimary: new Int8Array(B * F * L).fill(BASE_NULL),
    fragSecondary: new Int8Array(B * F * L).fill(BASE_NULL),
    fragLen: new Int32Array(B * F),
    fragCount: new Int32Array(B),
  }
}

export function initElement(state: BatchState, b: number, strand: string, cursorPos: number): void {
  const { L, F } = state
  const offset = b * L

  // Clear strand
  state.primary.fill(BASE_NULL, offset, offset + L)
  state.secondary.fill(BASE_NULL, offset, offset + L)

  // Write bases
  const len = Math.min(strand.length, L)
  for (let i = 0; i < len; i++) {
    state.primary[offset + i] = BASE_ENCODE[strand[i] as keyof typeof BASE_ENCODE] ?? BASE_NULL
  }
  state.strandLen[b] = len
  state.cursor[b] = cursorPos
  state.copyMode[b] = 0
  state.onSecondary[b] = 0
  state.terminated[b] = 0

  // Clear fragments
  const fragOffset = b * F * L
  state.fragPrimary.fill(BASE_NULL, fragOffset, fragOffset + F * L)
  state.fragSecondary.fill(BASE_NULL, fragOffset, fragOffset + F * L)
  state.fragLen.fill(0, b * F, (b + 1) * F)
  state.fragCount[b] = 0
}
