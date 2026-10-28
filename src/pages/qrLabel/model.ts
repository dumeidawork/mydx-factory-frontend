export type ModuleType = 'punch' | 'datamatrix' | 'text'
export type CodeSymbology = 'ecc200' | 'qr'
export type TextAlign = 'left' | 'center' | 'right'
export type PaperKey = 'A4' | 'A3' | 'A5' | 'LETTER' | 'LABEL' | 'CUSTOM'
export type PreviewMode = 'single' | 'page'

export type PunchModule = {
  id: string
  type: 'punch'
  x_mm: number
  y_mm: number
  size_mm: number
}

export type DataMatrixModule = {
  id: string
  type: 'datamatrix'
  x_mm: number
  y_mm: number
  size_mm: number
  quiet_mm: number
  content: string
  symbology: CodeSymbology
}

export type TextModule = {
  id: string
  type: 'text'
  x_mm: number
  y_mm: number
  w_mm: number
  h_mm: number
  content: string
  font_mm: number
  font_family: string
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  wrap: boolean
}

export type LabelModule = PunchModule | DataMatrixModule | TextModule

export type PrintSettings = {
  paper: PaperKey
  orientation: 'portrait' | 'landscape'
  paper_w_mm: number | null
  paper_h_mm: number | null
  cols: number
  rows: number
  gap_x_mm: number
  gap_y_mm: number
  margin_mm: number
  border_enabled: boolean
  border_width_px: number
}

