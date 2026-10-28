import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, Checkbox, Collapse, Drawer, Input, InputNumber, Modal, Radio, Space, Switch, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { normalizeDrawingInput } from '../utils/specParser'
import GenerateLabelDialog from './qrLabel/GenerateLabelDialog'
import styles from './WorkflowPages.module.css'

type TypingRow = {
  key: string
  id?: number
  order_no: string
  factory_order_no?: string
  order_detail_id?: number | null
  item_no?: number | null
  drawing_rev_no: string
  material_no: string
  part_name: string
  typing_content: string
  spec: string
  model_standard: string
  qr_spec: string
  heat_no: string
  heat_treatment_batch_no: string
  quantity: number | null
  unit_weight: number | null
  remark: string
  manual_fields: string[]
  missing: string[]
  missing_reasons: string[]
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type ApiTypingRow = Omit<TypingRow, 'key'> & { id: number }

type TypingLogRow = {
  id: number
  row_id?: number
  order_no: string
  drawing_rev_no: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  generate: '生成',
  create: '录入',
  update: '修改',
  delete: '删除',
  export: '导出',
}

const FIELD_LABELS: Record<string, string> = {
  drawing_rev_no: '图纸号',
  material_no: 'R3P物料号',
  part_name: '料号',
  typing_content: '打字内容',
  spec: '规格',
  model_standard: '型号（标准）',
  qr_spec: '二维码规格信息',
  heat_no: '炉号',
  heat_treatment_batch_no: '热处理批号',
  quantity: '数量',
  unit_weight: '单重',
  remark: '备注',
}

const EDITABLE_KEYS = [
  'drawing_rev_no',
  'material_no',
  'part_name',
  'typing_content',
  'heat_no',
  'heat_treatment_batch_no',
  'quantity',
  'unit_weight',
  'remark',
] as const

const MISSING_BG = '#ffc7ce'

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg || JSON.stringify(d)))
      .join('; ')
  }
  return '请求失败'
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

function formatChangeSummary(raw: string) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.op === 'generate') {
      const kept = parsed.kept_manual_fields as Record<string, string[]> | undefined
      const keptCount = kept ? Object.keys(kept).length : 0
      const materialNo = String(parsed.material_no || '').trim()
      return [
        `订单 ${parsed.order_no ?? ''}`,
        materialNo ? `物料 ${materialNo}` : '整单',
        `明细 ${parsed.detail_count ?? 0} 条`,
        `新增 ${parsed.inserted_count ?? 0}`,
        `更新 ${parsed.updated_count ?? 0}`,
        parsed.force_overwrite ? '强制覆盖人工值' : `保留人工值 ${keptCount} 行`,
      ].join('，')
    }
    if (parsed.op === 'export') {
      return `导出 ${parsed.file_name ?? ''}（${parsed.row_count ?? 0} 行，粉色 ${parsed.missing_cell_count ?? 0} 格）`
    }
    if (parsed.op === 'delete_batch') {
      return `批量删除 ${parsed.deleted_count ?? 0} 行`
    }
    const fields = parsed.fields as Record<string, unknown> | undefined
    if (!fields || typeof fields !== 'object') return raw
    if (parsed.op === 'delete' || parsed.op === 'manual_create' || parsed.op === 'generate_create') {
      const snap = fields as Record<string, unknown>
      return `${snap.drawing_rev_no ?? ''} / ${snap.material_no ?? ''}：${snap.typing_content ?? ''}`
    }
    return Object.entries(fields)
      .map(([key, value]) => {
        if (value && typeof value === 'object' && 'before' in (value as object)) {
          const pair = value as { before?: unknown; after?: unknown }
          return `${FIELD_LABELS[key] || key}: ${pair.before ?? '(空)'} → ${pair.after ?? '(空)'}`
        }
        return `${FIELD_LABELS[key] || key}: ${value ?? ''}`
      })
      .join('；')
  } catch {
    return raw
  }
}

