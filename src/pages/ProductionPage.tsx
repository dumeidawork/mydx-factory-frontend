import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Card, Checkbox, Collapse, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import styles from './WorkflowPages.module.css'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { confirmMaterialAlign, showAlignConfirmResult } from './PendingMaterialGapPanel'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import { usePageTitle } from '../layout/usePageTitle'
import { normalizeDrawingInput } from '../utils/specParser'
import DrawingArchivePanel from './DrawingArchivePanel'
import DrawingFlangeTypeMapPanel from './DrawingFlangeTypeMapPanel'
import PalletArchivePanel from './PalletArchivePanel'
import PriceSplitArchivePanel from './PriceSplitArchivePanel'
import {
  buildOrderedColumns,
  DraggableHeaderCell,
  type DraggableHeaderCellProps,
  usePersistedColumnOrder,
  withDraggableHeaderCells,
} from '../utils/draggableTableColumns'

type ConfirmRow = {
  id: number
  order_no?: string
  factory_order_no?: string
  status?: string
  material_no: string
  item_no?: number | null
  drawing_no?: string
  spec_model: string
  spec: string
  standard: string
  heat_no: string
  heat_treatment_batch_no: string
  quantity?: number
}

type MaterialRow = {
  key: string
  id?: number
  material_no: string
  part_no: string
  drawing_no: string
  standard_no: string
  spec_model: string
  spec: string
  model: string
  material: string
  unit_weight: number
  remark: string
  ut: string
  mt: string
  pt: string
  product_unit_price: number
  france_agreement_price: number
  dalian_agreement_price: number
  created_by: string
  created_at: string
  updated_by: string
  updated_at: string
}

type MaterialExportColumn = {
  key: keyof MaterialRow | 'id'
  title: string
}

const materialExportColumns: MaterialExportColumn[] = [
  { key: 'id', title: 'No.' },
  { key: 'material_no', title: '物料号' },
  { key: 'part_no', title: '料号' },
  { key: 'drawing_no', title: '图纸号' },
  { key: 'standard_no', title: '标准号' },
  { key: 'spec_model', title: '规格型号' },
  { key: 'spec', title: '规格' },
  { key: 'model', title: '型号' },
  { key: 'material', title: '材质' },
  { key: 'unit_weight', title: '单重' },
  { key: 'remark', title: '备注' },
  { key: 'ut', title: 'UT' },
  { key: 'mt', title: 'MT' },
  { key: 'pt', title: 'PT' },
  { key: 'product_unit_price', title: '产品单价' },
  { key: 'france_agreement_price', title: '法国协议价' },
  { key: 'dalian_agreement_price', title: '大连协议价' },
  { key: 'created_by', title: '建档人' },
  { key: 'created_at', title: '建档时间' },
  { key: 'updated_by', title: '更新者' },
  { key: 'updated_at', title: '更新时间' },
]

const materialPriceFields: (keyof MaterialRow)[] = ['product_unit_price', 'france_agreement_price', 'dalian_agreement_price']

const modeOptions = ['本厂钢材', '外来毛胚', '外来成品']

const customerOptions = [
  { value: 'Siemens S.A.S.', label: 'Siemens S.A.S.' },
  { value: 'Siemens Sensors＆Communication Ltd.', label: 'Siemens Sensors＆Communication Ltd.' },
]

const emptyMaterialRow = (index: number): MaterialRow => ({
  key: `new-${Date.now()}-${index}`,
  material_no: '',
  part_no: '',
  drawing_no: '',
  standard_no: '',
  spec_model: '',
  spec: '',
  model: '',
  material: '',
  unit_weight: 0,
  remark: '',
  ut: '',
  mt: '',
  pt: '',
  product_unit_price: 0,
  france_agreement_price: 0,
  dalian_agreement_price: 0,
  created_by: '',
  created_at: '',
  updated_by: '',
  updated_at: '',
})

const materialPasteFields: (keyof MaterialRow)[] = [
  'material_no',
  'part_no',
  'drawing_no',
  'standard_no',
  'spec_model',
  'spec',
  'model',
  'material',
  'unit_weight',
  'remark',
  'ut',
  'mt',
  'pt',
  'product_unit_price',
  'france_agreement_price',
  'dalian_agreement_price',
]
const materialPasteAliases: Record<string, keyof MaterialRow> = {
  物料号: 'material_no',
  料号: 'part_no',
  图纸号: 'drawing_no',
  标准号: 'standard_no',
  规格型号: 'spec_model',
  规格: 'spec',
  型号: 'model',
  材质: 'material',
  单重: 'unit_weight',
  备注: 'remark',
  UT: 'ut',
  MT: 'mt',
  PT: 'pt',
  产品单价: 'product_unit_price',
  法国协议价: 'france_agreement_price',
  大连协议价: 'dalian_agreement_price',
  material_no: 'material_no',
  part_no: 'part_no',
  drawing_no: 'drawing_no',
  standard_no: 'standard_no',
  spec_model: 'spec_model',
  spec: 'spec',
  model: 'model',
  material: 'material',
  unit_weight: 'unit_weight',
  remark: 'remark',
  ut: 'ut',
  mt: 'mt',
  pt: 'pt',
  product_unit_price: 'product_unit_price',
  france_agreement_price: 'france_agreement_price',
  dalian_agreement_price: 'dalian_agreement_price',
}

