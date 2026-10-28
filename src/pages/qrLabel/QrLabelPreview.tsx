import type { ReactNode } from 'react'
import QrLabelCanvas from './QrLabelCanvas'
import { useDatamatrixMatrix } from './datamatrixPreview'
import type { LabelDesign } from './model'
import { paperSizeMm, SAMPLE_VALUES, normalizeSymbology } from './model'
import styles from './qrLabel.module.css'

type Props = {
  design: LabelDesign
  mode: 'single' | 'page'
}

export default function QrLabelPreview({ design, mode }: Props) {
  const dm = design.modules.find((mod) => mod.type === 'datamatrix')
  const { matrix } = useDatamatrixMatrix(
    dm?.type === 'datamatrix' ? dm.content || '' : undefined,
    SAMPLE_VALUES,
    dm?.type === 'datamatrix' ? normalizeSymbology(dm.symbology) : undefined,
  )
  if (mode === 'single') {
    return (
      <div className={styles.previewPage}>
        <QrLabelCanvas
          widthMm={design.width_mm}
          heightMm={design.height_mm}
          modules={design.modules}
          showGrid={false}
          sampleText
          barcodeMatrix={matrix}
          interactive={false}
          pxPerMm={6}
          borderEnabled={design.print.border_enabled}
          borderWidthPx={design.print.border_width_px}
        />
      </div>
    )
  }

  const paper = paperSizeMm(design.print.paper, design.print.orientation, design.print.paper_w_mm, design.print.paper_h_mm)
  const scale = Math.min(2.2, 640 / paper.width)
  const cells: ReactNode[] = []
  for (let row = 0; row < design.print.rows; row += 1) {
    for (let col = 0; col < design.print.cols; col += 1) {
      const left = (design.print.margin_mm + col * (design.width_mm + design.print.gap_x_mm)) * scale
      const top = (design.print.margin_mm + row * (design.height_mm + design.print.gap_y_mm)) * scale
      cells.push(
        <div key={`${row}-${col}`} style={{ position: 'absolute', left, top }}>
          <QrLabelCanvas
            widthMm={design.width_mm}
            heightMm={design.height_mm}
            modules={design.modules}
            showGrid={false}
            sampleText
            barcodeMatrix={matrix}
            interactive={false}
            pxPerMm={scale}
            borderEnabled={design.print.border_enabled}
            borderWidthPx={design.print.border_width_px}
          />
        </div>,
      )
    }
  }

  return (
    <div className={styles.previewPage}>
      <div
        className={styles.previewPaper}
        style={{
          position: 'relative',
          width: paper.width * scale,
          height: paper.height * scale,
        }}
      >
        {cells}
      </div>
    </div>
  )
}