function fromApi(row: ApiTypingRow): TypingRow {
  return {
    ...row,
    key: String(row.id),
    factory_order_no: row.factory_order_no || '',
    order_detail_id: row.order_detail_id != null ? Number(row.order_detail_id) : null,
    part_name: row.part_name || '',
    spec: row.spec || '',
    model_standard: row.model_standard || '',
    qr_spec: row.qr_spec || '',
    unit_weight: row.unit_weight ?? null,
    manual_fields: row.manual_fields || [],
    missing: row.missing || [],
    missing_reasons: row.missing_reasons || [],
  }
}

function emptyRow(orderNo: string, index: number): TypingRow {
  return {
    key: `new-${Date.now()}-${index}`,
    order_no: orderNo,
    drawing_rev_no: '',
    material_no: '',
    part_name: orderNo.trim().startsWith('2') ? '-' : '',
    typing_content: '',
    spec: '',
    model_standard: '',
    qr_spec: '',
    heat_no: '',
    heat_treatment_batch_no: '',
    quantity: null,
    unit_weight: null,
    remark: '绿漆',
    manual_fields: [],
    missing: [],
    missing_reasons: [],
  }
}

function isSameValue(left: unknown, right: unknown) {
  if (left === null || left === undefined || left === '') {
    return right === null || right === undefined || right === ''
  }
  return String(left) === String(right)
}

function parseDetailIds(raw: string | null): number[] {
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]
}

