import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import styles from './WorkflowPages.module.css'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import {
  applyPriceSplitDerived,
  emptyPriceSplitRow,
  priceSplitPriceChanged,
  priceSplitRowFromApi,
  type PriceSplitGroup,
  type PriceSplitRegion,
  type PriceSplitRow,
} from '../utils/priceSplitCalc'
import { normalizeDrawingInput } from '../utils/specParser'

function LabeledField({
  label,
  required,
  hint,
  children,
  wide,
  block,
}: {
  label: string
  required?: boolean
  hint: string
  children: ReactNode
  wide?: boolean
  block?: boolean
}) {
  const className = [
    styles.labeledField,
    wide ? styles.labeledFieldWide : '',
    block ? styles.labeledFieldBlock : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      <div className={styles.labeledFieldName}>
        {label}
        {required ? <span className={styles.requiredMark}>*</span> : null}
      </div>
      <div className={styles.labeledFieldHint}>{hint}</div>
      {children}
    </div>
  )
}

type ColKind = 'text' | 'number' | 'derived' | 'int' | 'readonly'
type TabKey = `${PriceSplitRegion}-${PriceSplitGroup}`

type ColDef = {
  key: keyof PriceSplitRow
  title: string
  width: number
  kind: ColKind
  precision?: number
  tabs?: TabKey[]
  fixed?: 'left' | 'right'
}

const DA: TabKey[] = ['dalian-A105']
const DS: TabKey[] = ['dalian-SS']
const FR: TabKey[] = ['france-A105', 'france-SS']
const DL: TabKey[] = ['dalian-A105', 'dalian-SS']
const A105: TabKey[] = ['france-A105', 'dalian-A105']
const SS: TabKey[] = ['france-SS', 'dalian-SS']
const HAS_DESC: TabKey[] = ['france-A105', 'dalian-A105', 'dalian-SS']
const HAS_M6: TabKey[] = ['france-A105', 'france-SS', 'dalian-SS']
const HAS_YEAR: TabKey[] = ['france-A105', 'dalian-A105', 'dalian-SS']