const productionItems = (rows: ConfirmRow[]) =>
  rows.map((r) => ({ id: r.id, material_no: r.material_no, item_no: r.item_no ?? null }))

type TypingSyncResult = {
  inserted_count?: number
  updated_count?: number
  error?: string | null
}

function showTypingSyncResult(data: { typing?: TypingSyncResult }) {
  const typing = data.typing
  if (!typing) return
  if (typing.error) {
    message.warning(`打字要求同步失败：${typing.error}`)
    return
  }
  const inserted = typing.inserted_count ?? 0
  const updated = typing.updated_count ?? 0
  if (!inserted && !updated) return
  message.success(`已自动生成打字要求（新增 ${inserted}，更新 ${updated}）`)
  notifyWorkbenchUnreadChanged()
}

const EXPERIMENT_ARCHIVING_COLUMN_ORDER_KEY = 'erp_experiment_archiving_column_order'
const EXPERIMENT_SCROLLABLE_COLUMN_DEFAULT_ORDER = [
  'drawing_no',
  'status',
  'spec_model',
  'spec',
  'standard',
  'quantity',
  'heat_no',
  'heat_treatment_batch_no',
]

function ExperimentalArchiving() {
  const [rows, setRows] = useState<ConfirmRow[]>([])
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([])
  const [highlightedRowId, setHighlightedRowId] = useState<number | null>(null)
  const [form] = Form.useForm()

  const buildLoadPayload = (mode?: string, orderNo?: string, materialNo?: string, customer?: string) => ({
    mode: String(mode ?? form.getFieldValue('mode') ?? '').trim(),
    order_no: String(orderNo ?? form.getFieldValue('order_no') ?? '').trim(),
    material_no: String(materialNo ?? form.getFieldValue('material_no') ?? '').trim(),
    customer: String(customer ?? form.getFieldValue('customer') ?? '').trim(),
  })

  const refreshRows = async (mode?: string, orderNo?: string, materialNo?: string) => {
    const payload = buildLoadPayload(mode, orderNo, materialNo)
    if (!payload.order_no && !payload.material_no) return
    const res = await fetch(apiUrl('/api/v1/workflow/production/load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.ok) {
      setRows(data.rows || [])
      setSelectedKeys([])
      setHighlightedRowId(null)
    }
  }

  const handleLoad = async () => {
    const orderNo = String(form.getFieldValue('order_no') || '').trim()
    const materialNo = String(form.getFieldValue('material_no') || '').trim()
    if (!orderNo && !materialNo) {
      message.warning('请至少输入订单号或物料号')
      return
    }
    const res = await fetch(apiUrl('/api/v1/workflow/production/load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildLoadPayload()),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '加载失败')
      return
    }
    setRows(data.rows || [])
    setSelectedKeys([])
    setHighlightedRowId(null)
    message.success(`加载成功，共${(data.rows || []).length}条`)
  }

  const handleExtractSpecs = async () => {
    const materialNos = rows
      .map((r) => r.material_no)
      .filter(Boolean)
    if (materialNos.length === 0) {
      message.warning('请先加载明细')
      return
    }
    const res = await fetch(apiUrl('/api/v1/workflow/production/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: form.getFieldValue('mode') || '',
        order_no: String(form.getFieldValue('order_no') || '').trim(),
        material_nos: materialNos,
        items: productionItems(rows),
        heat_no: '',
        heat_treatment_batch_no: '',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '智能提取失败')
      return
    }
    const changed = data.rows_for_confirm || []
    setRows((prev) =>
      prev.map((r) => {
        const hit = changed.find((x: ConfirmRow) => x.id === r.id)
        return hit ? { ...r, spec: hit.spec, standard: hit.standard } : r
      })
    )
    message.success(`提取完成，处理${changed.length}条`)
  }

  const handleBatchApply = async () => {
    const selectedIds = new Set(selectedKeys.map((key) => Number(key)))
    if (selectedIds.size === 0) {
      message.warning('请先勾选要批量应用的物料')
      return
    }
    const heatNo = String(form.getFieldValue('heat_no') || '').trim()
    const batchNo = String(form.getFieldValue('heat_treatment_batch_no') || '').trim()
    if (!heatNo && !batchNo) {
      message.warning('炉号和热处理批号均为空，无需批量应用')
      return
    }
    const selected = rows.filter((r) => selectedIds.has(r.id))
    const res = await authFetch(apiUrl('/api/v1/workflow/production/batch-apply'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: String(form.getFieldValue('order_no') || '').trim(),
        items: productionItems(selected),
        heat_no: heatNo,
        heat_treatment_batch_no: batchNo,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '批量应用失败')
      return
    }
    await refreshRows()
    setSelectedKeys([])
    message.success(`批量应用成功，更新${data.updated_count}条`)
    showTypingSyncResult(data)
  }

  const submitConfirmRows = async (selected: ConfirmRow[]) => {
    const res = await authFetch(apiUrl('/api/v1/workflow/production/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: String(form.getFieldValue('order_no') || '').trim(),
        rows: selected,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '建档确认失败')
      return
    }
    await refreshRows()
    setSelectedKeys([])
    const noticeSuffix =
      data.typing?.error
        ? `；打字要求同步失败：${data.typing.error}`
        : (Number(data.typing?.inserted_count || 0) || Number(data.typing?.updated_count || 0))
          ? `；已自动生成打字要求（新增 ${data.typing?.inserted_count ?? 0}，更新 ${data.typing?.updated_count ?? 0}）`
          : ''
    message.success(`建档成功，已转加工${data.updated_count}条${noticeSuffix}`)
    if (!data.typing?.error && (Number(data.typing?.inserted_count || 0) || Number(data.typing?.updated_count || 0))) {
      notifyWorkbenchUnreadChanged()
    }
  }

  const handleSaveRow = async (record: ConfirmRow) => {
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/detail/update'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: record.id,
        patch: {
          spec: record.spec,
          standard: record.standard,
          heat_no: record.heat_no,
          heat_treatment_batch_no: record.heat_treatment_batch_no,
          quantity: Number(record.quantity ?? 0),
        },
        confirm_summary: '实验建档单行保存',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      Modal.error({ title: '保存失败', content: data.detail || '未知错误' })
      return
    }
    Modal.success({ title: '保存成功' })
    showTypingSyncResult(data)
    if (data.row) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? {
                ...r,
                spec: data.row.spec ?? r.spec,
                standard: data.row.standard ?? r.standard,
                heat_no: data.row.heat_no ?? r.heat_no,
                heat_treatment_batch_no: data.row.heat_treatment_batch_no ?? r.heat_treatment_batch_no,
                quantity: Number(data.row.quantity ?? r.quantity ?? 0),
              }
            : r
        )
      )
    }
  }

  const handleConfirm = async () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.id))
    if (!selected.length) {
      message.warning('请勾选要确认建档的行')
      return
    }
    const missingLabels = Array.from(
      new Set(
        selected.flatMap((r) => [
          ...(!r.spec ? ['规格'] : []),
          ...(!r.standard ? ['标准'] : []),
          ...(!r.heat_no ? ['炉号'] : []),
          ...(!r.heat_treatment_batch_no ? ['热处理批号'] : []),
        ])
      )
    )
    if (missingLabels.length > 0) {
      Modal.confirm({
        title: '确认建档',
        content: `${missingLabels.join('、')}存在空值，是否确认建档？`,
        onOk: () => submitConfirmRows(selected),
      })
      return
    }
    await submitConfirmRows(selected)
  }

  const handleCopyRow = async (record: ConfirmRow) => {
    const res = await authFetch(apiUrl('/api/v1/workflow/orders/detail/append'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        based_on_id: record.id,
        row: {
          spec: record.spec,
          standard: record.standard,
          heat_no: record.heat_no,
          heat_treatment_batch_no: record.heat_treatment_batch_no,
        },
        confirm_summary: '实验建档复制',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '复制失败')
      return
    }
    const newRow = data.row as ConfirmRow | undefined
    if (!newRow?.id) {
      message.error('复制成功但未返回新行数据')
      return
    }
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id)
      const next = [...prev]
      const inserted: ConfirmRow = {
        ...newRow,
        quantity: Number(newRow.quantity ?? record.quantity ?? 0),
      }
      if (idx < 0) {
        next.push(inserted)
      } else {
        next.splice(idx + 1, 0, inserted)
      }
      return next
    })
    setHighlightedRowId(Number(newRow.id))
    message.success(`已复制一行，新 ID：${newRow.id}`)
    showTypingSyncResult(data)
  }

  const handleDeleteRow = async (record: ConfirmRow) => {
    let hasPackingAssociation = false
    const checkRes = await authFetch(apiUrl(`/api/v1/workflow/orders/detail/${record.id}/delete-check`))
    if (checkRes.ok) {
      const checkData = await checkRes.json()
      hasPackingAssociation = !!checkData.has_packing_association
    }
    Modal.confirm({
      title: hasPackingAssociation ? '警告' : '确认删除',
      content: hasPackingAssociation
        ? `该明细（订单号 ${record.order_no || form.getFieldValue('order_no') || '—'}、物料号 ${record.material_no}、条目 ${record.item_no ?? '空'}）已关联装箱数据，删除后将同步清除对应装箱记录。是否仍要删除 id 为 ${record.id} 的记录？`
        : `确定删除 order_details 表中 id 为 ${record.id} 的记录吗？`,
      okText: '确认删除',
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/workflow/orders/detail/${record.id}`), { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) {
          message.error(typeof data.detail === 'string' ? data.detail : data.detail || '删除失败')
          return
        }
        message.success(data.message || `已删除 id 为 ${record.id} 的 1 条数据`)
        await refreshRows()
      },
    })
  }

  const handleInbound = async () => {
    const selected = rows.filter((r) => selectedKeys.includes(r.id))
    if (!selected.length) {
      message.warning('请先勾选要入库的物料')
      return
    }
    const invalid = selected.find((r) => r.status !== '加工')
    if (invalid) {
      message.error(`物料号${invalid.material_no}不是加工状态，无法入库`)
      return
    }
    const res = await fetch(apiUrl('/api/v1/workflow/production/inbound'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: String(form.getFieldValue('order_no') || '').trim(),
        row_ids: selected.map((r) => r.id),
        items: productionItems(selected),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '转入入库失败')
      return
    }
    await refreshRows()
    setSelectedKeys([])
    message.success(`入库成功，更新${data.updated_count}条`)
  }

  const [columnOrder, , reorderColumns] = usePersistedColumnOrder(
    EXPERIMENT_ARCHIVING_COLUMN_ORDER_KEY,
    EXPERIMENT_SCROLLABLE_COLUMN_DEFAULT_ORDER
  )

  const fixedLeftColumns: ColumnsType<ConfirmRow> = useMemo(
    () => [
      { title: 'ID', key: 'id', dataIndex: 'id', fixed: 'left' as const, width: 80 },
      {
        title: '订单号',
        key: 'order_no',
        dataIndex: 'order_no',
        fixed: 'left' as const,
        width: 160,
        render: (v?: string) => v || '-',
      },
      {
        title: '本厂单号',
        key: 'factory_order_no',
        dataIndex: 'factory_order_no',
        fixed: 'left' as const,
        width: 160,
        render: (v?: string) => v || '-',
      },
      { title: '物料号', key: 'material_no', dataIndex: 'material_no', fixed: 'left' as const, width: 180 },
      {
        title: '条目',
        key: 'item_no',
        dataIndex: 'item_no',
        fixed: 'left' as const,
        width: 90,
        render: (v?: number | null) => v ?? '-',
      },
    ],
    []
  )

  const scrollableColumnDefs: ColumnsType<ConfirmRow> = useMemo(
    () => [
      { title: '图纸号', key: 'drawing_no', dataIndex: 'drawing_no', width: 180, render: (v?: string) => v || '-' },
      {
        title: '状态',
        key: 'status',
        dataIndex: 'status',
        width: 110,
        render: (v?: string) => <Tag color={v === '加工' ? 'orange' : 'blue'}>{v || '-'}</Tag>,
      },
      { title: '规格型号', key: 'spec_model', dataIndex: 'spec_model', width: 220 },
      {
        title: '规格',
        key: 'spec',
        dataIndex: 'spec',
        width: 160,
        render: (v: string, record: ConfirmRow) => (
          <Input value={v} onChange={(e) => setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, spec: e.target.value } : r)))} />
        ),
      },
      {
        title: '标准',
        key: 'standard',
        dataIndex: 'standard',
        width: 160,
        render: (v: string, record: ConfirmRow) => (
          <Input
            value={v}
            onChange={(e) => setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, standard: e.target.value } : r)))}
          />
        ),
      },
      {
        title: '数量',
        key: 'quantity',
        dataIndex: 'quantity',
        width: 100,
        render: (v: number | undefined, record: ConfirmRow) => (
          <InputNumber
            min={0}
            precision={0}
            value={v ?? 0}
            style={{ width: '100%' }}
            onChange={(next) =>
              setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, quantity: Number(next ?? 0) } : r)))
            }
          />
        ),
      },
      {
        title: '炉号',
        key: 'heat_no',
        dataIndex: 'heat_no',
        width: 180,
        render: (v: string, record: ConfirmRow) => (
          <Input
            value={v}
            onChange={(e) => setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, heat_no: e.target.value } : r)))}
          />
        ),
      },
      {
        title: '热处理批号',
        key: 'heat_treatment_batch_no',
        dataIndex: 'heat_treatment_batch_no',
        width: 200,
        render: (v: string, record: ConfirmRow) => (
          <Input
            value={v}
            onChange={(e) =>
              setRows((prev) => prev.map((r) => (r.id === record.id ? { ...r, heat_treatment_batch_no: e.target.value } : r)))
            }
          />
        ),
      },
    ],
    []
  )

  const fixedRightColumns: ColumnsType<ConfirmRow> = useMemo(
    () => [
      {
        title: '操作',
        key: 'actions',
        fixed: 'right' as const,
        width: 200,
        render: (_: unknown, record: ConfirmRow) => (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => void handleSaveRow(record)}>
              保存
            </Button>
            <Button type="link" size="small" onClick={() => handleCopyRow(record)}>
              复制
            </Button>
            <Button type="link" size="small" danger onClick={() => handleDeleteRow(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    []
  )

  const columns = useMemo(
    () =>
      withDraggableHeaderCells(
        buildOrderedColumns(fixedLeftColumns, scrollableColumnDefs, fixedRightColumns, columnOrder),
        EXPERIMENT_SCROLLABLE_COLUMN_DEFAULT_ORDER,
        reorderColumns
      ),
    [columnOrder, fixedLeftColumns, scrollableColumnDefs, fixedRightColumns, reorderColumns]
  )

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
                      <li>至少填订单号或物料号，可选客户、生产模式，点「加载明细」。</li>
                      <li>点「智能提取规格/标准」，从规格型号拆出规格、标准，写入表格，可手改。</li>
                      <li>在步骤 2 填炉号、热处理批号，勾选行后点「批量应用」。</li>
                      <li>
                        表格内可改规格、标准、数量、炉号、热处理批号；改完点行内「保存」。拆行用「复制」，误行用「删除」。
                      </li>
                      <li>勾选核对无误的行，点「确认建档并转加工」，这些行状态变为「加工」。</li>
                      <li>状态已是「加工」的行，勾选后点「入库」。</li>
                    </ol>
                  </div>
                  <div className={styles.opGuideBlock}>
                    <div className={styles.opGuideLabel}>注意事项</div>
                    <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                      <li>定位一行用订单号 + 物料号 + 条目。</li>
                      <li>规格、标准、炉号、热处理批号允许为空；确认建档时若有空值会二次确认，不硬拦。</li>
                      <li>「确认建档并转加工」和「入库」只处理勾选行。</li>
                      <li>
                        单行保存、批量应用炉号/热处理批号、复制明细，以及「确认建档并转加工」时，若数量/炉号/热处理批号有填入或变动且与打字要求未对齐，会自动生成或更新对应打字要求（一条订单明细对应一条，手工改过的字段会保留）。该明细的上传者和更新者会在工作台收到提醒，确认后可跳转查看。
                      </li>
                      <li>入库必须是「加工」状态。</li>
                      <li>删除已关联装箱数据的明细会同步清除对应装箱记录。</li>
                      <li>移动端建议横屏查看表格。</li>
                    </ul>
                  </div>
                </div>
              ),
            },
          ]}
        />
        <Form form={form} layout="vertical" className={styles.stackForm}>
          <Card size="small" title={<Tag color="blue">步骤1：加载待处理订单</Tag>} className={styles.sectionCard}>
            <div className={styles.stack}>
              <Form.Item name="order_no" label="订单号">
                <Input className={styles.fieldMedium} />
              </Form.Item>
              <Form.Item name="material_no" label="物料号">
                <Input className={styles.fieldMedium} />
              </Form.Item>
              <Form.Item name="customer" label="客户">
                <Select
                  allowClear
                  className={styles.fieldMedium}
                  style={{ width: 320, maxWidth: '100%' }}
                  options={customerOptions}
                />
              </Form.Item>
              <Form.Item name="mode" label="生产模式">
                <Select
                  allowClear
                  className={styles.fieldMedium}
                  style={{ width: 320, maxWidth: '100%' }}
                  options={modeOptions.map((v) => ({ value: v }))}
                />
              </Form.Item>
              <div className={styles.actions}>
                <Button type="primary" onClick={handleLoad}>
                  加载明细
                </Button>
              </div>
            </div>
          </Card>

          <Card size="small" title={<Tag color="blue">步骤2：智能提取与批量分配</Tag>} className={styles.sectionCard}>
            <div className={styles.stack}>
              <div className={styles.actions}>
                <Button type="primary" onClick={handleExtractSpecs}>
                  智能提取规格/标准
                </Button>
              </div>
              <Form.Item name="heat_no" label="炉号（批量应用）">
                <Input className={styles.fieldMedium} />
              </Form.Item>
              <Form.Item name="heat_treatment_batch_no" label="热处理批号（批量应用）">
                <Input className={styles.fieldMedium} />
              </Form.Item>
              <div className={styles.actions}>
                <Button type="primary" onClick={handleBatchApply}>
                  批量应用
                </Button>
              </div>
            </div>
          </Card>
        </Form>

        <Card size="small" title={<Tag color="blue">步骤3：人工微调与流转</Tag>} className={styles.sectionCard}>
          <div className={styles.actions} style={{ marginBottom: 10 }}>
            <Tag color="cyan">总件数：{rows.length}</Tag>
            <Button onClick={() => setSelectedKeys(rows.map((r) => r.id))}>全选</Button>
            <Button onClick={() => setSelectedKeys([])}>清空</Button>
            <Button type="primary" onClick={handleConfirm}>
              确认建档并转加工
            </Button>
            <Button type="primary" onClick={handleInbound}>
              入库
            </Button>
          </div>
          <Table
            className={styles.experimentArchivingTable}
            rowKey="id"
            columns={columns}
            dataSource={rows}
            scroll={{ x: 2140 }}
            components={{
              header: {
                cell: (props: DraggableHeaderCellProps) => (
                  <DraggableHeaderCell
                    {...props}
                    dragHandleClassName={styles.experimentColumnDragHandle}
                    dropTargetClassName={styles.experimentColumnDropTarget}
                  />
                ),
              },
            }}
            rowClassName={(record) => (record.id === highlightedRowId ? styles.experimentCopiedRow : '')}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: (keys) => setSelectedKeys(keys as (string | number)[]),
            }}
          />
          <div className={styles.mobileTableHint}>移动端建议横屏查看表格字段。</div>
        </Card>
    </div>
  )
}

type MaterialApiRow = Omit<MaterialRow, 'key'> & { id: number }

const materialRowFromApi = (row: MaterialApiRow): MaterialRow => ({
  ...row,
  key: String(row.id),
  standard_no: row.standard_no || '',
  spec: row.spec || '',
  model: row.model || '',
  unit_weight: Number(row.unit_weight || 0),
  ut: row.ut || '',
  mt: row.mt || '',
  pt: row.pt || '',
  product_unit_price: Number(row.product_unit_price || 0),
  france_agreement_price: Number(row.france_agreement_price || 0),
  dalian_agreement_price: Number(row.dalian_agreement_price || 0),
})

const parseMaterialPasteRows = (text: string, startIndex: number): MaterialRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
  if (!lines.length) return []
  const firstCells = lines[0].split('\t').map((cell) => cell.trim())
  const headerFields = firstCells.map((cell) => materialPasteAliases[cell])
  const hasHeader = headerFields.some(Boolean)
  const fields = hasHeader ? headerFields : materialPasteFields
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line, index) => {
    const row = emptyMaterialRow(startIndex + index)
    line.split('\t').forEach((cell, cellIndex) => {
      const field = fields[cellIndex]
      if (!field || field === 'key' || field === 'id') return
      if (field === 'unit_weight') {
        row.unit_weight = Number(cell || 0)
      } else if (field === 'product_unit_price' || field === 'france_agreement_price' || field === 'dalian_agreement_price') {
        row[field] = Number(cell || 0)
      } else if (field === 'drawing_no') {
        row.drawing_no = normalizeDrawingInput(cell)
      } else {
        row[field] = cell as never
      }
    })
    return row
  })
}

function MaterialArchiving() {
  const [rows, setRows] = useState<MaterialRow[]>([])
  const [queryMaterialNo, setQueryMaterialNo] = useState('')
  const [queryDrawingNo, setQueryDrawingNo] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [submitStatus, setSubmitStatus] = useState('')
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set())
  const [isXlsxLoaded, setIsXlsxLoaded] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportColumnKeys, setExportColumnKeys] = useState<string[]>(
    materialExportColumns.map((col) => col.key)
  )
  const [aligning, setAligning] = useState(false)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
    script.onload = () => setIsXlsxLoaded(true)
    document.body.appendChild(script)
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [])

  const buildMaterialsQuery = (materialNo = queryMaterialNo, drawingNo = queryDrawingNo) => {
    const params = new URLSearchParams()
    if (materialNo.trim()) params.set('material_no', materialNo.trim())
    if (drawingNo.trim()) params.set('drawing_no', drawingNo.trim())
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }

  const loadMaterials = async (materialNo = queryMaterialNo, drawingNo = queryDrawingNo) => {
    const res = await fetch(apiUrl(`/api/v1/workflow/materials${buildMaterialsQuery(materialNo, drawingNo)}`))
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '物料加载失败')
      return
    }
    setRows((data.rows || []).map((row: MaterialApiRow) => materialRowFromApi(row)))
    setEditingKeys(new Set())
  }

  useEffect(() => {
    void loadMaterials('', '')
  }, [])

  const updateMaterialRow = <K extends keyof MaterialRow>(key: string, field: K, value: MaterialRow[K]) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  const handleConfirmAlign = async () => {
    setAligning(true)
    try {
      const data = await confirmMaterialAlign()
      showAlignConfirmResult(data)
      notifyWorkbenchUnreadChanged()
      await loadMaterials()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '对齐失败')
    } finally {
      setAligning(false)
    }
  }

  const handleApplyPaste = () => {
    const pastedRows = parseMaterialPasteRows(pasteText, rows.length)
    if (!pastedRows.length) {
      message.warning('没有可应用的粘贴数据')
      return
    }
    setRows((prev) => [...prev, ...pastedRows])
    setEditingKeys((prev) => new Set([...prev, ...pastedRows.map((row) => row.key)]))
    setPasteText('')
    message.success(`已追加${pastedRows.length}条粘贴数据`)
  }

  const saveMaterialRows = async (payloadRows: MaterialRow[]) => {
    const validRows = payloadRows.filter((row) => row.material_no.trim())
    if (!validRows.length) {
      message.warning('请至少录入一条物料号')
      return false
    }
    const res = await fetch(apiUrl('/api/v1/workflow/materials/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: validRows.map((row) => ({ ...row, drawing_no: normalizeDrawingInput(row.drawing_no) })),
        updated_by: 'system',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      const detail = data.detail || '未知错误'
      message.error(detail)
      setSubmitStatus(`保存失败（${detail}）`)
      return false
    }
    const inserted = data.inserted_count ?? 0
    const updated = data.updated_count ?? 0
    const saved = data.saved_count ?? validRows.length
    Modal.success({
      title: '保存成功',
      content: `已保存 ${saved} 条（新增 ${inserted} 条，更新 ${updated} 条）`,
    })
    setSubmitStatus(`保存成功（${saved}条）`)
    const savedKeys = new Set(validRows.map((row) => row.key))
    setEditingKeys((prev) => {
      const next = new Set(prev)
      savedKeys.forEach((key) => next.delete(key))
      return next
    })
    await loadMaterials()
    return true
  }

  const handleSaveRow = async (record: MaterialRow) => {
    setSubmitStatus('保存中...')
    await saveMaterialRows([record])
  }

  const handleSaveAll = async () => {
    const payloadRows =
      editingKeys.size > 0 ? rows.filter((row) => editingKeys.has(row.key) && row.material_no.trim()) : rows.filter((row) => row.material_no.trim())
    if (!payloadRows.length) {
      message.warning(editingKeys.size > 0 ? '没有处于编辑中的物料行' : '请至少录入一条物料号')
      return
    }
    setSubmitStatus('保存中...')
    await saveMaterialRows(payloadRows)
  }

  const handleDelete = (record: MaterialRow) => {
    Modal.confirm({
      title: '删除物料',
      content: record.id ? `确认删除物料号 ${record.material_no}？` : '确认删除这条未提交的物料？',
      onOk: async () => {
        if (!record.id) {
          setRows((prev) => prev.filter((row) => row.key !== record.key))
          setEditingKeys((prev) => {
            const next = new Set(prev)
            next.delete(record.key)
            return next
          })
          Modal.success({ title: '删除成功', content: '已删除 1 条（未提交行）' })
          return
        }
        const res = await fetch(apiUrl(`/api/v1/workflow/materials/${record.id}`), { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) {
          message.error(data.detail || '删除失败')
          return
        }
        Modal.success({ title: '删除成功', content: '已删除 1 条' })
        await loadMaterials()
      },
    })
  }

  const formatExportCell = (record: MaterialRow, colKey: MaterialExportColumn['key']) => {
    if (colKey === 'id') return record.id ?? ''
    const value = record[colKey as keyof MaterialRow]
    if (colKey === 'unit_weight') return Number(value || 0).toFixed(3)
    if (materialPriceFields.includes(colKey as keyof MaterialRow)) return Number(value || 0).toFixed(2)
    return value ?? ''
  }

  const handleExportExcel = () => {
    if (!rows.length) {
      message.warning('当前没有可导出的物料数据')
      return
    }
    if (!isXlsxLoaded) {
      message.warning('Excel 引擎加载中，请稍后再试')
      return
    }
    const selectedCols = materialExportColumns.filter((col) => exportColumnKeys.includes(col.key))
    if (!selectedCols.length) {
      message.warning('请至少选择一列导出')
      return
    }
    const XLSX = (window as { XLSX?: { utils: { book_new: () => unknown; aoa_to_sheet: (d: unknown[][]) => unknown; book_append_sheet: (wb: unknown, ws: unknown, name: string) => void }; write: (wb: unknown, opts: { bookType: string; type: string }) => ArrayBuffer } }).XLSX
    if (!XLSX) {
      message.error('Excel 引擎未就绪')
      return
    }
    const header = selectedCols.map((col) => col.title)
    const body = rows.map((record) => selectedCols.map((col) => formatExportCell(record, col.key)))
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '物料一览')
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const fileName = `物料一览表_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    setExportModalOpen(false)
    message.success(`已导出 ${rows.length} 条`)
  }

  const handleAppendRow = () => {
    const nextRow = emptyMaterialRow(rows.length)
    setRows((prev) => [...prev, nextRow])
    setEditingKeys((prev) => new Set(prev).add(nextRow.key))
  }

  const renderReadonlyOrInput = (record: MaterialRow, value: string, field: keyof MaterialRow, width?: number) => {
    if (!editingKeys.has(record.key)) return value || '-'
    return (
      <Input
        value={value}
        style={width ? { width } : undefined}
        placeholder={field === 'drawing_no' ? 'A5E02970605A Rev017 或 A5E02970605A-017' : undefined}
        onChange={(e) => updateMaterialRow(record.key, field, e.target.value)}
        onBlur={
          field === 'drawing_no'
            ? (e) => updateMaterialRow(record.key, field, normalizeDrawingInput(e.target.value))
            : undefined
        }
      />
    )
  }

  const materialColumns = [
    { title: 'No.', dataIndex: 'id', fixed: 'left' as const, width: 80, render: (value: number | undefined, _record: MaterialRow, index: number) => value || index + 1 },
    {
      title: '物料号',
      dataIndex: 'material_no',
      width: 160,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'material_no'),
    },
    {
      title: '料号',
      dataIndex: 'part_no',
      width: 150,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'part_no'),
    },
    {
      title: '图纸号',
      dataIndex: 'drawing_no',
      width: 200,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'drawing_no'),
    },
    {
      title: '标准号',
      dataIndex: 'standard_no',
      width: 140,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'standard_no'),
    },
    {
      title: '规格型号',
      dataIndex: 'spec_model',
      width: 220,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'spec_model'),
    },
    {
      title: '规格',
      dataIndex: 'spec',
      width: 100,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'spec'),
    },
    {
      title: '型号',
      dataIndex: 'model',
      width: 100,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'model'),
    },
    {
      title: '材质',
      dataIndex: 'material',
      width: 120,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'material'),
    },
    {
      title: '单重',
      dataIndex: 'unit_weight',
      width: 120,
      render: (value: number, record: MaterialRow) =>
        editingKeys.has(record.key) ? (
          <InputNumber min={0} precision={3} value={value} onChange={(next) => updateMaterialRow(record.key, 'unit_weight', Number(next || 0))} />
        ) : (
          Number(value || 0).toFixed(3)
        ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 180,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'remark'),
    },
    {
      title: 'UT',
      dataIndex: 'ut',
      width: 80,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'ut', 72),
    },
    {
      title: 'MT',
      dataIndex: 'mt',
      width: 80,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'mt', 72),
    },
    {
      title: 'PT',
      dataIndex: 'pt',
      width: 80,
      render: (value: string, record: MaterialRow) => renderReadonlyOrInput(record, value, 'pt', 72),
    },
    {
      title: '产品单价',
      dataIndex: 'product_unit_price',
      width: 110,
      render: (value: number, record: MaterialRow) =>
        editingKeys.has(record.key) ? (
          <InputNumber min={0} precision={2} value={value} onChange={(next) => updateMaterialRow(record.key, 'product_unit_price', Number(next || 0))} />
        ) : (
          Number(value || 0).toFixed(2)
        ),
    },
    {
      title: '法国协议价',
      dataIndex: 'france_agreement_price',
      width: 110,
      render: (value: number, record: MaterialRow) =>
        editingKeys.has(record.key) ? (
          <InputNumber min={0} precision={2} value={value} onChange={(next) => updateMaterialRow(record.key, 'france_agreement_price', Number(next || 0))} />
        ) : (
          Number(value || 0).toFixed(2)
        ),
    },
    {
      title: '大连协议价',
      dataIndex: 'dalian_agreement_price',
      width: 110,
      render: (value: number, record: MaterialRow) =>
        editingKeys.has(record.key) ? (
          <InputNumber min={0} precision={2} value={value} onChange={(next) => updateMaterialRow(record.key, 'dalian_agreement_price', Number(next || 0))} />
        ) : (
          Number(value || 0).toFixed(2)
        ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 260,
      render: (_: unknown, record: MaterialRow) => (
        <Space wrap>
          <Button size="small" type="primary" onClick={() => void handleSaveRow(record)}>
            保存
          </Button>
          <Button
            size="small"
            onClick={() =>
              setRows((prev) => {
                const nextKey = `copy-${Date.now()}`
                setEditingKeys((keys) => new Set(keys).add(nextKey))
                return [
                  ...prev,
                  {
                    ...record,
                    id: undefined,
                    key: nextKey,
                    created_by: '',
                    created_at: '',
                    updated_by: '',
                    updated_at: '',
                  },
                ]
              })
            }
          >
            复制
          </Button>
          <Button size="small" onClick={() => setEditingKeys((prev) => new Set(prev).add(record.key))}>
            修改
          </Button>
          <Button size="small" danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className={styles.stack}>
      <Card size="small" title={<Tag color="blue">物料查询与批量录入</Tag>} className={styles.sectionCard}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Button
              type="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
              onClick={() => {
                setQueryMaterialNo('')
                setQueryDrawingNo('')
                void loadMaterials('', '')
              }}
            >
              显示全部物料信息
            </Button>
            <Button
              style={{ background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 600 }}
              onClick={() => {
                setExportColumnKeys(materialExportColumns.map((col) => col.key))
                setExportModalOpen(true)
              }}
            >
              导出物料一览表
            </Button>
          </Space>
          <Space wrap>
            <Input
              placeholder="输入物料号查询"
              value={queryMaterialNo}
              onChange={(e) => setQueryMaterialNo(e.target.value)}
              style={{ width: 220 }}
            />
            <Input
              placeholder="A5E02970605A Rev017 或 A5E02970605A-017"
              value={queryDrawingNo}
              onChange={(e) => setQueryDrawingNo(e.target.value)}
              style={{ width: 220 }}
            />
            <Button type="primary" onClick={() => void loadMaterials()}>
              查询
            </Button>
          </Space>
          <Input.TextArea
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="可粘贴Excel数据，支持表头：物料号、料号、图纸号、规格型号、材质、单重、备注、UT、MT、PT、产品单价、法国协议价、大连协议价"
          />
          <Space>
            <Button onClick={handleApplyPaste}>应用粘贴</Button>
            <Button onClick={() => setPasteText('')}>清空粘贴</Button>
            <Button onClick={handleAppendRow}>追加行</Button>
          </Space>
        </Space>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <Tag color="blue">物料表</Tag>
            <Button type="primary" onClick={() => void handleSaveAll()}>
              保存全部
            </Button>
            <Button type="primary" loading={aligning} onClick={() => void handleConfirmAlign()}>
              确认对齐
            </Button>
            {submitStatus ? (
              <Tag color={submitStatus.startsWith('保存失败') ? 'red' : submitStatus === '保存中...' ? 'blue' : 'green'}>{submitStatus}</Tag>
            ) : null}
          </Space>
        }
        className={styles.sectionCard}
      >
        <Table rowKey="key" columns={materialColumns} dataSource={rows} scroll={{ x: 2200 }} />
      </Card>
      <Modal
        title="选择导出列"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={handleExportExcel}
        okText="导出 Excel"
        cancelText="取消"
      >
        <Checkbox.Group
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          value={exportColumnKeys}
          onChange={(vals) => setExportColumnKeys(vals as string[])}
        >
          {materialExportColumns.map((col) => (
            <Checkbox key={col.key} value={col.key}>
              {col.title}
            </Checkbox>
          ))}
        </Checkbox.Group>
        <div style={{ marginTop: 12 }}>
          <Button size="small" onClick={() => setExportColumnKeys(materialExportColumns.map((col) => col.key))}>
            全选
          </Button>
          <Button size="small" style={{ marginLeft: 8 }} onClick={() => setExportColumnKeys([])}>
            清空
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default function ProductionPage() {
  const { pathname } = useLocation()
  const pageTitle = usePageTitle()
  let content = <ExperimentalArchiving />
  if (pathname.endsWith('/materials')) {
    content = <MaterialArchiving />
  } else if (pathname.endsWith('/drawings')) {
    content = <DrawingArchivePanel />
  } else if (pathname.endsWith('/drawing-flange-types')) {
    content = <DrawingFlangeTypeMapPanel />
  } else if (pathname.endsWith('/price-split')) {
    content = <PriceSplitArchivePanel />
  } else if (pathname.endsWith('/pallets')) {
    content = <PalletArchivePanel />
  }

  return (
    <Card title={pageTitle} className={styles.pageCard}>
      {content}
    </Card>
  )
}