export default function TypingRequirementPanel() {
  const [searchParams] = useSearchParams()
  const currentUser = getStoredUser()
  const [orderNo, setOrderNo] = useState('')
  const [materialNo, setMaterialNo] = useState('')
  const [loadedOrderNo, setLoadedOrderNo] = useState('')
  const [factoryOrderNo, setFactoryOrderNo] = useState('')
  const [rows, setRows] = useState<TypingRow[]>([])
  const [baseline, setBaseline] = useState<Record<string, TypingRow>>({})
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportScope, setExportScope] = useState<'selected' | 'displayed' | 'order'>('order')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<TypingLogRow[]>([])
  const [logOrderNo, setLogOrderNo] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [deleteInverse, setDeleteInverse] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [labelOpen, setLabelOpen] = useState(false)
  const [labelRows, setLabelRows] = useState<TypingRow[]>([])
  const [focusDetailIds, setFocusDetailIds] = useState<number[]>([])
  const [showFocusOnly, setShowFocusOnly] = useState(false)

  const applyRows = (apiRows: ApiTypingRow[], order: string, factory: string) => {
    const next = apiRows.map(fromApi)
    setRows(next)
    setBaseline(Object.fromEntries(next.map((row) => [row.key, row])))
    setLoadedOrderNo(order)
    setFactoryOrderNo(factory)
    setSelectedKeys([])
    setPage(1)
  }

  const dirtyCount = useMemo(
    () =>
      rows.filter((row) => {
        if (!row.id) return true
        const before = baseline[row.key]
        if (!before) return true
        return EDITABLE_KEYS.some((key) => !isSameValue(before[key], row[key]))
      }).length,
    [rows, baseline],
  )

  const displayedRows = useMemo(() => {
    if (!showFocusOnly || !focusDetailIds.length) return rows
    const ids = new Set(focusDetailIds)
    return rows.filter((row) => {
      if (!row.id) return true
      const detailId = Number(row.order_detail_id || 0)
      return detailId > 0 && ids.has(detailId)
    })
  }, [rows, showFocusOnly, focusDetailIds])

  const loadRows = async (order = orderNo) => {
    const trimmed = order.trim()
    if (!trimmed) {
      message.warning('请先填写订单号')
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ order_no: trimmed })
      const res = await authFetch(apiUrl(`/api/v1/typing-requirements?${params.toString()}`))
      const data = await readJson<{
        rows?: ApiTypingRow[]
        factory_order_no?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      applyRows(data.rows || [], trimmed, data.factory_order_no || '')
      if (!(data.rows || []).length) message.info('该订单还没有打字要求，请点「生成打字要求」')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const order = (searchParams.get('order_no') || '').trim()
    const ids = parseDetailIds(searchParams.get('detail_ids'))
    if (!order) return
    setOrderNo(order)
    setFocusDetailIds(ids)
    setShowFocusOnly(ids.length > 0)
    void loadRows(order)
    // 只跟随工作台跳转参数，避免把 loadRows 放进依赖导致重复查询
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const runGenerate = async (forceOverwrite: boolean) => {
    const trimmed = orderNo.trim()
    const trimmedMaterial = materialNo.trim()
    if (!trimmed) {
      message.warning('请先填写订单号')
      return
    }
    setGenerating(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/typing-requirements/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no: trimmed,
          material_no: trimmedMaterial,
          force_overwrite: forceOverwrite,
        }),
      })
      const data = await readJson<{
        rows?: ApiTypingRow[]
        factory_order_no?: string
        inserted_count?: number
        updated_count?: number
        detail_count?: number
        material_no?: string
        scope?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      applyRows(data.rows || [], trimmed, data.factory_order_no || '')
      setShowFocusOnly(false)
      const scopeText = trimmedMaterial
        ? `物料 ${trimmedMaterial}（${data.detail_count ?? 0} 条明细）`
        : '整单'
      message.success(
        `已生成${scopeText}（新增 ${data.inserted_count ?? 0}，更新 ${data.updated_count ?? 0}）${
          forceOverwrite ? '，人工修改已被覆盖' : '，人工修改已保留'
        }`,
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleForceGenerate = () => {
    const trimmedMaterial = materialNo.trim()
    Modal.confirm({
      title: '强制重新生成',
      content: trimmedMaterial
        ? `会用三表最新数据覆盖本订单物料 ${trimmedMaterial} 的行，包括你手工改过的打字内容和备注。其他物料不受影响。确认继续？`
        : '会用三表最新数据覆盖本订单所有行，包括你手工改过的打字内容和备注。确认继续？',
      okText: '确认覆盖',
      okButtonProps: { danger: true },
      onOk: () => runGenerate(true),
    })
  }

  const updateRow = (key: string, patch: Partial<TypingRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const handleAppend = () => {
    if (!loadedOrderNo) {
      message.warning('请先查询或生成某个订单的打字要求，再追加行')
      return
    }
    setRows((prev) => [...prev, emptyRow(loadedOrderNo, prev.length)])
  }

  const handleSave = async () => {
    if (!dirtyCount) {
      message.info('没有改动需要保存')
      return
    }
    setSaving(true)
    try {
      let created = 0
      let updated = 0
      for (const row of rows) {
        const payload = {
          drawing_rev_no: row.drawing_rev_no,
          material_no: row.material_no,
          part_name: row.part_name,
          typing_content: row.typing_content,
          heat_no: row.heat_no,
          heat_treatment_batch_no: row.heat_treatment_batch_no,
          quantity: row.quantity,
          unit_weight: row.unit_weight,
          remark: row.remark,
        }
        if (!row.id) {
          if (!row.drawing_rev_no.trim() && !row.typing_content.trim()) continue
          const res = await authFetch(apiUrl('/api/v1/typing-requirements'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_no: loadedOrderNo, ...payload }),
          })
          const data = await readJson(res)
          if (!res.ok) {
            message.error(parseApiDetail(data))
            return
          }
          created += 1
          continue
        }
        const before = baseline[row.key]
        if (before && !EDITABLE_KEYS.some((key) => !isSameValue(before[key], row[key]))) continue
        const res = await authFetch(apiUrl(`/api/v1/typing-requirements/${row.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        updated += 1
      }
      message.success(`已保存（新增 ${created}，修改 ${updated}）`)
      await loadRows(loadedOrderNo)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (row: TypingRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      setSelectedKeys((prev) => prev.filter((key) => key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除图纸号 ${row.drawing_rev_no || '(空)'} / 物料号 ${row.material_no || '(空)'} 这一行？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/typing-requirements/${row.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除')
        await loadRows(loadedOrderNo)
      },
    })
  }

  const batchTargets = useMemo(() => {
    const selected = new Set(selectedKeys)
    return deleteInverse
      ? displayedRows.filter((row) => !selected.has(row.key))
      : displayedRows.filter((row) => selected.has(row.key))
  }, [displayedRows, selectedKeys, deleteInverse])

  const allSelected =
    displayedRows.length > 0 && displayedRows.every((row) => selectedKeys.includes(row.key))
  const someSelected = displayedRows.some((row) => selectedKeys.includes(row.key)) && !allSelected

  const toggleRowSelected = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => (checked ? [...new Set([...prev, key])] : prev.filter((item) => item !== key)))
  }

  const toggleAllSelected = (checked: boolean) => {
    setSelectedKeys(checked ? displayedRows.map((row) => row.key) : [])
  }

  const openLabelDialog = (targets: TypingRow[]) => {
    if (!targets.length) {
      message.warning(deleteInverse ? '没有可生成标签的未勾选行' : '请先勾选要生成标签的行')
      return
    }
    if (!targets.some((row) => (row.quantity ?? 0) > 0)) {
      message.warning('所选明细的数量均为 0，无法生成标签')
      return
    }
    setLabelRows(targets)
    setLabelOpen(true)
  }

  const handleBatchDelete = () => {
    if (!batchTargets.length) {
      message.warning(deleteInverse ? '没有可删除的未勾选行' : '请先勾选要删除的行')
      return
    }
    const persistedIds = batchTargets.map((row) => row.id).filter((id): id is number => Boolean(id))
    Modal.confirm({
      title: '批量删除',
      content: deleteInverse
        ? `将删除未勾选的 ${batchTargets.length} 行，已勾选的 ${selectedKeys.length} 行会保留。此操作会记入操作日志。`
        : `将删除已勾选的 ${batchTargets.length} 行。此操作会记入操作日志。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBatchDeleting(true)
        try {
          if (persistedIds.length) {
            const res = await authFetch(apiUrl('/api/v1/typing-requirements/delete-batch'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: persistedIds }),
            })
            const data = await readJson<{ detail?: unknown }>(res)
            if (!res.ok) {
              message.error(parseApiDetail(data))
              return
            }
          }
          const remove = new Set(batchTargets.map((row) => row.key))
          setRows((prev) => prev.filter((row) => !remove.has(row.key)))
          setSelectedKeys((prev) => prev.filter((key) => !remove.has(key)))
          message.success(`已删除 ${batchTargets.length} 行`)
          if (persistedIds.length && loadedOrderNo) await loadRows(loadedOrderNo)
        } finally {
          setBatchDeleting(false)
        }
      },
    })
  }

  const handleExport = () => {
    if (!loadedOrderNo || !rows.length) {
      message.warning('请先查询或生成打字要求，再导出')
      return
    }
    if (dirtyCount) {
      message.warning('有未保存的改动，请先点「保存」再导出')
      return
    }
    setExportScope(showFocusOnly && focusDetailIds.length ? 'displayed' : 'order')
    setExportOpen(true)
  }

  const runExport = async () => {
    if (!loadedOrderNo) return
    let exportRows = rows
    if (exportScope === 'selected') {
      const selected = new Set(selectedKeys)
      exportRows = displayedRows.filter((row) => selected.has(row.key))
      if (!exportRows.length) {
        message.warning('请先勾选要导出的明细')
        return
      }
    } else if (exportScope === 'displayed') {
      exportRows = displayedRows
      if (!exportRows.length) {
        message.warning('当前没有可导出的明细')
        return
      }
    }
    const persistedIds = exportRows.map((row) => row.id).filter((id): id is number => Boolean(id))
    if (exportScope !== 'order' && !persistedIds.length) {
      message.warning('所选范围没有已保存的打字要求，无法导出')
      return
    }
    const defaultName = `打字要求_${loadedOrderNo}.xlsx`
    const saveInfo = await askSavePathAndFileName('导出打字要求', '', defaultName, {
      okText: '确认导出',
    })
    if (!saveInfo) return
    setExporting(true)
    try {
      const params = new URLSearchParams({ order_no: loadedOrderNo })
      if (exportScope !== 'order') {
        persistedIds.forEach((id) => params.append('ids', String(id)))
      }
      const res = await authFetch(apiUrl(`/api/v1/typing-requirements/export?${params.toString()}`))
      if (!res.ok) {
        const data = await readJson(res)
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      const finalName = getDownloadFileName(res, saveInfo.fileName || defaultName)
      const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
      if (saved) {
        message.success(`已导出：${saved}`)
        setExportOpen(false)
      }
    } finally {
      setExporting(false)
    }
  }

  const loadLogs = async (order = logOrderNo) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (order.trim()) params.set('order_no', order.trim())
      const res = await authFetch(apiUrl(`/api/v1/typing-requirements/logs?${params.toString()}`))
      const data = await readJson<{ rows?: TypingLogRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  const cellStyle = (row: TypingRow, key: string) =>
    row.missing.includes(key) ? { background: MISSING_BG, borderColor: '#f87171' } : undefined

  const editableCell = (
    key: (typeof EDITABLE_KEYS)[number],
    row: TypingRow,
    value: string,
    placeholder: string,
  ) => {
    const input = (
      <Input
        value={value}
        placeholder={placeholder}
        style={cellStyle(row, key)}
        onChange={(e) => updateRow(row.key, { [key]: e.target.value } as Partial<TypingRow>)}
        onBlur={
          key === 'drawing_rev_no'
            ? (e) => {
                const next = normalizeDrawingInput(e.target.value)
                if (next !== e.target.value) updateRow(row.key, { drawing_rev_no: next })
              }
            : undefined
        }
      />
    )
    const manual = row.manual_fields.includes(key)
    if (!manual) return input
    return (
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {input}
        <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 11 }}>
          人工
        </Tag>
      </Space>
    )
  }

  const columns: ColumnsType<TypingRow> = [
    {
      title: (
        <Space size={6}>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={!rows.length}
            onChange={(e) => toggleAllSelected(e.target.checked)}
          />
          操作
        </Space>
      ),
      key: 'actions',
      width: 168,
      fixed: 'left',
      render: (_v, row) => (
        <Space size={0} direction="vertical">
          <Space size={4}>
            <Checkbox
              checked={selectedKeys.includes(row.key)}
              onChange={(e) => toggleRowSelected(row.key, e.target.checked)}
            />
            <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
              删除
            </Button>
          </Space>
          <Button type="link" size="small" onClick={() => openLabelDialog([row])}>
            生成标签
          </Button>
        </Space>
      ),
    },
    {
      title: 'No.',
      width: 60,
      fixed: 'left',
      render: (_v, _row, index) => index + 1,
    },
    {
      title: '条目',
      dataIndex: 'item_no',
      width: 70,
      fixed: 'left',
      render: (value?: number | null) => (value === null || value === undefined ? '—' : value),
    },
    {
      title: '图纸号',
      dataIndex: 'drawing_rev_no',
      width: 220,
      fixed: 'left',
      render: (value: string, row) => editableCell('drawing_rev_no', row, value, 'A5E… Rev…'),
    },
    {
      title: 'R3P物料号',
      dataIndex: 'material_no',
      width: 180,
      fixed: 'left',
      render: (value: string, row) => editableCell('material_no', row, value, 'FDK-…'),
    },
    {
      title: '料号',
      dataIndex: 'part_name',
      width: 180,
      render: (value: string, row) =>
        editableCell('part_name', row, value, loadedOrderNo.startsWith('2') ? '-' : '取订单明细名称/料号'),
    },
    {
      title: '打字内容如下：',
      dataIndex: 'typing_content',
      width: 520,
      render: (value: string, row) => {
        const cell = editableCell('typing_content', row, value, '自动拼接，可手工改')
        if (!row.missing.includes('typing_content') || !row.missing_reasons.length) return cell
        return (
          <Tooltip title={`缺数据：${row.missing_reasons.join('、')}`}>
            <div>{cell}</div>
          </Tooltip>
        )
      },
    },
    {
      title: '规格',
      dataIndex: 'spec',
      width: 140,
      render: (value: string, row) => (
        <span style={row.missing.includes('spec') ? { background: MISSING_BG, padding: '0 6px' } : undefined}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: '型号（标准）',
      dataIndex: 'model_standard',
      width: 200,
      render: (value: string, row) => (
        <span style={row.missing.includes('model_standard') ? { background: MISSING_BG, padding: '0 6px' } : undefined}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: '二维码规格信息',
      dataIndex: 'qr_spec',
      width: 160,
      render: (value: string, row) => (
        <span style={row.missing.includes('qr_spec') ? { background: MISSING_BG, padding: '0 6px' } : undefined}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: '炉号',
      dataIndex: 'heat_no',
      width: 150,
      render: (value: string, row) => editableCell('heat_no', row, value, '去实验建档补'),
    },
    {
      title: '热处理批号',
      dataIndex: 'heat_treatment_batch_no',
      width: 160,
      render: (value: string, row) => editableCell('heat_treatment_batch_no', row, value, '去实验建档补'),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (value: number | null, row) => (
        <Input
          value={value === null || value === undefined ? '' : String(value)}
          placeholder="0"
          style={cellStyle(row, 'quantity')}
          onChange={(e) => {
            const text = e.target.value.replace(/[^\d]/g, '')
            updateRow(row.key, { quantity: text ? Number(text) : null })
          }}
        />
      ),
    },
    {
      title: '单重',
      dataIndex: 'unit_weight',
      width: 110,
      render: (value: number | null, row) => {
        const input = (
          <InputNumber
            min={0}
            precision={2}
            value={value}
            placeholder="取订单明细"
            style={{ width: '100%', ...cellStyle(row, 'unit_weight') }}
            onChange={(next) => updateRow(row.key, { unit_weight: next === null || next === undefined ? null : Number(next) })}
          />
        )
        if (!row.manual_fields.includes('unit_weight')) return input
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {input}
            <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 11 }}>
              人工
            </Tag>
          </Space>
        )
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 120,
      render: (value: string, row) => editableCell('remark', row, value, '绿漆 或 /'),
    },
    { title: '上传者', dataIndex: 'created_by', width: 100, render: (v?: string) => v || '—' },
    { title: '上传时间', dataIndex: 'created_at', width: 170, render: (v?: string) => v || '—' },
    { title: '更改者', dataIndex: 'updated_by', width: 100, render: (v?: string) => v || '—' },
    { title: '更改时间', dataIndex: 'updated_at', width: 170, render: (v?: string) => v || '—' },
  ]

  const missingRowCount = displayedRows.filter((row) => row.missing.length).length

  return (
    <div className={styles.stack}>
      <Collapse
        className={styles.opGuide}
        defaultActiveKey={[]}
        items={[
          {
            key: 'guide',
            label: '操作说明',
            children: (
              <div className={styles.opGuideBody}>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>操作步骤</div>
                  <ol className={styles.opGuideList}>
                    <li>
                      填订单号（如 2000981867），点「生成打字要求」，系统按该订单全部明细逐条生成。若同时填物料号，则只生成该物料。
                    </li>
                    <li>图纸号、R3P物料号、数量、单重、炉号、热处理批号直接取自订单明细表。</li>
                    <li>
                      料号：订单号 2 开头（法国）默认填「-」；4 开头（大连）取订单明细「名称/料号」。可手工改。
                    </li>
                    <li>打字内容自动拼接：标准号 规格 型号 + 打字材质 + 炉号 + 热处理批号 + 铭远厂标。</li>
                    <li>备注取自「划漆要求」：录了不划绿漆的图纸填「/」，其余默认填「绿漆」。</li>
                    <li>任何单元格都能直接改；改完点「保存」。要多加一行点「追加行」。</li>
                    <li>
                      操作列可勾选行。滑块在「被选项」时，批量删除 / 批量生成标签作用于勾选行；拨到「反选项」则作用于未勾选行。
                    </li>
                    <li>
                      「生成标签」或「批量生成标签」会弹出模板选择。打印页数 = 该行数量 ÷ 模板排版（横×竖），向上取整。可直接打印或生成 PDF。
                    </li>
                    <li>点「导出 Excel」按模板导出，缺数据的格子在 Excel 里也是粉色。</li>
                    <li>「操作日志」可按订单号查看谁在何时生成、改了什么、导出过什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>打字内容拼接规则</div>
                  <ul className={styles.opGuideList}>
                    <li>规格型号去掉末尾的类型段：EN1092-1 DN300 PN16 SO RF → EN1092-1 DN300 PN16。</li>
                    <li>
                      标准号是 ASME B16.5 时，规格按「DN值-英寸」拼成 DN300/NPS12”，得 ASME B16.5 DN300/NPS12” CL150。
                    </li>
                    <li>材质段查「材质-打字材质」：A105 → A105+QT、304 → A182 F304+AT、316 → A182 F316/F316L+AT。</li>
                    <li>末尾固定加「铭远厂标」。</li>
                  </ul>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>
                      <span style={{ background: MISSING_BG, padding: '0 6px' }}>粉色</span>
                      表示缺数据，鼠标停在打字内容上可看缺什么。单重为 0 或空也会标粉。炉号/热处理批号缺失请到{' '}
                      <Link to="/production/experiment">实验建档</Link> 补录。
                    </li>
                    <li>ASME B16.5 缺英寸去「DN值-英寸」Tab 补；材质对不上去「材质-打字材质」Tab 补。</li>
                    <li>
                      手工改过的字段会标「人工」，再点「生成打字要求」时会保留，不被自动值覆盖。只填订单号时作用于整单；同时填物料号时只作用于该物料。
                    </li>
                    <li>这次新增「料号」「单重」列后，已经生成过的订单请再点一次「生成打字要求」，会按上面规则回填。</li>
                    <li>
                      要让自动值全部生效，点「强制重新生成」。未填物料号时覆盖本订单全部行；填了物料号则只覆盖该物料。
                    </li>
                    <li>图纸号入库统一为 A5E… Rev… 形，连字符写法会自动转换。</li>
                    <li>生成、修改、追加、删除、导出都会留下操作人、时间和变更内容，便于溯源。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Card
        size="small"
        title={<Tag color="orange">按订单号 / 物料号生成打字要求</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.requiredFieldRow}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>订单号</div>
              <div className={styles.labeledFieldHint}>如 2000981867；不填物料号则生成整单</div>
              <Input
                placeholder="2000981867"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                onPressEnter={() => void loadRows()}
                allowClear
              />
            </div>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>物料号</div>
              <div className={styles.labeledFieldHint}>选填；填写后只生成该物料的打字要求</div>
              <Input
                placeholder="如 FDK-115-518"
                value={materialNo}
                onChange={(e) => setMaterialNo(e.target.value)}
                onPressEnter={() => void loadRows()}
                allowClear
              />
            </div>
          </div>
          <Space wrap>
            <Button type="primary" loading={generating} onClick={() => void runGenerate(false)}>
              生成打字要求
            </Button>
            <Button
              type="primary"
              loading={loading}
              onClick={() => {
                setFocusDetailIds([])
                setShowFocusOnly(false)
                void loadRows()
              }}
            >
              查询
            </Button>
            <Button danger loading={generating} onClick={handleForceGenerate}>
              强制重新生成
            </Button>
            <Button
              onClick={() => {
                setLogOrderNo(loadedOrderNo)
                setLogOpen(true)
                void loadLogs(loadedOrderNo)
              }}
            >
              操作日志
            </Button>
          </Space>
        </div>
      </Card>
      <Card
        size="small"
        title={<Tag color="blue">打字要求明细</Tag>}
        extra={
          <Space size={8}>
            {loadedOrderNo ? (
              <span style={{ color: '#334155', fontSize: 12 }}>
                订单号：{factoryOrderNo ? `${factoryOrderNo} ` : ''}
                {loadedOrderNo}
              </span>
            ) : null}
            {missingRowCount ? <Tag color="magenta">{missingRowCount} 行缺数据</Tag> : null}
            {dirtyCount ? <Tag color="gold">{dirtyCount} 行未保存</Tag> : null}
            {showFocusOnly && focusDetailIds.length ? <Tag color="blue">本次变动 {displayedRows.length} 条</Tag> : null}
            <span style={{ color: '#64748b', fontSize: 12 }}>
              {showFocusOnly && focusDetailIds.length
                ? `显示 ${displayedRows.length} / ${rows.length} 条`
                : `共 ${rows.length} 条`}
            </span>
          </Space>
        }
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <Space wrap>
            <Button
              type="primary"
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 600 }}
              onClick={handleAppend}
            >
              追加行
            </Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
            <Button
              type="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
              loading={exporting}
              onClick={handleExport}
            >
              导出 Excel
            </Button>
            {focusDetailIds.length ? (
              <Button
                onClick={() => {
                  setShowFocusOnly((prev) => !prev)
                  setPage(1)
                }}
              >
                {showFocusOnly ? '查看整单' : '只看本次变动'}
              </Button>
            ) : null}
            <Button
              danger
              loading={batchDeleting}
              disabled={!batchTargets.length}
              onClick={handleBatchDelete}
            >
              批量删除{batchTargets.length ? `（${batchTargets.length}）` : ''}
            </Button>
            <Button
              type="primary"
              disabled={!batchTargets.length}
              onClick={() => openLabelDialog(batchTargets)}
            >
              批量生成标签{batchTargets.length ? `（${batchTargets.length}）` : ''}
            </Button>
            <div className={styles.paintSwitch}>
              <span className={deleteInverse ? styles.paintSwitchMuted : styles.paintSwitchActiveGreen}>被选项</span>
              <Switch checked={deleteInverse} onChange={setDeleteInverse} />
              <span className={deleteInverse ? styles.paintSwitchActiveOrange : styles.paintSwitchMuted}>反选项</span>
            </div>
          </Space>
        </div>
        <Table
          className={styles.paintTable}
          rowKey="key"
          size="small"
          loading={loading || generating}
          columns={columns}
          dataSource={displayedRows}
          scroll={{ x: 2900 }}
          locale={{ emptyText: '请先填订单号并点「生成打字要求」' }}
          pagination={{
            current: Math.min(page, Math.max(1, Math.ceil(displayedRows.length / pageSize) || 1)),
            pageSize,
            showSizeChanger: { getPopupContainer: () => document.body },
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage)
              setPageSize(nextSize)
            },
          }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer title="打字要求操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={960}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>订单号</div>
                <div className={styles.labeledFieldHint}>按订单号筛选操作记录</div>
                <Input
                  placeholder="2000981867"
                  value={logOrderNo}
                  onChange={(e) => setLogOrderNo(e.target.value)}
                  onPressEnter={() => void loadLogs()}
                  allowClear
                />
              </div>
            </div>
            <Space wrap>
              <Button type="primary" onClick={() => void loadLogs()}>
                查询
              </Button>
              <Button
                onClick={() => {
                  setLogOrderNo('')
                  void loadLogs('')
                }}
              >
                显示全部
              </Button>
            </Space>
          </div>
          <Table
            className={styles.paintTable}
            rowKey="id"
            size="small"
            loading={logLoading}
            dataSource={logRows}
            locale={{ emptyText: '暂无操作日志' }}
            pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
            columns={[
              { title: '时间', dataIndex: 'operated_at', width: 165 },
              { title: '操作人', dataIndex: 'operator_name', width: 90 },
              {
                title: '动作',
                dataIndex: 'action',
                width: 70,
                render: (value: string) => ACTION_LABELS[value] || value,
              },
              { title: '订单号', dataIndex: 'order_no', width: 120 },
              { title: '图纸号', dataIndex: 'drawing_rev_no', width: 180, render: (v: string) => v || '—' },
              {
                title: '变更内容',
                dataIndex: 'change_summary',
                render: (value: string) => (
                  <Tooltip title={formatChangeSummary(value)}>
                    <span>{formatChangeSummary(value)}</span>
                  </Tooltip>
                ),
              },
            ]}
          />
        </Space>
      </Drawer>
      <Modal
        title="导出打字要求"
        open={exportOpen}
        onCancel={() => setExportOpen(false)}
        okText="确认导出"
        confirmLoading={exporting}
        onOk={() => void runExport()}
        destroyOnClose
      >
        <Radio.Group
          value={exportScope}
          onChange={(e) => setExportScope(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <Radio value="selected">只导出被选中的明细</Radio>
          <Radio value="displayed">只导出当前页面显示的明细</Radio>
          <Radio value="order">导出该订单号相关的所有明细</Radio>
        </Radio.Group>
      </Modal>
      <GenerateLabelDialog
        open={labelOpen}
        rows={labelRows}
        factoryOrderNo={factoryOrderNo}
        onClose={() => setLabelOpen(false)}
      />
    </div>
  )
}
