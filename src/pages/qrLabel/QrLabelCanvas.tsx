import { useRef, type ReactNode } from 'react'
import type { LabelModule, TextModule } from './model'
import { PX_PER_MM, QUIET_ZONE_DEFAULT, borderWidthMm, clampModule, moduleBox, renderFilledText, renderSampleText, setCodeAreaSize, snapMm } from './model'
import styles from './qrLabel.module.css'

type DragMode = 'move' | 'resize'

type Props = {
  widthMm: number
  heightMm: number
  modules: LabelModule[]
  selectedId?: string
  showGrid: boolean
  sampleText: boolean
  values?: Record<string, string>
  barcodeMatrix?: number[][]
  interactive: boolean
  invalidIds?: string[]
  pxPerMm?: number
  showRuler?: boolean
  borderEnabled?: boolean
  borderWidthPx?: number
  onSelect?: (id?: string) => void
  onChangeModule?: (next: LabelModule) => void
}

const RULER_TOP = 22
const RULER_LEFT = 28

function rulerMarks(lengthMm: number, pxPerMm: number, axis: 'x' | 'y') {
  const marks: ReactNode[] = []
  const values = new Set<number>()
  for (let mm = 0; mm <= Math.floor(lengthMm); mm += 1) values.add(mm)
  values.add(lengthMm)
  for (const mm of [...values].sort((a, b) => a - b)) {
    const pos = mm * pxPerMm
    const major = mm % 5 === 0 || mm === lengthMm
    const tick = major ? 12 : 7
    if (axis === 'x') {
      marks.push(
        <line
          key={`t-${mm}`}
          x1={pos}
          y1={RULER_TOP - tick}
          x2={pos}
          y2={RULER_TOP}
          stroke="#64748b"
          strokeWidth={major ? 1.2 : 1}
        />,
      )
      if (major) {
        const textX = pos + 14 > lengthMm * pxPerMm && mm !== 0 ? pos - 14 : mm === 0 ? 2 : pos + 3
        marks.push(
          <text key={`tn-${mm}`} x={textX} y={11} fill="#334155" fontSize={10}>
            {mm}
          </text>,
        )
      }
    } else {
      marks.push(
        <line
          key={`l-${mm}`}
          x1={RULER_LEFT - tick}
          y1={pos}
          x2={RULER_LEFT}
          y2={pos}
          stroke="#64748b"
          strokeWidth={major ? 1.2 : 1}
        />,
      )
      if (major) {
        const textY = pos + 11 > lengthMm * pxPerMm ? pos - 2 : mm === 0 ? 11 : pos + 11
        marks.push(
          <text key={`ln-${mm}`} x={2} y={textY} fill="#334155" fontSize={10}>
            {mm}
          </text>,
        )
      }
    }
  }
  return marks
}

function PunchGraphic({ size }: { size: number }) {
  const r = size / 2
  return (
    <g>
      <circle cx={r} cy={r} r={r} fill="#dc2626" />
      <circle cx={r} cy={r} r={r * 0.62} fill="#fecaca" />
      <circle cx={r} cy={r} r={r * 0.28} fill="#991b1b" />
    </g>
  )
}

function DataMatrixGraphic({ size, quiet, matrix }: { size: number; quiet: number; matrix?: number[][] }) {
  const inner = Math.max(0, size - quiet * 2)
  if (matrix && matrix.length) {
    const n = matrix.length
    const cell = inner / n
    const squares = []
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        if (matrix[row][col]) {
          squares.push(
            <rect
              key={`${row}-${col}`}
              x={quiet + col * cell}
              y={quiet + row * cell}
              width={cell}
              height={cell}
              fill="#0f172a"
            />,
          )
        }
      }
    }
    return (
      <g>
        <rect x={0} y={0} width={size} height={size} fill="#fff" />
        {squares}
      </g>
    )
  }
  return (
    <g>
      <rect x={0} y={0} width={size} height={size} fill="#fff" stroke="#cbd5e1" strokeWidth={0.12} />
      <rect x={quiet} y={quiet} width={inner} height={inner} fill="none" stroke="#94a3b8" strokeWidth={0.1} strokeDasharray="0.6 0.4" />
    </g>
  )
}

