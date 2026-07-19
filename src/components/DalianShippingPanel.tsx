import { useCallback, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import styles from '../pages/WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { askSavePath } from '../utils/savePath'
import { message } from '../utils/feedback'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'

export type DalianShippingRow = {
  key: string
  id?: number
  delivery_date: string
  persisted: boolean
  locked: boolean
  packing_no: string
  drawing_no: string
  ap1_material_no: string
  r3p_material_no: string
  spec_model: string
  material: string
  quantity: number
  unit_weight: number
  total_weight: number
  order_no: string
  factory_order_no: string
  item_no: string
  unit_price: number | null
  remark: string
  buyer: string
  heat_no: string
  heat_treatment_batch_no: string
  shipping_mark_remark: string
  /** 复制行时预填的下一 ID（提交成功前仅作展示） */
  previewNextId?: number
  /** 追加行产生的待录入行，在填写图纸号前显示 */
  isEntryDraft?: boolean
}

const PASTE_COLUMNS = [
  'drawing_no',
  'ap1_material_no',
  'r3p_material_no',
  'spec_model',
  'material',
  'quantity',
  'unit_weight',
  'order_no',
  'factory_order_no',
  'item_no',
  'unit_price',
  'remark',
  'buyer',
  'heat_no',
  'heat_treatment_batch_no',
] as const

const PASTE_HEADER_LABEL =
  '图纸号、AP1料号、R3P物料号、规格型号、材质、数量、单重、订单号、本厂单号、条目、单价、备注、采购员、炉号、热处理批号'

const BTN_PRIMARY = { type: 'primary' as const, style: { background: '#1677ff', borderColor: '#1677ff' } }

/** 表格可视区域约 10 行（small 尺寸行高约 39px） */
const DALIAN_TABLE_SCROLL_Y = 400

/** 列宽合计，保证横向滚动从而左侧 ID~图纸号、右侧操作列均能固定 */
const DALIAN_TABLE_SCROLL_X = 2620

const BTN_GREEN_TEXT = {
  size: 'small' as const,
  style: {
    backgroundColor: '#ffffff',
    color: '#389e0d',
    borderColor: '#b7eb8f',
  },
}

function normalizeDeliveryDate(value: string): string {
  const text = (value || '').trim()
  if (!text) return ''
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 8) return digits.slice(0, 8)
  const dotted = text.match(/^(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/)
  if (dotted) {
    const y = dotted[1]
    const m = String(Number(dotted[2])).padStart(2, '0')
    const d = String(Number(dotted[3])).padStart(2, '0')
    return `${y}${m}${d}`
  }
  const parsed = dayjs(text)
  return parsed.isValid() ? parsed.format('YYYYMMDD') : text.replace(/\D/g, '').slice(0, 8)
}

function calcTotalWeight(quantity: number, unitWeight: number) {
  return Math.round(Number(quantity || 0) * Number(unitWeight || 0) * 1000) / 1000
}

/** 材质为 A105（含 ASTM A105）且热处理批号非空 → 绿色，否则 → 白色 */
function isMaterialA105(material: string): boolean {
  const upper = (material || '').trim().toUpperCase()
  return upper === 'A105' || upper.includes('A105')
}

function inferShippingMarkRemark(material: string, heatTreatmentBatchNo: string): string {
  const hasHeatBatch = Boolean((heatTreatmentBatchNo || '').trim())
  if (isMaterialA105(material) && hasHeatBatch) return '绿色'
  return '白色'
}

function hasDrawingNo(row: DalianShippingRow): boolean {
  return Boolean((row.drawing_no || '').trim())
}

function shouldDisplayRow(row: DalianShippingRow): boolean {
  if (hasDrawingNo(row)) return true
  if (row.isEntryDraft) return true
  return false
}

function pruneInvalidRows(rows: DalianShippingRow[]): DalianShippingRow[] {
  return rows.filter(shouldDisplayRow)
}

function emptyRow(index: number, entryDraft = false): DalianShippingRow {
  return {
    key: `${Date.now()}-${index}`,
    delivery_date: '',
    persisted: false,
    locked: false,
    packing_no: '',
    drawing_no: '',
    ap1_material_no: '',
    r3p_material_no: '',
    spec_model: '',
    material: '',
    quantity: 0,
    unit_weight: 0,
    total_weight: 0,
    order_no: '',
    factory_order_no: '',
    item_no: '',
    unit_price: null,
    remark: '',
    buyer: '',
    heat_no: '',
    heat_treatment_batch_no: '',
    shipping_mark_remark: '',
    isEntryDraft: entryDraft,
  }
}

function mapDbRowToUi(row: Record<string, unknown>, idx: number): DalianShippingRow {
  const material = String(row.material || '')
  const heatBatch = String(row.heat_treatment_batch_no || '')
  const remark = inferShippingMarkRemark(material, heatBatch)
  return {
    key: `${row.id ?? Date.now()}-${idx}`,
    id: row.id as number | undefined,
    delivery_date: String(row.delivery_date || ''),
    persisted: true,
    locked: true,
    packing_no: String(row.packing_no || ''),
    drawing_no: String(row.drawing_no || ''),
    ap1_material_no: String(row.ap1_material_no || ''),
    r3p_material_no: String(row.r3p_material_no || ''),
    spec_model: String(row.spec_model || ''),
    material,
    quantity: Number(row.quantity || 0),
    unit_weight: Number(row.unit_weight || 0),
    total_weight: Number(row.total_weight || 0),
    order_no: String(row.order_no || ''),
    factory_order_no: String(row.factory_order_no || ''),
    item_no: String(row.item_no || ''),
    unit_price: row.unit_price == null ? null : Number(row.unit_price),
    remark: String(row.remark || ''),
    buyer: String(row.buyer || ''),
    heat_no: String(row.heat_no || ''),
    heat_treatment_batch_no: heatBatch,
    shipping_mark_remark: remark,
  }
}

function applyAutoRemark(row: DalianShippingRow): DalianShippingRow {
  if (!row.material.trim() && !row.heat_treatment_batch_no.trim()) {
    return { ...row, shipping_mark_remark: '' }
  }
  return {
    ...row,
    shipping_mark_remark: inferShippingMarkRemark(row.material, row.heat_treatment_batch_no),
  }
}

function parsePasteText(text: string, deliveryDate: string): DalianShippingRow[] {
  const normalizedDate = normalizeDeliveryDate(deliveryDate)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const cols = line.split('\t')
      const row = emptyRow(idx)
      PASTE_COLUMNS.forEach((field, colIdx) => {
        const raw = cols[colIdx] ?? ''
        if (field === 'quantity') {
          row.quantity = Number(raw || 0)
        } else if (field === 'unit_weight') {
          row.unit_weight = Number(raw || 0)
        } else if (field === 'unit_price') {
          row.unit_price = raw === '' ? null : Number(raw || 0)
        } else if (field === 'item_no') {
          row.item_no = raw
        } else {
          row[field] = raw
        }
      })
      row.delivery_date = normalizedDate
      row.total_weight = calcTotalWeight(row.quantity, row.unit_weight)
      return applyAutoRemark(row)
    })
    .filter(hasDrawingNo)
}

