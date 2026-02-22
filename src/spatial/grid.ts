import type { CrowdingMode } from './types.ts'

export function idx(row: number, col: number, width: number): number {
  return row * width + col
}

export function rowCol(i: number, width: number): [number, number] {
  return [Math.floor(i / width), i % width]
}

/** Moore neighborhood (8 neighbors) on a toroidal grid */
export function neighbors(i: number, width: number, height: number): number[] {
  const [r, c] = rowCol(i, width)
  const result: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = (r + dr + height) % height
      const nc = (c + dc + width) % width
      result.push(idx(nr, nc, width))
    }
  }
  return result
}

/** Distribute strands into clusters on the grid */
export function initGridClustered(
  strands: string[],
  width: number,
  height: number,
  numClusters: number,
): string[][] {
  const totalCells = width * height
  const grid: string[][] = Array.from({ length: totalCells }, () => [])

  // Pick random cluster centers
  const centers: number[] = []
  for (let i = 0; i < numClusters; i++) {
    centers.push(Math.floor(Math.random() * totalCells))
  }

  // For each cluster center, collect it + its neighbors as candidate cells
  const clusterCells: number[][] = centers.map(c => {
    const nbrs = neighbors(c, width, height)
    return [c, ...nbrs]
  })

  // Distribute strands round-robin across clusters, into random cells within each cluster
  for (let i = 0; i < strands.length; i++) {
    const cluster = clusterCells[i % numClusters]
    const cellIdx = cluster[Math.floor(Math.random() * cluster.length)]
    grid[cellIdx].push(strands[i])
  }

  return grid
}

/** Each strand has probability `rate` of moving to a random neighbor. Mutates in place. */
export function diffuse(
  grid: string[][],
  width: number,
  height: number,
  rate: number,
) {
  const totalCells = width * height
  // Collect moves first to avoid order-dependent bias
  const moves: [number, number, string][] = [] // [fromCell, toCell, strand]

  for (let i = 0; i < totalCells; i++) {
    const cell = grid[i]
    for (let j = cell.length - 1; j >= 0; j--) {
      if (Math.random() < rate) {
        const nbrs = neighbors(i, width, height)
        const dest = nbrs[Math.floor(Math.random() * nbrs.length)]
        moves.push([i, dest, cell[j]])
        cell.splice(j, 1)
      }
    }
  }

  for (const [, dest, strand] of moves) {
    grid[dest].push(strand)
  }
}

/** Enforce cell capacity. Mutates in place. */
export function enforceCrowding(
  grid: string[][],
  width: number,
  height: number,
  cellCapacity: number,
  mode: CrowdingMode,
) {
  const totalCells = width * height

  if (mode === 'death') {
    for (let i = 0; i < totalCells; i++) {
      const cell = grid[i]
      if (cell.length > cellCapacity) {
        // Shuffle and truncate
        for (let j = cell.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1))
          ;[cell[j], cell[k]] = [cell[k], cell[j]]
        }
        cell.length = cellCapacity
      }
    }
  } else {
    // cascade mode: push excess to random neighbor, up to 3 hops
    const MAX_HOPS = 3
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let anyOverflow = false
      for (let i = 0; i < totalCells; i++) {
        const cell = grid[i]
        if (cell.length > cellCapacity) {
          anyOverflow = true
          // Shuffle to randomize which strands stay
          for (let j = cell.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1))
            ;[cell[j], cell[k]] = [cell[k], cell[j]]
          }
          const excess = cell.splice(cellCapacity)
          const nbrs = neighbors(i, width, height)
          for (const strand of excess) {
            const dest = nbrs[Math.floor(Math.random() * nbrs.length)]
            grid[dest].push(strand)
          }
        }
      }
      if (!anyOverflow) break
    }
    // Final pass: hard-kill any remaining overflow
    for (let i = 0; i < totalCells; i++) {
      if (grid[i].length > cellCapacity) {
        grid[i].length = cellCapacity
      }
    }
  }
}

/** Count bases per cell */
export function computeCellBases(
  grid: string[][],
  width: number,
  height: number,
): { baseA: number[]; baseC: number[]; baseG: number[]; baseT: number[] } {
  const totalCells = width * height
  const baseA = new Array<number>(totalCells).fill(0)
  const baseC = new Array<number>(totalCells).fill(0)
  const baseG = new Array<number>(totalCells).fill(0)
  const baseT = new Array<number>(totalCells).fill(0)

  for (let i = 0; i < totalCells; i++) {
    for (const strand of grid[i]) {
      for (let j = 0; j < strand.length; j++) {
        switch (strand[j]) {
          case 'A': baseA[i]++; break
          case 'C': baseC[i]++; break
          case 'G': baseG[i]++; break
          case 'T': baseT[i]++; break
        }
      }
    }
  }

  return { baseA, baseC, baseG, baseT }
}

/** Flatten grid into a single array of all strands */
export function flattenGrid(grid: string[][]): string[] {
  const result: string[] = []
  for (const cell of grid) {
    for (const strand of cell) {
      result.push(strand)
    }
  }
  return result
}
