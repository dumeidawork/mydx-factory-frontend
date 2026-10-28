import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, AutoComplete, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Resizable } from 'react-resizable'
import 'react-resizable/css/styles.css'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { usePageTitle } from '../layout/usePageTitle'
import { normalizeDrawingInput } from '../utils/specParser'
import ContractArchivePanel from './ContractArchivePanel'
import './ContractOrdersPage.css'

type AnyRow = Record<string, unknown>
type ManualRow = {
  key: string
  seq: number
  item_no?: number
  name: string
  drawing_no: string
  material_no: string
  spec_model: string
  material: string
  quantity: number
  unit_weight: number
  total_weight: number
  agreement_price: number
  product_unit_price: number
  remark1: string
  remark2: string
  /** 提交后由后端回填：待补资料 */
  doc_status?: string
}
type MaterialLookupResult = {
  source_index: number
  material_no: string
  part_no: string
  drawing_no: string
  spec_model: string
  material: string
  unit_weight: number
  product_unit_price?: number
  france_agreement_price?: number
  dalian_agreement_price?: number
  france_tax_inclusive_price?: number
}
type MaterialLookupMissing = {
  source_index: number
  drawing_no: string
  material_no: string
  reason?: string
}
type OrderSubmitFormValues = {
  order_no: string
  factory_order_no?: string
  customer: string
}
type CellState = 'normal' | 'error' | 'fixed' | 'diff'

/** 可通过「获取物料信息」回填的字段 */
const MATERIAL_FETCH_FIELDS = ['name', 'spec_model', 'material', 'unit_weight', 'total_weight', 'agreement_price', 'product_unit_price'] as const
type MaterialFetchField = (typeof MATERIAL_FETCH_FIELDS)[number]

const statusOptions = ['开始', '分割', '加工', '入库', '质检', '再加工', '包装', '装箱', '打包', '发货', '完成']
const modeOptions = ['本厂钢材', '外来毛胚', '外来成品']

type ContractSection = 'upload' | 'manual' | 'materials' | 'query' | 'split'

function contractSectionFromPath(pathname: string): ContractSection {
  if (pathname.endsWith('/upload')) return 'upload'
  if (pathname.endsWith('/materials')) return 'materials'
  if (pathname.endsWith('/query')) return 'query'
  if (pathname.endsWith('/split')) return 'split'
  return 'manual'
}

/** 与后端 ORDER_DETAIL_WRITABLE_FIELDS 一致 */
const ORDER_DETAIL_WRITABLE_KEYS = [
  'customer',
  'factory_order_no',
  'seq',
  'item_no',
  'name',
  'drawing_no',
  'material_no',
  'spec_model',
  'spec',
  'standard',
  'material',
  'quantity',
  'unit_weight',
  'total_weight',
  'agreement_price',
  'product_unit_price',
  'remark1',
  'remark2',
  'heat_no',
  'heat_treatment_batch_no',
  'status',
  'upload_type',
  'material_mode',
] as const

type OrderDetailWritableKey = (typeof ORDER_DETAIL_WRITABLE_KEYS)[number]

const ORDER_DETAIL_DISPLAY_ORDER = [
  'id',
  'order_no',
  'customer',
  'factory_order_no',
  'seq',
  'item_no',
  'name',
  'drawing_no',
  'material_no',
  'spec_model',
  'spec',
  'standard',
  'material',
  'quantity',
  'unit_weight',
  'total_weight',
  'agreement_price',
  'product_unit_price',
  'remark1',
  'remark2',
  'heat_no',
  'heat_treatment_batch_no',
  'status',
  'planned_arrival_date',
  'actual_delivery_date',
  'reservation_status',
  'doc_status',
  'upload_type',
  'material_mode',
  'started_at',
  'finished_at',
  'packed_at',
  'shipped_at',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
] as const

const ORDER_DETAIL_HIDDEN_KEYS = ['created_by_user_id', 'updated_by_user_id'] as const

const ORDER_DETAIL_DISPLAY_ORDER_SET = new Set<string>([
  ...(ORDER_DETAIL_DISPLAY_ORDER as unknown as string[]),
  ...ORDER_DETAIL_HIDDEN_KEYS,
])

const ORDER_DETAIL_LABELS: Record<string, string> = {
  id: 'ID',
  order_no: '订单号',
  customer: '客户',
  factory_order_no: '本厂单号',
  seq: '序号',
  item_no: '条目',
  name: '名称/料号',
  drawing_no: '图纸号',
  material_no: '物料号',
  spec_model: '规格型号',
  spec: '规格',
  standard: '标准',
  material: '材质',
  quantity: '数量',
  unit_weight: '单重',
  total_weight: '总重',
  agreement_price: '协议价',
  product_unit_price: '产品单价',
  remark1: '备注1',
  remark2: '备注2',
  heat_no: '炉号',
  heat_treatment_batch_no: '热处理批号',
  status: '状态',
  planned_arrival_date: '预定到货日期',
  actual_delivery_date: '实际发货日期',
  reservation_status: '预定状态',
  doc_status: '资料状态',
  upload_type: '上传方式',
  material_mode: '生产模式',
  started_at: '开始时间',
  finished_at: '完成时间',
  packed_at: '装箱时间',
  shipped_at: '发货时间',
  created_by: '上传者',
  created_at: '上传时间',
  updated_by: '更改者',
  updated_at: '更改时间',
}

const orderQueryExportColumns = ORDER_DETAIL_DISPLAY_ORDER.map((key) => ({
  key,
  title: ORDER_DETAIL_LABELS[key] || key,
}))

type XlsxStyleEngine = {
  utils: {
    decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }
    encode_cell: (addr: { r: number; c: number }) => string
  }
}

type XlsxStyledCell = {
  t?: string
  v?: unknown
  s?: {
    border: Record<string, { style: string; color: { auto: number } }>
    alignment: { vertical: string; horizontal: string; wrapText: boolean }
    fill?: { fgColor: { rgb: string } }
  }
}

type XlsxStyledSheet = Record<string, unknown> & {
  '!ref'?: string
  '!cols'?: Array<{ wch: number }>
  '!rows'?: Array<{ hpt: number } | null>
}

const QUERY_EXPORT_THIN_BORDER = {
  top: { style: 'thin', color: { auto: 1 } },
  bottom: { style: 'thin', color: { auto: 1 } },
  left: { style: 'thin', color: { auto: 1 } },
  right: { style: 'thin', color: { auto: 1 } },
}

const QUERY_EXPORT_MIN_COL_WIDTH = 8
const QUERY_EXPORT_MAX_COL_WIDTH = 60
const QUERY_EXPORT_MIN_ROW_HEIGHT = 15
const QUERY_EXPORT_MAX_ROW_HEIGHT = 180
const QUERY_EXPORT_LINE_HEIGHT = 15

function cellHasExportContent(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function getExportDisplayLength(text: string): number {
  let len = 0
  for (const ch of text) {
    len += ch.charCodeAt(0) > 255 ? 2 : 1
  }
  return len
}

function getExportCellText(cell: XlsxStyledCell | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  return String(cell.v)
}

function findQueryExportContentBounds(ws: XlsxStyledSheet, XLSX: XlsxStyleEngine) {
  const ref = ws['!ref']
  if (!ref) return null
  const range = XLSX.utils.decode_range(ref)
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = -1
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = -1

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = ws[cellRef] as XlsxStyledCell | undefined
      if (!cellHasExportContent(cell?.v)) continue
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
    }
  }

  if (maxRow < 0) return null
  return { minRow, maxRow, minCol, maxCol }
}

function estimateExportWrappedLines(text: string, colWidth: number): number {
  if (!text) return 1
  const effectiveWidth = Math.max(colWidth - 1, 1)
  return text.split('\n').reduce((sum, line) => {
    const len = getExportDisplayLength(line)
    return sum + Math.max(1, Math.ceil(len / effectiveWidth))
  }, 0)
}

function autofitQueryExportSheetSize(
  ws: XlsxStyledSheet,
  XLSX: XlsxStyleEngine,
  bounds: { minRow: number; maxRow: number; minCol: number; maxCol: number },
) {
  const colWidths: number[] = []
  for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
    let maxLen = 0
    for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const text = getExportCellText(ws[cellRef] as XlsxStyledCell | undefined)
      maxLen = Math.max(maxLen, getExportDisplayLength(text))
    }
    const wch = Math.min(Math.max(maxLen + 2, QUERY_EXPORT_MIN_COL_WIDTH), QUERY_EXPORT_MAX_COL_WIDTH)
    colWidths.push(wch)
  }

  const cols = (ws['!cols'] || []) as Array<{ wch: number }>
  colWidths.forEach((wch, index) => {
    cols[bounds.minCol + index] = { wch }
  })
  ws['!cols'] = cols

  const rows = (ws['!rows'] || []) as Array<{ hpt: number } | null>
  for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    let maxLines = 1
    for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const text = getExportCellText(ws[cellRef] as XlsxStyledCell | undefined)
      const colWidth = colWidths[col - bounds.minCol]
      maxLines = Math.max(maxLines, estimateExportWrappedLines(text, colWidth))
    }
    const hpt = Math.min(
      Math.max(maxLines * QUERY_EXPORT_LINE_HEIGHT + 4, QUERY_EXPORT_MIN_ROW_HEIGHT),
      QUERY_EXPORT_MAX_ROW_HEIGHT,
    )
    rows[row] = { hpt }
  }
  ws['!rows'] = rows
}