export type LabelDesign = {
  id?: number
  name: string
  width_mm: number
  height_mm: number
  modules: LabelModule[]
  print: PrintSettings
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

export const WIDTH_MIN = 50
export const WIDTH_MAX = 80
export const HEIGHT_MIN = 25
export const HEIGHT_MAX = 40
export const DATAMATRIX_MIN = 20
export const QUIET_ZONE_DEFAULT = 2.5
export const QUIET_ZONE_SPEC = 2.5
export const CODE_BODY_SPEC = 15
export const PX_PER_MM = 8
export const FONT_MM_MAX = 8
export const MM_PER_PT = 0.3528
export const CSS_PX_TO_MM = 25.4 / 96
export const BORDER_WIDTH_MIN = 0.5
export const BORDER_WIDTH_MAX = 8
export const DEFAULT_BORDER_WIDTH_PX = 1

export function clampBorderPx(value: number): number {
  const snapped = Math.round(value * 2) / 2
  return Math.min(BORDER_WIDTH_MAX, Math.max(BORDER_WIDTH_MIN, snapped))
}

export function borderWidthMm(px: number): number {
  return clampBorderPx(px) * CSS_PX_TO_MM
}
export const FONT_PT_MAX = Math.round((FONT_MM_MAX / MM_PER_PT) * 1000) / 1000
export const FONT_PT_MAX_INT = Math.floor(FONT_PT_MAX)

export const DEFAULT_FONT_FAMILY = 'Calibri'
export const DEFAULT_SYMBOLOGY: CodeSymbology = 'ecc200'
export const DEFAULT_FONT_PT = 11
export const DEFAULT_FONT_BOLD = true

export const DEFAULT_DATAMATRIX_CONTENT =
  '1P{{material_no}}+1T{{heat_no}}_{{heat_treatment_batch_no}}+K{{order_no}}'

export const FONT_FAMILIES = [
  { value: 'Calibri', label: 'Calibri' },
  { value: '微软雅黑', label: '微软雅黑' },
  { value: '宋体', label: '宋体' },
  { value: '黑体', label: '黑体' },
  { value: '楷体', label: '楷体' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
]
export const DEFAULT_WIDTH = 70
export const DEFAULT_HEIGHT = 32

export const PAPER_SIZES_MM: Record<Exclude<PaperKey, 'CUSTOM'>, { label: string; width: number; height: number }> = {
  A3: { label: 'A3 (297×420)', width: 297, height: 420 },
  A4: { label: 'A4 (210×297 默认)', width: 210, height: 297 },
  A5: { label: 'A5 (148×210)', width: 148, height: 210 },
  LETTER: { label: 'Letter (215.9×279.4)', width: 215.9, height: 279.4 },
  LABEL: { label: '热敏标 (100×150)', width: 100, height: 150 },
}

export const PLACEHOLDER_FIELDS: { key: string; label: string }[] = [
  { key: 'order_no', label: '订单号' },
  { key: 'factory_order_no', label: '本厂单号' },
  { key: 'item_no', label: '条目' },
  { key: 'drawing_rev_no', label: '图纸号' },
  { key: 'material_no', label: 'R3P物料号' },
  { key: 'part_name', label: '料号' },
  { key: 'typing_content', label: '打字内容如下：' },
  { key: 'spec', label: '规格' },
  { key: 'model_standard', label: '型号（标准）' },
  { key: 'qr_spec', label: '二维码规格信息' },
  { key: 'heat_no', label: '炉号' },
  { key: 'heat_treatment_batch_no', label: '热处理批号' },
  { key: 'quantity', label: '数量' },
  { key: 'unit_weight', label: '单重' },
  { key: 'remark', label: '备注' },
]

export const SAMPLE_VALUES: Record<string, string> = {
  order_no: '2000581321',
  factory_order_no: 'MY-2026-001',
  item_no: '1',
  drawing_rev_no: 'A5E02970605A Rev017',
  material_no: 'FDK-083N5025',
  part_name: 'FDK-083N5025',
  typing_content: 'EN1092-1 DN50 PN16 A105+QT 45678 MY2511 铭远厂标',
  spec: 'DN50',
  model_standard: 'PN16（EN1092-1）',
  qr_spec: 'DN50/PN16',
  heat_no: '45678',
  heat_treatment_batch_no: 'MY2511',
  quantity: '20',
  unit_weight: '1.25',
  remark: '绿漆',
}

export function snapMm(value: number): number {
  return Math.round(value * 2) / 2
}

export function snapTenth(value: number): number {
  return Math.round(value * 10) / 10
}

export function snapThousandth(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function normalizeSymbology(value?: string | null): CodeSymbology {
  return value === 'qr' ? 'qr' : DEFAULT_SYMBOLOGY
}

export function fontMmToPt(fontMm: number): number {
  return fontMm / MM_PER_PT
}

export function fontPtToMm(fontPt: number): number {
  return fontPt * MM_PER_PT
}

export function clampFontMm(fontMm: number): number {
  return snapThousandth(Math.max(0, Math.min(FONT_MM_MAX, fontMm)))
}

export function clampFontPt(fontPt: number): number {
  return snapThousandth(fontMmToPt(clampFontMm(fontPtToMm(fontPt))))
}

export function snapFontPt(fontPt: number): number {
  return Math.max(0, Math.min(FONT_PT_MAX_INT, Math.round(fontPt)))
}

export function codeSizeMm(mod: DataMatrixModule): number {
  return snapTenth(Math.max(0, mod.size_mm - 2 * (mod.quiet_mm ?? QUIET_ZONE_DEFAULT)))
}

export function setCodeAreaSize(mod: DataMatrixModule, sizeMm: number): DataMatrixModule {
  const size = snapMm(Math.max(1, sizeMm))
  const quiet = snapTenth(Math.max(0, Math.min(mod.quiet_mm ?? QUIET_ZONE_DEFAULT, size / 2)))
  return { ...mod, size_mm: size, quiet_mm: quiet }
}

export function setQuietZone(mod: DataMatrixModule, quietMm: number): DataMatrixModule {
  const quiet = snapTenth(Math.max(0, Math.min(quietMm, mod.size_mm / 2)))
  return { ...mod, quiet_mm: quiet }
}

export function setCodeBodySize(mod: DataMatrixModule, codeMm: number): DataMatrixModule {
  const code = snapTenth(Math.max(0, Math.min(codeMm, mod.size_mm)))
  return { ...mod, quiet_mm: snapTenth((mod.size_mm - code) / 2) }
}

export function belowCodeSpec(mod: DataMatrixModule): boolean {
  return mod.size_mm < DATAMATRIX_MIN - 1e-6 || (mod.quiet_mm ?? 0) < QUIET_ZONE_SPEC - 1e-6 || codeSizeMm(mod) < CODE_BODY_SPEC - 1e-6
}

export function normalizeModule(mod: LabelModule): LabelModule {
  if (mod.type === 'datamatrix') {
    return {
      ...mod,
      quiet_mm: snapTenth(mod.quiet_mm ?? QUIET_ZONE_DEFAULT),
      content: mod.content ?? '',
      symbology: normalizeSymbology(mod.symbology),
    }
  }
  if (mod.type === 'text') {
    const legacy = mod as TextModule & { font_pt?: number }
    const fontMm = legacy.font_mm ?? (legacy.font_pt != null ? legacy.font_pt * MM_PER_PT : 0.5)
    return {
      ...legacy,
      font_mm: clampFontMm(fontMm),
      font_family: legacy.font_family || DEFAULT_FONT_FAMILY,
      bold: Boolean(legacy.bold),
      italic: Boolean(legacy.italic),
      underline: Boolean(legacy.underline),
    }
  }
  return mod
}

export function normalizePrint(print: Partial<PrintSettings> | undefined, widthMm: number, heightMm: number): PrintSettings {
  const base = defaultPrint(widthMm, heightMm)
  return {
    ...base,
    ...print,
    border_enabled: Boolean(print?.border_enabled),
    border_width_px: clampBorderPx(Number(print?.border_width_px ?? DEFAULT_BORDER_WIDTH_PX)),
  }
}

export function normalizeDesign(row: LabelDesign): LabelDesign {
  return {
    ...row,
    modules: (row.modules || []).map(normalizeModule),
    print: normalizePrint(row.print, row.width_mm, row.height_mm),
  }
}

export function newModuleId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function defaultPrint(widthMm: number, heightMm: number): PrintSettings {
  const gap = 1
  const margin = 5
  const paper = paperSizeMm('A4', 'landscape', null, null)
  return {
    paper: 'A4',
    orientation: 'landscape',
    paper_w_mm: null,
    paper_h_mm: null,
    cols: Math.max(1, maxFit(paper.width, widthMm, gap, margin)),
    rows: Math.max(1, maxFit(paper.height, heightMm, gap, margin)),
    gap_x_mm: gap,
    gap_y_mm: gap,
    margin_mm: margin,
    border_enabled: false,
    border_width_px: DEFAULT_BORDER_WIDTH_PX,
  }
}

export function emptyDesign(name: string, widthMm = DEFAULT_WIDTH, heightMm = DEFAULT_HEIGHT): LabelDesign {
  return {
    name,
    width_mm: snapMm(widthMm),
    height_mm: snapMm(heightMm),
    modules: [],
    print: defaultPrint(widthMm, heightMm),
  }
}

export function paperSizeMm(
  paper: PaperKey,
  orientation: PrintSettings['orientation'],
  customW: number | null,
  customH: number | null,
): { width: number; height: number } {
  if (paper === 'CUSTOM') {
    return { width: snapMm(customW || 210), height: snapMm(customH || 297) }
  }
  const size = PAPER_SIZES_MM[paper]
  if (orientation === 'landscape') return { width: size.height, height: size.width }
  return { width: size.width, height: size.height }
}

export function maxFit(paper: number, label: number, gap: number, margin: number): number {
  const usable = paper - margin * 2
  if (usable < label) return 0
  return Math.floor((usable + gap) / (label + gap))
}

export function moduleBox(mod: LabelModule): { x: number; y: number; w: number; h: number } {
  if (mod.type === 'text') return { x: mod.x_mm, y: mod.y_mm, w: mod.w_mm, h: mod.h_mm }
  return { x: mod.x_mm, y: mod.y_mm, w: mod.size_mm, h: mod.size_mm }
}

export function clampModule(mod: LabelModule, widthMm: number, heightMm: number): LabelModule {
  const box = moduleBox(mod)
  const w = Math.min(box.w, widthMm)
  const h = Math.min(box.h, heightMm)
  const x = snapMm(Math.min(Math.max(0, box.x), Math.max(0, widthMm - w)))
  const y = snapMm(Math.min(Math.max(0, box.y), Math.max(0, heightMm - h)))
  if (mod.type === 'text') return { ...mod, x_mm: x, y_mm: y, w_mm: snapMm(w), h_mm: snapMm(h) }
  const size = snapMm(Math.min(w, h))
  if (mod.type === 'datamatrix') {
    const quiet = snapTenth(Math.max(0, Math.min(mod.quiet_mm ?? QUIET_ZONE_DEFAULT, size / 2)))
    return { ...mod, x_mm: x, y_mm: y, size_mm: size, quiet_mm: quiet }
  }
  return { ...mod, x_mm: x, y_mm: y, size_mm: size }
}

export function validateDesign(design: LabelDesign): string | null {
  const name = design.name.trim()
  if (!name) return '标签名不能为空'
  if (design.width_mm < WIDTH_MIN || design.width_mm > WIDTH_MAX) {
    return `标签宽度须在 ${WIDTH_MIN}–${WIDTH_MAX} mm`
  }
  if (design.height_mm < HEIGHT_MIN || design.height_mm > HEIGHT_MAX) {
    return `标签高度须在 ${HEIGHT_MIN}–${HEIGHT_MAX} mm`
  }
  const codes = design.modules.filter((m) => m.type === 'datamatrix')
  if (codes.length > 1) return '一张标签最多放置 1 个二维码生成区域'
  for (let i = 0; i < design.modules.length; i += 1) {
    const mod = design.modules[i]
    const box = moduleBox(mod)
    if (box.x < -0.01 || box.y < -0.01 || box.x + box.w - design.width_mm > 0.01 || box.y + box.h - design.height_mm > 0.01) {
      return `第 ${i + 1} 个模块超出画布，请拖回标签范围内`
    }
    if (mod.type === 'datamatrix') {
      if (mod.size_mm < 1) return '码区边长须大于 0'
      if ((mod.quiet_mm ?? 0) < 0 || codeSizeMm(mod) < 0) return '净空或 Data Matrix 尺寸不合法'
    }
  }
  const paper = paperSizeMm(design.print.paper, design.print.orientation, design.print.paper_w_mm, design.print.paper_h_mm)
  const maxCols = maxFit(paper.width, design.width_mm, design.print.gap_x_mm, design.print.margin_mm)
  const maxRows = maxFit(paper.height, design.height_mm, design.print.gap_y_mm, design.print.margin_mm)
  if (maxCols < 1 || maxRows < 1) return '当前纸张放不下这一枚标签，请改纸张或缩小标签'
  if (design.print.cols > maxCols || design.print.rows > maxRows) {
    return `当前纸张最多横 ${maxCols} × 竖 ${maxRows}`
  }
  return null
}

export function insertPlaceholder(content: string, key: string): string {
  const token = `{{${key}}}`
  return content ? `${content}${token}` : token
}

export function renderSampleText(content: string): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => SAMPLE_VALUES[key] ?? `{{${key}}}`)
}

export function renderFilledText(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '')
}