const COLUMN_DEFS: ColDef[] = [
  { key: 'id', title: 'ID', width: 80, kind: 'readonly', fixed: 'left' },
  { key: 'drawing_no', title: '图纸号', width: 180, kind: 'text', fixed: 'left' },
  { key: 'part_no', title: 'AP1', width: 120, kind: 'text', fixed: 'left', tabs: DL },
  { key: 'material_no', title: '物料号', width: 140, kind: 'text', fixed: 'left' },
  { key: 'material', title: '材质', width: 80, kind: 'text', fixed: 'left' },
  { key: 'flange_type', title: '类型', width: 80, kind: 'text' },
  { key: 'dn', title: 'DN', width: 80, kind: 'number', precision: 1 },
  { key: 'description', title: '描述', width: 220, kind: 'text', tabs: HAS_DESC },
  { key: 'drawing_code', title: '图纸代号', width: 140, kind: 'text', tabs: DS },
  { key: 'drawing_rev', title: '版本', width: 90, kind: 'text', tabs: DS },
  { key: 'scope', title: '范围', width: 90, kind: 'text', tabs: DS },
  { key: 'has_m16', title: 'M16', width: 70, kind: 'text', tabs: DS },
  { key: 'has_through_hole', title: '通孔', width: 70, kind: 'text', tabs: DS },
  { key: 'has_ptfe_hole', title: 'PTFE孔', width: 80, kind: 'text', tabs: DS },
  { key: 'steel_price', title: '钢材价格', width: 110, kind: 'number', precision: 4 },
  { key: 'blanking_weight', title: '下料毛重', width: 100, kind: 'number', precision: 4 },
  { key: 'gas_loss', title: '天然气火耗', width: 110, kind: 'number', precision: 6, tabs: A105 },
  { key: 'ht_loss', title: '热处理火耗', width: 110, kind: 'derived', precision: 6, tabs: A105 },
  { key: 'ht_blanking_weight', title: '热处理下料毛重', width: 130, kind: 'derived', precision: 4, tabs: A105 },
  { key: 'heat_loss', title: '火耗', width: 90, kind: 'number', precision: 6, tabs: SS },
  { key: 'forged_weight', title: '锻造后毛重', width: 110, kind: 'derived', precision: 4 },
  { key: 'net_weight', title: '净重', width: 90, kind: 'number', precision: 4 },
  { key: 'recover_weight', title: '回收料重', width: 100, kind: 'derived', precision: 4 },
  { key: 'scrap_price', title: '废料回收价', width: 110, kind: 'number', precision: 2 },
  { key: 'material_cost', title: '材料成本', width: 110, kind: 'derived', precision: 4 },
  { key: 'blanking_cost', title: '下料费', width: 90, kind: 'number', precision: 2 },
  { key: 'forging_cost', title: '锻造费', width: 90, kind: 'number', precision: 2 },
  { key: 'heat_treatment_cost', title: '热处理费', width: 100, kind: 'number', precision: 2, tabs: A105 },
  { key: 'ht_freight_cost', title: '热处理运费', width: 110, kind: 'number', precision: 2, tabs: A105 },
  { key: 'ring_rolling_cost', title: '碾环费', width: 90, kind: 'number', precision: 2 },
  { key: 'machining_cost', title: '机加工费', width: 100, kind: 'number', precision: 2 },
  { key: 'ht_machining_extra', title: '热处理机加增加', width: 130, kind: 'number', precision: 2, tabs: A105 },
  { key: 'drilling_cost', title: '钻孔费', width: 90, kind: 'number', precision: 2 },
  { key: 'grounding_hole_cost', title: '接地孔费', width: 100, kind: 'number', precision: 2, tabs: DA },
  { key: 'hoisting_hole_cost', title: '吊装孔费', width: 100, kind: 'number', precision: 2 },
  { key: 'through_hole_cost', title: '通孔费', width: 90, kind: 'number', precision: 2, tabs: DS },
  { key: 'ptfe_hole_cost', title: 'PTFE钻孔费', width: 110, kind: 'number', precision: 2 },
  { key: 'm6_hole_cost', title: 'M6侧孔费', width: 100, kind: 'number', precision: 2, tabs: HAS_M6 },
  { key: 'packing_cost', title: '包装费', width: 90, kind: 'number', precision: 2 },
  { key: 'other_cost', title: '其他成本', width: 90, kind: 'number', precision: 2 },
  { key: 'total_process_cost', title: '总加工成本', width: 110, kind: 'derived', precision: 4 },
  { key: 'profit_rate', title: '利润率', width: 90, kind: 'number', precision: 4 },
  { key: 'transport_cost', title: '运输费', width: 90, kind: 'number', precision: 2 },
  { key: 'port_surcharge', title: '港杂费', width: 90, kind: 'number', precision: 2, tabs: FR },
  { key: 'net_price', title: '最终报价', width: 110, kind: 'derived', precision: 4 },
  { key: 'vat_rate', title: '增值税', width: 90, kind: 'number', precision: 2, tabs: FR },
  { key: 'tax_inclusive_price', title: '含税单价', width: 110, kind: 'derived', precision: 4, tabs: FR },
  { key: 'excel_net_price', title: 'Excel原价', width: 110, kind: 'readonly', precision: 4 },
  { key: 'award_yn', title: 'Award', width: 80, kind: 'text', tabs: DA },
  { key: 'sales_mode', title: '模式', width: 80, kind: 'text', tabs: DA },
  { key: 'year_usage', title: '年用量', width: 80, kind: 'int', tabs: HAS_YEAR },
  { key: 'ref_part_no', title: '对照AP1', width: 120, kind: 'text', tabs: DS },
  { key: 'ref_material_no', title: '对照物料号', width: 130, kind: 'text', tabs: DS },
  { key: 'price_version', title: '价格版本', width: 110, kind: 'text' },
  { key: 'price_change_remark', title: '调价说明', width: 180, kind: 'readonly' },
  { key: 'created_by', title: '上传者', width: 100, kind: 'readonly' },
  { key: 'created_at', title: '上传时间', width: 160, kind: 'readonly' },
  { key: 'updated_by', title: '更改者', width: 100, kind: 'readonly' },
  { key: 'updated_at', title: '更改时间', width: 160, kind: 'readonly' },
]

const PASTE_ALIASES: Record<string, keyof PriceSplitRow> = {
  图纸号: 'drawing_no',
  AP1: 'part_no',
  料号: 'part_no',
  物料号: 'material_no',
  材质: 'material',
  类型: 'flange_type',
  DN: 'dn',
  描述: 'description',
  钢材价格: 'steel_price',
  下料毛重: 'blanking_weight',
  净重: 'net_weight',
  最终报价: 'net_price',
}

function visibleColumns(region: PriceSplitRegion, group: PriceSplitGroup): ColDef[] {
  const tab: TabKey = `${region}-${group}`
  return COLUMN_DEFS.filter((col) => !col.tabs || col.tabs.includes(tab))
}

function parsePasteRows(text: string, region: PriceSplitRegion, group: PriceSplitGroup, startIndex: number): PriceSplitRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
  if (!lines.length) return []
  const first = lines[0].split('\t').map((cell) => cell.trim())
  const mapped = first.map((cell) => PASTE_ALIASES[cell])
  const hasHeader = mapped.some(Boolean)
  const fields = hasHeader ? mapped : visibleColumns(region, group).filter((col) => col.kind !== 'readonly').map((col) => col.key)
  const dataLines = hasHeader ? lines.slice(1) : lines
  return dataLines.map((line, index) => {
    const row = emptyPriceSplitRow(group, startIndex + index)
    line.split('\t').forEach((cell, cellIndex) => {
      const field = fields[cellIndex]
      if (!field || field === 'key' || field === 'id') return
      if (typeof row[field] === 'number') {
        ;(row[field] as number) = Number(cell || 0)
      } else if (field === 'drawing_no') {
        row.drawing_no = normalizeDrawingInput(cell)
      } else {
        ;(row[field] as string) = cell
      }
    })
    return row
  })
}

