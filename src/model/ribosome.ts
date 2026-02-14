import type { Amino, Base, Enzyme } from './types'
import { DUPLET_MAP } from './types'

export function translate(strand: string): Enzyme[] {
  const results: Enzyme[] = []
  let current: Amino[] = []
  let direction = 0

  for (let i = 0; i + 1 < strand.length; i += 2) {
    const duplet = strand.slice(i, i + 2)
    const entry = DUPLET_MAP.get(duplet)
    if (!entry) continue
    const [amino, turn] = entry

    if (amino === 'pun') {
      if (current.length > 0) {
        results.push({ aminos: current, bindingPref: directionToPreference(direction) })
        current = []
        direction = 0
      }
    } else {
      current.push(amino)
      direction += turn === 'r' ? 1 : turn === 'l' ? -1 : 0
    }
  }

  if (current.length > 0) {
    results.push({ aminos: current, bindingPref: directionToPreference(direction) })
  }

  return results
}

const PREFS: readonly Base[] = ['A', 'G', 'T', 'C']

function directionToPreference(direction: number): Base {
  const dirMod = ((direction % 4) + 4) % 4
  return PREFS[dirMod]
}
