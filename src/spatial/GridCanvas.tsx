import { useRef, useEffect, useState, useCallback } from 'react'

type Props = {
  baseA: number[]
  baseC: number[]
  baseG: number[]
  baseT: number[]
  gridWidth: number
  gridHeight: number
  cellCapacity: number
}

export default function GridCanvas({
  baseA, baseC, baseG, baseT,
  gridWidth, gridHeight, cellCapacity,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number; y: number
    row: number; col: number
    strandCount: number
    a: number; c: number; g: number; t: number
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = gridWidth
    canvas.height = gridHeight

    const imageData = ctx.createImageData(gridWidth, gridHeight)
    const data = imageData.data

    for (let i = 0; i < gridWidth * gridHeight; i++) {
      const total = baseA[i] + baseC[i] + baseG[i] + baseT[i]
      const px = i * 4

      if (total === 0) {
        data[px] = 0
        data[px + 1] = 0
        data[px + 2] = 0
        data[px + 3] = 0
      } else {
        const fA = baseA[i] / total  // Cyan
        const fC = baseC[i] / total  // Magenta
        const fG = baseG[i] / total  // Yellow
        const fT = baseT[i] / total  // Key (black)

        const R = 255 * (1 - fA) * (1 - fT)
        const G = 255 * (1 - fC) * (1 - fT)
        const B = 255 * (1 - fG) * (1 - fT)
        const alpha = Math.min(1, total / cellCapacity) * 255

        data[px] = R
        data[px + 1] = G
        data[px + 2] = B
        data[px + 3] = alpha
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }, [baseA, baseC, baseG, baseT, gridWidth, gridHeight, cellCapacity])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = gridWidth / rect.width
    const scaleY = gridHeight / rect.height
    const col = Math.floor((e.clientX - rect.left) * scaleX)
    const row = Math.floor((e.clientY - rect.top) * scaleY)

    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
      setTooltip(null)
      return
    }

    const i = row * gridWidth + col
    const total = baseA[i] + baseC[i] + baseG[i] + baseT[i]
    // Estimate strand count from total bases (rough: avg strand ~4 bases)
    // Actually we should count strands, but we only have base counts.
    // Use total as the "weight" indicator.
    setTooltip({
      x: e.clientX + 12,
      y: e.clientY + 12,
      row, col,
      strandCount: total,
      a: baseA[i], c: baseC[i], g: baseG[i], t: baseT[i],
    })
  }, [baseA, baseC, baseG, baseT, gridWidth, gridHeight])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="grid-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip && (
        <div
          className="grid-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong>({tooltip.row}, {tooltip.col})</strong>
          <span>Bases: {tooltip.strandCount}</span>
          <span>A:{tooltip.a} C:{tooltip.c} G:{tooltip.g} T:{tooltip.t}</span>
        </div>
      )}
    </div>
  )
}