function TextGraphic({
  mod,
  sample,
  values,
  px,
}: {
  mod: TextModule
  sample: boolean
  values?: Record<string, string>
  px: number
}) {
  const text = values ? renderFilledText(mod.content, values) : sample ? renderSampleText(mod.content) : mod.content || '文本'
  return (
    <foreignObject x={0} y={0} width={mod.w_mm} height={mod.h_mm}>
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          fontSize: `${Math.max(0, mod.font_mm) * px}px`,
          fontFamily: mod.font_family || 'Calibri',
          fontWeight: mod.bold ? 700 : 400,
          fontStyle: mod.italic ? 'italic' : 'normal',
          textDecoration: mod.underline ? 'underline' : 'none',
          lineHeight: 1.2,
          textAlign: mod.align,
          whiteSpace: mod.wrap ? 'pre-wrap' : 'nowrap',
          wordBreak: 'break-all',
          color: '#0f172a',
          padding: '0.4px 0.8px',
          boxSizing: 'border-box',
        }}
      >
        {text}
      </div>
    </foreignObject>
  )
}

export default function QrLabelCanvas({
  widthMm,
  heightMm,
  modules,
  selectedId,
  showGrid,
  sampleText,
  values,
  barcodeMatrix,
  interactive,
  invalidIds = [],
  pxPerMm = PX_PER_MM,
  showRuler,
  borderEnabled = false,
  borderWidthPx = 1,
  onSelect,
  onChangeModule,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    id: string
    mode: DragMode
    startX: number
    startY: number
    orig: LabelModule
  } | null>(null)

  const widthPx = widthMm * pxPerMm
  const heightPx = heightMm * pxPerMm
  const gridLines: ReactNode[] = []
  if (showGrid) {
    for (let x = 1; x < widthMm; x += 1) {
      gridLines.push(
        <line key={`vx-${x}`} x1={x} y1={0} x2={x} y2={heightMm} stroke="#e2e8f0" strokeWidth={0.08} />,
      )
    }
    for (let y = 1; y < heightMm; y += 1) {
      gridLines.push(
        <line key={`hy-${y}`} x1={0} y1={y} x2={widthMm} y2={y} stroke="#e2e8f0" strokeWidth={0.08} />,
      )
    }
  }

  const clientToMm = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * widthMm,
      y: ((clientY - rect.top) / rect.height) * heightMm,
    }
  }

  const applyDrag = (clientX: number, clientY: number) => {
    const drag = dragRef.current
    if (!drag || !onChangeModule) return
    const now = clientToMm(clientX, clientY)
    const dx = now.x - drag.startX
    const dy = now.y - drag.startY
    const orig = drag.orig
    if (drag.mode === 'move') {
      const box = moduleBox(orig)
      onChangeModule(
        clampModule(
          orig.type === 'text'
            ? { ...orig, x_mm: snapMm(box.x + dx), y_mm: snapMm(box.y + dy) }
            : { ...orig, x_mm: snapMm(box.x + dx), y_mm: snapMm(box.y + dy) },
          widthMm,
          heightMm,
        ),
      )
      return
    }
    if (orig.type === 'text') {
      onChangeModule(
        clampModule(
          {
            ...orig,
            w_mm: snapMm(Math.max(4, orig.w_mm + dx)),
            h_mm: snapMm(Math.max(3, orig.h_mm + dy)),
          },
          widthMm,
          heightMm,
        ),
      )
      return
    }
    if (orig.type === 'datamatrix') {
      onChangeModule(clampModule(setCodeAreaSize(orig, orig.size_mm + Math.max(dx, dy)), widthMm, heightMm))
      return
    }
    const next = snapMm(Math.max(3, orig.size_mm + Math.max(dx, dy)))
    onChangeModule(clampModule({ ...orig, size_mm: next }, widthMm, heightMm))
  }

  const withRuler = showRuler ?? interactive
  const canvasSvg = (
    <svg
      ref={svgRef}
      className={styles.canvasSvg}
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      onPointerDown={(e) => {
        if (!interactive) return
        if (e.target === svgRef.current) onSelect?.(undefined)
      }}
      onPointerMove={(e) => {
        if (dragRef.current) applyDrag(e.clientX, e.clientY)
      }}
      onPointerUp={() => {
        dragRef.current = null
      }}
      onPointerLeave={() => {
        dragRef.current = null
      }}
    >
      <rect
        x={0}
        y={0}
        width={widthMm}
        height={heightMm}
        fill="#fff"
        stroke={interactive ? '#94a3b8' : 'none'}
        strokeWidth={interactive ? 0.15 : 0}
      />
      {gridLines}
      {modules.map((mod) => {
        const box = moduleBox(mod)
        const selected = mod.id === selectedId
        const invalid = invalidIds.includes(mod.id)
        return (
          <g
            key={mod.id}
            transform={`translate(${box.x} ${box.y})`}
            onPointerDown={(e) => {
              if (!interactive) return
              e.stopPropagation()
              onSelect?.(mod.id)
              if (!onChangeModule) return
              const start = clientToMm(e.clientX, e.clientY)
              dragRef.current = { id: mod.id, mode: 'move', startX: start.x, startY: start.y, orig: mod }
              ;(e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId)
            }}
          >
            {mod.type === 'punch' && <PunchGraphic size={mod.size_mm} />}
            {mod.type === 'datamatrix' && (
              <DataMatrixGraphic
                size={mod.size_mm}
                quiet={mod.quiet_mm ?? QUIET_ZONE_DEFAULT}
                matrix={barcodeMatrix}
              />
            )}
            {mod.type === 'text' && (
              <g>
                <rect width={mod.w_mm} height={mod.h_mm} fill="#fff" stroke="#cbd5e1" strokeWidth={0.12} />
                <TextGraphic mod={mod} sample={sampleText} values={values} px={pxPerMm} />
              </g>
            )}
            <rect
              width={box.w}
              height={box.h}
              fill="transparent"
              stroke={invalid ? '#ef4444' : selected ? '#2563eb' : 'transparent'}
              strokeWidth={selected || invalid ? 0.25 : 0}
            />
            {interactive && selected && (
              <rect
                x={box.w - 1.2}
                y={box.h - 1.2}
                width={1.2}
                height={1.2}
                fill="#2563eb"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const start = clientToMm(e.clientX, e.clientY)
                  dragRef.current = { id: mod.id, mode: 'resize', startX: start.x, startY: start.y, orig: mod }
                  ;(e.currentTarget as SVGRectElement).setPointerCapture?.(e.pointerId)
                }}
              />
            )}
          </g>
        )
      })}
      {borderEnabled ? (
        <rect
          x={borderWidthMm(borderWidthPx) / 2}
          y={borderWidthMm(borderWidthPx) / 2}
          width={Math.max(0, widthMm - borderWidthMm(borderWidthPx))}
          height={Math.max(0, heightMm - borderWidthMm(borderWidthPx))}
          fill="none"
          stroke="#000"
          strokeWidth={borderWidthMm(borderWidthPx)}
        />
      ) : null}
    </svg>
  )

  if (!withRuler) return canvasSvg

  return (
    <div className={styles.canvasStage}>
      <div className={styles.rulerCorner}>mm</div>
      <svg className={styles.rulerSvg} width={widthPx} height={RULER_TOP}>
        {rulerMarks(widthMm, pxPerMm, 'x')}
      </svg>
      <svg className={styles.rulerSvg} width={RULER_LEFT} height={heightPx}>
        {rulerMarks(heightMm, pxPerMm, 'y')}
      </svg>
      {canvasSvg}
    </div>
  )
}
