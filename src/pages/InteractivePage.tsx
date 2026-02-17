import { useState, useRef, useCallback } from 'react'
import { translate } from '../model/ribosome'
import { initialStrands } from '../model/strand'
import StrandText from '../StrandText'
import EnzymeDisplay from '../EnzymeDisplay'
import ProcessingWindow, { type ProcessingData } from '../ProcessingWindow'

const SPEEDS = [1, 2, 5, 10, 50] as const

type Selection =
  | null
  | { stage: 'enzyme'; si: number; ei: number }
  | { stage: 'bound'; si: number; ei: number; ti: number; bi: number }

export default function InteractivePage() {
  const [speedIndex, setSpeedIndex] = useState(0)
  const speed = SPEEDS[speedIndex]
  const [strands, setStrands] = useState<string[]>(initialStrands)
  const [selected, setSelected] = useState<Selection>(null)
  const [pulsingTarget, setPulsingTarget] = useState<number | null>(null)
  const [processingData, setProcessingData] = useState<ProcessingData | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newStrand, setNewStrand] = useState('')

  const selectedBindingPref = (() => {
    if (!selected) return null
    const enzymes = translate(strands[selected.si])
    return enzymes[selected.ei]?.bindingPref ?? null
  })()

  const clearPulse = useCallback(() => {
    if (pulseTimer.current) {
      clearTimeout(pulseTimer.current)
      pulseTimer.current = null
    }
    setPulsingTarget(null)
  }, [])

  function handleEnzymeClick(e: React.MouseEvent, si: number, ei: number) {
    e.stopPropagation()
    if (selected && selected.si === si && selected.ei === ei) {
      setSelected(null)
      clearPulse()
    } else {
      setSelected({ stage: 'enzyme', si, ei })
      clearPulse()
    }
  }

  function handleItemClick(i: number) {
    if (selected === null) {
      const enzymes = translate(strands[i])
      if (enzymes.length > 0) {
        setSelected({ stage: 'enzyme', si: i, ei: 0 })
      }
    } else if (selected.si === i && selected.stage === 'enzyme') {
      const strand = strands[i]
      if (selectedBindingPref && strand.includes(selectedBindingPref)) {
        triggerPulse(i)
      }
    } else if (selected.stage === 'enzyme') {
      const strand = strands[i]
      if (selectedBindingPref && strand.includes(selectedBindingPref)) {
        triggerPulse(i)
      }
    }
  }

  function triggerPulse(ti: number) {
    clearPulse()
    setPulsingTarget(ti)
    pulseTimer.current = setTimeout(() => {
      setPulsingTarget(null)
      pulseTimer.current = null
    }, 1200)
  }

  function handleBaseClick(ti: number, bi: number) {
    if (!selected || selected.stage !== 'enzyme') return
    const { si, ei } = selected
    setSelected({ stage: 'bound', si, ei, ti, bi })
    clearPulse()

    setTimeout(() => {
      const enzymes = translate(strands[si])
      const enzyme = enzymes[ei]
      const targetStrand = strands[ti]

      setProcessingData({ enzyme, strand: targetStrand, boundBase: bi })

      setStrands(prev => {
        const indicesToRemove = new Set([si, ti])
        return prev.filter((_, idx) => !indicesToRemove.has(idx))
      })
      setSelected(null)
    }, 500 / speed)
  }

  return (
    <div className="two-panel">
      <div className="strand-panel">
        <div className="strand-pool-header">
          <h2>Strand Pool</h2>
          <div className="speed-control">
            <button
              className="speed-btn"
              disabled={speedIndex === 0}
              onClick={() => setSpeedIndex(i => i - 1)}
            >&larr;</button>
            <span className="speed-value">x{speed}</span>
            <button
              className="speed-btn"
              disabled={speedIndex === SPEEDS.length - 1}
              onClick={() => setSpeedIndex(i => i + 1)}
            >&rarr;</button>
          </div>
        </div>
        <ol className="strand-list" style={{ '--exit-duration': `${0.5 / speed}s` } as React.CSSProperties}>
          <li className="strand-item strand-item-create">
            <input
              className="strand-create-input"
              type="text"
              value={newStrand}
              onChange={e => setNewStrand(e.target.value.replace(/[^acgtACGT]/g, '').toUpperCase())}
              placeholder="ACGT..."
            />
            <button
              className="strand-create-btn"
              disabled={newStrand.length === 0}
              onClick={() => { setStrands(prev => [newStrand, ...prev]); setNewStrand('') }}
            >Create</button>
          </li>
          {strands.map((strand, i) => {
            const enzymes = translate(strand)
            const isSource = selected !== null && selected.si === i
            const isExiting = selected?.stage === 'bound' && (selected.si === i || selected.ti === i)

            const isValidTarget = selected?.stage === 'enzyme'
              && selectedBindingPref !== null
              && strand.includes(selectedBindingPref)
            const isInert = selected?.stage === 'enzyme' && !isSource && !isValidTarget

            return (
              <li
                key={i}
                className={
                  `strand-item`
                  + (isSource ? ' strand-item-source' : '')
                  + (isValidTarget ? ' strand-item-target' : '')
                  + (isInert ? ' strand-item-inert' : '')
                  + (isExiting ? ' strand-item-exiting' : '')
                }
                onClick={() => handleItemClick(i)}
              >
                <StrandText
                  strand={strand}
                  bindingPref={selectedBindingPref}
                  isTarget={isValidTarget}
                  onBaseClick={isValidTarget ? (bi) => handleBaseClick(i, bi) : null}
                  pulsing={pulsingTarget === i}
                />
                <div className="enzymes">
                  {enzymes.map((enzyme, ei) => {
                    const isSelected = isSource && selected!.ei === ei
                    const dimmed = selected !== null && !isSelected
                    return (
                      <EnzymeDisplay
                        key={ei}
                        enzyme={enzyme}
                        className={`${isSelected ? 'enzyme-selected' : ''} ${dimmed ? 'enzyme-dimmed' : ''}`}
                        onClick={(e) => handleEnzymeClick(e, i, ei)}
                      />
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
      <ProcessingWindow
        data={processingData}
        speed={speed}
        onComplete={useCallback((results: string[]) => {
          setStrands(prev => [...results, ...prev])
        }, [])}
      />
    </div>
  )
}