function applyQueryExportSheetStyle(ws: XlsxStyledSheet, XLSX: XlsxStyleEngine) {
  const bounds = findQueryExportContentBounds(ws, XLSX)
  if (!bounds) return

  for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const existing = ws[cellRef] as XlsxStyledCell | undefined
      const cell: XlsxStyledCell = existing ?? { t: 's', v: '' }
      const isHeader = row === 0
      cell.s = {
        border: QUERY_EXPORT_THIN_BORDER,
        alignment: { vertical: 'center', horizontal: isHeader ? 'center' : 'left', wrapText: true },
        ...(isHeader ? { fill: { fgColor: { rgb: 'DCE6F1' } } } : {}),
      }
      ws[cellRef] = cell
    }
  }

  autofitQueryExportSheetSize(ws, XLSX, bounds)
}

function pickWritableFromRow(row: AnyRow): Partial<Record<OrderDetailWritableKey, unknown>> {
  const o: Partial<Record<OrderDetailWritableKey, unknown>> = {}
  for (const k of ORDER_DETAIL_WRITABLE_KEYS) {
    if (row[k] !== undefined) o[k] = row[k]
  }
  return o
}

function buildPatchFromRow(original: AnyRow, values: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const norm = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v).trim())
  const normItem = (v: unknown) => (v === '' || v === undefined || v === null ? '' : String(v))

  for (const key of ORDER_DETAIL_WRITABLE_KEYS) {
    let after = values[key]
    if (key === 'item_no' && (after === '' || after === undefined)) after = null

    let changed = false
    if (key === 'item_no') {
      changed = normItem(original[key]) !== normItem(after)
    } else if (key === 'quantity' || key === 'seq') {
      changed = Number(original[key] ?? 0) !== Number(after ?? 0)
    } else if (key === 'unit_weight' || key === 'total_weight' || key === 'agreement_price' || key === 'product_unit_price') {
      changed = Number(original[key] ?? 0) !== Number(after ?? 0)
    } else {
      changed = norm(original[key]) !== norm(after)
    }

    if (changed) patch[key] = after
  }
  return patch
}

function parseTsv(text: string): ManualRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const cols = line.split('\t')
      return {
        key: `${Date.now()}-${idx}`,
        seq: Number(cols[0] || idx + 1),
        item_no: cols[1] === '' || cols[1] == null ? undefined : Number(cols[1]),
        name: cols[2] || '',
        drawing_no: normalizeDrawingInput(cols[3] || ''),
        material_no: cols[4] || '',
        spec_model: cols[5] || '',
        material: cols[6] || '',
        quantity: Number(cols[7] || 0),
        unit_weight: Number(cols[8] || 0),
        total_weight: Number(cols[9] || 0),
        agreement_price: Number(cols[12] || 0),
        product_unit_price: Number(cols[13] || 0),
        remark1: cols[10] || '',
        remark2: cols[11] || '',
      }
    })
}

function parseDalianTsv(text: string): ManualRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const cols = line.split('\t')
      return {
        key: `${Date.now()}-dalian-${idx}`,
        seq: Number(cols[0] || idx + 1),
        item_no: cols[1] === '' || cols[1] == null ? undefined : Number(cols[1]),
        name: '',
        drawing_no: normalizeDrawingInput(cols[2] || ''),
        material_no: cols[3] || '',
        spec_model: '',
        material: '',
        quantity: Number(cols[4] || 0),
        unit_weight: 0,
        total_weight: 0,
        // 协议价、产品单价不从粘贴取得，由「获取物料信息」从价格拆分表回填
        agreement_price: 0,
        product_unit_price: 0,
        remark1: cols[5] || '',
        remark2: cols[6] || '',
      }
    })
}

function totalWeight(quantity: number, unitWeight: number) {
  return Math.round(Number(quantity || 0) * Number(unitWeight || 0) * 100) / 100
}

/** 2 开头=法国订单；4 开头=大连订单 */
function resolveOrderLine(orderNo: string): { line: 'france' | 'dalian'; error?: string } {
  const trimmed = String(orderNo || '').trim()
  if (!trimmed) return { line: 'dalian', error: '请先填写订单号后再获取物料信息' }
  const prefix = trimmed[0]
  if (prefix === '2') return { line: 'france' }
  if (prefix === '4') return { line: 'dalian' }
  return { line: 'dalian', error: `订单号【${trimmed}】无法识别客户线（2开头=法国，4开头=大连）` }
}

function resolveAgreementPrice(orderNo: string, hit: MaterialLookupResult): number {
  const { line } = resolveOrderLine(orderNo)
  if (line === 'france') return Number(hit.france_agreement_price || 0)
  return Number(hit.dalian_agreement_price || 0)
}

function resolveProductUnitPrice(orderNo: string, hit: MaterialLookupResult): number {
  const { line } = resolveOrderLine(orderNo)
  if (line === 'france') return Number(hit.france_tax_inclusive_price || 0)
  return Number(hit.dalian_agreement_price || 0)
}

function normCompare(value: unknown, numeric: boolean) {
  if (numeric) return Number(value || 0)
  return String(value ?? '').trim()
}

function buildFetchedMaterialPatch(orderNo: string, row: ManualRow, hit: MaterialLookupResult) {
  const unitWeight = Number(hit.unit_weight || 0)
  const next: Pick<ManualRow, MaterialFetchField> = {
    name: hit.part_no || '',
    spec_model: hit.spec_model || '',
    material: hit.material || '',
    unit_weight: unitWeight,
    total_weight: totalWeight(row.quantity, unitWeight),
    agreement_price: resolveAgreementPrice(orderNo, hit),
    product_unit_price: resolveProductUnitPrice(orderNo, hit),
  }
  const changedFields: MaterialFetchField[] = []
  MATERIAL_FETCH_FIELDS.forEach((field) => {
    const numeric = field === 'unit_weight' || field === 'total_weight' || field === 'agreement_price' || field === 'product_unit_price'
    if (normCompare(row[field], numeric) !== normCompare(next[field], numeric)) {
      changedFields.push(field)
    }
  })
  return { next, changedFields }
}

function errorText(detail: unknown, fallback: string) {
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object' && 'message' in detail) return String((detail as { message?: unknown }).message || fallback)
  return fallback
}

type OrderDetailLogRow = {
  id: number
  row_id?: number | null
  order_no?: string
  material_no?: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ORDER_LOG_ACTION_LABELS: Record<string, string> = {
  create: '录入',
  update: '修改',
  upload: '上传',
  export: '导出',
  delete: '删除',
}

function formatOrderLogSummary(raw: string) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown }> | undefined
    if (fields && Object.keys(fields).length) {
      return Object.entries(fields)
        .slice(0, 8)
        .map(([key, value]) => `${ORDER_DETAIL_LABELS[key] || key}: ${value?.before ?? ''} → ${value?.after ?? ''}`)
        .join('；')
    }
    if (parsed.op === 'export') {
      return `导出 ${parsed.file_name || ''}，${parsed.count ?? 0} 条`
    }
    if (parsed.op === 'append') {
      return `追加明细 id=${parsed.id ?? ''}，参照 ${parsed.based_on_id ?? ''}，物料号 ${parsed.material_no ?? ''}`
    }
    if (parsed.op === 'delete') {
      const snap = (parsed.snapshot || {}) as Record<string, unknown>
      return `删除 id=${snap.id ?? ''}，订单 ${snap.order_no ?? ''}，物料号 ${snap.material_no ?? ''}`
    }
    if (parsed.confirm_summary) return String(parsed.confirm_summary)
    const materialNo = parsed.material_no ? `物料号 ${parsed.material_no}` : ''
    const orderNo = parsed.order_no ? `订单 ${parsed.order_no}` : ''
    return [orderNo, materialNo].filter(Boolean).join('，') || raw
  } catch {
    return raw
  }
}

function emptyManualRow(index: number): ManualRow {
  return {
    key: `${Date.now()}-${index}`,
    seq: index + 1,
    item_no: undefined,
    name: '',
    drawing_no: '',
    material_no: '',
    spec_model: '',
    material: '',
    quantity: 0,
    unit_weight: 0,
    total_weight: 0,
    agreement_price: 0,
    product_unit_price: 0,
    remark1: '',
    remark2: '',
  }
}

type ResizableTitleProps = React.HTMLAttributes<HTMLTableCellElement> & {
  onResize?: (e: React.SyntheticEvent<Element>, data: { size: { width: number; height: number } }) => void
  width?: number
}

const ResizableTitle = ({ onResize, width, ...restProps }: ResizableTitleProps) => {
  if (!width) {
    return <th {...restProps} />
  }
  return (
    <Resizable width={width} height={0} onResize={onResize} draggableOpts={{ enableUserSelectHack: false }}>
      <th {...restProps} />
    </Resizable>
  )
}