function toDbDate(value: dayjs.Dayjs | null | undefined): string {
  return value ? value.format('YYYYMMDD') : ''
}

function serializeRow(row: DalianShippingRow, formDeliveryDate: string) {
  const delivery_date = normalizeDeliveryDate(row.delivery_date) || formDeliveryDate
  return {
    id: row.persisted ? row.id : undefined,
    delivery_date,
    packing_no: row.packing_no,
    drawing_no: row.drawing_no,
    ap1_material_no: row.ap1_material_no,
    r3p_material_no: row.r3p_material_no,
    spec_model: row.spec_model,
    material: row.material,
    quantity: row.quantity,
    unit_weight: row.unit_weight,
    total_weight: row.total_weight,
    order_no: row.order_no,
    factory_order_no: row.factory_order_no,
    item_no: row.item_no,
    unit_price: row.unit_price,
    remark: row.remark,
    buyer: row.buyer,
    heat_no: row.heat_no,
    heat_treatment_batch_no: row.heat_treatment_batch_no,
    shipping_mark_remark: row.shipping_mark_remark,
  }
}

function mergeSavedRow(prev: DalianShippingRow, saved: Record<string, unknown>): DalianShippingRow {
  const mapped = mapDbRowToUi(saved, 0)
  return { ...mapped, key: prev.key }
}

