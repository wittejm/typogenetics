export interface ProcessingSnapshot {
  aminoIndex: number    // -1 for initial state, 0+ for after that amino executed
  bases: string[]
  secondary: Record<number, string>
  cursor: number
  onSecondary: boolean
  copyMode: boolean
  fragments: string[][]
  fragmentSecondaries: Record<number, string>[]
  fellOff: boolean
}

const complement: Record<string, string> = {
  A: 'T', T: 'A', C: 'G', G: 'C',
}

function isPurine(base: string): boolean {
  return base === 'A' || base === 'G'
}

function isPyrimidine(base: string): boolean {
  return base === 'C' || base === 'T'
}

function snap(
  aminoIndex: number,
  bases: string[],
  secondary: Record<number, string>,
  cursor: number,
  onSecondary: boolean,
  copyMode: boolean,
  fragments: string[][],
  fragmentSecondaries: Record<number, string>[],
  fellOff: boolean,
): ProcessingSnapshot {
  return {
    aminoIndex,
    bases: [...bases],
    secondary: { ...secondary },
    cursor,
    onSecondary,
    copyMode,
    fragments: fragments.map(f => [...f]),
    fragmentSecondaries: fragmentSecondaries.map(fs => ({ ...fs })),
    fellOff,
  }
}

function searchFor(
  bases: string[],
  secondary: Record<number, string>,
  dir: number,
  test: (base: string) => boolean,
  copyMode: boolean,
  onSecondary: boolean,
  startCursor: number,
): number {
  let pos = startCursor + dir
  while (pos >= 0 && pos < bases.length) {
    if (copyMode && !onSecondary && bases[pos]) {
      secondary[pos] = complement[bases[pos]]
    }
    const base = onSecondary ? secondary[pos] : bases[pos]
    if (base && test(base)) {
      return pos
    }
    pos += dir
  }
  return pos
}

export function generateSnapshots(
  enzyme: string[],
  strand: string,
  bindingIndex: number,
): ProcessingSnapshot[] {
  const bases = strand.split('')
  let secondary: Record<number, string> = {}
  let cursor = bindingIndex
  let onSecondary = false
  let copyMode = false
  const fragments: string[][] = []
  const fragmentSecondaries: Record<number, string>[] = []

  const snapshots: ProcessingSnapshot[] = []

  // Initial state
  snapshots.push(snap(-1, bases, secondary, cursor, onSecondary, copyMode, fragments, fragmentSecondaries, false))

  for (let ai = 0; ai < enzyme.length; ai++) {
    const amino = enzyme[ai]

    switch (amino) {
      case 'cut': {
        const rightBases = bases.splice(cursor + 1)
        const rightSecondary: Record<number, string> = {}
        const leftSecondary: Record<number, string> = {}
        for (const [k, v] of Object.entries(secondary)) {
          const ki = Number(k)
          if (ki > cursor) rightSecondary[ki - (cursor + 1)] = v
          else leftSecondary[ki] = v
        }
        secondary = leftSecondary
        if (rightBases.length > 0) {
          fragments.push(rightBases)
          fragmentSecondaries.push(rightSecondary)
        }
        break
      }

      case 'del': {
        if (onSecondary) {
          delete secondary[cursor]
        } else {
          bases.splice(cursor, 1)
          const newSecondary: Record<number, string> = {}
          for (const [k, v] of Object.entries(secondary)) {
            const ki = Number(k)
            if (ki < cursor) newSecondary[ki] = v
            else if (ki > cursor) newSecondary[ki - 1] = v
          }
          secondary = newSecondary
        }
        break
      }

      case 'swi': {
        onSecondary = !onSecondary
        break
      }

      case 'mvr': {
        cursor++
        if (copyMode && !onSecondary && bases[cursor]) {
          secondary[cursor] = complement[bases[cursor]]
        }
        break
      }

      case 'mvl': {
        cursor--
        if (copyMode && !onSecondary && bases[cursor]) {
          secondary[cursor] = complement[bases[cursor]]
        }
        break
      }

      case 'cop': {
        copyMode = true
        if (!onSecondary && bases[cursor]) {
          secondary[cursor] = complement[bases[cursor]]
        }
        break
      }

      case 'off': {
        copyMode = false
        break
      }

      case 'ina':
      case 'inc':
      case 'ing':
      case 'int': {
        const base = amino === 'ina' ? 'A' : amino === 'inc' ? 'C' : amino === 'ing' ? 'G' : 'T'
        if (onSecondary) {
          const newSecondary: Record<number, string> = {}
          for (const [k, v] of Object.entries(secondary)) {
            const ki = Number(k)
            if (ki <= cursor) newSecondary[ki] = v
            else newSecondary[ki + 1] = v
          }
          newSecondary[cursor + 1] = base
          secondary = newSecondary
          bases.splice(cursor + 1, 0, '')
        } else {
          bases.splice(cursor + 1, 0, base)
          const newSecondary: Record<number, string> = {}
          for (const [k, v] of Object.entries(secondary)) {
            const ki = Number(k)
            if (ki <= cursor) newSecondary[ki] = v
            else newSecondary[ki + 1] = v
          }
          secondary = newSecondary
        }
        cursor++
        break
      }

      case 'rpy': {
        const dir = onSecondary ? -1 : 1
        cursor = searchFor(bases, secondary, dir, isPyrimidine, copyMode, onSecondary, cursor)
        break
      }

      case 'rpu': {
        const dir = onSecondary ? -1 : 1
        cursor = searchFor(bases, secondary, dir, isPurine, copyMode, onSecondary, cursor)
        break
      }

      case 'lpy': {
        const dir = onSecondary ? 1 : -1
        cursor = searchFor(bases, secondary, dir, isPyrimidine, copyMode, onSecondary, cursor)
        break
      }

      case 'lpu': {
        const dir = onSecondary ? 1 : -1
        cursor = searchFor(bases, secondary, dir, isPurine, copyMode, onSecondary, cursor)
        break
      }
    }

    const fellOff = cursor < 0 || cursor >= bases.length
    snapshots.push(snap(ai, bases, secondary, cursor, onSecondary, copyMode, fragments, fragmentSecondaries, fellOff))
    if (fellOff) break
  }

  return snapshots
}

function collectSecondaryRuns(secondary: Record<number, string>, results: string[]) {
  const indices = Object.keys(secondary).map(Number).sort((a, b) => a - b)
  if (indices.length === 0) return

  let run: string[] = []
  let prev = -2
  for (const idx of indices) {
    if (idx !== prev + 1 && run.length > 0) {
      results.push(run.reverse().join(''))
      run = []
    }
    run.push(secondary[idx])
    prev = idx
  }
  if (run.length > 0) {
    results.push(run.reverse().join(''))
  }
}

export function collectResults(snapshot: ProcessingSnapshot): string[] {
  const results: string[] = []

  // Primary strand (filter empty gaps from insertions on secondary)
  const primary = snapshot.bases.filter(b => b !== '').join('')
  if (primary.length > 0) results.push(primary)

  // Secondary strand — contiguous runs, reversed (antiparallel)
  collectSecondaryRuns(snapshot.secondary, results)

  // Fragments
  for (let fi = 0; fi < snapshot.fragments.length; fi++) {
    const fragPrimary = snapshot.fragments[fi].filter(b => b !== '').join('')
    if (fragPrimary.length > 0) results.push(fragPrimary)

    if (snapshot.fragmentSecondaries[fi]) {
      collectSecondaryRuns(snapshot.fragmentSecondaries[fi], results)
    }
  }

  return results
}
