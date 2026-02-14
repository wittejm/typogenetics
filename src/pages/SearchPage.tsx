import { useEffect, useRef, useState, useCallback } from 'react'
import ProcessingWindow from '../ProcessingWindow'
import type { ProcessingData } from '../ProcessingWindow'
import { translate } from '../model/ribosome'
import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect'
import { bind, runAll } from '../model/execution'

type ResultItem = { strand: string; results: string[]; bucket: string }
type Progress = { length: number; checked: number }

const BUCKET_META = [
  { key: 'survivor', label: 'Survivor', tip: 'Produces itself — a self-replicator' },
  { key: 'complement', label: 'Complement', tip: 'Produces its reverse complement (A↔T, C↔G, reversed) as a distinct strand' },
  { key: 'survivorComplementSingle', label: 'Survivor + Complement (single op)', tip: 'One enzyme binding reproduces itself AND produces its reverse complement' },
  { key: 'survivorComplementMulti', label: 'Survivor + Complement (multi op)', tip: 'Different enzyme bindings reproduce itself and produce its reverse complement' },
  { key: 'pairBond', label: 'Pair Bond', tip: 'Two distinct strands that each produce the other\u2019s reverse complement — a mutual reproduction cycle' },
  { key: 'novel', label: 'Novel', tip: 'Produces a strand that is neither itself nor its reverse complement — something genuinely new' },
] as const

type BucketKey = (typeof BUCKET_META)[number]['key']

const EMPTY_BUCKETS: Record<BucketKey, ResultItem[]> = {
  survivor: [],
  complement: [],
  survivorComplementSingle: [],
  survivorComplementMulti: [],
  pairBond: [],
  novel: [],
}

const MAX_DISPLAY = 200

export default function SearchPage() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress>({ length: 0, checked: 0 })
  const [buckets, setBuckets] = useState<Record<BucketKey, ResultItem[]>>({ ...EMPTY_BUCKETS })
  const [queue, setQueue] = useState<ProcessingData[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const processingData = queue.length > 0 ? queue[queueIndex] ?? null : null

  const handleStrandClick = useCallback((strand: string) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    const enzymes = translate(strand)
    const ops: ProcessingData[] = []
    for (const enzyme of enzymes) {
      for (let i = 0; i < strand.length; i++) {
        if (strand[i] === enzyme.bindingPref) {
          const ds = parsePrimaryStrand(strand)
          const state = bind(ds, i)
          const final = runAll(state, enzyme)
          const results = collectResults(final).map(strandToString)
          if (results.length > 0) {
            ops.push({ enzyme, strand, boundBase: i })
          }
        }
      }
    }
    setQueue(ops)
    setQueueIndex(0)
  }, [])

  const handleAnimationComplete = useCallback(() => {
    setQueueIndex(i => {
      // Don't advance past the last operation — keep its results visible
      if (i >= queue.length - 1) return i
      // Delay before advancing to next binding
      advanceTimer.current = setTimeout(() => {
        setQueueIndex(j => j + 1)
      }, 1500)
      return i
    })
  }, [queue.length])

  const handleToggle = useCallback(() => {
    if (running) {
      workerRef.current?.postMessage({ type: 'stop' })
      workerRef.current?.terminate()
      workerRef.current = null
      setRunning(false)
    } else {
      setProgress({ length: 0, checked: 0 })
      setBuckets({ ...EMPTY_BUCKETS })

      const w = new Worker(
        new URL('../search/worker.ts', import.meta.url),
        { type: 'module' },
      )

      w.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'progress') {
          setProgress({ length: e.data.length, checked: e.data.checked })
        } else if (e.data.type === 'results') {
          setBuckets(prev => {
            const next = { ...prev }
            for (const item of e.data.items as ResultItem[]) {
              const key = item.bucket as BucketKey
              next[key] = [...next[key], item]
            }
            return next
          })
        }
      }

      workerRef.current = w
      w.postMessage({ type: 'start' })
      setRunning(true)
    }
  }, [running])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  return (
    <div className="search-page">
      <div className="search-controls">
        <button className="search-toggle" onClick={handleToggle}>
          {running ? 'Stop' : 'Start'}
        </button>
        <span
          className="search-progress"
          title={progress.length > 0
            ? `Total strings of length 1 through ${progress.length}: 4 + 16 + \u2026 + 4^${progress.length}`
            : ''}
        >
          {progress.length > 0
            ? `Length ${progress.length} \u2014 ${progress.checked} / ${4 * (4 ** progress.length - 1) / 3} strands`
            : 'Ready'}
        </span>
      </div>

      <div className="search-body">
        <div className="search-buckets">
          {BUCKET_META.map(({ key, label, tip }) => {
            const items = buckets[key]
            const display = items.slice(-MAX_DISPLAY)
            return (
              <div key={key} className="bucket">
                <h3 className="bucket-header" title={tip}>
                  {label} <span className="bucket-count">({items.length})</span>
                </h3>
                <div className="bucket-list">
                  {display.map((item, i) => (
                    <div
                      key={`${item.strand}-${i}`}
                      className="bucket-entry"
                      onClick={() => handleStrandClick(item.strand)}
                    >
                      <span className="strand">{item.strand}</span>
                      <span className="bucket-arrow"> → </span>
                      <span className="strand">{item.results.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <ProcessingWindow
          data={processingData}
          speed={5}
          onComplete={handleAnimationComplete}
          emptyMessage="Click a strand to watch it run"
          subtitle={queue.length > 1 ? `Binding ${queueIndex + 1} of ${queue.length}` : undefined}
        />
      </div>
    </div>
  )
}
