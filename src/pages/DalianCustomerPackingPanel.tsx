import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Checkbox, DatePicker, Drawer, Modal, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'

type PackingRow = {
  id: number
  order_no: string
  factory_order_no: string
  item_no: number | null
  part_no: string
  material_no: string
  drawing_no: string
  spec_model: string
  material: string
  heat_no: string
  heat_treatment_batch_no: string
  unit_weight: number
  planned_qty: number
  total_weight: number
  remark: string
  booker_name: string
  booked_at: string
  assignee_name: string
  status: string
  planned_arrival_date: string
}

type PackingView = {
  planned_arrival_date: string
  assignee_name: string
  packing_generated_by: string
  packing_generated_by_user_id: number | null
  packing_generated_at: string
  packing_content_stale: boolean
  has_changes: boolean
  can_generate: boolean
  can_start_packing: boolean
  rows: PackingRow[]
}

type LogRow = {
  id: number
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'planned_arrival_date', label: '预定到货日期' },
  { key: 'order_no', label: '订单号' },
  { key: 'factory_order_no', label: '本厂单号' },
  { key: 'item_no', label: '条目' },
  { key: 'part_no', label: '料号' },
  { key: 'material_no', label: '物料号' },
  { key: 'drawing_no', label: '图纸号' },
  { key: 'spec_model', label: '规格型号' },
  { key: 'material', label: '材质' },
  { key: 'heat_no', label: '炉号' },
  { key: 'heat_treatment_batch_no', label: '热处理号' },
  { key: 'unit_weight', label: '单重' },
  { key: 'planned_qty', label: '预定到货数量' },
  { key: 'total_weight', label: '总重' },
  { key: 'remark', label: '备注' },
  { key: 'booker_name', label: '预定者' },
  { key: 'booked_at', label: '预定时间' },
  { key: 'assignee_name', label: '对接人员' },
  { key: 'status', label: '进度' },
]

const ACTION_LABELS: Record<string, string> = {
  create: '录入',
  update: '修改',
  delete: '删除',
  assign: '指定对接',
  reassign: '改派对接',
  generate: '生成箱单',
  regenerate: '重新生成箱单',
  export: '导出箱单',
  start_packing: '开始自动装箱',
}

const STATUS_COLOR: Record<string, string> = {
  已预定: 'default',
  已指定对接: 'blue',
  存在变更内容: 'orange',
  开始装箱: 'processing',
  已装箱: 'cyan',
  已发货: 'green',
}

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'string' ? item : (item as { msg?: string }).msg || JSON.stringify(item)))
      .join('; ')
  }
  return '请求失败'
}

const LINE_COLUMNS: ColumnsType<PackingRow> = [
  { title: '订单号', dataIndex: 'order_no', width: 130 },
  { title: '本厂单号', dataIndex: 'factory_order_no', width: 120 },
  { title: '条目', dataIndex: 'item_no', width: 70, render: (value: number | null) => value ?? '' },
  { title: '料号', dataIndex: 'part_no', width: 120 },
  { title: '物料号', dataIndex: 'material_no', width: 150 },
  { title: '图纸号', dataIndex: 'drawing_no', width: 140 },
  { title: '规格型号', dataIndex: 'spec_model', width: 140 },
  { title: '材质', dataIndex: 'material', width: 80 },
  { title: '炉号', dataIndex: 'heat_no', width: 120 },
  { title: '热处理号', dataIndex: 'heat_treatment_batch_no', width: 140 },
  { title: '单重', dataIndex: 'unit_weight', width: 80 },
  { title: '预定数量', dataIndex: 'planned_qty', width: 90 },
  { title: '总重', dataIndex: 'total_weight', width: 90 },
  { title: '备注', dataIndex: 'remark', width: 140 },
  { title: '预定者', dataIndex: 'booker_name', width: 90 },
  { title: '预定时间', dataIndex: 'booked_at', width: 160 },
  { title: '对接人员', dataIndex: 'assignee_name', width: 100 },
  {
    title: '进度',
    dataIndex: 'status',
    width: 120,
    render: (value: string) => <Tag color={STATUS_COLOR[value] || 'default'}>{value || '—'}</Tag>,
  },
]