export default function DalianShippingPanel() {
  const [detailForm] = Form.useForm()
  const [markForm] = Form.useForm()
  const [rows, setRows] = useState<DalianShippingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveDir, setSaveDir] = useState('')

  const updateRow = useCallback(<K extends keyof DalianShippingRow>(key: string, field: K, value: DalianShippingRow[K]) => {
    setRows((prev) => {
      const nextRows = prev.flatMap((row) => {
        if (row.key !== key) return [row]
        if (field === 'drawing_no' && !String(value).trim() && !row.persisted) {
          return []
        }
        const next: DalianShippingRow = { ...row, [field]: value }
        if (field === 'drawing_no' && String(value).trim()) {
          next.isEntryDraft = false
        }
        if (field === 'quantity' || field === 'unit_weight') {
          next.total_weight = calcTotalWeight(next.quantity, next.unit_weight)
        }
        if (field === 'material' || field === 'heat_treatment_batch_no') {
          const material = field === 'material' ? String(value) : next.material
          const heatBatch = field === 'heat_treatment_batch_no' ? String(value) : next.heat_treatment_batch_no
          if (!material.trim() && !heatBatch.trim()) {
            next.shipping_mark_remark = ''
          } else {
            next.shipping_mark_remark = inferShippingMarkRemark(material, heatBatch)
          }
        }
        return [next]
      })
      return pruneInvalidRows(nextRows)
    })
  }, [])

  const tableRows = useMemo(() => rows.filter(shouldDisplayRow), [rows])
  const editableRows = useMemo(() => rows.filter((r) => !r.locked && hasDrawingNo(r)), [rows])

  const renderTextInput = (row: DalianShippingRow, field: keyof DalianShippingRow, width = '100%') => {
    if (row.locked) return <span>{String(row[field] ?? '')}</span>
    return (
      <Input
        value={String(row[field] ?? '')}
        style={{ width }}
        onChange={(e) => updateRow(row.key, field, e.target.value as DalianShippingRow[typeof field])}
      />
    )
  }

  const loadDetails = async () => {
    const values = await detailForm.validateFields(['delivery_date'])
    const delivery_date = toDbDate(values.delivery_date)
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/v1/workflow/shipping/dalian/details?delivery_date=${delivery_date}`))
      const data = await res.json()
      if (!res.ok) return message.error(data.detail || '加载失败')
      const loaded = (data.rows || []).map(mapDbRowToUi).filter(hasDrawingNo)
      setRows(loaded)
      message.success(loaded.length ? `已加载 ${loaded.length} 条发货明细` : '该日期暂无数据，可新建明细')
    } finally {
      setLoading(false)
    }
  }

  const applyPaste = async () => {
    const values = await detailForm.validateFields(['table_text', 'delivery_date'])
    const delivery_date = toDbDate(values.delivery_date)
    const parsed = parsePasteText(values.table_text || '', delivery_date)
    if (!parsed.length) return message.warning('粘贴内容为空、格式不正确，或没有有效的图纸号')
    setRows(parsed)
    message.success(`已粘贴 ${parsed.length} 行数据，发货日期已设为 ${delivery_date}，包装序号请在表格中手动填写`)
  }

  const fetchMaxId = async (): Promise<number> => {
    const res = await fetch(apiUrl('/api/v1/workflow/shipping/dalian/max-id'))
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || '获取最大ID失败')
    return Number(data.max_id || 0)
  }

  const copyRow = async (row: DalianShippingRow) => {
    try {
      const maxId = await fetchMaxId()
      const copy: DalianShippingRow = {
        ...row,
        key: `${Date.now()}-copy`,
        id: undefined,
        previewNextId: maxId + 1,
        delivery_date: '',
        persisted: false,
        locked: false,
      }
      if (!hasDrawingNo(row)) return message.warning('图纸号为空，无法复制该行')
      setRows((prev) => [...prev, copy])
      message.success(`已复制一行，预填 ID：${maxId + 1}`)
    } catch (err) {
      message.error(err instanceof Error ? err.message : '复制失败')
    }
  }

  const unlockRow = (row: DalianShippingRow) => {
    if (!row.persisted) return message.warning('该行尚未提交，可直接编辑')
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, locked: false } : r)))
  }

  const lockRowFromSaved = (prev: DalianShippingRow, saved: Record<string, unknown>) => {
    setRows((list) => list.map((r) => (r.key === prev.key ? mergeSavedRow(r, saved) : r)))
  }

  const saveRow = async (row: DalianShippingRow) => {
    if (!hasDrawingNo(row)) return message.warning('图纸号不能为空')
    const values = await detailForm.validateFields(['delivery_date'])
    const delivery_date = toDbDate(values.delivery_date)
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/shipping/dalian/row/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_date, row: serializeRow(row, delivery_date) }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '保存失败')
        return
      }
      if (data.no_update) {
        message.info('无更新')
        if (row.persisted) {
          setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, locked: true } : r)))
        }
        return
      }
      lockRowFromSaved(row, data.row || {})
      message.success(data.message || '保存成功')
    } catch (err) {
      if (isFetchGuardHandled(err)) return
      message.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const deleteRow = (row: DalianShippingRow) => {
    const doRemove = () => {
      setRows((prev) => prev.filter((r) => r.key !== row.key))
    }
    if (!row.persisted || !row.id) {
      doRemove()
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `确定删除 dalian_shipping_details 表中 id 为 ${row.id} 的记录吗？`,
      onOk: async () => {
        setLoading(true)
        try {
          const res = await fetch(apiUrl(`/api/v1/workflow/shipping/dalian/row/${row.id}`), { method: 'DELETE' })
          const data = await res.json()
          if (!res.ok) {
            message.error(data.detail || '删除失败')
            return
          }
          doRemove()
          message.success(data.message || `已删除 id 为 ${row.id} 的 1 条数据`)
        } finally {
          setLoading(false)
        }
      },
    })
  }

  const formatApiError = (data: unknown, fallback: string) => {
    if (!data || typeof data !== 'object') return fallback
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: string }).msg)
          return JSON.stringify(item)
        })
        .join('；')
    }
    return fallback
  }

  const submitDetails = async () => {
    const values = await detailForm.validateFields(['delivery_date'])
    const delivery_date = toDbDate(values.delivery_date)
    const pending = rows.filter((r) => !r.locked && hasDrawingNo(r))
    if (!pending.length) return message.warning('没有可提交的可编辑行（需填写图纸号）')
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/shipping/dalian/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_date,
          rows: pending.map((r) => serializeRow(r, delivery_date)),
        }),
      })
      let data: Record<string, unknown> = {}
      try {
        data = (await res.json()) as Record<string, unknown>
      } catch {
        data = {}
      }
      if (!res.ok) {
        const reason = formatApiError(data, `HTTP ${res.status}`)
        Modal.error({
          title: '提交失败',
          content: `提交失败！失败原因：${reason}`,
        })
        return
      }
      const savedList: Record<string, unknown>[] = (data.rows as Record<string, unknown>[]) || []
      const count = Number(data.saved_count ?? savedList.length)
      setRows((prev) => {
        let savedIdx = 0
        return prev.map((row) => {
          if (row.locked) return row
          const saved = savedList[savedIdx]
          savedIdx += 1
          return saved ? mergeSavedRow(row, saved) : row
        })
      })
      Modal.success({
        title: '提交成功',
        content: `提交成功 ${count} 条`,
      })
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      const reason = error instanceof Error ? error.message : '网络或服务器异常'
      Modal.error({
        title: '提交失败',
        content: `提交失败！失败原因：${reason}`,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const generateMark = async () => {
    const values = await markForm.validateFields(['mark_delivery_date'])
    const delivery_date = toDbDate(values.mark_delivery_date)
    const nextSaveDir = await askSavePath('大连唛头生成', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('正在检索发货明细并生成唛头，请稍候...', 0)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/shipping/dalian/generate_mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_date }),
      })
      if (!res.ok) return message.error(await readFetchErrorMessage(res))
      const fileName = getDownloadFileName(res, `大连西门子唛头_${delivery_date}.xlsx`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      message.success(`大连唛头已生成：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '大连唛头生成失败')
    } finally {
      hide()
      setGenerating(false)
    }
  }

  const columns: ColumnsType<DalianShippingRow> = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: 'id',
        width: 70,
        fixed: 'left',
        render: (_, row) => (
          <span>{row.persisted && row.id ? row.id : row.previewNextId ? row.previewNextId : ''}</span>
        ),
      },
      {
        title: '发货日期',
        dataIndex: 'delivery_date',
        width: 100,
        fixed: 'left',
        render: (_, row) => renderTextInput(row, 'delivery_date'),
      },
      {
        title: '包装序号',
        dataIndex: 'packing_no',
        width: 90,
        fixed: 'left',
        render: (_, row) => renderTextInput(row, 'packing_no'),
      },
      {
        title: '图纸号',
        dataIndex: 'drawing_no',
        width: 120,
        fixed: 'left',
        render: (_, row) => renderTextInput(row, 'drawing_no'),
      },
      {
        title: 'AP1料号',
        dataIndex: 'ap1_material_no',
        width: 110,
        render: (_, row) => renderTextInput(row, 'ap1_material_no'),
      },
      {
        title: 'R3P物料号',
        dataIndex: 'r3p_material_no',
        width: 110,
        render: (_, row) => renderTextInput(row, 'r3p_material_no'),
      },
      {
        title: '规格型号',
        dataIndex: 'spec_model',
        width: 180,
        render: (_, row) => renderTextInput(row, 'spec_model'),
      },
      {
        title: '材质',
        dataIndex: 'material',
        width: 90,
        render: (_, row) => renderTextInput(row, 'material'),
      },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: 80,
        render: (_, row) =>
          row.locked ? (
            <span>{row.quantity}</span>
          ) : (
            <InputNumber
              min={0}
              value={row.quantity}
              style={{ width: '100%' }}
              onChange={(v) => updateRow(row.key, 'quantity', Number(v || 0))}
            />
          ),
      },
      {
        title: '单重',
        dataIndex: 'unit_weight',
        width: 90,
        render: (_, row) =>
          row.locked ? (
            <span>{row.unit_weight}</span>
          ) : (
            <InputNumber
              min={0}
              step={0.001}
              value={row.unit_weight}
              style={{ width: '100%' }}
              onChange={(v) => updateRow(row.key, 'unit_weight', Number(v || 0))}
            />
          ),
      },
      {
        title: '总重',
        dataIndex: 'total_weight',
        width: 90,
        render: (v) => <span>{v}</span>,
      },
      {
        title: '订单号',
        dataIndex: 'order_no',
        width: 130,
        render: (_, row) => renderTextInput(row, 'order_no'),
      },
      {
        title: '本厂单号',
        dataIndex: 'factory_order_no',
        width: 120,
        render: (_, row) => renderTextInput(row, 'factory_order_no'),
      },
      {
        title: '条目',
        dataIndex: 'item_no',
        width: 80,
        render: (_, row) => renderTextInput(row, 'item_no'),
      },
      {
        title: '单价',
        dataIndex: 'unit_price',
        width: 90,
        render: (_, row) =>
          row.locked ? (
            <span>{row.unit_price ?? ''}</span>
          ) : (
            <InputNumber
              min={0}
              step={0.01}
              value={row.unit_price ?? undefined}
              style={{ width: '100%' }}
              onChange={(v) => updateRow(row.key, 'unit_price', v == null ? null : Number(v))}
            />
          ),
      },
      {
        title: '备注',
        dataIndex: 'remark',
        width: 120,
        render: (_, row) => renderTextInput(row, 'remark'),
      },
      {
        title: '采购员',
        dataIndex: 'buyer',
        width: 90,
        render: (_, row) => renderTextInput(row, 'buyer'),
      },
      {
        title: '炉号',
        dataIndex: 'heat_no',
        width: 110,
        render: (_, row) => renderTextInput(row, 'heat_no'),
      },
      {
        title: '热处理批号',
        dataIndex: 'heat_treatment_batch_no',
        width: 120,
        render: (_, row) => renderTextInput(row, 'heat_treatment_batch_no'),
      },
      {
        title: '唛头备注',
        dataIndex: 'shipping_mark_remark',
        width: 100,
        render: (_, row) => renderTextInput(row, 'shipping_mark_remark'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        fixed: 'right' as const,
        render: (_, row) => (
          <Space size={4} wrap>
            <Button {...BTN_GREEN_TEXT} onClick={() => copyRow(row)}>
              复制
            </Button>
            <Button
              {...BTN_GREEN_TEXT}
              disabled={!row.persisted || !row.locked}
              onClick={() => unlockRow(row)}
            >
              修改
            </Button>
            <Button size="small" danger onClick={() => deleteRow(row)}>
              删除
            </Button>
            <Button size="small" type="primary" disabled={row.locked} onClick={() => saveRow(row)}>
              保存
            </Button>
          </Space>
        ),
      },
    ],
    [updateRow, rows]
  )

  return (
    <>
      <Form form={detailForm} layout="vertical">
        <Card size="small" title="发货明细维护" className={styles.sectionCard}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
            <Form.Item
              name="delivery_date"
              label="发货日期"
              rules={[{ required: true, message: '请选择发货日期' }]}
              initialValue={dayjs()}
              style={{ marginBottom: 0 }}
            >
              <DatePicker format="YYYYMMDD" allowClear={false} />
            </Form.Item>
            <Button {...BTN_PRIMARY} loading={loading} onClick={loadDetails}>
              加载该日明细
            </Button>
          </div>

          <Form.Item
            name="table_text"
            label={`Excel 粘贴区（表头：${PASTE_HEADER_LABEL}）`}
          >
            <Input.TextArea
              rows={4}
              placeholder="从 Excel 复制后粘贴到此处（不含发货日期、包装序号），列之间应为 Tab 分隔；发货日期取上方选择值，包装序号在表格中手动填写"
            />
          </Form.Item>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Button {...BTN_PRIMARY} onClick={applyPaste}>
                应用粘贴
              </Button>
              <Button
                {...BTN_PRIMARY}
                onClick={() => setRows((prev) => [...pruneInvalidRows(prev), emptyRow(prev.length, true)])}
              >
                追加行
              </Button>
              <Button {...BTN_PRIMARY} onClick={() => setRows([])}>
                清空表格
              </Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Button {...BTN_PRIMARY} loading={submitting} onClick={submitDetails}>
                提交发货明细
              </Button>
              <span style={{ color: '#666' }}>可编辑行：{editableRows.length} 条</span>
            </div>
          </div>

          <Table
            className={styles.dalianShippingTable}
            rowKey="key"
            size="small"
            tableLayout="fixed"
            scroll={{ x: DALIAN_TABLE_SCROLL_X, y: DALIAN_TABLE_SCROLL_Y }}
            pagination={false}
            loading={loading}
            dataSource={tableRows}
            columns={columns}
          />

        </Card>
      </Form>

      <Form form={markForm} layout="vertical">
        <Card size="small" title="唛头生成" className={styles.sectionCard}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
            <Form.Item
              name="mark_delivery_date"
              label="发货日期（查询条件）"
              rules={[{ required: true, message: '请选择要查询的发货日期' }]}
              initialValue={dayjs()}
              style={{ marginBottom: 0 }}
            >
              <DatePicker format="YYYYMMDD" allowClear={false} />
            </Form.Item>
            <Button {...BTN_PRIMARY} loading={generating} onClick={generateMark}>
              大连唛头生成
            </Button>
          </div>
          <div style={{ marginTop: 8, color: '#666' }}>
            根据所选发货日期，从数据库检索已保存的大连发货明细并生成 Excel 唛头文件（与上方明细维护的发货日期相互独立）。
          </div>
        </Card>
      </Form>
    </>
  )
}
