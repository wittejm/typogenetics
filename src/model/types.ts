export type Base = 'A' | 'C' | 'G' | 'T'

export type Amino =
  | 'cut'
  | 'del'
  | 'swi'
  | 'mvr'
  | 'mvl'
  | 'cop'
  | 'off'
  | 'ina'
  | 'inc'
  | 'ing'
  | 'int'
  | 'rpy'
  | 'rpu'
  | 'lpy'
  | 'lpu'

export type Turn = 's' | 'r' | 'l'

export type DualCell = {
  primary: Base | null
  secondary: Base | null
}

export type DualStrand = DualCell[]

export type Enzyme = {
  aminos: Amino[]
  bindingPref: Base
}

export const COMPLEMENT: ReadonlyMap<Base, Base> = new Map([
  ['A', 'T'],
  ['T', 'A'],
  ['C', 'G'],
  ['G', 'C'],
])

export const DUPLET_MAP: ReadonlyMap<string, [Amino | 'pun', Turn | null]> = new Map([
  ['AA', ['pun', null]],
  ['AC', ['cut', 's']],
  ['AG', ['del', 's']],
  ['AT', ['swi', 'r']],
  ['CA', ['mvr', 's']],
  ['CC', ['mvl', 's']],
  ['CG', ['cop', 'r']],
  ['CT', ['off', 'l']],
  ['GA', ['ina', 's']],
  ['GC', ['inc', 'r']],
  ['GG', ['ing', 'r']],
  ['GT', ['int', 'l']],
  ['TA', ['rpy', 'r']],
  ['TC', ['rpu', 'l']],
  ['TG', ['lpy', 'l']],
  ['TT', ['lpu', 'l']],
])