export function labelPageCount(quantity: number, cols: number, rows: number): number {
  const perPage = Math.max(1, (cols || 1) * (rows || 1))
  const qty = Math.max(0, Math.floor(quantity || 0))
  if (qty <= 0) return 0
  return Math.ceil(qty / perPage)
}

export function paperLabel(print: PrintSettings): string {
  if (print.paper === 'CUSTOM') {
    return `自定义 ${print.paper_w_mm ?? '—'}×${print.paper_h_mm ?? '—'} mm`
  }
  return PAPER_SIZES_MM[print.paper].label.replace(' 默认', '')
}

export function createModule(type: ModuleType, widthMm: number, heightMm: number, existing: LabelModule[]): LabelModule | string {
  const offset = snapMm(2 + existing.length * 1.5)
  if (type === 'datamatrix') {
    if (existing.some((m) => m.type === 'datamatrix')) return '一张标签最多放置 1 个二维码生成区域'
    const size = DATAMATRIX_MIN
    if (size > widthMm || size > heightMm) return '当前标签尺寸放不下 20 mm 码区'
    return clampModule(
      {
        id: newModuleId(),
        type: 'datamatrix',
        x_mm: offset,
        y_mm: 2,
        size_mm: size,
        quiet_mm: QUIET_ZONE_DEFAULT,
        content: DEFAULT_DATAMATRIX_CONTENT,
        symbology: DEFAULT_SYMBOLOGY,
      },
      widthMm,
      heightMm,
    )
  }
  if (type === 'punch') {
    return clampModule({ id: newModuleId(), type: 'punch', x_mm: offset, y_mm: 2, size_mm: 6 }, widthMm, heightMm)
  }
  return clampModule(
    {
      id: newModuleId(),
      type: 'text',
      x_mm: offset,
      y_mm: 2,
      w_mm: 40,
      h_mm: 8,
      content: '',
      font_mm: clampFontMm(fontPtToMm(DEFAULT_FONT_PT)),
      font_family: DEFAULT_FONT_FAMILY,
      bold: DEFAULT_FONT_BOLD,
      italic: false,
      underline: false,
      align: 'left',
      wrap: false,
    },
    widthMm,
    heightMm,
  )
}
