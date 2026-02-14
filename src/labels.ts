import type { Amino } from './model/types'

export const aminoLabel: Record<Amino, string> = {
  cut: 'cut',
  del: 'del',
  swi: 'swi',
  mvr: 'mv→',
  mvl: '←mv',
  cop: 'copy',
  off: 'off',
  ina: '+A',
  inc: '+C',
  ing: '+G',
  int: '+T',
  rpy: 'py→',
  rpu: 'pu→',
  lpy: '←py',
  lpu: '←pu',
}
