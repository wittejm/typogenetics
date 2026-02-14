import { useState, useRef, useCallback } from 'react'
import './App.css'
import { strandToEnzymes } from './model/ribosome'
import { initialStrands } from './model/strand'
import { aminoLabel } from './labels'
import StrandText from './StrandText'
import ProcessingWindow from './ProcessingWindow'

type Selection =
  | null
  | { stage: 'enzyme'; si: number; ei: number }
  | { stage: 'bound'; si: number; ei: number; ti: number; bi: number }

interface ProcessingData {
  enzyme: string[]
  bindingPref: string
  strand: string
  boundBase: number
}

function App() {
  const [strands, setStrands] = useState<string[]>(initialStrands)
  const [selected, setSelected] = useState<Selection>(null)
  const [pulsingTarget, setPulsingTarget] = useState<number | null>(null)
  const [processingData, setProcessingData] = useState<ProcessingData | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedBindingPref = (() => {
    if (!selected) return null
    const enzymes = strandToEnzymes(strands[selected.si])
    return enzymes[selected.ei]?.[1] ?? null
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
      // no selection — select first enzyme of this strand
      const enzymes = strandToEnzymes(strands[i])
      if (enzymes.length > 0) {
        setSelected({ stage: 'enzyme', si: i, ei: 0 })
      }
    } else if (selected.si === i && selected.stage === 'enzyme') {
      // clicked the source item — deselect
      setSelected(null)
      clearPulse()
    } else if (selected.stage === 'enzyme') {
      // clicked a target strand (but not on a bindable base) — pulse
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

    // After animation, remove items and populate processing window
    setTimeout(() => {
      const enzymes = strandToEnzymes(strands[si])
      const [enzyme, pref] = enzymes[ei]
      const targetStrand = strands[ti]

      setProcessingData({ enzyme, bindingPref: pref, strand: targetStrand, boundBase: bi })

      // Remove source and target from strands (handle indices carefully)
      setStrands(prev => {
        const indicesToRemove = new Set([si, ti])
        return prev.filter((_, idx) => !indicesToRemove.has(idx))
      })
      setSelected(null)
    }, 500)
  }

  return (
    <div className="app">
      <h1>Typogenetics</h1>
      <div className="two-panel">
        <div className="strand-panel">
          <h2>Strand Pool</h2>
          <ol className="strand-list">
            {strands.map((strand, i) => {
              const enzymes = strandToEnzymes(strand)
              const isSource = selected !== null && selected.si === i
              const isExiting = selected?.stage === 'bound' && (selected.si === i || selected.ti === i)

              const isValidTarget = selected?.stage === 'enzyme'
                && !isSource
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
                    {enzymes.map(([enzyme, pref], ei) => {
                      const isSelected = isSource && selected!.ei === ei
                      const dimmed = selected !== null && !isSelected
                      return (
                        <div
                          key={ei}
                          className={`enzyme ${isSelected ? 'enzyme-selected' : ''} ${dimmed ? 'enzyme-dimmed' : ''}`}
                          onClick={(e) => handleEnzymeClick(e, i, ei)}
                        >
                          <span className="enzyme-ops">
                            {enzyme.map((amino, ai) => (
                              <span key={ai} className="amino-badge">{aminoLabel[amino] ?? amino}</span>
                            ))}
                          </span>
                          <span className="bind-pref">binds {pref}</span>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
        <ProcessingWindow data={processingData} />
      </div>
    </div>
  )
}

export default App
