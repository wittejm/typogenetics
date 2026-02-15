import { useEffect, useRef, useState, useCallback } from 'react'
import ProcessingWindow from '../ProcessingWindow'
import type { ProcessingData } from '../ProcessingWindow'
import { translate } from '../model/ribosome'
import { parsePrimaryStrand, collectResults, strandToString } from '../model/collect'
import { bind, runAll } from '../model/execution'

type ResultItem = { strand: string; results: string[]; bucket: string }
type Progress = { length: number; checked: number }

const BUCKET_META = [
  { key: 'survivor', label: 'Survivor',
    desc: 'One product of the self-operation is the original strand, unchanged. This is most likely to occur when the enzyme doesn\u2019t add or delete any bases from the strand.' },
  { key: 'complement', label: 'Complement',
    desc: 'One product of the self-operation is the reverse complement of the original strand. This is most likely to occur when the enzyme activates the COPY mode, and then moves along the entire strand.' },
  { key: 'survivorComplementSingle', label: 'Survivor + Complement (single op)',
    desc: 'The self-operation results in the unchanged strand AND its complete reverse complement.' },
  { key: 'survivorComplementMulti', label: 'Survivor + Complement (multi op)',
    desc: 'The self-operation results in the unchanged strand AND its complete reverse complement, but only does so by performing two operations that begin from different binding sites.' },
  { key: 'pairBond', label: 'Pair Bond',
    desc: 'One product of the self-operation is the strand\u2019s reverse complement, AND the product of THAT strand\u2019s self-operation is the original strand. This is wildly difficult to achieve and has not been found in strands up to length 15.' },
  { key: 'hypercycle2', label: '2-Hypercycle (not implemented)',
    desc: 'One product of the self-operation is a strand whose self-operation produces the original strand. This most likely to occur when a strand\u2019s enzyme deletes one of the bases in the strand, and the resulting strand\u2019s enzyme adds it back in in the same spot, or vice versa. Pretty cool! But also pretty common.' },
  { key: 'hypercycle2NonTrivial', label: 'Non-trivial 2-Hypercycle (not implemented)',
    desc: 'Same as above, but disallowing \u201cchange once and undo\u201d described above.' },
  { key: 'hypercycle3', label: '3-Hypercycle (not implemented)',
    desc: 'One of the strand\u2019s 3rd generation (and not less) of self-operation is identical to the original strand.' },
  { key: 'hypercycle4', label: '4-Hypercycle (not implemented)',
    desc: 'One of the strand\u2019s 4th generation (and not less) of self-operation is identical to the original strand.' },
  { key: 'novel', label: 'Novel',
    desc: 'Any strand that doesn\u2019t meet the above criteria but also whose self-operation creates a new strand.' },
] as const

type BucketKey = (typeof BUCKET_META)[number]['key']

const EMPTY_BUCKETS: Record<BucketKey, ResultItem[]> = {
  survivor: [],
  complement: [],
  survivorComplementSingle: [],
  survivorComplementMulti: [],
  pairBond: [],
  hypercycle2: [],
  hypercycle2NonTrivial: [],
  hypercycle3: [],
  hypercycle4: [],
  novel: [],
}

const MAX_DISPLAY = 50

type SearchState = 'idle' | 'running' | 'paused'

export default function SearchPage() {
  const [state, setState] = useState<SearchState>('idle')
  const [progress, setProgress] = useState<Progress>({ length: 0, checked: 0 })
  const [buckets, setBuckets] = useState<Record<BucketKey, ResultItem[]>>({ ...EMPTY_BUCKETS })
  const [queue, setQueue] = useState<ProcessingData[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workerRef = useRef<Worker | null>(null)

  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set())
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<string>>(new Set())
  const isIdle = state === 'idle'
  const processingData = queue.length > 0 ? queue[queueIndex] ?? null : null

  const toggleDesc = useCallback((key: string) => {
    setExpandedDescs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedBuckets(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setExpandedDescs(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

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

  function createWorker() {
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
            if (next[key]) next[key] = [...next[key], item]
          }
          return next
        })
      }
    }

    return w
  }

  const handleStart = useCallback(() => {
    if (state === 'paused') {
      workerRef.current?.postMessage({ type: 'resume' })
      setState('running')
      return
    }

    // Fresh start
    setProgress({ length: 0, checked: 0 })
    setBuckets({ ...EMPTY_BUCKETS })
    const w = createWorker()
    workerRef.current = w
    w.postMessage({ type: 'start' })
    setState('running')
  }, [state])

  const handlePause = useCallback(() => {
    if (state === 'running') {
      workerRef.current?.postMessage({ type: 'pause' })
      setState('paused')
    }
  }, [state])

  const handleReset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' })
    workerRef.current?.terminate()
    workerRef.current = null
    setState('idle')
    setProgress({ length: 0, checked: 0 })
    setBuckets({ ...EMPTY_BUCKETS })
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  return (
    <div className="search-page">
      <div className="search-intro">
        <p>
          Open question: What happens when strands produce enzymes that operate on their source strands? What patterns emerge?
        </p>
        <p>
          This app performs an exhaustive search on strands of increasing length to locate strands that produce interesting behavior, defined in various ways:
        </p>
      </div>

      <div className="search-controls">
        <button className="search-toggle" onClick={handleStart} disabled={state === 'running'}>
          Start
        </button>
        <button className="search-toggle" onClick={handlePause} disabled={state !== 'running'}>
          Pause
        </button>
        <button className="search-toggle" onClick={handleReset} disabled={state === 'running' || progress.length === 0}>
          Reset
        </button>
        <span
          className="search-progress"
          title={progress.length > 0
            ? `Total strings of length 1 through ${progress.length}: 4 + 16 + \u2026 + 4^${progress.length}`
            : ''}
        >
          {progress.length > 0
            ? `Length ${progress.length} \u2014 ${progress.checked} / ${4 * (4 ** progress.length - 1) / 3} strands${state === 'paused' ? ' (paused)' : ''}`
            : 'Ready'}
        </span>
      </div>

      <div className="search-body">
        <div className="search-buckets">
          {BUCKET_META.map(({ key, label, desc }) => {
            const items = buckets[key]
            const display = items.slice(-MAX_DISPLAY)
            const descExpanded = expandedDescs.has(key)
            const collapsed = collapsedBuckets.has(key)
            return (
              <div key={key} className="bucket">
                <h3 className="bucket-header">
                  <span className="bucket-header-left">
                    {label}
                    {!isIdle && (
                      <button className="bucket-help-btn" onClick={() => toggleDesc(key)}>?</button>
                    )}
                    {!isIdle && <span className="bucket-count">({items.length})</span>}
                  </span>
                  {!isIdle && (
                    <button className="bucket-collapse-btn" onClick={() => toggleCollapse(key)}>
                      <span className="bucket-collapse-icon">≡</span>
                    </button>
                  )}
                </h3>
                {isIdle && <p className="bucket-desc">{desc}</p>}
                {!isIdle && descExpanded && !collapsed && (
                  <p className="bucket-desc bucket-desc-collapsible">{desc}</p>
                )}
                {!isIdle && !collapsed && display.length > 0 && (
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
                )}
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