function OrderDetailWritableFormItems({ seqExtra }: { seqExtra?: string }) {
  return (
    <>
      {ORDER_DETAIL_WRITABLE_KEYS.map((key) => {
        const label = ORDER_DETAIL_LABELS[key] || key
        if (key === 'status') {
          return (
            <Form.Item key={key} name={key} label={label}>
              <Select allowClear style={{ width: '100%' }} options={statusOptions.map((v) => ({ value: v }))} />
            </Form.Item>
          )
        }
        if (key === 'material_mode') {
          return (
            <Form.Item key={key} name={key} label={label}>
              <Select allowClear style={{ width: '100%' }} options={modeOptions.map((v) => ({ value: v }))} />
            </Form.Item>
          )
        }
        if (key === 'quantity') {
          return (
            <Form.Item key={key} name={key} label={label}>
              <InputNumber style={{ width: '100%' }} min={0} precision={0} />
            </Form.Item>
          )
        }
        if (key === 'seq') {
          return (
            <Form.Item key={key} name={key} label={label} extra={seqExtra}>
              <InputNumber style={{ width: '100%' }} min={0} precision={0} />
            </Form.Item>
          )
        }
        if (key === 'unit_weight' || key === 'total_weight' || key === 'agreement_price' || key === 'product_unit_price') {
          return (
            <Form.Item key={key} name={key} label={label}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          )
        }
        if (key === 'item_no') {
          return (
            <Form.Item key={key} name={key} label={label}>
              <InputNumber style={{ width: '100%' }} min={0} precision={0} />
            </Form.Item>
          )
        }
        return (
          <Form.Item key={key} name={key} label={label}>
            <Input />
          </Form.Item>
        )
      })}
    </>
  )
}

