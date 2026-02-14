import { useEffect, useRef, useState, useCallback } from 'react'
import { initialStrands } from '../model/strand'
import StrandWithTooltip from '../StrandWithTooltip'

type EvictionRule = 'none' | 'random' | 'shortest' | 'oldest'

type Stats = {
  ops: number
  attempts: number
  poolSize: number
  uniqueCount: number
  topStrands: [string, number][]
  topEdges: [string, string, number][]
  mutualPairs: [string, string, number, number][]
}

type HistoryPoint = { ops: number; poolSize: number }

const EMPTY_STATS: Stats = {
  ops: 0, attempts: 0, poolSize: 0, uniqueCount: 0,
  topStrands: [], topEdges: [], mutualPairs: [],
}
const MAX_HISTORY = 300

type WorkerState = 'idle' | 'running' | 'paused' | 'done'

export default function SoupPage() {
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [evictionRule, setEvictionRule] = useState<EvictionRule>('none')
  const [capSize, setCapSize] = useState(500)
  const [consumeSource, setConsumeSource] = useState(false)
  const [filterInert, setFilterInert] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const sendConfig = useCallback(() => {
    workerRef.current?.postMessage({
      type: 'config',
      capSize: evictionRule === 'none' ? 0 : capSize,
      evictionRule,
      consumeSource,
      filterInert,
    })
  }, [evictionRule, capSize, consumeSource, filterInert])

  useEffect(() => {
    sendConfig()
  }, [sendConfig])

  function spawnWorker() {
    const w = new Worker(
      new URL('../soup/worker.ts', import.meta.url),
      { type: 'module' },
    )

    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'stats') {
        const s: Stats = {
          ops: e.data.ops,
          attempts: e.data.attempts,
          poolSize: e.data.poolSize,
          uniqueCount: e.data.uniqueCount,
          topStrands: e.data.topStrands,
          topEdges: e.data.topEdges,
          mutualPairs: e.data.mutualPairs,
        }
        setStats(s)
        setHistory(prev => {
          const next = [...prev, { ops: s.ops, poolSize: s.poolSize }]
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
        })
      } else if (e.data.type === 'done') {
        setWorkerState('done')
      }
    }

    workerRef.current = w
    return w
  }

  function handleStart() {
    setStats(EMPTY_STATS)
    setHistory([])

    const w = spawnWorker()
    w.postMessage({
      type: 'config',
      capSize: evictionRule === 'none' ? 0 : capSize,
      evictionRule,
      consumeSource,
      filterInert,
    })
    w.postMessage({ type: 'start', pool: initialStrands })
    setWorkerState('running')
  }

  function handlePause() {
    workerRef.current?.postMessage({ type: 'pause' })
    setWorkerState('paused')
  }

  function handleResume() {
    workerRef.current?.postMessage({ type: 'resume' })
    setWorkerState('running')
  }

  function handleReset() {
    workerRef.current?.postMessage({ type: 'stop' })
    workerRef.current?.terminate()
    workerRef.current = null
    setWorkerState('idle')
    setStats(EMPTY_STATS)
    setHistory([])
  }

  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

  // Sparkline dimensions
  const sparkW = 300
  const sparkH = 40

  let sparkPath = ''
  if (history.length > 1) {
    const maxPool = Math.max(...history.map(h => h.poolSize), 1)
    const xStep = sparkW / (history.length - 1)
    sparkPath = history
      .map((h, i) => {
        const x = i * xStep
        const y = sparkH - (h.poolSize / maxPool) * (sparkH - 2) - 1
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join('')
  }

  return (
    <div className="soup-page">
      <div className="soup-controls">
        {workerState === 'idle' && (
          <button className="soup-toggle" onClick={handleStart}>Start</button>
        )}
        {workerState === 'running' && (
          <button className="soup-toggle" onClick={handlePause}>Pause</button>
        )}
        {workerState === 'paused' && (
          <button className="soup-toggle" onClick={handleResume}>Resume</button>
        )}
        {workerState === 'done' && (
          <button className="soup-toggle" disabled>Extinct</button>
        )}
        {workerState !== 'idle' && (
          <button className="soup-toggle soup-reset" onClick={handleReset}>Reset</button>
        )}
        <span className="soup-stats-line">
          {stats.ops > 0
            ? `${stats.ops.toLocaleString()} ops / ${stats.attempts.toLocaleString()} attempts — Pool ${stats.poolSize.toLocaleString()} (${stats.uniqueCount} unique)`
            : 'Ready'}
        </span>
      </div>

      <div className="soup-config">
        <label className="soup-label">
          Eviction
          <select
            value={evictionRule}
            onChange={e => setEvictionRule(e.target.value as EvictionRule)}
          >
            <option value="none">None</option>
            <option value="random">Random</option>
            <option value="shortest">Shortest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>

        <label className="soup-label">
          Cap
          <input
            type="number"
            className="soup-cap-input"
            value={capSize}
            min={10}
            step={50}
            disabled={evictionRule === 'none'}
            onChange={e => setCapSize(Math.max(10, parseInt(e.target.value) || 10))}
          />
        </label>

        <label className="soup-label soup-checkbox-label">
          <input
            type="checkbox"
            checked={consumeSource}
            onChange={e => setConsumeSource(e.target.checked)}
          />
          Consume source
        </label>

        <label className="soup-label soup-checkbox-label">
          <input
            type="checkbox"
            checked={filterInert}
            onChange={e => setFilterInert(e.target.checked)}
          />
          Filter inert
        </label>
      </div>

      {history.length > 1 && (
        <div className="soup-sparkline-container">
          <span className="soup-sparkline-label">Pool size</span>
          <svg className="soup-sparkline" viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none">
            <path d={sparkPath} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}

      {stats.mutualPairs.length > 0 && (
        <div className="soup-mutual-section">
          <h3 className="soup-section-header">Mutual Production</h3>
          <div className="soup-edge-list">
            {stats.mutualPairs.map(([a, b, fwd, rev], i) => (
              <div key={i} className="soup-edge-entry soup-mutual-entry">
                <StrandWithTooltip strand={a} />
                <span className="soup-edge-arrow soup-mutual-arrow">&hArr;</span>
                <StrandWithTooltip strand={b} />
                <span className="soup-edge-counts">&rarr;{fwd} &larr;{rev}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.topEdges.length > 0 && (
        <div className="soup-graph-section">
          <h3 className="soup-section-header">Top Production Edges</h3>
          <div className="soup-edge-list">
            {stats.topEdges.map(([src, tgt, count], i) => (
              <div key={i} className="soup-edge-entry">
                <StrandWithTooltip strand={src} />
                <span className="soup-edge-arrow">&rarr;</span>
                <StrandWithTooltip strand={tgt} />
                <span className="soup-edge-counts">&times;{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.topStrands.length > 0 && (
        <div className="soup-top-strands">
          <h3 className="soup-section-header">Top Strands</h3>
          <div className="soup-strand-list">
            {stats.topStrands.map(([strand, count], i) => (
              <div key={`${strand}-${i}`} className="soup-strand-entry">
                <StrandWithTooltip strand={strand} />
                <span className="soup-strand-count">&times;{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {workerState === 'done' && (
        <div className="soup-extinct">Pool went extinct at op {stats.ops.toLocaleString()}.</div>
      )}
    </div>
  )
}
