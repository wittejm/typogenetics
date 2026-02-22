import { useEffect, useRef, useState, useCallback } from 'react'
import { initialStrands } from '../model/strand'
import StrandWithTooltip from '../StrandWithTooltip'

type EvictionRule = 'none' | 'random' | 'shortest' | 'oldest'

type Stats = {
  ops: number
  attempts: number
  poolSize: number
  uniqueCount: number
  topStrands: [string, number, number[]][]
  topTriples: [string, string, string, number][]
  mutualPairs: [string, string, number, number][]
  triangles: [string, string, string, number][]
}

const EMPTY_STATS: Stats = {
  ops: 0, attempts: 0, poolSize: 0, uniqueCount: 0,
  topStrands: [], topTriples: [], mutualPairs: [], triangles: [],
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  if (max === 0) return null
  const w = 60, h = 18
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - (v / max) * h}`
  ).join(' ')
  return (
    <svg className="soup-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke="rgba(0,119,204,0.6)" strokeWidth="1.5" />
    </svg>
  )
}

type WorkerState = 'idle' | 'running' | 'paused' | 'done'

export default function SoupPage() {
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [evictionRule, setEvictionRule] = useState<EvictionRule>('none')
  const [capSize, setCapSize] = useState(500)
  const [consumeSource, setConsumeSource] = useState(false)
  const [filterInert, setFilterInert] = useState(false)
  const [crossTable, setCrossTable] = useState(false)
  const workerRef = useRef<Worker | null>(null)

  const sendConfig = useCallback(() => {
    workerRef.current?.postMessage({
      type: 'config',
      capSize: evictionRule === 'none' ? 0 : capSize,
      evictionRule,
      consumeSource,
      filterInert,
      crossTable,
    })
  }, [evictionRule, capSize, consumeSource, filterInert, crossTable])

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
          topTriples: e.data.topTriples,
          mutualPairs: e.data.mutualPairs,
          triangles: e.data.triangles,
        }
        setStats(s)
      } else if (e.data.type === 'done') {
        setWorkerState('done')
      }
    }

    workerRef.current = w
    return w
  }

  function handleStart() {
    setStats(EMPTY_STATS)

    const w = spawnWorker()
    w.postMessage({
      type: 'config',
      capSize: evictionRule === 'none' ? 0 : capSize,
      evictionRule,
      consumeSource,
      filterInert,
      crossTable,
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
  }

  useEffect(() => {
    return () => { workerRef.current?.terminate() }
  }, [])

  return (
    <div className="soup-page">
      <div className="soup-intro">
        <p>
          Open question: What happens when strands are operating on strands other than themselves? What happens if this happens many times, at scale? Are there robust patterns of strand production? Interesting population dynamics? Who Knows!
        </p>
        <p>
          Note: This app is presently just weird and confusing. I'm still working on making some sense of it.
        </p>
      </div>

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

        <label className="soup-label soup-checkbox-label">
          <input
            type="checkbox"
            checked={crossTable}
            onChange={e => setCrossTable(e.target.checked)}
          />
          <span
            className="soup-tooltip"
            title="Swap insertion targets: GA↔GC (ina↔inc) and GG↔GT (ing↔int). Breaks the C/G alphabet trap by letting C/G-only strands insert A/T and vice versa."
          >
            Cross-table
          </span>
        </label>
      </div>

      {(() => {
        const maxCount = stats.topStrands[0]?.[1] ?? 1
        const rows = 20
        return (
          <div className="soup-top-strands">
            <h3 className="soup-section-header">Top Strands</h3>
            <div className="soup-bar-chart">
              {Array.from({ length: rows }, (_, i) => {
                const entry = stats.topStrands[i]
                if (!entry) {
                  return <div key={i} className="soup-bar-row soup-bar-row-empty"><div className="soup-bar-label" /><div className="soup-bar-track" /><span className="soup-bar-count" /></div>
                }
                const [strand, count, history] = entry
                return (
                  <div key={`${strand}-${i}`} className="soup-bar-row">
                    <div className="soup-bar-label">
                      <StrandWithTooltip strand={strand} />
                    </div>
                    <div className="soup-bar-track">
                      <div
                        className="soup-bar-fill"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <Sparkline data={history} />
                    <span className="soup-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      <div className="soup-mutual-section">
        <h3 className="soup-section-header">Mutual Production</h3>
        <div className="soup-edge-list">
          {Array.from({ length: 10 }, (_, i) => {
            const entry = stats.mutualPairs[i]
            if (!entry) {
              return <div key={i} className="soup-edge-entry soup-edge-entry-empty">&nbsp;</div>
            }
            const [a, b, fwd, rev] = entry
            return (
              <div key={i} className="soup-edge-entry soup-mutual-entry">
                <StrandWithTooltip strand={a} />
                <span className="soup-edge-arrow soup-mutual-arrow">&hArr;</span>
                <StrandWithTooltip strand={b} />
                <span className="soup-edge-counts">&rarr;{fwd} &larr;{rev}</span>
              </div>
            )
          })}
        </div>
      </div>

      {stats.triangles.length > 0 && (
        <div className="soup-triangle-section">
          <h3 className="soup-section-header">Hypercycles (3-cycles)</h3>
          <div className="soup-edge-list">
            {stats.triangles.map(([a, b, c, score], i) => (
              <div key={i} className="soup-edge-entry soup-triangle-entry">
                <StrandWithTooltip strand={a} />
                <span className="soup-edge-arrow soup-triangle-arrow">&rarr;</span>
                <StrandWithTooltip strand={b} />
                <span className="soup-edge-arrow soup-triangle-arrow">&rarr;</span>
                <StrandWithTooltip strand={c} />
                <span className="soup-edge-arrow soup-triangle-arrow">&rarr;</span>
                <StrandWithTooltip strand={a} />
                <span className="soup-edge-counts">&times;{score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="soup-graph-section">
        <h3 className="soup-section-header">Enzyme + Strand = Result</h3>
        <div className="soup-edge-list">
          {Array.from({ length: 10 }, (_, i) => {
            const entry = stats.topTriples[i]
            if (!entry) {
              return <div key={i} className="soup-edge-entry soup-edge-entry-empty">&nbsp;</div>
            }
            const [src, tgt, res, count] = entry
            return (
              <div key={i} className="soup-edge-entry soup-triple-entry">
                <StrandWithTooltip strand={src} />
                <span className="soup-edge-arrow">+</span>
                <StrandWithTooltip strand={tgt} />
                <span className="soup-edge-arrow">=</span>
                <StrandWithTooltip strand={res} />
                <span className="soup-edge-counts">&times;{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {workerState === 'done' && (
        <div className="soup-extinct">Pool went extinct at op {stats.ops.toLocaleString()}.</div>
      )}
    </div>
  )
}
