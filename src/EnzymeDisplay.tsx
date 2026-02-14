import type { Enzyme } from './model/types'
import { aminoLabel } from './labels'

type Props = {
  enzyme: Enzyme
  className?: string
  aminoClassName?: (ai: number) => string
  onClick?: (e: React.MouseEvent) => void
}

export default function EnzymeDisplay({ enzyme, className, aminoClassName, onClick }: Props) {
  return (
    <div className={`enzyme ${className ?? ''}`} onClick={onClick}>
      <span className="enzyme-ops">
        {enzyme.aminos.map((amino, ai) => (
          <span
            key={ai}
            className={`amino-badge ${aminoClassName ? aminoClassName(ai) : ''}`}
          >
            {aminoLabel[amino] ?? amino}
          </span>
        ))}
      </span>
      <span className="bind-pref">binds {enzyme.bindingPref}</span>
    </div>
  )
}
