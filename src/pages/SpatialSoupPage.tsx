import { useEffect, useRef, useState, useCallback } from 'react'
import { initialStrands } from '../model/strand'
import type { SpatialStats, CrowdingMode } from '../spatial/types'
import GridCanvas from '../spatial/GridCanvas'
import StrandWithTooltip from '../StrandWithTooltip'

const EMPTY_STATS: SpatialStats = {
  type: 'stats',
  ops: 0, attempts: 0, totalStrands: 0, uniqueCount: 0,
  gridWidth: 32, gridHeight: 32,
  baseA: [], baseC: [], baseG: [], baseT: [],
  topStrands: [], topTriples: [], mutualPairs: [],
}

type WorkerState = 'idle' | 'running' | 'paused' | 'done'

export default function SpatialSoupPage() {
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [stats, setStats] = useState<SpatialStats>(EMPTY_STATS)

  // Config state
  const [gridWidth, setGridWidth] = useState(32)
  const [gridHeight, setGridHeight] = useState(32)
  const [cellCapacity, setCellCapacity] = useState(8)
  const [diffusionRate, setDiffusionRate] = useState(0.05)
  const [crowdingEnabled, setCrowdingEnabled] = useState(true)
  const [crowdingMode, setCrowdingMode] = useState<CrowdingMode>('death')
  const [numClusters, setNumClusters] = useState(3)
  const [batchSize, setBatchSize] = useState(100)
  const [consumeSource, setConsumeSource] = useState(false)
  const [filterInert, setFilterInert] = useState(false)
  const [crossTable, setCrossTable] = useState(false)

  const workerRef = useRef<Worker | null>(null)

  const sendConfig = useCallback(() => {
    workerRef.current?.postMessage({
      type: 'config',
      cellCapacity,
      diffusionRate,
      enforceCrowding: crowdingEnabled,
      crowdingMode,
      consumeSource,
      filterInert,
      crossTable,
      batchSize,
    })
  }, [cellCapacity, diffusionRate, crowdingEnabled, crowdingMode, consumeSource, filterInert, crossTable, batchSize])

  useEffect(() => {
    sendConfig()
  }, [sendConfig])

  function spawnWorker() {
    const w = new Worker(
      new URL('../spatial/worker.ts', import.meta.url),
      { type: 'module' },
    )
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'stats') {
        setStats(e.data as SpatialStats)
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
      cellCapacity,
      diffusionRate,
      enforceCrowding: crowdingEnabled,
      crowdingMode,
      consumeSource,
      filterInert,
      crossTable,
      batchSize,
    })
    w.postMessage({
      type: 'start',
      pool: initialStrands,
      gridWidth,
      gridHeight,
      numClusters,
    })
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

  const configDisabled = workerState !== 'idle'

  return (
    <div className="spatial-page">
      <div className="spatial-intro">
        <p>What if the Soup (explained on the previous page) had a spatial component? Only strands and enzymes near one another can interact.</p>
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
            ? `${stats.ops.toLocaleString()} ops / ${stats.attempts.toLocaleString()} attempts — ${stats.totalStrands.toLocaleString()} strands (${stats.uniqueCount} unique)`
            : 'Ready'}
        </span>
      </div>

      <div className="spatial-config">
        <label className="soup-label">
          Grid
          <input
            type="number"
            className="spatial-num-input"
            value={gridWidth}
            min={4} max={128}
            disabled={configDisabled}
            onChange={e => setGridWidth(Math.max(4, parseInt(e.target.value) || 4))}
          />
          <span>&times;</span>
          <input
            type="number"
            className="spatial-num-input"
            value={gridHeight}
            min={4} max={128}
            disabled={configDisabled}
            onChange={e => setGridHeight(Math.max(4, parseInt(e.target.value) || 4))}
          />
        </label>

        <label className="soup-label">
          Cell cap
          <input
            type="number"
            className="spatial-num-input"
            value={cellCapacity}
            min={1}
            onChange={e => setCellCapacity(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </label>

        <label className="soup-label">
          Diffusion
          <input
            type="range"
            min={0} max={0.5} step={0.01}
            value={diffusionRate}
            onChange={e => setDiffusionRate(parseFloat(e.target.value))}
          />
          <span className="spatial-slider-value">{diffusionRate.toFixed(2)}</span>
        </label>

        <label className="soup-label soup-checkbox-label">
          <input
            type="checkbox"
            checked={crowdingEnabled}
            onChange={e => setCrowdingEnabled(e.target.checked)}
          />
          Crowding
        </label>

        <span className="soup-label" style={{ opacity: crowdingEnabled ? 1 : 0.4 }}>
          <label className="spatial-radio-label">
            <input
              type="radio" name="crowdingMode" value="death"
              checked={crowdingMode === 'death'}
              onChange={() => setCrowdingMode('death')}
            />
            Death
          </label>
          <label className="spatial-radio-label">
            <input
              type="radio" name="crowdingMode" value="cascade"
              checked={crowdingMode === 'cascade'}
              onChange={() => setCrowdingMode('cascade')}
            />
            Cascade
          </label>
        </span>

        <label className="soup-label">
          Clusters
          <input
            type="number"
            className="spatial-num-input"
            value={numClusters}
            min={1}
            disabled={configDisabled}
            onChange={e => setNumClusters(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </label>

        <label className="soup-label">
          Batch
          <input
            type="number"
            className="spatial-num-input"
            value={batchSize}
            min={10} step={10}
            onChange={e => setBatchSize(Math.max(10, parseInt(e.target.value) || 10))}
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
            title="Swap insertion targets: GA↔GC (ina↔inc) and GG↔GT (ing↔int). Breaks the C/G alphabet trap."
          >
            Cross-table
          </span>
        </label>
      </div>

      <div className="spatial-body">
        <div className="spatial-canvas-col">
          <GridCanvas
            baseA={stats.baseA}
            baseC={stats.baseC}
            baseG={stats.baseG}
            baseT={stats.baseT}
            gridWidth={stats.gridWidth || gridWidth}
            gridHeight={stats.gridHeight || gridHeight}
            cellCapacity={cellCapacity}
          />
          <div className="spatial-legend">
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'cyan' }} />A
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'magenta' }} />C
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'yellow', border: '1px solid #ccc' }} />G
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'black' }} />T
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'red' }} />C+G
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'green' }} />A+G
            </span>
            <span className="spatial-legend-item">
              <span className="spatial-legend-swatch" style={{ background: 'blue' }} />A+C
            </span>
          </div>
        </div>

        <div className="spatial-stats-col">
          {(() => {
            const maxCount = stats.topStrands[0]?.[1] ?? 1
            return (
              <div>
                <h3 className="soup-section-header">Top Strands</h3>
                <div className="soup-bar-chart">
                  {Array.from({ length: 20 }, (_, i) => {
                    const entry = stats.topStrands[i]
                    if (!entry) {
                      return <div key={i} className="soup-bar-row"><div className="soup-bar-label" /><div className="soup-bar-track" /><span className="soup-bar-count" /></div>
                    }
                    const [strand, count] = entry
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
      </div>
    </div>
  )
}