export default function ContractOrdersPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const pageTitle = usePageTitle()
  const section = contractSectionFromPath(pathname)
  const [queryRows, setQueryRows] = useState<AnyRow[]>([])
  const [splitRows, setSplitRows] = useState<AnyRow[]>([])
  const [warning, setWarning] = useState('')
  const [manualRows, setManualRows] = useState<ManualRow[]>([emptyManualRow(0)])
  const [dalianRows, setDalianRows] = useState<ManualRow[]>([emptyManualRow(0)])
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({})
  const [dalianCellStates, setDalianCellStates] = useState<Record<string, CellState>>({})
  const [selectedManualKeys, setSelectedManualKeys] = useState<React.Key[]>([])
  const [selectedDalianKeys, setSelectedDalianKeys] = useState<React.Key[]>([])
  const [selectedQueryKeys, setSelectedQueryKeys] = useState<React.Key[]>([])
  const [selectedSplitKeys, setSelectedSplitKeys] = useState<React.Key[]>([])
  const [manualFetchStatus, setManualFetchStatus] = useState('')
  const [dalianFetchStatus, setDalianFetchStatus] = useState('')
  const [queryMaterialFetchStatus, setQueryMaterialFetchStatus] = useState('')
  const [manualColWidths, setManualColWidths] = useState<Record<string, number>>({
    seq: 90,
    item_no: 90,
    name: 140,
    drawing_no: 180,
    material_no: 180,
    spec_model: 220,
    material: 120,
    quantity: 110,
    unit_weight: 110,
    total_weight: 110,
    remark1: 140,
    remark2: 140,
    agreement_price: 120,
    product_unit_price: 120,
    action: 90,
  })
  const [dalianColWidths, setDalianColWidths] = useState<Record<string, number>>({
    seq: 90,
    item_no: 90,
    name: 160,
    drawing_no: 180,
    material_no: 180,
    spec_model: 220,
    material: 120,
    quantity: 110,
    unit_weight: 110,
    total_weight: 110,
    agreement_price: 120,
    product_unit_price: 120,
    remark1: 140,
    remark2: 140,
    action: 90,
  })

  const [customerOptions, setCustomerOptions] = useState<{ value: string; label: string }[]>([])
  const [manualForm] = Form.useForm()
  const [dalianForm] = Form.useForm()
  const [queryForm] = Form.useForm()
  const [splitForm] = Form.useForm()
  const [detailEditForm] = Form.useForm()
  const [detailAppendForm] = Form.useForm()

  const [detailEditOpen, setDetailEditOpen] = useState(false)
  const [detailAppendOpen, setDetailAppendOpen] = useState(false)
  const [detailEditSnapshot, setDetailEditSnapshot] = useState<AnyRow | null>(null)
  const [detailAppendBase, setDetailAppendBase] = useState<AnyRow | null>(null)
  const [isXlsxLoaded, setIsXlsxLoaded] = useState(false)
  const [queryExportModalOpen, setQueryExportModalOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<OrderDetailLogRow[]>([])
  const [logOrderNo, setLogOrderNo] = useState('')
  const [logMaterialNo, setLogMaterialNo] = useState('')
  const [queryExportColumnKeys, setQueryExportColumnKeys] = useState<string[]>(
    orderQueryExportColumns.map((col) => col.key)
  )
  const [queryExportSaveDir, setQueryExportSaveDir] = useState('')

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
    script.onload = () => setIsXlsxLoaded(true)
    document.body.appendChild(script)
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [])

  const loadCustomers = useCallback(async (q = '') => {
    try {
      const res = await authFetch(
        apiUrl(`/api/v1/contract-archives/customers/suggest?q=${encodeURIComponent(q)}&limit=50`),
      )
      const data = (await res.json()) as { items?: string[] }
      if (!res.ok) return
      setCustomerOptions((data.items || []).map((name) => ({ value: name, label: name })))
    } catch {
      /* ignore suggest errors */
    }
  }, [])

  useEffect(() => {
    void loadCustomers('')
  }, [loadCustomers])

  const setCellValue = <K extends keyof ManualRow>(rowKey: string, field: K, value: ManualRow[K]) => {
    setManualRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, [field]: value } : r)))
    setCellStates((prev) => {
      const key = `${rowKey}.${String(field)}`
      if (prev[key] === 'error') return { ...prev, [key]: 'fixed' }
      if (prev[key] === 'diff') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return prev
    })
  }

  const setDalianCellValue = <K extends keyof ManualRow>(rowKey: string, field: K, value: ManualRow[K]) => {
    setDalianRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, [field]: value } : r)))
    setDalianCellStates((prev) => {
      const key = `${rowKey}.${String(field)}`
      if (prev[key] === 'error') return { ...prev, [key]: 'fixed' }
      if (prev[key] === 'diff') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return prev
    })
  }

  const validateRows = (rows: ManualRow[]) => {
    const nextState: Record<string, CellState> = {}
    const errors: string[] = []
    rows.forEach((r, idx) => {
      const rowNo = idx + 1
      if (!r.material_no) {
        nextState[`${r.key}.material_no`] = 'error'
        errors.push(`第${rowNo}行物料号不能为空`)
      }
      if (r.quantity < 0) {
        nextState[`${r.key}.quantity`] = 'error'
        errors.push(`第${rowNo}行数量不能为负`)
      }
      if (r.unit_weight < 0) {
        nextState[`${r.key}.unit_weight`] = 'error'
        errors.push(`第${rowNo}行单重不能为负`)
      }
      if (r.total_weight < 0) {
        nextState[`${r.key}.total_weight`] = 'error'
        errors.push(`第${rowNo}行总重不能为负`)
      }
      if (r.agreement_price < 0) {
        nextState[`${r.key}.agreement_price`] = 'error'
        errors.push(`第${rowNo}行协议价不能为负`)
      }
      if (r.product_unit_price < 0) {
        nextState[`${r.key}.product_unit_price`] = 'error'
        errors.push(`第${rowNo}行产品单价不能为负`)
      }
    })
    const seqRows = new Map<number, number[]>()
    rows.forEach((r, idx) => {
      const seq = Number(r.seq)
      if (!Number.isFinite(seq)) return
      seqRows.set(seq, [...(seqRows.get(seq) || []), idx + 1])
    })
    seqRows.forEach((rowNos, seq) => {
      if (rowNos.length > 1) {
        rowNos.forEach((rowNo) => {
          nextState[`${rows[rowNo - 1].key}.seq`] = 'error'
        })
        errors.push(`序号${seq}重复，重复行：第${rowNos.join('、')}行`)
      }
    })
    return { nextState, errors }
  }

  const cellStyle = (states: Record<string, CellState>, rowKey: string, field: keyof ManualRow) => {
    const state = states[`${rowKey}.${String(field)}`] || 'normal'
    if (state === 'error') return { background: '#fff1f0', borderColor: '#ff4d4f' }
    if (state === 'fixed') return { background: '#f6ffed', borderColor: '#52c41a' }
    if (state === 'diff') return { background: 'var(--erp-color-primary-bg)', borderColor: 'var(--erp-color-primary)' }
    return {}
  }

  const submitOrderRows = async (
    form: ReturnType<typeof Form.useForm>[0],
    rows: ManualRow[],
    setRows: React.Dispatch<React.SetStateAction<ManualRow[]>>,
    updateCellStates: React.Dispatch<React.SetStateAction<Record<string, CellState>>>,
    onSuccess?: () => void
  ) => {
    const values = (await form.validateFields()) as OrderSubmitFormValues
    const { nextState, errors } = validateRows(rows)
    updateCellStates((prev) => ({ ...prev, ...nextState }))
    if (errors.length > 0) {
      Modal.error({
        title: '提交失败',
        content: errors[0],
      })
      return
    }
    const payload = {
      order_no: values.order_no,
      factory_order_no: values.factory_order_no || '',
      customer: values.customer ?? '',
      rows: rows.map((r) => ({
        seq: r.seq,
        item_no: r.item_no,
        name: r.name,
        drawing_no: normalizeDrawingInput(r.drawing_no),
        material_no: r.material_no,
        spec_model: r.spec_model,
        material: r.material,
        quantity: Number(r.quantity || 0),
        unit_weight: Number(r.unit_weight || 0),
        total_weight: Number(r.total_weight || 0),
        agreement_price: Number(r.agreement_price || 0),
        product_unit_price: Number(r.product_unit_price || 0),
        remark1: r.remark1,
        remark2: r.remark2,
      })),
    }
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/manual'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      Modal.error({
        title: '提交失败',
        content: data.detail?.message || data.detail || '提交失败',
      })
      return
    }
    updateCellStates({})
    form.setFieldValue('table_text', '')
    const createdRows = (data.rows || []) as Array<{ seq?: number; doc_status?: string }>
    const docBySeq = new Map<number, string>()
    createdRows.forEach((r) => {
      if (r.seq != null) docBySeq.set(Number(r.seq), r.doc_status || '')
    })
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        doc_status: docBySeq.has(Number(r.seq)) ? docBySeq.get(Number(r.seq)) : r.doc_status,
      }))
    )
    onSuccess?.()
    void loadCustomers('')
    const pending = Number(data.pending_docs_count || 0)
    if (pending > 0) {
      message.warning(`提交成功，共${data.count}条；其中 ${pending} 条缺少图纸或物料建档，已标记「待补资料」`)
    } else {
      message.success(`提交成功，共${data.count}条`)
    }
  }

  const handleManualSubmit = async () => {
    await submitOrderRows(manualForm, manualRows, setManualRows, setCellStates, () => setManualFetchStatus(''))
  }

  const handleDalianSubmit = async () => {
    await submitOrderRows(dalianForm, dalianRows, setDalianRows, setDalianCellStates, () => setDalianFetchStatus(''))
  }

  useEffect(() => {
    setManualFetchStatus('')
    setDalianFetchStatus('')
    setQueryMaterialFetchStatus('')
  }, [section])

  const applyPasteRows = async () => {
    const values = await manualForm.validateFields(['table_text'])
    const parsed = parseTsv(values.table_text || '')
    if (parsed.length === 0) {
      message.warning('未识别到可粘贴数据')
      return
    }
    setManualRows(parsed)
    setManualFetchStatus('')
    setCellStates({})
    message.success(`已粘贴${parsed.length}行`)
  }

  const applyDalianPasteRows = async () => {
    const values = await dalianForm.validateFields(['table_text'])
    const parsed = parseDalianTsv(values.table_text || '')
    if (parsed.length === 0) {
      message.warning('未识别到可粘贴数据')
      return
    }
    setDalianRows(parsed)
    setDalianFetchStatus('')
    message.success(`已粘贴${parsed.length}行`)
  }

  const fetchMaterialInfoForRows = async (
    orderNo: string,
    rows: ManualRow[],
    setRows: React.Dispatch<React.SetStateAction<ManualRow[]>>,
    setStates: React.Dispatch<React.SetStateAction<Record<string, CellState>>>,
    setStatus: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const lineCheck = resolveOrderLine(orderNo)
    if (lineCheck.error) {
      setStatus(`获取失败（失败原因：${lineCheck.error}）`)
      message.error(lineCheck.error)
      return
    }
    const requestRows = rows.map((row, index) => ({
      source_index: index,
      drawing_no: normalizeDrawingInput(row.drawing_no),
      material_no: row.material_no,
      part_no: row.name,
    }))
    const invalidRows = requestRows
      .filter((row) => !String(row.drawing_no || '').trim() || !String(row.material_no || '').trim())
      .map((row) => ({ ...row, reason: '图纸号或物料号为空' }))
    const validRows = requestRows.filter((row) => String(row.drawing_no || '').trim() && String(row.material_no || '').trim())
    if (validRows.length === 0) {
      const reason = invalidRows.length > 0 ? `第${invalidRows[0].source_index + 1}行${invalidRows[0].reason}` : '没有可获取的物料行'
      setStatus(`获取失败（失败原因：${reason}）`)
      message.error(reason)
      return
    }
    setStatus('获取中...')
    const res = await fetch(apiUrl('/api/v1/workflow/materials/lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: validRows }),
    })
    const data = await res.json()
    if (!res.ok) {
      const reason = data.detail || '物料信息获取失败'
      setStatus(`获取失败（失败原因：${reason}）`)
      message.error(reason)
      return
    }
    const missing = [...invalidRows, ...(data.missing || [])]
    const rowsByIndex = new Map<number, MaterialLookupResult>((data.rows || []).map((row: MaterialLookupResult) => [row.source_index, row]))
    const patchByKey = new Map<string, Pick<ManualRow, MaterialFetchField>>()
    const diffStates: Record<string, CellState> = {}
    rows.forEach((row, index) => {
      const hit = rowsByIndex.get(index)
      if (!hit) return
      const { next, changedFields } = buildFetchedMaterialPatch(orderNo, row, hit)
      patchByKey.set(row.key, next)
      changedFields.forEach((field) => {
        diffStates[`${row.key}.${field}`] = 'diff'
      })
    })
    setRows((prev) => prev.map((row) => (patchByKey.has(row.key) ? { ...row, ...patchByKey.get(row.key)! } : row)))
    setStates((prev) => {
      const cleared = { ...prev }
      Object.keys(cleared).forEach((key) => {
        if (cleared[key] === 'diff') delete cleared[key]
      })
      return { ...cleared, ...diffStates }
    })
    if (missing.length > 0) {
      const reason = missing
        .map((row: MaterialLookupMissing) =>
          row.reason ? `第${row.source_index + 1}行(${row.reason})` : `第${row.source_index + 1}行(${row.drawing_no}/${row.material_no})`
        )
        .join('、')
      setStatus(`获取失败（失败原因：未找到或无法查询${reason}；已提取${data.rows?.length || 0}条）`)
      message.error(`部分物料信息未找到，已提取${data.rows?.length || 0}条`)
      return
    }
    setStatus(`获取成功（${data.rows?.length || 0}条）`)
    message.success(`获取成功，共${data.rows?.length || 0}条`)
  }

  const fetchManualMaterialInfo = async () => {
    const orderNo = String(manualForm.getFieldValue('order_no') || '').trim()
    await fetchMaterialInfoForRows(orderNo, manualRows, setManualRows, setCellStates, setManualFetchStatus)
  }

  const fetchDalianMaterialInfo = async () => {
    const orderNo = String(dalianForm.getFieldValue('order_no') || '').trim()
    await fetchMaterialInfoForRows(orderNo, dalianRows, setDalianRows, setDalianCellStates, setDalianFetchStatus)
  }

  const handleQuery = async () => {
    setQueryMaterialFetchStatus('')
    const values = await queryForm.validateFields()
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '查询失败')
      return
    }
    setWarning(data.warning || '')
    const flat: AnyRow[] = []
    Object.keys(data.grouped || {}).forEach((orderNo) => {
      ;(data.grouped[orderNo] as AnyRow[]).forEach((r) => flat.push(r))
    })
    setQueryRows(flat)
    setSelectedQueryKeys([])
    if (data.warning) message.warning(data.warning)
  }

  const loadOrderLogs = async (orderNo = logOrderNo, materialNo = logMaterialNo) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (orderNo.trim()) params.set('order_no', orderNo.trim())
      if (materialNo.trim()) params.set('material_no', materialNo.trim())
      const res = await authFetch(apiUrl(`/api/v1/workflow/orders/logs?${params.toString()}`))
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '操作日志加载失败')
        return
      }
      setLogRows((data.rows || []) as OrderDetailLogRow[])
    } finally {
      setLogLoading(false)
    }
  }

  const formatQueryExportCell = (row: AnyRow, colKey: string) => {
    const value = row[colKey]
    if (value === null || value === undefined) return ''
    if (colKey === 'quantity' || colKey === 'seq' || colKey === 'item_no') return value
    if (colKey === 'unit_weight' || colKey === 'total_weight') return Number(value || 0)
    return String(value)
  }

  const handleExportQueryExcel = async () => {
    if (!queryRows.length) {
      message.warning('当前没有可导出的查询结果，请先查询')
      return
    }
    if (!isXlsxLoaded) {
      message.warning('Excel 引擎加载中，请稍后再试')
      return
    }
    const selectedCols = orderQueryExportColumns.filter((col) => queryExportColumnKeys.includes(col.key))
    if (!selectedCols.length) {
      message.warning('请至少选择一列导出')
      return
    }

    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const defaultFileName = `订单查询_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`
    const saveInfo = await askSavePathAndFileName('导出订单查询结果', queryExportSaveDir, defaultFileName)
    if (!saveInfo) return

    const XLSX = (window as {
      XLSX?: XlsxStyleEngine & {
        utils: XlsxStyleEngine['utils'] & {
          book_new: () => unknown
          aoa_to_sheet: (d: unknown[][]) => XlsxStyledSheet
          book_append_sheet: (wb: unknown, ws: unknown, name: string) => void
        }
        write: (wb: unknown, opts: { bookType: string; type: string }) => ArrayBuffer
      }
    }).XLSX
    if (!XLSX) {
      message.error('Excel 引擎未就绪')
      return
    }

    const header = selectedCols.map((col) => col.title)
    const body = queryRows.map((row) => selectedCols.map((col) => formatQueryExportCell(row, col.key)))
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    applyQueryExportSheetStyle(ws, XLSX)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '订单查询')
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    try {
      const savedPath = await saveGeneratedBlob(blob, saveInfo.fileName, saveInfo.directoryPath)
      setQueryExportSaveDir(saveInfo.directoryPath)
      setQueryExportModalOpen(false)
      message.success(`已导出 ${queryRows.length} 条：${savedPath}`)
      const orderNos = [...new Set(queryRows.map((row) => String(row.order_no || '')).filter(Boolean))]
      const materialNos = [...new Set(queryRows.map((row) => String(row.material_no || '')).filter(Boolean))]
      await authFetch(apiUrl('/api/v1/workflow/orders/export-log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: saveInfo.fileName,
          count: queryRows.length,
          order_nos: orderNos,
          material_nos: materialNos,
        }),
      })
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出失败')
    }
  }

  const deleteQueryRows = async (ids: number[]) => {
    if (!ids.length) {
      message.warning('请先勾选要删除的物料')
      return
    }
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/delete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '删除失败')
      return
    }
    const packingHint =
      data.packing_deleted_count > 0 ? `，并同步清除装箱记录 ${data.packing_deleted_count} 条` : ''
    message.success(`已删除${data.deleted_count}条物料${packingHint}`)
    await handleQuery()
  }

  const confirmDeleteQueryRows = (ids: number[]) => {
    Modal.confirm({
      title: '确认删除物料',
      content: `删除后将从订单明细表中移除 ${ids.length} 条记录；若对应物料在订单中已无剩余行，将同步清除装箱记录。是否继续？`,
      onOk: () => deleteQueryRows(ids),
    })
  }

  const fetchAndApplyQueryMaterialInfo = async (targetRows: AnyRow[]) => {
    if (!targetRows.length) {
      message.warning('请先选择要获取物料信息的订单明细')
      return
    }
    const requestRows = targetRows.map((row, index) => ({
      source_index: index,
      drawing_no: normalizeDrawingInput(String(row.drawing_no || '')),
      material_no: String(row.material_no || ''),
      part_no: String(row.name || ''),
    }))
    const invalidRows: MaterialLookupMissing[] = requestRows
      .filter((row) => !row.drawing_no.trim() || !row.material_no.trim())
      .map((row) => ({ ...row, reason: '图纸号或物料号为空' }))
    const validRows = requestRows.filter((row) => row.drawing_no.trim() && row.material_no.trim())
    if (!validRows.length) {
      const reason = invalidRows.length ? `第${invalidRows[0].source_index + 1}行${invalidRows[0].reason}` : '没有可获取的物料行'
      setQueryMaterialFetchStatus(`获取失败（失败原因：${reason}）`)
      message.error(reason)
      return
    }

    setQueryMaterialFetchStatus('获取中...')
    const lookupRes = await fetch(apiUrl('/api/v1/workflow/materials/lookup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: validRows }),
    })
    const lookupData = await lookupRes.json()
    if (!lookupRes.ok) {
      const reason = errorText(lookupData.detail, '物料信息获取失败')
      setQueryMaterialFetchStatus(`获取失败（失败原因：${reason}）`)
      message.error(reason)
      return
    }

    const missing: MaterialLookupMissing[] = [...invalidRows, ...(lookupData.missing || [])]
    const hits = (lookupData.rows || []) as MaterialLookupResult[]
    let updatedCount = 0
    const updateFailures: string[] = []
    for (const hit of hits) {
      const row = targetRows[hit.source_index]
      if (!row?.id) continue
      const quantity = Number(row.quantity || 0)
      const unitWeight = Number(hit.unit_weight || 0)
      const orderNo = String(row.order_no || '')
      const lineCheck = resolveOrderLine(orderNo)
      if (lineCheck.error) {
        updateFailures.push(`id=${row.id}: ${lineCheck.error}`)
        continue
      }
      const patch = {
        name: hit.part_no,
        spec_model: hit.spec_model,
        material: hit.material,
        unit_weight: unitWeight,
        total_weight: totalWeight(quantity, unitWeight),
        agreement_price: resolveAgreementPrice(orderNo, hit),
        product_unit_price: resolveProductUnitPrice(orderNo, hit),
      }
      const summary = `获取物料信息：订单明细 id=${row.id}，图纸号=${String(row.drawing_no || '')}，物料号=${String(row.material_no || '')}`
      const updateRes = await authFetch(apiUrl('/api/v1/workflow/orders/detail/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: Number(row.id),
          patch,
          confirm_summary: summary,
        }),
      })
      const updateData = await updateRes.json()
      if (!updateRes.ok) {
        updateFailures.push(`id=${row.id}: ${errorText(updateData.detail, '更新失败')}`)
        continue
      }
      updatedCount += 1
    }

    if (updatedCount > 0) await handleQuery()
    if (missing.length > 0 || updateFailures.length > 0) {
      const missingText = missing
        .map((row) => (row.reason ? `第${row.source_index + 1}行(${row.reason})` : `第${row.source_index + 1}行(${row.drawing_no}/${row.material_no})`))
        .join('、')
      const failureText = updateFailures.length ? `；更新失败：${updateFailures.join('、')}` : ''
      const reason = `${missingText ? `未找到或无法查询${missingText}` : ''}${failureText}`
      setQueryMaterialFetchStatus(`获取失败（失败原因：${reason}；已更新${updatedCount}条）`)
      message.error(`部分物料信息获取失败，已更新${updatedCount}条`)
      return
    }

    setQueryMaterialFetchStatus(`获取成功（${updatedCount}条）`)
    message.success(`获取成功，共更新${updatedCount}条`)
  }

  const fetchSelectedQueryMaterialInfo = async () => {
    const selectedRows = queryRows.filter((row) => selectedQueryKeys.includes(row.id as React.Key))
    await fetchAndApplyQueryMaterialInfo(selectedRows)
  }

  const openDetailEdit = (row: AnyRow) => {
    setDetailEditSnapshot(row)
    detailEditForm.setFieldsValue({
      ...pickWritableFromRow(row),
      item_no: row.item_no === null || row.item_no === undefined ? undefined : Number(row.item_no),
      seq: Number(row.seq ?? 0),
      quantity: Number(row.quantity ?? 0),
      unit_weight: Number(row.unit_weight ?? 0),
      total_weight: Number(row.total_weight ?? 0),
    })
    setDetailEditOpen(true)
  }

  const submitDetailEdit = async () => {
    const values = await detailEditForm.validateFields()
    if (!detailEditSnapshot) return
    const patch = buildPatchFromRow(detailEditSnapshot, values as Record<string, unknown>)
    if (!Object.keys(patch).length) {
      message.warning('没有检测到变更')
      return
    }
    const summary = Object.entries(patch)
      .map(([k, v]) => `${ORDER_DETAIL_LABELS[k] || k}: ${String(detailEditSnapshot[k] ?? '/')} → ${String(v ?? '/')}`)
      .join('\n')
    Modal.confirm({
      title: '确认保存订单明细修改',
      width: 640,
      content: <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 360, overflow: 'auto' }}>{summary}</pre>,
      onOk: async () => {
        const res = await authFetch(apiUrl('/api/v1/workflow/orders/detail/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: Number(detailEditSnapshot.id),
            patch,
            confirm_summary: summary,
          }),
        })
        const data = await res.json()
        if (!res.ok) return message.error(data.detail || '保存失败')
        message.success('修改已保存并已记入日志')
        setDetailEditOpen(false)
        setDetailEditSnapshot(null)
        await handleQuery()
      },
    })
  }

  const openDetailAppend = (row: AnyRow) => {
    setDetailAppendBase(row)
    detailAppendForm.setFieldsValue({
      ...pickWritableFromRow(row),
      material_no: '',
      item_no: row.item_no === null || row.item_no === undefined ? undefined : Number(row.item_no),
      seq: undefined,
    })
    setDetailAppendOpen(true)
  }

  const submitDetailAppend = async () => {
    const values = await detailAppendForm.validateFields()
    if (!detailAppendBase) return
    if (!String(values.material_no || '').trim()) {
      message.error('新行物料号不能为空')
      return
    }
    const rowPayload: Record<string, unknown> = { ...values }
    if (rowPayload.seq === undefined || rowPayload.seq === null || rowPayload.seq === '') delete rowPayload.seq
    const summary = `追加订单【${detailAppendBase.order_no}】明细，参照 id=${detailAppendBase.id}，物料号=${values.material_no}`
    Modal.confirm({
      title: '确认追加订单明细',
      width: 520,
      content: <div>{summary}</div>,
      onOk: async () => {
        const res = await authFetch(apiUrl('/api/v1/workflow/orders/detail/append'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            based_on_id: Number(detailAppendBase.id),
            row: rowPayload,
            confirm_summary: summary,
          }),
        })
        const data = await res.json()
        if (!res.ok) return message.error(data.detail || '追加失败')
        message.success('追加成功并已记入日志')
        setDetailAppendOpen(false)
        setDetailAppendBase(null)
        await handleQuery()
      },
    })
  }

  const handleLoadSplitRows = async () => {
    const orderNo = splitForm.getFieldValue('order_no')
    if (!orderNo) return
    await loadSplitRows(orderNo)
  }

  const loadSplitRows = async (orderNo: string) => {
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_no: orderNo }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '查询失败')
      return
    }
    const rows = (data.grouped?.[orderNo] || []) as AnyRow[]
    setSplitRows(rows)
    return rows
  }

  const handleSplit = async () => {
    const values = await splitForm.validateFields()
    const selected = splitRows
      .filter((r) => selectedSplitKeys.includes(r.id as React.Key))
      .map((r) => String(r.material_no || ''))
      .filter(Boolean)
    if (selected.length === 0) {
      message.warning('请先勾选要分配的物料')
      return
    }
    const payload = {
      order_no: values.order_no,
      material_no: null,
      selected_material_nos: selected,
      assign_mode: values.assign_mode,
    }
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/split'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '分割失败')
      return
    }
    message.success(`分割成功，更新${data.updated_count}条`)
    await loadSplitRows(values.order_no)
    setSelectedSplitKeys([])
  }

  const queryDetailColumns: ColumnsType<AnyRow> = (() => {
    const present = new Set<string>()
    queryRows.forEach((r) => Object.keys(r).forEach((k) => present.add(k)))
    const ordered = ORDER_DETAIL_DISPLAY_ORDER.filter((k) => present.has(k))
    const extras = [...present].filter((k) => !ORDER_DETAIL_DISPLAY_ORDER_SET.has(k)).sort()
    const keys = [...ordered, ...extras]
    const dataCols = keys.map((key) => ({
      title: ORDER_DETAIL_LABELS[key] || key,
      dataIndex: key,
      width: key === 'id' ? 72 : key.endsWith('_at') ? 168 : 112,
      ellipsis: true,
      render: (v: unknown) =>
        key === 'status' ? (
          <Tag color="blue">{String(v ?? '') || '/'}</Tag>
        ) : key === 'doc_status' ? (
          v === '待补资料' ? <Tag color="gold">待补资料</Tag> : '/'
        ) : v === null || v === undefined || v === '' ? (
          '/'
        ) : (
          String(v)
        ),
    }))
    return [
      {
        title: 'No.',
        width: 56,
        fixed: 'left',
        render: (_: unknown, __: unknown, index: number) => index + 1,
      },
      ...dataCols,
      {
        title: '操作',
        width: 320,
        fixed: 'right',
        render: (_: unknown, row: AnyRow) => (
          <Space wrap size="small">
            <Button size="small" type="primary" onClick={() => openDetailEdit(row)}>
              修改
            </Button>
            <Button size="small" onClick={() => fetchAndApplyQueryMaterialInfo([row])}>
              获取物料信息
            </Button>
            <Button size="small" onClick={() => openDetailAppend(row)}>
              追加
            </Button>
            <Button danger size="small" onClick={() => confirmDeleteQueryRows([Number(row.id)])}>
              删除
            </Button>
          </Space>
        ),
      },
    ]
  })()

  const editableColumns: ColumnsType<ManualRow> = useMemo(
    () => [
      {
        title: '序号',
        dataIndex: 'seq',
        width: manualColWidths.seq,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(cellStates, row.key, 'seq')}
            onChange={(e) => setCellValue(row.key, 'seq', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '条目',
        dataIndex: 'item_no',
        width: manualColWidths.item_no,
        render: (v, row) => (
          <Input
            type="number"
            value={v ?? ''}
            style={cellStyle(cellStates, row.key, 'item_no')}
            onChange={(e) => setCellValue(row.key, 'item_no', e.target.value === '' ? undefined : Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '名称/料号',
        dataIndex: 'name',
        width: manualColWidths.name,
        render: (v, row) => <Input value={v} style={cellStyle(cellStates, row.key, 'name')} onChange={(e) => setCellValue(row.key, 'name', e.target.value)} />,
      },
      {
        title: '图纸号',
        dataIndex: 'drawing_no',
        width: manualColWidths.drawing_no,
        render: (v, row) => (
          <Input
            value={v}
            placeholder="A5E… Rev017 或 A5E…-017"
            style={cellStyle(cellStates, row.key, 'drawing_no')}
            onChange={(e) => setCellValue(row.key, 'drawing_no', e.target.value)}
            onBlur={(e) => setCellValue(row.key, 'drawing_no', normalizeDrawingInput(e.target.value))}
          />
        ),
      },
      {
        title: '物料号',
        dataIndex: 'material_no',
        width: manualColWidths.material_no,
        render: (v, row) => (
          <Input value={v} style={cellStyle(cellStates, row.key, 'material_no')} onChange={(e) => setCellValue(row.key, 'material_no', e.target.value)} />
        ),
      },
      {
        title: '规格型号',
        dataIndex: 'spec_model',
        width: manualColWidths.spec_model,
        render: (v, row) => (
          <Input value={v} style={cellStyle(cellStates, row.key, 'spec_model')} onChange={(e) => setCellValue(row.key, 'spec_model', e.target.value)} />
        ),
      },
      {
        title: '材质',
        dataIndex: 'material',
        width: manualColWidths.material,
        render: (v, row) => (
          <Input value={v} style={cellStyle(cellStates, row.key, 'material')} onChange={(e) => setCellValue(row.key, 'material', e.target.value)} />
        ),
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: manualColWidths.quantity,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(cellStates, row.key, 'quantity')}
            onChange={(e) => setCellValue(row.key, 'quantity', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '单重',
        dataIndex: 'unit_weight',
        width: manualColWidths.unit_weight,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(cellStates, row.key, 'unit_weight')}
            onChange={(e) => setCellValue(row.key, 'unit_weight', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '总重',
        dataIndex: 'total_weight',
        width: manualColWidths.total_weight,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(cellStates, row.key, 'total_weight')}
            onChange={(e) => setCellValue(row.key, 'total_weight', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '备注1',
        dataIndex: 'remark1',
        width: manualColWidths.remark1,
        render: (v, row) => (
          <Input value={v} style={cellStyle(cellStates, row.key, 'remark1')} onChange={(e) => setCellValue(row.key, 'remark1', e.target.value)} />
        ),
      },
      {
        title: '备注2',
        dataIndex: 'remark2',
        width: manualColWidths.remark2,
        render: (v, row) => (
          <Input value={v} style={cellStyle(cellStates, row.key, 'remark2')} onChange={(e) => setCellValue(row.key, 'remark2', e.target.value)} />
        ),
      },
      {
        title: '协议价',
        dataIndex: 'agreement_price',
        width: manualColWidths.agreement_price,
        render: (v, row) => (
          <InputNumber
            min={0}
            precision={2}
            value={v}
            style={{ width: '100%', ...cellStyle(cellStates, row.key, 'agreement_price') }}
            onChange={(next) => setCellValue(row.key, 'agreement_price', Number(next || 0))}
          />
        ),
      },
      {
        title: '产品单价',
        dataIndex: 'product_unit_price',
        width: manualColWidths.product_unit_price,
        render: (v, row) => (
          <InputNumber
            min={0}
            precision={2}
            value={v}
            style={{ width: '100%', ...cellStyle(cellStates, row.key, 'product_unit_price') }}
            onChange={(next) => setCellValue(row.key, 'product_unit_price', Number(next || 0))}
          />
        ),
      },
      {
        title: '操作',
        width: manualColWidths.action,
        render: (_, row) => (
          <Button danger onClick={() => setManualRows((prev) => prev.filter((x) => x.key !== row.key))}>
            删除
          </Button>
        ),
      },
    ],
    [cellStates, manualColWidths]
  )

  const dalianEditableColumns: ColumnsType<ManualRow> = useMemo(
    () => [
      {
        title: '序号',
        dataIndex: 'seq',
        width: dalianColWidths.seq,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(dalianCellStates, row.key, 'seq')}
            onChange={(e) => setDalianCellValue(row.key, 'seq', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '条目',
        dataIndex: 'item_no',
        width: dalianColWidths.item_no,
        render: (v, row) => (
          <Input
            type="number"
            value={v ?? ''}
            style={cellStyle(dalianCellStates, row.key, 'item_no')}
            onChange={(e) => setDalianCellValue(row.key, 'item_no', e.target.value === '' ? undefined : Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '名称/料号',
        dataIndex: 'name',
        width: dalianColWidths.name,
        render: (v, row) => <Input value={v} style={cellStyle(dalianCellStates, row.key, 'name')} onChange={(e) => setDalianCellValue(row.key, 'name', e.target.value)} />,
      },
      {
        title: '图纸号',
        dataIndex: 'drawing_no',
        width: dalianColWidths.drawing_no,
        render: (v, row) => (
          <Input
            value={v}
            placeholder="A5E… Rev017 或 A5E…-017"
            style={cellStyle(dalianCellStates, row.key, 'drawing_no')}
            onChange={(e) => setDalianCellValue(row.key, 'drawing_no', e.target.value)}
            onBlur={(e) => setDalianCellValue(row.key, 'drawing_no', normalizeDrawingInput(e.target.value))}
          />
        ),
      },
      {
        title: '物料号',
        dataIndex: 'material_no',
        width: dalianColWidths.material_no,
        render: (v, row) => (
          <Input value={v} style={cellStyle(dalianCellStates, row.key, 'material_no')} onChange={(e) => setDalianCellValue(row.key, 'material_no', e.target.value)} />
        ),
      },
      {
        title: '规格型号',
        dataIndex: 'spec_model',
        width: dalianColWidths.spec_model,
        render: (v, row) => (
          <Input value={v} style={cellStyle(dalianCellStates, row.key, 'spec_model')} onChange={(e) => setDalianCellValue(row.key, 'spec_model', e.target.value)} />
        ),
      },
      {
        title: '材质',
        dataIndex: 'material',
        width: dalianColWidths.material,
        render: (v, row) => (
          <Input value={v} style={cellStyle(dalianCellStates, row.key, 'material')} onChange={(e) => setDalianCellValue(row.key, 'material', e.target.value)} />
        ),
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: dalianColWidths.quantity,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(dalianCellStates, row.key, 'quantity')}
            onChange={(e) => {
              const quantity = Number(e.target.value || 0)
              setDalianRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity, total_weight: totalWeight(quantity, r.unit_weight) } : r)))
            }}
          />
        ),
      },
      {
        title: '单重',
        dataIndex: 'unit_weight',
        width: dalianColWidths.unit_weight,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(dalianCellStates, row.key, 'unit_weight')}
            onChange={(e) => {
              const unitWeight = Number(e.target.value || 0)
              setDalianRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, unit_weight: unitWeight, total_weight: totalWeight(r.quantity, unitWeight) } : r)))
            }}
          />
        ),
      },
      {
        title: '总重',
        dataIndex: 'total_weight',
        width: dalianColWidths.total_weight,
        render: (v, row) => (
          <Input
            type="number"
            value={v}
            style={cellStyle(dalianCellStates, row.key, 'total_weight')}
            onChange={(e) => setDalianCellValue(row.key, 'total_weight', Number(e.target.value || 0))}
          />
        ),
      },
      {
        title: '协议价',
        dataIndex: 'agreement_price',
        width: dalianColWidths.agreement_price,
        render: (v, row) => (
          <InputNumber
            min={0}
            precision={2}
            value={v}
            style={{ width: '100%', ...cellStyle(dalianCellStates, row.key, 'agreement_price') }}
            onChange={(next) => setDalianCellValue(row.key, 'agreement_price', Number(next || 0))}
          />
        ),
      },
      {
        title: '产品单价',
        dataIndex: 'product_unit_price',
        width: dalianColWidths.product_unit_price,
        render: (v, row) => (
          <InputNumber
            min={0}
            precision={2}
            value={v}
            style={{ width: '100%', ...cellStyle(dalianCellStates, row.key, 'product_unit_price') }}
            onChange={(next) => setDalianCellValue(row.key, 'product_unit_price', Number(next || 0))}
          />
        ),
      },
      {
        title: '备注1',
        dataIndex: 'remark1',
        width: dalianColWidths.remark1,
        render: (v, row) => (
          <Input value={v} style={cellStyle(dalianCellStates, row.key, 'remark1')} onChange={(e) => setDalianCellValue(row.key, 'remark1', e.target.value)} />
        ),
      },
      {
        title: '备注2',
        dataIndex: 'remark2',
        width: dalianColWidths.remark2,
        render: (v, row) => (
          <Input value={v} style={cellStyle(dalianCellStates, row.key, 'remark2')} onChange={(e) => setDalianCellValue(row.key, 'remark2', e.target.value)} />
        ),
      },
      {
        title: '操作',
        width: dalianColWidths.action,
        render: (_, row) => (
          <Button danger onClick={() => setDalianRows((prev) => prev.filter((x) => x.key !== row.key))}>
            删除
          </Button>
        ),
      },
    ],
    [dalianCellStates, dalianColWidths]
  )

  const mergedEditableColumns = editableColumns.map((col) => {
    const c = col as { dataIndex?: string | number; key?: React.Key; width?: number }
    const key = String(c.dataIndex || c.key || '')
    return {
      ...col,
      onHeaderCell: () => ({
        width: c.width,
        onResize: (_: React.SyntheticEvent<Element>, { size }: { size: { width: number } }) => {
          setManualColWidths((prev) => ({ ...prev, [key]: size.width }))
        },
      }),
    }
  })

  const mergedDalianEditableColumns = dalianEditableColumns.map((col) => {
    const c = col as { dataIndex?: string | number; key?: React.Key; width?: number }
    const key = String(c.dataIndex || c.key || '')
    return {
      ...col,
      onHeaderCell: () => ({
        width: c.width,
        onResize: (_: React.SyntheticEvent<Element>, { size }: { size: { width: number } }) => {
          setDalianColWidths((prev) => ({ ...prev, [key]: size.width }))
        },
      }),
    }
  })

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title={pageTitle}>
        {section === 'upload' && <ContractArchivePanel />}
        {(section === 'manual' || section === 'materials') && (
          <Tabs
            className="contract-tabs"
            activeKey={section}
            onChange={(key) => navigate(`/contracts/${key}`)}
            items={[
              {
                key: 'manual',
                label: t('nav.contractsManual'),
                children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form form={manualForm} layout="vertical">
                    <Space wrap>
                      <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="factory_order_no" label="本厂单号">
                        <Input />
                      </Form.Item>
                      <Form.Item name="customer" label="客户">
                        <AutoComplete
                          style={{ width: 320 }}
                          options={customerOptions}
                          onSearch={(q) => void loadCustomers(q)}
                          placeholder="请输入或选择客户"
                          allowClear
                          filterOption={false}
                        />
                      </Form.Item>
                    </Space>
                    <Form.Item
                      name="table_text"
                      label="可选：粘贴Excel数据(制表符分隔)，列顺序：序号、条目、名称/料号、图纸号、物料号、规格型号、材质、数量、单重、总重、备注1、备注2、协议价、产品单价（名称/料号、规格型号、材质、单重、总重、协议价、产品单价可留空；协议价/产品单价由「获取物料信息」按价格拆分表回填）"
                    >
                      <Input.TextArea rows={8} />
                    </Form.Item>
                    <Space wrap>
                      <Button onClick={applyPasteRows}>应用粘贴</Button>
                      <Button type="primary" onClick={fetchManualMaterialInfo}>
                        获取物料信息
                      </Button>
                      {manualFetchStatus ? (
                        <Tag color={manualFetchStatus.startsWith('获取失败') ? 'red' : manualFetchStatus === '获取中...' ? 'blue' : 'green'}>{manualFetchStatus}</Tag>
                      ) : null}
                      <Button onClick={() => setManualRows((prev) => [...prev, emptyManualRow(prev.length)])}>追加行</Button>
                      <Button
                        danger
                        disabled={selectedManualKeys.length === 0}
                        onClick={() => {
                          setManualRows((prev) => prev.filter((r) => !selectedManualKeys.includes(r.key)))
                          setSelectedManualKeys([])
                        }}
                      >
                        批量删除
                      </Button>
                      <Button
                        danger
                        onClick={() => {
                          setManualRows([])
                          setSelectedManualKeys([])
                          setManualFetchStatus('')
                          setCellStates({})
                        }}
                      >
                        全部删除
                      </Button>
                      <Tag color="red">红色=错误</Tag>
                      <Tag color="green">浅绿=已修改待提交</Tag>
                      <Tag color="blue">浅蓝=获取后与原文不一致</Tag>
                      <Tag color="orange">浅黄行=待补资料（缺图纸或物料建档）</Tag>
                    </Space>
                    <Table
                      rowKey="key"
                      columns={mergedEditableColumns}
                      dataSource={manualRows}
                      scroll={{ x: 2300 }}
                      pagination={false}
                      components={{ header: { cell: ResizableTitle } }}
                      rowClassName={(row) => (row.doc_status === '待补资料' ? 'missing-drawing-row' : '')}
                      rowSelection={{
                        selectedRowKeys: selectedManualKeys,
                        onChange: setSelectedManualKeys,
                      }}
                    />
                    <Button type="primary" onClick={handleManualSubmit}>
                      提交
                    </Button>
                  </Form>
                </Space>
                ),
              },
              {
                key: 'materials',
                label: t('nav.contractsMaterials'),
                children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Form
                      form={dalianForm}
                      layout="vertical"
                    >
                    <Space wrap>
                      <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="factory_order_no" label="本厂单号">
                        <Input />
                      </Form.Item>
                      <Form.Item name="customer" label="客户">
                        <AutoComplete
                          style={{ width: 320 }}
                          options={customerOptions}
                          onSearch={(q) => void loadCustomers(q)}
                          placeholder="请输入或选择客户"
                          allowClear
                          filterOption={false}
                        />
                      </Form.Item>
                    </Space>
                    <Form.Item name="table_text" label="可选：粘贴Excel数据(制表符分隔)，列顺序：序号、条目、图纸号、物料号、数量、备注1、备注2">
                      <Input.TextArea rows={8} />
                    </Form.Item>
                    <Space wrap>
                      <Button onClick={applyDalianPasteRows}>应用粘贴</Button>
                      <Button type="primary" onClick={fetchDalianMaterialInfo}>
                        获取物料信息
                      </Button>
                      {dalianFetchStatus ? (
                        <Tag color={dalianFetchStatus.startsWith('获取失败') ? 'red' : dalianFetchStatus === '获取中...' ? 'blue' : 'green'}>{dalianFetchStatus}</Tag>
                      ) : null}
                      <Button onClick={() => setDalianRows((prev) => [...prev, emptyManualRow(prev.length)])}>追加行</Button>
                      <Button
                        danger
                        disabled={selectedDalianKeys.length === 0}
                        onClick={() => {
                          setDalianRows((prev) => prev.filter((r) => !selectedDalianKeys.includes(r.key)))
                          setSelectedDalianKeys([])
                        }}
                      >
                        批量删除
                      </Button>
                      <Button
                        danger
                        onClick={() => {
                          setDalianRows([])
                          setSelectedDalianKeys([])
                          setDalianFetchStatus('')
                        }}
                      >
                        全部删除
                      </Button>
                      <Tag color="red">红色=错误</Tag>
                      <Tag color="green">浅绿=已修改待提交</Tag>
                      <Tag color="blue">浅蓝=获取后与原文不一致</Tag>
                      <Tag color="orange">浅黄行=待补资料（缺图纸或物料建档）</Tag>
                    </Space>
                    <Table
                      rowKey="key"
                      columns={mergedDalianEditableColumns}
                      dataSource={dalianRows}
                      scroll={{ x: 2100 }}
                      pagination={false}
                      components={{ header: { cell: ResizableTitle } }}
                      rowClassName={(row) => (row.doc_status === '待补资料' ? 'missing-drawing-row' : '')}
                      rowSelection={{
                        selectedRowKeys: selectedDalianKeys,
                        onChange: setSelectedDalianKeys,
                      }}
                    />
                    <Button type="primary" onClick={handleDalianSubmit}>
                      提交
                    </Button>
                  </Form>
                </Space>
                ),
              },
            ]}
          />
        )}
        {section === 'query' && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Tag color="blue">查询总件数：{queryRows.length}</Tag>
                    <Tag color="orange">浅黄行=待补资料（缺图纸或物料建档）</Tag>
                    {queryMaterialFetchStatus ? (
                      <Tag color={queryMaterialFetchStatus.startsWith('获取失败') ? 'red' : queryMaterialFetchStatus === '获取中...' ? 'blue' : 'green'}>{queryMaterialFetchStatus}</Tag>
                    ) : null}
                  </Space>
                  <Form form={queryForm} layout="inline">
                    <Form.Item name="order_no" label="订单号">
                      <Input />
                    </Form.Item>
                    <Form.Item name="customer" label="客户">
                      <Select allowClear placeholder="全部" style={{ width: 320 }} options={customerOptions} />
                    </Form.Item>
                    <Form.Item name="material_no" label="物料号">
                      <Input />
                    </Form.Item>
                    <Form.Item name="status" label="状态">
                      <Select
                        mode="multiple"
                        allowClear
                        style={{ minWidth: 220 }}
                        placeholder="可多选状态"
                        options={statusOptions.map((v) => ({ value: v, label: v }))}
                      />
                    </Form.Item>
                    <Button type="primary" onClick={handleQuery}>
                      查询
                    </Button>
                    <Button onClick={() => setSelectedQueryKeys(queryRows.map((r) => r.id as React.Key))}>全选</Button>
                    <Button onClick={() => setSelectedQueryKeys([])}>清空</Button>
                    <Button type="primary" disabled={selectedQueryKeys.length === 0} onClick={fetchSelectedQueryMaterialInfo}>
                      批量获取物料信息
                    </Button>
                    <Button
                      danger
                      disabled={selectedQueryKeys.length === 0}
                      onClick={() => confirmDeleteQueryRows(selectedQueryKeys.map((id) => Number(id)))}
                    >
                      批量删除
                    </Button>
                    <Button
                      style={{ background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 600 }}
                      disabled={queryRows.length === 0}
                      onClick={() => {
                        setQueryExportColumnKeys(orderQueryExportColumns.map((col) => col.key))
                        setQueryExportModalOpen(true)
                      }}
                    >
                      导出 Excel
                    </Button>
                    <Button
                      onClick={() => {
                        const orderNo = String(queryForm.getFieldValue('order_no') || '')
                        const materialNo = String(queryForm.getFieldValue('material_no') || '')
                        setLogOrderNo(orderNo)
                        setLogMaterialNo(materialNo)
                        setLogOpen(true)
                        void loadOrderLogs(orderNo, materialNo)
                      }}
                    >
                      操作日志
                    </Button>
                  </Form>
                  {warning && <Alert type="warning" message={warning} />}
                  <Table
                    rowKey="id"
                    columns={queryDetailColumns}
                    dataSource={queryRows}
                    scroll={{ x: Math.max(3200, queryRows.length ? Object.keys(queryRows[0]).length * 110 : 3200) }}
                    rowClassName={(row) => (row.doc_status === '待补资料' ? 'missing-drawing-row' : '')}
                    rowSelection={{
                      selectedRowKeys: selectedQueryKeys,
                      onChange: setSelectedQueryKeys,
                    }}
                  />
                </Space>
        )}
        {section === 'split' && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form form={splitForm} layout="inline">
                    <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Button type="primary" onClick={handleLoadSplitRows}>
                      加载明细
                    </Button>
                    <Button onClick={() => setSelectedSplitKeys(splitRows.map((r) => r.id as React.Key))}>全选</Button>
                    <Form.Item name="assign_mode" label="分配选项" rules={[{ required: true }]}>
                      <Select style={{ width: 160 }} options={modeOptions.map((v) => ({ value: v }))} />
                    </Form.Item>
                    <Button type="primary" onClick={handleSplit}>
                      分割订单
                    </Button>
                  </Form>
                  <Table
                    rowKey="id"
                    columns={[
                      {
                        title: 'No.',
                        width: 70,
                        render: (_: unknown, __: unknown, index: number) => index + 1,
                      },
                      { title: '物料号', dataIndex: 'material_no', width: 180 },
                      { title: '生产模式', dataIndex: 'material_mode', width: 140 },
                      { title: '订单号', dataIndex: 'order_no' },
                      { title: '本厂单号', dataIndex: 'factory_order_no' },
                      { title: '客户', dataIndex: 'customer' },
                      { title: '序号', dataIndex: 'seq' },
                      { title: '条目', dataIndex: 'item_no' },
                      { title: '名称/料号', dataIndex: 'name' },
                      { title: '图纸号', dataIndex: 'drawing_no' },
                      { title: '规格型号', dataIndex: 'spec_model' },
                      { title: '规格', dataIndex: 'spec' },
                      { title: '标准', dataIndex: 'standard' },
                      { title: '材质', dataIndex: 'material' },
                      { title: '数量', dataIndex: 'quantity' },
                      { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color="blue">{v}</Tag> },
                    ]}
                    dataSource={splitRows}
                    scroll={{ x: 1800 }}
                    rowSelection={{
                      selectedRowKeys: selectedSplitKeys,
                      onChange: setSelectedSplitKeys,
                    }}
                  />
                </Space>
        )}
      </Card>

      <Modal
        title="修改订单明细"
        open={detailEditOpen}
        destroyOnClose
        onCancel={() => {
          setDetailEditOpen(false)
          setDetailEditSnapshot(null)
        }}
        footer={null}
        width={780}
      >
        <Form form={detailEditForm} layout="vertical">
          <Form.Item label="订单号">
            <Input disabled value={(detailEditSnapshot?.order_no as string) || ''} />
          </Form.Item>
          <OrderDetailWritableFormItems />
          <Button type="primary" onClick={() => void submitDetailEdit()}>
            保存修改
          </Button>
        </Form>
      </Modal>

      <Modal
        title="选择导出列"
        open={queryExportModalOpen}
        onCancel={() => setQueryExportModalOpen(false)}
        onOk={() => void handleExportQueryExcel()}
        okText="下一步：保存文件"
        cancelText="取消"
      >
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflow: 'auto' }}
          value={queryExportColumnKeys}
          onChange={(vals) => setQueryExportColumnKeys(vals as string[])}
        >
          {orderQueryExportColumns.map((col) => (
            <Checkbox key={col.key} value={col.key}>
              {col.title}
            </Checkbox>
          ))}
        </Checkbox.Group>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={() => setQueryExportColumnKeys(orderQueryExportColumns.map((col) => col.key))}>
            全选
          </Button>
          <Button size="small" style={{ marginLeft: 8 }} onClick={() => setQueryExportColumnKeys([])}>
            清空
          </Button>
        </div>
      </Modal>

      <Drawer title="订单明细操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={920}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              placeholder="按订单号筛选"
              value={logOrderNo}
              onChange={(e) => setLogOrderNo(e.target.value)}
              style={{ width: 200 }}
            />
            <Input
              placeholder="按物料号筛选"
              value={logMaterialNo}
              onChange={(e) => setLogMaterialNo(e.target.value)}
              style={{ width: 200 }}
            />
            <Button onClick={() => void loadOrderLogs()}>查询</Button>
            <Button
              onClick={() => {
                setLogOrderNo('')
                setLogMaterialNo('')
                void loadOrderLogs('', '')
              }}
            >
              显示全部
            </Button>
          </Space>
          <Table
            rowKey="id"
            size="small"
            loading={logLoading}
            dataSource={logRows}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            columns={[
              { title: '时间', dataIndex: 'operated_at', width: 170 },
              { title: '操作人', dataIndex: 'operator_name', width: 100 },
              {
                title: '动作',
                dataIndex: 'action',
                width: 80,
                render: (value: string) => ORDER_LOG_ACTION_LABELS[value] || value,
              },
              { title: '订单号', dataIndex: 'order_no', width: 140 },
              { title: '物料号', dataIndex: 'material_no', width: 140 },
              {
                title: '变更内容',
                dataIndex: 'change_summary',
                render: (value: string) => formatOrderLogSummary(value),
              },
            ]}
          />
        </Space>
      </Drawer>

      <Modal
        title="追加订单明细"
        open={detailAppendOpen}
        destroyOnClose
        onCancel={() => {
          setDetailAppendOpen(false)
          setDetailAppendBase(null)
        }}
        footer={null}
        width={780}
      >
        <Form form={detailAppendForm} layout="vertical">
          <Form.Item label="订单号">
            <Input disabled value={(detailAppendBase?.order_no as string) || ''} />
          </Form.Item>
          <OrderDetailWritableFormItems seqExtra="留空则自动使用本订单下一序号" />
          <Button type="primary" onClick={() => void submitDetailAppend()}>
            确认追加
          </Button>
        </Form>
      </Modal>
    </Space>
  )
}
