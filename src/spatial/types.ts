export type CrowdingMode = 'death' | 'cascade'

export type SpatialConfig = {
  gridWidth: number
  gridHeight: number
  cellCapacity: number
  diffusionRate: number
  enforceCrowding: boolean
  crowdingMode: CrowdingMode
  numClusters: number
  consumeSource: boolean
  filterInert: boolean
  crossTable: boolean
  batchSize: number
}

export type SpatialStats = {
  type: 'stats'
  ops: number
  attempts: number
  totalStrands: number
  uniqueCount: number
  gridWidth: number
  gridHeight: number
  baseA: number[]
  baseC: number[]
  baseG: number[]
  baseT: number[]
  topStrands: [string, number][]
  topTriples: [string, string, string, number][]
  mutualPairs: [string, string, number, number][]
}
