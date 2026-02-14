import { useState, useRef, useEffect } from 'react'
import { translate } from './model/ribosome'
import EnzymeDisplay from './EnzymeDisplay'

type Props = {
  strand: string
  className?: string
}

export default function StrandWithTooltip({ strand, className }: Props) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const tipRef = useRef<HTMLDivElement>(null)
  const spanRef = useRef<HTMLSpanElement>(null)

  const enzymes = show ? translate(strand) : []

  useEffect(() => {
    if (!show || !tipRef.current || !spanRef.current) return
    const tip = tipRef.current
    const rect = tip.getBoundingClientRect()
    // Keep tooltip within viewport
    if (rect.right > window.innerWidth) {
      setPos(p => ({ ...p, x: p.x - (rect.right - window.innerWidth) - 8 }))
    }
    if (rect.bottom > window.innerHeight) {
      setPos(p => ({ ...p, y: p.y - rect.height - 20 }))
    }
  }, [show])

  function handleMouseEnter(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ x: rect.left, y: rect.bottom + 4 })
    setShow(true)
  }

  return (
    <>
      <span
        ref={spanRef}
        className={`strand strand-hoverable ${className ?? ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
      >
        {strand}
      </span>
      {show && enzymes.length > 0 && (
        <div ref={tipRef} className="strand-tooltip" style={{ left: pos.x, top: pos.y }}>
          {enzymes.map((enzyme, i) => (
            <EnzymeDisplay key={i} enzyme={enzyme} />
          ))}
        </div>
      )}
      {show && enzymes.length === 0 && (
        <div ref={tipRef} className="strand-tooltip strand-tooltip-inert" style={{ left: pos.x, top: pos.y }}>
          No enzymes
        </div>
      )}
    </>
  )
}