type PriceSplitLogRow = {
  id: number
  region: string
  row_id?: number | null
  material_group?: string
  material_no?: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  create: '录入',
  update: '修改',
  adjust: '调价',
  upload: '上传',
  export: '导出',
  delete: '删除',
}

function formatChangeSummary(raw: string) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown }> | undefined
    if (fields && Object.keys(fields).length) {
      return Object.entries(fields)
        .slice(0, 8)
        .map(([key, value]) => `${key}: ${value?.before ?? ''} → ${value?.after ?? ''}`)
        .join('；')
    }
    if (parsed.op === 'upload') {
      return `文件 ${parsed.file_name || ''}，A105 ${parsed.count_a105 ?? 0} / 不锈钢 ${parsed.count_ss ?? 0}，新增 ${parsed.inserted_count ?? 0}，更新 ${parsed.updated_count ?? 0}，调价 ${parsed.adjusted_count ?? 0}`
    }
    if (parsed.op === 'adjust' || parsed.history_net_price != null) {
      return `历史协议价 ${parsed.history_net_price ?? ''}（版本 ${parsed.history_price_version ?? ''}）→ 新价 ${parsed.net_price ?? ''}；${parsed.price_change_remark || ''}`
    }
    if (parsed.op === 'export') {
      return `导出 ${parsed.file_name || ''}，${parsed.count ?? 0} 条`
    }
    if (parsed.op === 'delete-all') {
      return `清空 ${parsed.material_group || ''} ${parsed.deleted_count ?? 0} 条`
    }
    const materialNo = parsed.material_no ? `物料号 ${parsed.material_no}` : ''
    const netPrice = parsed.net_price != null ? `净价 ${parsed.net_price}` : ''
    return [materialNo, netPrice].filter(Boolean).join('，') || raw
  } catch {
    return raw
  }
}

type PreviewPayload = {
  count_a105: number
  count_ss: number
  skipped: number
  warning_count: number
  warnings: { sheet?: string; row?: number; material_no?: string; message: string }[]
  sheets: string[]
}

