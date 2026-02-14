import { useState, useEffect, useRef } from 'react'
import type { Enzyme } from './model/types'
import EnzymeDisplay from './EnzymeDisplay'
import type { ExecState } from './model/execution'
import { bind, step } from './model/execution'
import { parsePrimaryStrand } from './model/collect'
import { collectResults } from './model/collect'
import { strandToString } from './model/collect'

export interface ProcessingData {
  enzyme: Enzyme
  strand: string
  boundBase: number
}

interface ProcessingWindowProps {
  data: ProcessingData | null
  speed: number
  onComplete?: (resultStrands: string[]) => void
  emptyMessage?: string
  subtitle?: string
}

export default function ProcessingWindow({ data, speed, onComplete, emptyMessage, subtitle }: ProcessingWindowProps) {
  const [states, setStates] = useState<ExecState[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [runId, setRunId] = useState(0)
  // Track the last non-null data so we can keep rendering after data goes null
  const displayDataRef = useRef<ProcessingData | null>(null)
  if (data) displayDataRef.current = data
  const displayData = displayDataRef.current

  useEffect(() => {
    if (!data) return // Don't clear — keep showing last result
    const ds = parsePrimaryStrand(data.strand)
    const initial = bind(ds, data.boundBase)
    const all: ExecState[] = [initial]
    let s = initial
    while (!s.terminated && s.pc < data.enzyme.aminos.length) {
      s = step(s, data.enzyme)
      all.push(s)
    }
    setStates(all)
    setStepIndex(0)
    setRunId(r => r + 1)
  }, [data])

  // Auto-advance through states
  useEffect(() => {
    if (states.length <= 1 || stepIndex >= states.length - 1) return
    const delay = (stepIndex === 0 ? 800 : 1200) / speed
    const timer = setTimeout(() => setStepIndex(s => s + 1), delay)
    return () => clearTimeout(timer)
  }, [stepIndex, states, speed])

  // Return result strands to the pool when animation completes
  useEffect(() => {
    if (states.length === 0 || stepIndex < states.length - 1) return
    const finalState = states[states.length - 1]
    const resultStrands = collectResults(finalState).map(strandToString)
    if (resultStrands.length > 0 && onComplete) {
      onComplete(resultStrands)
    }
  }, [stepIndex, states, onComplete])

  if (!displayData || states.length === 0) {
    return (
      <div className="processing-panel">
        <div className="processing-empty">
          {emptyMessage ?? 'Select an enzyme, then click a binding site on a target strand.'}
        </div>
      </div>
    )
  }

  const state = states[stepIndex]
  const isComplete = stepIndex === states.length - 1
  // pc is 0 for initial state, then increments after each amino
  // aminoIndex: which amino just executed (-1 for initial, 0+ after)
  const aminoIndex = state.pc - 1
  const hasSecondary = state.strand.some(c => c.secondary != null)
  const results = isComplete ? collectResults(state).map(strandToString) : null

  return (
    <div className="processing-panel">
      <h3 className="processing-title">
        Processing
        {subtitle && <span className="processing-subtitle">{subtitle}</span>}
      </h3>

      <div key={runId} className="processing-content">

        {/* Enzyme bar */}
        <div className="processing-enzyme">
          <span className="processing-label">Enzyme</span>
          <EnzymeDisplay
            enzyme={displayData.enzyme}
            aminoClassName={(ai) => {
              const isActive = aminoIndex === ai
              const isPast = aminoIndex >= 0 && ai < aminoIndex
              return isActive ? 'amino-stepping' : isPast ? 'amino-past' : 'amino-future'
            }}
          />
          <div className="processing-source-strand">
            <span className="strand">{displayData.strand}</span>
          </div>
        </div>

        {/* Strand visualization */}
        <div className="processing-strand">
          <span className="processing-label">
            Strand
            {state.copyMode && <span className="copy-mode-badge">COPY</span>}
          </span>
          <div className="strand-display">
            <div className="strand-row">
              {state.strand.map((cell, i) => (
                <span
                  key={i}
                  className={
                    'base-cell'
                    + (i === state.cursor && !state.onSecondary && !state.terminated ? ' base-cursor' : '')
                  }
                >
                  {cell.primary || '\u00A0'}
                </span>
              ))}
            </div>
            {hasSecondary && (
              <div className="strand-row strand-secondary-row">
                {state.strand.map((cell, i) => (
                  <span
                    key={i}
                    className={
                      'base-cell'
                      + (cell.secondary != null ? ' base-complement' : '')
                      + (i === state.cursor && state.onSecondary && !state.terminated ? ' base-cursor' : '')
                    }
                  >
                    {cell.secondary || '\u00A0'}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fragments from cuts */}
        {state.fragments.length > 0 && (
          <div className="processing-fragments">
            <span className="processing-label">Fragments</span>
            {state.fragments.map((frag, fi) => {
              const hasFragSec = frag.some(c => c.secondary != null)
              return (
                <div key={fi} className="strand-display fragment-display">
                  <div className="strand-row">
                    {frag.map((cell, bi) => (
                      <span key={bi} className="base-cell">{cell.primary || '\u00A0'}</span>
                    ))}
                  </div>
                  {hasFragSec && (
                    <div className="strand-row strand-secondary-row">
                      {frag.map((cell, bi) => (
                        <span key={bi} className={'base-cell' + (cell.secondary != null ? ' base-complement' : '')}>
                          {cell.secondary || '\u00A0'}
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
              {state.terminated && (state.cursor < 0 || state.cursor >= state.strand.length)
                ? 'Enzyme fell off the strand'
                : 'Processing complete'}
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
