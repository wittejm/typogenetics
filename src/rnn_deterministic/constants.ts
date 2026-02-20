import type { Amino, Base } from '../model/types'

// Base encoding
export const BASE_A = 0
export const BASE_C = 1
export const BASE_G = 2
export const BASE_T = 3
export const BASE_NULL = 4

export const COMPLEMENT = new Int8Array([3, 2, 1, 0, 4])
// A(0)→T(3), C(1)→G(2), G(2)→C(1), T(3)→A(0), NULL(4)→NULL(4)

// Amino encoding
export const AMINO_CUT = 0
export const AMINO_DEL = 1
export const AMINO_SWI = 2
export const AMINO_MVR = 3
export const AMINO_MVL = 4
export const AMINO_COP = 5
export const AMINO_OFF = 6
export const AMINO_INA = 7
export const AMINO_INC = 8
export const AMINO_ING = 9
export const AMINO_INT = 10
export const AMINO_RPY = 11
export const AMINO_RPU = 12
export const AMINO_LPY = 13
export const AMINO_LPU = 14
export const AMINO_NOP = 15 // padding for enzymes shorter than max

// Limits
export const L_MAX = 64
export const F_MAX = 16

// Lookup tables
export const AMINO_ENCODE: Record<Amino, number> = {
  cut: AMINO_CUT, del: AMINO_DEL, swi: AMINO_SWI,
  mvr: AMINO_MVR, mvl: AMINO_MVL, cop: AMINO_COP, off: AMINO_OFF,
  ina: AMINO_INA, inc: AMINO_INC, ing: AMINO_ING, int: AMINO_INT,
  rpy: AMINO_RPY, rpu: AMINO_RPU, lpy: AMINO_LPY, lpu: AMINO_LPU,
}

export const AMINO_DECODE: Amino[] = [
  'cut', 'del', 'swi', 'mvr', 'mvl', 'cop', 'off',
  'ina', 'inc', 'ing', 'int', 'rpy', 'rpu', 'lpy', 'lpu',
]

export const BASE_ENCODE: Record<Base, number> = {
  A: BASE_A, C: BASE_C, G: BASE_G, T: BASE_T,
}

export const BASE_DECODE: Base[] = ['A', 'C', 'G', 'T']
