interface StrandTextProps {
  strand: string
  bindingPref: string | null
  isTarget: boolean
  onBaseClick: ((baseIndex: number) => void) | null
  pulsing: boolean
}

export default function StrandText({ strand, bindingPref, isTarget, onBaseClick, pulsing }: StrandTextProps) {
  return (
    <span className="strand">
      {strand.split('').map((base, i) => {
        const bindable = isTarget && bindingPref !== null && base === bindingPref
        return (
          <span
            key={i}
            className={`base-letter${bindable ? ' base-bindable' : ''}${bindable && pulsing ? ' base-pulse' : ''}`}
            onClick={bindable && onBaseClick ? (e) => { e.stopPropagation(); onBaseClick(i) } : undefined}
          >
            {base}
          </span>
        )
      })}
    </span>
  )
}
