import { useState, useEffect } from 'react'
import { aminoLabel } from './labels'
import { generateSnapshots, collectResults, type ProcessingSnapshot } from './model/stepper'

interface ProcessingData {
  enzyme: string[]
  bindingPref: string
  strand: string
  boundBase: number
}

interface ProcessingWindowProps {
  data: ProcessingData | null
}

export default function ProcessingWindow({ data }: ProcessingWindowProps) {
  const [snapshots, setSnapshots] = useState<ProcessingSnapshot[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    if (!data) {
      setSnapshots([])
      setStepIndex(0)
      return
    }
    const snaps = generateSnapshots(data.enzyme, data.strand, data.boundBase)
    setSnapshots(snaps)
    setStepIndex(0)
    setRunId(r => r + 1)
  }, [data])

  // Auto-advance through snapshots
  useEffect(() => {
    if (snapshots.length <= 1 || stepIndex >= snapshots.length - 1) return
    const delay = stepIndex === 0 ? 800 : 1200
    const timer = setTimeout(() => setStepIndex(s => s + 1), delay)
    return () => clearTimeout(timer)
  }, [stepIndex, snapshots])

  if (!data || snapshots.length === 0) {
    return (
      <div className="processing-panel">
        <div className="processing-empty">
          Select an enzyme, then click a binding site on a target strand.
        </div>
      </div>
    )
  }

  const snap = snapshots[stepIndex]
  const isComplete = stepIndex === snapshots.length - 1
  const hasSecondary = Object.keys(snap.secondary).length > 0
  const results = isComplete ? collectResults(snap) : null

  return (
    <div className="processing-panel">
      <h3 className="processing-title">Processing</h3>

      {/* key={runId} forces remount on new data → retriggers entrance animations */}
      <div key={runId} className="processing-content">

        {/* Enzyme bar */}
        <div className="processing-enzyme">
          <span className="processing-label">Enzyme</span>
          <div className="enzyme-ops">
            {data.enzyme.map((amino, ai) => {
              const isActive = snap.aminoIndex === ai
              const isPast = snap.aminoIndex >= 0 && ai < snap.aminoIndex
              return (
                <span
                  key={ai}
                  className={
                    'amino-badge'
                    + (isActive ? ' amino-stepping' : '')
                    + (isPast ? ' amino-past' : '')
                    + (!isActive && !isPast ? ' amino-future' : '')
                  }
                >
                  {aminoLabel[amino] ?? amino}
                </span>
              )
            })}
          </div>
          <span className="bind-pref">binds {data.bindingPref}</span>
        </div>

        {/* Strand visualization */}
        <div className="processing-strand">
          <span className="processing-label">
            Strand
            {snap.copyMode && <span className="copy-mode-badge">COPY</span>}
          </span>
          <div className="strand-display">
            <div className="strand-row">
              {snap.bases.map((base, i) => (
                <span
                  key={i}
                  className={
                    'base-cell'
                    + (i === snap.cursor && !snap.onSecondary && !snap.fellOff ? ' base-cursor' : '')
                  }
                >
                  {base || '\u00A0'}
                </span>
              ))}
            </div>
            {hasSecondary && (
              <div className="strand-row strand-secondary-row">
                {snap.bases.map((_, i) => (
                  <span
                    key={i}
                    className={
                      'base-cell'
                      + (snap.secondary[i] ? ' base-complement' : '')
                      + (i === snap.cursor && snap.onSecondary && !snap.fellOff ? ' base-cursor' : '')
                    }
                  >
                    {snap.secondary[i] || '\u00A0'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fragments from cuts */}
        {snap.fragments.length > 0 && (
          <div className="processing-fragments">
            <span className="processing-label">Fragments</span>
            {snap.fragments.map((frag, fi) => {
              const fragSec = snap.fragmentSecondaries[fi] || {}
              const hasFragSec = Object.keys(fragSec).length > 0
              return (
                <div key={fi} className="strand-display fragment-display">
                  <div className="strand-row">
                    {frag.map((base, bi) => (
                      <span key={bi} className="base-cell">{base || '\u00A0'}</span>
                    ))}
                  </div>
                  {hasFragSec && (
                    <div className="strand-row strand-secondary-row">
                      {frag.map((_, bi) => (
                        <span key={bi} className={'base-cell' + (fragSec[bi] ? ' base-complement' : '')}>
                          {fragSec[bi] || '\u00A0'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Completion */}
        {isComplete && (
          <>
            <div className="processing-status">
              {snap.fellOff ? 'Enzyme fell off the strand' : 'Processing complete'}
            </div>
            {results && results.length > 0 && (
              <div className="processing-results">
                <span className="processing-label">Result Strands</span>
                {results.map((strand, i) => (
                  <div key={i} className="result-strand">
                    <span className="strand">{strand}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