export default function PriceSplitArchivePanel() {
  const [region, setRegion] = useState<PriceSplitRegion>('france')
  const [group, setGroup] = useState<PriceSplitGroup>('A105')
  const [rows, setRows] = useState<PriceSplitRow[]>([])
  const [queryDrawingNo, setQueryDrawingNo] = useState('')
  const [queryMaterialNo, setQueryMaterialNo] = useState('')
  const [queryPartNo, setQueryPartNo] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [syncMaterials, setSyncMaterials] = useState(false)
  const [priceVersion, setPriceVersion] = useState('')
  const [priceChangeRemark, setPriceChangeRemark] = useState('')
  const [originals, setOriginals] = useState<Record<string, PriceSplitRow>>({})
  const [downloading, setDownloading] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustVersion, setAdjustVersion] = useState('')
  const [adjustRemark, setAdjustRemark] = useState('')
  const [pendingSaveRows, setPendingSaveRows] = useState<PriceSplitRow[] | null>(null)
  const [importVatRate, setImportVatRate] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<PriceSplitLogRow[]>([])
  const [logMaterialNo, setLogMaterialNo] = useState('')
  const currentUser = getStoredUser()

  const loadRows = async (
    nextRegion = region,
    nextGroup = group,
    drawingNo = queryDrawingNo,
    materialNo = queryMaterialNo,
    partNo = queryPartNo,
  ) => {
    const params = new URLSearchParams()
    params.set('material_group', nextGroup)
    if (drawingNo.trim()) params.set('drawing_no', drawingNo.trim())
    if (materialNo.trim()) params.set('material_no', materialNo.trim())
    if (partNo.trim()) params.set('part_no', partNo.trim())
    const res = await authFetch(apiUrl(`/api/v1/price-split/${nextRegion}?${params.toString()}`))
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '价格拆分表加载失败')
      return
    }
    const mapped: PriceSplitRow[] = (data.rows || []).map((row: Omit<PriceSplitRow, 'key'> & { id: number }) =>
      priceSplitRowFromApi(row),
    )
    setRows(mapped)
    setOriginals(Object.fromEntries(mapped.filter((row) => row.id).map((row) => [String(row.id), row])))
    setSelectedKeys([])
    if (nextRegion === 'france') {
      const vatValues = mapped.map((row) => row.vat_rate).filter((value): value is number => value != null)
      if (vatValues.length) setImportVatRate(vatValues[0])
    }
  }

  const loadLogs = async (materialNo = logMaterialNo) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('material_group', group)
      if (materialNo.trim()) params.set('material_no', materialNo.trim())
      const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/logs?${params.toString()}`))
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '操作日志加载失败')
        return
      }
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const switchRegion = (next: string) => {
    const value = next === 'dalian' ? 'dalian' : 'france'
    setRegion(value)
    if (value === 'france') setQueryPartNo('')
    void loadRows(value, group, queryDrawingNo, queryMaterialNo, value === 'france' ? '' : queryPartNo)
  }

  const switchGroup = (next: string) => {
    const value = next === 'SS' ? 'SS' : 'A105'
    setGroup(value)
    void loadRows(region, value)
  }

  const updateRow = (key: string, patch: Partial<PriceSplitRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        return applyPriceSplitDerived({ ...row, ...patch, material_group: group }, region)
      }),
    )
  }

  const handleAddRow = () => {
    setRows((prev) => {
      const row = emptyPriceSplitRow(group, prev.length)
      if (region === 'france' && importVatRate != null) {
        return [...prev, applyPriceSplitDerived({ ...row, vat_rate: importVatRate }, region)]
      }
      return [...prev, row]
    })
  }

  const handleApplyPaste = () => {
    const pasted = parsePasteRows(pasteText, region, group, rows.length).map((row) => applyPriceSplitDerived(row, region))
    if (!pasted.length) {
      message.warning('没有可应用的粘贴数据')
      return
    }
    setRows((prev) => [...prev, ...pasted])
    setPasteText('')
    message.success(`已追加 ${pasted.length} 条`)
  }

  const commitSave = async (valid: PriceSplitRow[], version: string, remark: string) => {
    setSaving(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/rows`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: valid.map((row) => ({
            ...row,
            drawing_no: normalizeDrawingInput(row.drawing_no),
            material_group: group,
            price_version: version.trim() || row.price_version,
            price_change_remark: remark.trim() || row.price_change_remark,
          })),
          sync_materials: syncMaterials,
          price_version: version,
          price_change_remark: remark,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '保存失败')
        return
      }
      const missing = (data.sync_missing || []).length
      Modal.success({
        title: '保存成功',
        content: `已保存 ${data.saved_count} 条（新增 ${data.inserted_count}，更新 ${data.updated_count}，调价 ${data.adjusted_count || 0}）${
          syncMaterials ? `，同步物料协议价 ${data.synced_count} 条${missing ? `，未匹配 ${missing} 条` : ''}` : ''
        }`,
      })
      setPriceVersion(version)
      setPriceChangeRemark(remark)
      setAdjustOpen(false)
      setPendingSaveRows(null)
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const saveRows = async (payload: PriceSplitRow[]) => {
    const valid = payload.filter((row) => row.material_no.trim())
    if (!valid.length) {
      message.warning('请至少录入一条物料号')
      return
    }
    const missingDrawing = valid.find((row) => !row.drawing_no.trim())
    if (missingDrawing) {
      message.warning('图纸号不能为空')
      return
    }
    const prepared =
      region === 'france' && importVatRate != null
        ? valid.map((row) =>
            row.vat_rate == null || row.vat_rate === ('' as unknown as number)
              ? applyPriceSplitDerived({ ...row, vat_rate: importVatRate }, region)
              : row,
          )
        : valid
    if (region === 'france' && prepared.some((row) => row.vat_rate == null || row.vat_rate === ('' as unknown as number))) {
      message.warning('法国增值税为必填项，请填写如 13（代表 13%）')
      return
    }
    const adjusted = prepared.filter((row) => {
      const origin = row.id ? originals[String(row.id)] : undefined
      return origin ? priceSplitPriceChanged(origin, row) : false
    })
    if (adjusted.length) {
      setAdjustVersion(priceVersion)
      setAdjustRemark(priceChangeRemark)
      setPendingSaveRows(prepared)
      setAdjustOpen(true)
      return
    }
    if (!priceVersion.trim() && prepared.some((row) => !row.price_version.trim())) {
      message.warning('价格版本为必填项')
      return
    }
    await commitSave(prepared, priceVersion, priceChangeRemark)
  }

  const confirmAdjustSave = () => {
    if (!adjustVersion.trim()) {
      message.warning('请填写价格版本')
      return
    }
    if (!adjustRemark.trim()) {
      message.warning('请填写调价说明')
      return
    }
    const pending = pendingSaveRows || []
    const versionUnchanged = pending.find((row) => {
      const origin = row.id ? originals[String(row.id)] : undefined
      if (!origin || !priceSplitPriceChanged(origin, row)) return false
      return adjustVersion.trim() === (origin.price_version || '')
    })
    if (versionUnchanged) {
      message.warning('价格已变动，价格版本必须与当前版本不同')
      return
    }
    void commitSave(pending, adjustVersion, adjustRemark)
  }

  const regionLabel = region === 'france' ? '法国' : '大连'
  const groupLabel = group === 'SS' ? '304&316' : 'A105'

  const handleDelete = (record: PriceSplitRow) => {
    Modal.confirm({
      title: '删除价格拆分记录',
      content: record.id ? `确认删除物料号 ${record.material_no}？` : '确认删除这条未提交的记录？',
      onOk: async () => {
        if (!record.id) {
          setRows((prev) => prev.filter((row) => row.key !== record.key))
          return
        }
        const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/${record.id}`), { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) {
          message.error(data.detail || '删除失败')
          return
        }
        message.success('已删除')
        await loadRows()
      },
    })
  }

  const handleBatchDelete = () => {
    const selected = rows.filter((row) => selectedKeys.includes(row.key))
    if (!selected.length) {
      message.warning('请先勾选要删除的行')
      return
    }
    const persistedIds = selected.map((row) => row.id).filter((id): id is number => Boolean(id))
    const localCount = selected.length - persistedIds.length
    Modal.confirm({
      title: '批量删除',
      content: `确认删除已选 ${selected.length} 条（其中已建档 ${persistedIds.length} 条${localCount ? `，未保存 ${localCount} 条` : ''}）？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeleting(true)
        try {
          if (persistedIds.length) {
            const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/delete-batch`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: persistedIds }),
            })
            const data = await res.json()
            if (!res.ok) {
              message.error(data.detail || '批量删除失败')
              return
            }
          }
          setRows((prev) => prev.filter((row) => !selectedKeys.includes(row.key)))
          setSelectedKeys([])
          message.success(`已删除 ${selected.length} 条`)
          if (persistedIds.length) {
            await loadRows()
          }
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  const handleDeleteAll = () => {
    const persistedCount = rows.filter((row) => row.id).length
    Modal.confirm({
      title: '全部删除',
      content: `将删除【${regionLabel} / ${groupLabel}】下的全部有效记录（当前列表约 ${persistedCount} 条，未保存的新行也会清空）。历史无效调价记录会保留。此操作不可恢复。`,
      okText: '确认全部删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeleting(true)
        try {
          const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/delete-all?material_group=${group}`), {
            method: 'POST',
          })
          const data = await res.json()
          if (!res.ok) {
            message.error(data.detail || '全部删除失败')
            return
          }
          setRows([])
          setSelectedKeys([])
          message.success(`已删除 ${data.deleted_count ?? persistedCount} 条`)
          await loadRows()
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/export?material_group=${group}`))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        message.error(data.detail || '下载失败')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `价格拆分_${regionLabel}_${groupLabel}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const runPreview = async (file?: File) => {
    const target = file || uploadFile
    if (!target) {
      message.warning('请先选择 xlsx 文件')
      return
    }
    setPreviewing(true)
    try {
      const form = new FormData()
      form.append('file', target)
      const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/preview`), { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '预览失败')
        return
      }
      setPreview(data)
    } finally {
      setPreviewing(false)
    }
  }

  const runImport = async () => {
    if (!uploadFile) {
      message.warning('请先选择 xlsx 文件')
      return
    }
    if (!priceVersion.trim()) {
      message.warning('价格版本为必填项')
      return
    }
    if (region === 'france' && importVatRate == null) {
      message.warning('法国增值税为必填项，请填写如 13（代表 13%）')
      return
    }
    setImporting(true)
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      form.append('price_version', priceVersion)
      form.append('price_change_remark', priceChangeRemark)
      if (region === 'france' && importVatRate != null) {
        form.append('vat_rate', String(importVatRate))
      }
      form.append('sync_materials', syncMaterials ? 'true' : 'false')
      const res = await authFetch(apiUrl(`/api/v1/price-split/${region}/import`), { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        message.error(data.detail || '导入失败')
        return
      }
      Modal.success({
        title: '导入成功',
        content: `A105 ${data.count_a105} 条，不锈钢 ${data.count_ss} 条；新增 ${data.inserted_count}，更新 ${data.updated_count}，调价 ${data.adjusted_count || 0}${
          syncMaterials ? `；同步协议价 ${data.synced_count} 条` : ''
        }`,
      })
      setUploadOpen(false)
      setFileList([])
      setPreview(null)
      await loadRows()
    } finally {
      setImporting(false)
    }
  }

  const defs = visibleColumns(region, group)
  const columns: ColumnsType<PriceSplitRow> = [
    ...defs.map((col) => ({
      title: col.title,
      dataIndex: col.key,
      width: col.width,
      fixed: col.fixed,
      render: (value: unknown, record: PriceSplitRow) => {
        if (col.kind === 'derived' || col.kind === 'readonly') {
          if (value == null || value === '') return ''
          if (typeof value === 'number' || col.precision != null) {
            const n = Number(value)
            return Number.isFinite(n) ? n.toFixed(col.precision ?? 4) : String(value)
          }
          return String(value)
        }
        if (col.kind === 'number' || col.kind === 'int') {
          const nullable = col.key === 'vat_rate'
          const inputWidth = Math.max(72, (col.width || 100) - 16)
          return (
            <InputNumber
              size="small"
              style={{ width: inputWidth }}
              min={0}
              precision={col.kind === 'int' ? 0 : col.precision ?? 2}
              value={nullable ? (value == null || value === '' ? null : Number(value)) : Number(value || 0)}
              onChange={(next) =>
                updateRow(record.key, {
                  [col.key]: nullable ? (next == null ? null : Number(next)) : Number(next || 0),
                } as Partial<PriceSplitRow>)
              }
            />
          )
        }
        return (
          <Input
            size="small"
            style={{ width: Math.max(72, (col.width || 100) - 16) }}
            value={String(value ?? '')}
            placeholder={col.key === 'drawing_no' ? 'A5E… Rev017 或 A5E…-017' : undefined}
            onChange={(e) => updateRow(record.key, { [col.key]: e.target.value } as Partial<PriceSplitRow>)}
            onBlur={
              col.key === 'drawing_no'
                ? (e) => updateRow(record.key, { drawing_no: normalizeDrawingInput(e.target.value) })
                : undefined
            }
          />
        )
      },
    })),
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: (_: unknown, record: PriceSplitRow) => (
        <Space>
          <Button size="small" type="primary" onClick={() => void saveRows([record])}>
            保存
          </Button>
          <Button size="small" danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const scrollX = useMemo(() => visibleColumns(region, group).reduce((sum, col) => sum + col.width, 180), [region, group])

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
                  <div className={styles.opGuideLabel}>操作方法</div>
                  <ul className={styles.opGuideList}>
                    <li>先选择区域 Tab（法国 / 大连），再选择材质组（A105 / 304&amp;316）。查询、录入、保存都针对当前 Tab。</li>
                    <li>方法一：上传原价格拆分表 Excel（一次可同时导入该区域的 A105 与不锈钢）。</li>
                    <li>方法二：从 Excel 复制后粘贴追加到当前材质组表格。</li>
                    <li>方法三：点「追加行」逐条填写，或直接改表中已有行后保存。</li>
                  </ul>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>方法一：上传 Excel</div>
                  <ol className={styles.opGuideList}>
                    <li>切到要导入的区域（法国或大连）。材质组 Tab 不影响整表导入，一份文件会同时写入 A105 和 304&amp;316。</li>
                    <li>价格版本必填。若与已有有效行撞键（法国：图纸号+物料号；大连：图纸号+物料号+料号），视为调价，必须另填调价说明，旧行变无效、导入行作为新有效行。</li>
                    <li>点击橙色「上传 Excel」，选择对应区域的 xlsx（仅支持 .xlsx）。「下载excel」导出当前 Tab 有效行。</li>
                    <li>系统自动预览：显示识别到的工作表、条数、跳过行、报价差异告警。核对后点「确认导入」。</li>
                    <li>导入按「材质组 + 物料号」更新已有记录、新增没有的记录（upsert），不会整表清空。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>方法二：粘贴追加</div>
                  <ol className={styles.opGuideList}>
                    <li>切到目标区域和材质组。</li>
                    <li>在 Excel 中复制若干行（建议带表头：图纸号、物料号、材质、类型、DN、描述、钢材价格、下料毛重、净重；大连可带 AP1）。</li>
                    <li>粘贴到页面文本框，点「粘贴追加」。数据追加到表格末尾，尚未写入数据库。</li>
                    <li>核对后点行内「保存」或顶部「保存全部」落库。物料号不能为空。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>方法三：逐条录入 / 修改</div>
                  <ol className={styles.opGuideList}>
                    <li>点「追加行」新增空行，填写图纸号、物料号、重量与各项费率。</li>
                    <li>材料成本、总加工成本、最终报价为只读派生列，改输入项后会按源表公式自动重算。</li>
                    <li>点该行「保存」写入一条；「保存全部」保存当前表格中有物料号的行。</li>
                    <li>可用图纸号 / 物料号查询（大连还可按 AP1），或「显示全部」加载当前材质组全部记录。</li>
                    <li>「删除」会删除已落库记录；未保存的新行只从页面移除。</li>
                    <li>勾选多行后点「批量删除」；「全部删除」清空当前区域+当前材质组的全部已建档记录。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>请上传当前 Tab 对应区域的文件：法国表导入法国库，大连表导入大连库，不要交叉上传。</li>
                    <li>仅支持 xlsx。大连表会跳过「价格变化记录说明」；不锈钢以右侧 Drawing / AP1 / R3P 为正式物料，左侧碳钢对照件写入对照字段。</li>
                    <li>法国按图纸号+物料号判唯一，大连按图纸号+物料号+料号（AP1）判唯一。法国增值税必填（填 13 即 13%），含税单价=最终报价×(1+增值税/100)。改任何价格保存时会弹出对话框，必填新的价格版本和调价说明，旧行保留为无效历史。</li>
                    <li>预览中的告警表示引擎报价与 Excel 缓存值相差超过 0.05 元，默认仍以系统公式为准，不阻断导入。</li>
                    <li>「同步到物料建档协议价」默认关闭。勾选后按物料号+图纸号更新对应区域协议价；找不到物料只提示、不会自动建物料。</li>
                    <li>合同订单「获取物料信息」按客户线读取本表有效行：大连协议价与产品单价取最终报价；法国协议价取最终报价，产品单价取含税单价。名称/规格/单重仍来自物料建档。</li>
                    <li>Excel 须先在本机用 Excel 打开并保存过，系统才能读到公式计算后的钢材价格等缓存值。</li>
                    <li>录入、修改、上传、删除会记录当前登录人、时间和变更内容，可在「操作日志」中按物料号溯源。表格右侧显示上传者/上传时间/更改者/更改时间。</li>
                    <li>列与源表对齐：法国无 AP1 / Award / 对照件 / 孔位标记；大连无港杂；M6 侧孔仅法国与大连不锈钢有；接地孔仅大连 A105；通孔费仅大连不锈钢单独列（法国并入吊装孔）。</li>
                    <li>「全部删除」只作用于当前 Tab（例如法国/A105），不会删除另一区域或另一材质组。删除后不可恢复，请先确认。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Tabs
        activeKey={region}
        onChange={switchRegion}
        items={[
          { key: 'france', label: '法国' },
          { key: 'dalian', label: '大连' },
        ]}
      />
      <Tabs
        activeKey={group}
        onChange={switchGroup}
        items={[
          { key: 'A105', label: 'A105' },
          { key: 'SS', label: '304&316' },
        ]}
      />
      <Card size="small" title={<Tag color="blue">查询 / 导入 / 逐条录入</Tag>} className={styles.sectionCard}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div>
              <Button type="primary" onClick={() => void loadRows()}>
                查询
              </Button>
            </div>
            <div className={styles.queryFieldRow}>
              <LabeledField label="图纸号" hint="按图纸号筛选当前 Tab 有效行">
                <Input placeholder="A5E… Rev017 或 A5E…-017" value={queryDrawingNo} onChange={(e) => setQueryDrawingNo(e.target.value)} />
              </LabeledField>
              <LabeledField label="物料号" hint="按物料号筛选当前 Tab 有效行">
                <Input placeholder="请输入物料号" value={queryMaterialNo} onChange={(e) => setQueryMaterialNo(e.target.value)} />
              </LabeledField>
              {region === 'dalian' ? (
                <LabeledField label="AP1" hint="大连按料号（AP1）筛选">
                  <Input placeholder="请输入 AP1" value={queryPartNo} onChange={(e) => setQueryPartNo(e.target.value)} />
                </LabeledField>
              ) : null}
            </div>
          </div>
          <Space wrap>
            <Button
              type="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
              onClick={() => {
                setQueryDrawingNo('')
                setQueryMaterialNo('')
                setQueryPartNo('')
                void loadRows(region, group, '', '', '')
              }}
            >
              显示全部
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 700 }}
              onClick={() => setUploadOpen(true)}
            >
              上传 Excel
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              loading={downloading}
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 700 }}
              onClick={() => void handleDownload()}
            >
              下载excel
            </Button>
            <Button onClick={handleAddRow}>追加行</Button>
            <Button type="primary" loading={saving} onClick={() => void saveRows(rows)}>
              保存全部
            </Button>
            <Button danger disabled={selectedKeys.length === 0} loading={deleting} onClick={handleBatchDelete}>
              批量删除{selectedKeys.length ? `（${selectedKeys.length}）` : ''}
            </Button>
            <Button danger disabled={rows.length === 0} loading={deleting} onClick={handleDeleteAll}>
              全部删除
            </Button>
            <Button
              onClick={() => {
                setLogOpen(true)
                void loadLogs()
              }}
            >
              操作日志
            </Button>
            <Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>
            <Checkbox checked={syncMaterials} onChange={(e) => setSyncMaterials(e.target.checked)}>
              同步到物料建档协议价
            </Checkbox>
          </Space>
          <div className={styles.requiredFieldRow}>
            {region === 'france' ? (
              <LabeledField label="增值税" required hint="法国必填。填写 13 即代表 13%，含税单价=最终报价×(1+增值税/100)" block>
                <InputNumber
                  min={0}
                  precision={2}
                  placeholder="例如 13"
                  value={importVatRate}
                  onChange={(next) => {
                    const value = next == null ? null : Number(next)
                    setImportVatRate(value)
                    setRows((prev) =>
                      prev.map((row) => applyPriceSplitDerived({ ...row, vat_rate: value }, region)),
                    )
                  }}
                  style={{ width: '100%' }}
                />
              </LabeledField>
            ) : null}
            <LabeledField label="价格版本" required hint="保存必填。首次建档填写本次版本，如 2026-01-01；改价时须与当前版本不同" block>
              <Input
                placeholder="例如 2026-01-01"
                value={priceVersion}
                onChange={(e) => setPriceVersion(e.target.value)}
              />
            </LabeledField>
            <LabeledField label="调价说明" hint="改任何价格后保存时必填，用于记录本次调价原因；首次建档可空" block>
              <Input
                placeholder="例如：钢材涨价后调整最终报价"
                value={priceChangeRemark}
                onChange={(e) => setPriceChangeRemark(e.target.value)}
              />
            </LabeledField>
          </div>
          <div className={styles.pasteArea}>
            <LabeledField
              label="粘贴追加"
              hint={
                region === 'dalian'
                  ? '从 Excel 复制后粘贴到此处。支持表头：图纸号、AP1、物料号、材质、类型、DN、描述、钢材价格、下料毛重、净重'
                  : '从 Excel 复制后粘贴到此处。支持表头：图纸号、物料号、材质、类型、DN、描述、钢材价格、下料毛重、净重（法国无 AP1）'
              }
              block
            >
              <Input.TextArea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="请粘贴 Excel 内容（制表符分隔）"
              />
            </LabeledField>
            <div>
              <Button type="primary" onClick={handleApplyPaste}>
                粘贴追加
              </Button>
            </div>
          </div>
        </Space>
      </Card>
      <Table
        className={styles.priceSplitTable}
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        scroll={{ x: scrollX, y: 560 }}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys as string[]),
        }}
      />
      <div className={styles.mobileTableHint}>派生列（材料成本 / 总加工成本 / 最终报价）按公式自动重算，灰色显示为只读。</div>
      <Modal
        title={`上传${region === 'france' ? '法国' : '大连'}价格拆分表`}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false)
          setPreview(null)
          setFileList([])
          setUploadFile(null)
        }}
        footer={null}
        width={720}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Upload
            accept=".xlsx"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              if (!file.name.toLowerCase().endsWith('.xlsx')) {
                message.error('仅支持 xlsx 文件')
                return Upload.LIST_IGNORE
              }
              setFileList([
                {
                  uid: file.uid || file.name,
                  name: file.name,
                  status: 'done',
                  originFileObj: file,
                },
              ])
              setUploadFile(file)
              void runPreview(file)
              return false
            }}
            onRemove={() => {
              setFileList([])
              setUploadFile(null)
              setPreview(null)
            }}
          >
            <Button icon={<UploadOutlined />}>选择 xlsx 文件</Button>
          </Upload>
          <div className={styles.requiredFieldRow}>
            {region === 'france' ? (
              <LabeledField label="增值税" required hint="法国导入必填。填写 13 即代表 13%，导入行若未带增值税则按此填写" block>
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="例如 13"
                  value={importVatRate}
                  onChange={(next) => setImportVatRate(next == null ? null : Number(next))}
                />
              </LabeledField>
            ) : null}
            <LabeledField label="价格版本" required hint="导入必填。首次导入可填本次版本；与已有有效行撞键视为调价，须与当前版本不同" block>
              <Input placeholder="例如 2026-01-01" value={priceVersion} onChange={(e) => setPriceVersion(e.target.value)} />
            </LabeledField>
            <LabeledField label="调价说明" hint="与已有有效行撞键（调价）时必填；首次导入可空，系统记为「首次建档」" block>
              <Input.TextArea
                rows={2}
                placeholder="例如：按新协议价整体上调"
                value={priceChangeRemark}
                onChange={(e) => setPriceChangeRemark(e.target.value)}
              />
            </LabeledField>
          </div>
          <Checkbox checked={syncMaterials} onChange={(e) => setSyncMaterials(e.target.checked)}>
            导入后同步净价到物料建档对应协议价（找不到物料则跳过）
          </Checkbox>
          {preview ? (
            <div>
              <p>
                识别工作表：{(preview.sheets || []).join('、') || '无'}
              </p>
              <p>
                A105 {preview.count_a105} 条，不锈钢 {preview.count_ss} 条，跳过 {preview.skipped} 行
                {preview.warning_count ? `，告警 ${preview.warning_count} 条` : ''}
              </p>
              {preview.warnings?.slice(0, 8).map((item, index) => (
                <div key={`${item.row}-${index}`} style={{ color: '#b45309', fontSize: 12 }}>
                  {item.sheet} 第{item.row}行 {item.material_no}：{item.message}
                </div>
              ))}
            </div>
          ) : null}
          <Space>
            <Button loading={previewing} onClick={() => void runPreview()}>
              重新预览
            </Button>
            <Button type="primary" loading={importing} disabled={!preview} onClick={() => void runImport()}>
              确认导入
            </Button>
          </Space>
        </Space>
      </Modal>
      <Drawer
        title={`${regionLabel} / ${groupLabel} 操作日志`}
        open={logOpen}
        onClose={() => setLogOpen(false)}
        width={860}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              placeholder="按物料号筛选"
              value={logMaterialNo}
              onChange={(e) => setLogMaterialNo(e.target.value)}
              style={{ width: 200 }}
            />
            <Button onClick={() => void loadLogs()}>查询</Button>
            <Button
              onClick={() => {
                setLogMaterialNo('')
                void loadLogs('')
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
                render: (value: string) => ACTION_LABELS[value] || value,
              },
              { title: '物料号', dataIndex: 'material_no', width: 140 },
              {
                title: '变更内容',
                dataIndex: 'change_summary',
                render: (value: string) => formatChangeSummary(value),
              },
            ]}
          />
        </Space>
      </Drawer>
      <Modal
        title="价格已变动，请填写调价信息"
        open={adjustOpen}
        onCancel={() => {
          setAdjustOpen(false)
          setPendingSaveRows(null)
        }}
        onOk={confirmAdjustSave}
        confirmLoading={saving}
        okText="确认保存"
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <LabeledField label="价格版本" required hint="必填，且必须与当前有效行的价格版本不同">
            <Input
              placeholder="例如 2026-08-16"
              value={adjustVersion}
              onChange={(e) => setAdjustVersion(e.target.value)}
            />
          </LabeledField>
          <LabeledField label="调价说明" required hint="必填，请写明本次调价原因，便于对账核查">
            <Input.TextArea
              rows={3}
              placeholder="例如：钢材涨价后调整最终报价"
              value={adjustRemark}
              onChange={(e) => setAdjustRemark(e.target.value)}
            />
          </LabeledField>
        </Space>
      </Modal>
    </div>
  )
}
