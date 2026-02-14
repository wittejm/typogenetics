import { runOnSelf, flattenOps, categorize, generateStrands } from './classify.ts'
import type { Bucket } from './classify.ts'

type ResultItem = { strand: string; results: string[]; bucket: Bucket }

let running = false

async function search() {
  running = true
  let length = 1
  let checked = 0

  while (running) {
    let batch: ResultItem[] = []
    let sinceYield = 0

    for (const strand of generateStrands(length)) {
      if (!running) return

      checked++
      sinceYield++

      const ops = runOnSelf(strand)
      if (ops.length > 0) {
        const buckets = categorize(strand, ops)
        const unique = [...new Set(flattenOps(ops))]
        for (const bucket of buckets) {
          batch.push({ strand, results: unique, bucket })
        }
      }

      if (sinceYield >= 500) {
        if (batch.length > 0) {
          self.postMessage({ type: 'results', items: batch })
          batch = []
        }
        self.postMessage({ type: 'progress', length, checked })
        sinceYield = 0
        await new Promise(r => setTimeout(r, 0))
        if (!running) return
      }
    }

    // Flush remaining batch for this length
    if (batch.length > 0) {
      self.postMessage({ type: 'results', items: batch })
    }
    self.postMessage({ type: 'progress', length, checked })

    length++
    await new Promise(r => setTimeout(r, 0))
  }
}

self.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'start') {
    if (!running) search()
  } else if (e.data.type === 'stop') {
    running = false
  }
}
