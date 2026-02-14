import type { Amino, Base, DualCell, DualStrand, Enzyme } from './types'
import { COMPLEMENT } from './types'

export type ExecState = {
  strand: DualStrand
  cursor: number
  onSecondary: boolean
  copyMode: boolean
  pc: number
  fragments: DualStrand[]
  terminated: boolean
}

export function bind(strand: DualStrand, cursor: number): ExecState {
  return {
    strand,
    cursor,
    onSecondary: false,
    copyMode: false,
    pc: 0,
    fragments: [],
    terminated: false,
  }
}

export function step(state: ExecState, enzyme: Enzyme): ExecState {
  if (state.terminated || state.pc >= enzyme.aminos.length) {
    return { ...state, terminated: true }
  }
  const amino = enzyme.aminos[state.pc]
  const next = applyAmino(state, amino)
  // Check if cursor fell off
  if (next.cursor < 0 || next.cursor >= next.strand.length) {
    return { ...next, pc: next.pc, terminated: true }
  }
  return next
}

export function runAll(state: ExecState, enzyme: Enzyme): ExecState {
  let s = state
  while (!s.terminated && s.pc < enzyme.aminos.length) {
    s = step(s, enzyme)
  }
  return s
}

function isPurine(base: Base): boolean {
  return base === 'A' || base === 'G'
}

function isPyrimidine(base: Base): boolean {
  return base === 'C' || base === 'T'
}

function cloneStrand(s: DualStrand): DualStrand {
  return s.map(c => ({ ...c }))
}

function cloneFragments(frags: DualStrand[]): DualStrand[] {
  return frags.map(f => cloneStrand(f))
}

function copyComplement(strand: DualStrand, pos: number): DualStrand {
  const p = strand[pos].primary
  if (p == null) return strand
  const ns = cloneStrand(strand)
  ns[pos] = { ...ns[pos], secondary: COMPLEMENT.get(p)! }
  return ns
}

function applyAmino(state: ExecState, amino: Amino): ExecState {
  const { strand, cursor, onSecondary, copyMode, fragments } = state
  const pc = state.pc + 1

  switch (amino) {
    case 'cut': {
      if (cursor + 1 >= strand.length) {
        // nothing to the right to cut
        return { ...state, pc }
      }
      const left = cloneStrand(strand.slice(0, cursor + 1))
      const right = cloneStrand(strand.slice(cursor + 1))
      return {
        strand: left,
        cursor,
        onSecondary,
        copyMode,
        pc,
        fragments: [...cloneFragments(fragments), right],
        terminated: false,
      }
    }

    case 'del': {
      const ns = cloneStrand(strand)
      if (onSecondary) {
        ns[cursor] = { ...ns[cursor], secondary: null }
        return { ...state, strand: ns, pc }
      } else {
        // Remove the cell entirely
        const newStrand = [...ns.slice(0, cursor), ...ns.slice(cursor + 1)]
        return {
          ...state,
          strand: newStrand,
          pc,
          fragments: cloneFragments(fragments),
        }
      }
    }

    case 'swi': {
      return { ...state, onSecondary: !onSecondary, pc }
    }

    case 'mvr': {
      const newCursor = cursor + 1
      let ns = cloneStrand(strand)
      if (copyMode && !onSecondary && newCursor < ns.length && ns[newCursor].primary != null) {
        ns = copyComplement(ns, newCursor)
      }
      return { ...state, strand: ns, cursor: newCursor, pc }
    }

    case 'mvl': {
      const newCursor = cursor - 1
      let ns = cloneStrand(strand)
      if (copyMode && !onSecondary && newCursor >= 0 && ns[newCursor].primary != null) {
        ns = copyComplement(ns, newCursor)
      }
      return { ...state, strand: ns, cursor: newCursor, pc }
    }

    case 'cop': {
      let ns = cloneStrand(strand)
      if (!onSecondary && ns[cursor].primary != null) {
        ns = copyComplement(ns, cursor)
      }
      return { ...state, strand: ns, copyMode: true, pc }
    }

    case 'off': {
      return { ...state, copyMode: false, pc }
    }

    case 'ina': return insert(state, 'A', pc)
    case 'inc': return insert(state, 'C', pc)
    case 'ing': return insert(state, 'G', pc)
    case 'int': return insert(state, 'T', pc)

    case 'rpy': {
      const dir = onSecondary ? -1 : 1
      return search(state, dir, isPyrimidine, pc)
    }
    case 'rpu': {
      const dir = onSecondary ? -1 : 1
      return search(state, dir, isPurine, pc)
    }
    case 'lpy': {
      const dir = onSecondary ? 1 : -1
      return search(state, dir, isPyrimidine, pc)
    }
    case 'lpu': {
      const dir = onSecondary ? 1 : -1
      return search(state, dir, isPurine, pc)
    }
  }
}

function insert(state: ExecState, base: Base, pc: number): ExecState {
  const { cursor, onSecondary } = state
  const ns = cloneStrand(state.strand)

  if (onSecondary) {
    // Insert into secondary: add a cell with null primary (gap) and the new base as secondary
    const newCell: DualCell = { primary: null, secondary: base }
    ns.splice(cursor + 1, 0, newCell)
  } else {
    // Insert into primary: add a cell with the new base as primary and null secondary
    const newCell: DualCell = { primary: base, secondary: null }
    ns.splice(cursor + 1, 0, newCell)
  }

  return {
    ...state,
    strand: ns,
    cursor: cursor + 1,
    pc,
    fragments: cloneFragments(state.fragments),
  }
}

function search(
  state: ExecState,
  dir: number,
  test: (base: Base) => boolean,
  pc: number,
): ExecState {
  const { onSecondary, copyMode } = state
  let ns = cloneStrand(state.strand)
  let pos = state.cursor + dir

  while (pos >= 0 && pos < ns.length) {
    if (copyMode && !onSecondary && ns[pos].primary != null) {
      ns = copyComplement(ns, pos)
    }
    const base = onSecondary ? ns[pos].secondary : ns[pos].primary
    if (base != null && test(base)) {
      return { ...state, strand: ns, cursor: pos, pc }
    }
    pos += dir
  }

  // fell off
  return { ...state, strand: ns, cursor: pos, pc }
}