export default function DalianCustomerPackingPanel() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateText = searchParams.get('date') || ''
  const [view, setView] = useState<PackingView | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportKeys, setExportKeys] = useState<string[]>(EXPORT_COLUMNS.map((item) => item.key))
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const load = useCallback(async (day: string) => {
    if (!day) {
      setView(null)
      return
    }
    setLoading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/partners/dalian-siemens/packing-list?planned_arrival_date=${encodeURIComponent(day)}`))
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(parseApiDetail(data))
        setView(null)
        return
      }
      setView(data as PackingView)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(dateText)
  }, [dateText, load])

  const onDateChange = (value: Dayjs | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'dalian')
    if (value) next.set('date', value.format('YYYY-MM-DD'))
    else next.delete('date')
    setSearchParams(next, { replace: true })
  }

  const postJson = async (path: string, body: unknown) => {
    const res = await authFetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return null
    }
    return data as PackingView & { action?: string }
  }

  const generate = async () => {
    if (!dateText) return
    setActing('generate')
    try {
      const data = await postJson('/api/v1/partners/dalian-siemens/packing-list/generate', {
        planned_arrival_date: dateText,
      })
      if (!data) return
      setView(data)
      message.success(data.action === 'regenerate' ? '已重新生成箱单' : '已生成箱单')
    } finally {
      setActing('')
    }
  }

  const startPacking = async () => {
    if (!dateText) return
    setActing('start')
    try {
      const data = await postJson('/api/v1/partners/dalian-siemens/packing-list/start', {
        planned_arrival_date: dateText,
      })
      if (!data) return
      setView(data)
      message.success('已开始装箱')
      navigate(`/packing/dalian-auto?date=${encodeURIComponent(dateText)}`)
    } finally {
      setActing('')
    }
  }

  const exportExcel = async () => {
    if (!dateText) return
    if (!exportKeys.length) {
      message.warning('请选择要导出的列')
      return
    }
    setActing('export')
    try {
      const res = await authFetch(apiUrl('/api/v1/partners/dalian-siemens/packing-list/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_arrival_date: dateText, columns: exportKeys }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `大连客户箱单_${dateText}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      setExportOpen(false)
      message.success('已导出')
    } finally {
      setActing('')
    }
  }

  const openLogs = async () => {
    if (!dateText) return
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const res = await authFetch(
        apiUrl(`/api/v1/partners/dalian-siemens/logs?planned_arrival_date=${encodeURIComponent(dateText)}&limit=200`),
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(parseApiDetail(data))
        setLogs([])
        return
      }
      setLogs((data.rows || []) as LogRow[])
    } finally {
      setLogsLoading(false)
    }
  }

  const hint = useMemo(() => {
    if (!dateText) return '先选择预定到货日期，再生成当天箱单。'
    if (!view) return ''
    if (!view.assignee_name) return '该日还没有对接人员。请先到合作伙伴 / 大连西门子 / 发货预定指定对接人。'
    if (!view.rows.length) return '该日没有预定数量大于 0 的明细。'
    if (view.packing_content_stale || view.has_changes) return '预定数量已变化。请重新生成箱单后，才能开始自动装箱。'
    if (!view.packing_generated_at) return '已指定对接人。生成后可导出，并开始自动装箱。'
    return ''
  }, [dateText, view])

  const logColumns: ColumnsType<LogRow> = [
    { title: '时间', dataIndex: 'operated_at', width: 170 },
    {
      title: '动作',
      dataIndex: 'action',
      width: 120,
      render: (value: string) => ACTION_LABELS[value] || value,
    },
    { title: '操作人', dataIndex: 'operator_name', width: 100 },
    { title: '内容', dataIndex: 'change_summary', ellipsis: true },
  ]

  return (
    <div className={styles.stack}>
      <div className={styles.queryArea}>
        <div className={styles.labeledField}>
          <div className={styles.labeledFieldName}>预定到货日期</div>
          <DatePicker value={dateText ? dayjs(dateText) : null} onChange={onDateChange} allowClear />
        </div>
        <Space wrap>
          <Button type="primary" disabled={!view?.can_generate} loading={acting === 'generate'} onClick={() => void generate()}>
            {view?.packing_generated_at ? '重新生成' : '生成'}
          </Button>
          <Button disabled={!view?.rows.length} onClick={() => setExportOpen(true)}>
            导出 Excel
          </Button>
          <Button disabled={!view?.can_start_packing} loading={acting === 'start'} onClick={() => void startPacking()}>
            开始自动装箱
          </Button>
          <Button disabled={!dateText} onClick={() => void openLogs()}>
            操作日志
          </Button>
        </Space>
      </div>
      {hint ? <Alert type={view?.packing_content_stale || view?.has_changes ? 'warning' : 'info'} showIcon message={hint} /> : null}
      {view?.packing_generated_at ? (
        <div>
          最后生成：{view.packing_generated_by || '—'}
          {view.packing_generated_by_user_id ? `（用户ID ${view.packing_generated_by_user_id}）` : ''}
          {' · '}
          {view.packing_generated_at}
          {view.assignee_name ? ` · 对接 ${view.assignee_name}` : ''}
        </div>
      ) : null}
      <Table
        className={styles.paintTable}
        size="small"
        rowKey="id"
        loading={loading}
        columns={LINE_COLUMNS}
        dataSource={view?.rows || []}
        pagination={false}
        scroll={{ x: 2060 }}
        locale={{ emptyText: dateText ? '该日没有可列入箱单的预定' : '请选择预定到货日期' }}
      />
      <div>数量、备注和删除仍在「合作伙伴 / 大连西门子 / 发货预定」修改。本页只确认、导出，并决定是否开始自动装箱。</div>
      <Modal
        title="选择导出列"
        open={exportOpen}
        okText="导出"
        cancelText="取消"
        confirmLoading={acting === 'export'}
        onCancel={() => {
          if (acting === 'export') return
          setExportOpen(false)
        }}
        onOk={() => void exportExcel()}
      >
        <Checkbox.Group
          options={EXPORT_COLUMNS.map((item) => ({ label: item.label, value: item.key }))}
          value={exportKeys}
          onChange={(values) => setExportKeys(values as string[])}
        />
      </Modal>
      <Drawer title={dateText ? `${dateText} 操作日志` : '操作日志'} open={logsOpen} width={720} onClose={() => setLogsOpen(false)}>
        <Table
          size="small"
          rowKey="id"
          loading={logsLoading}
          columns={logColumns}
          dataSource={logs}
          pagination={false}
          locale={{ emptyText: '该日还没有操作记录' }}
        />
      </Drawer>
    </div>
  )
}
