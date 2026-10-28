import { useCallback, useEffect, useMemo, useState, type Key } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button,
  Card,
  Collapse,
  DatePicker,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import { usePageTitle } from '../layout/usePageTitle'
import styles from './WorkflowPages.module.css'

const API = '/api/v1/partners/dalian-siemens'

type ExistingReservation = {
  id: number
  planned_arrival_date: string
  planned_qty: number
  remark: string
  status: string
}

type UnshippedRow = {
  key: string
  order_detail_id: number
  order_no: string
  factory_order_no: string
  part_no: string
  material_no: string
  spec_model: string
  material: string
  order_qty: number
  reserved_qty: number
  remaining_qty: number
  status: string
  planned_arrival_date: string
  planned_qty: number | null
  remark: string
  existing_reservations: ExistingReservation[]
}

type ReservationRow = {
  id: number
  order_detail_id: number
  order_no: string
  factory_order_no: string
  part_no: string
  material_no: string
  spec_model: string
  material: string
  order_qty: number
  reserved_qty?: number
  remaining_qty?: number
  planned_arrival_date: string
  planned_qty: number
  remark: string
  status: string
  booker_name: string
  booked_at: string
  assignee_name: string
}

type LogRow = {
  id: number
  row_id?: number
  order_no?: string
  material_no?: string
  planned_arrival_date?: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

type UserOption = { id: number; name: string; username: string }

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

const ORDER_STATUS_OPTIONS = ['开始', '分割', '加工', '入库', '质检', '再加工', '包装', '装箱', '打包', '发货', '完成']

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

function toYmd(value: Dayjs | string | null | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return value.format('YYYY-MM-DD')
}

function existingForDate(row: UnshippedRow, dateStr: string): ExistingReservation | undefined {
  return row.existing_reservations.find((item) => item.planned_arrival_date === dateStr)
}

export default function PartnerDalianSiemensPage() {
  const pageTitle = usePageTitle()

  return (
    <Card title={pageTitle} className={styles.pageCard}>
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
                    <div className={styles.opGuideLabel}>发货预定</div>
                    <ul className={styles.opGuideList}>
                      <li>本页只写发货预定表，不会修改或删除订单明细。</li>
                      <li>第一部分：搜索大连未发明细（订单号 4 开头），填写预定到货日期、本次数量和备注后单条或批量保存。数量 0 表示该日取消但留痕。</li>
                      <li>同一订单明细同一到货日只有一条，再填即改。超可预定余量会拒绝保存。</li>
                      <li>第二部分：按日期核对该日全部预定，指定或改派铭远对接人。追加同日预定会继承对接人并重提醒。</li>
                      <li>删除只删预定行并记日志。该日有效预定删光后，日期头上的对接人仍保留。</li>
                    </ul>
                  </div>
                </div>
              ),
            },
          ]}
        />
        <Tabs
          items={[
            {
              key: 'shipping-reserve',
              label: '发货预定',
              children: <DalianShippingReservationPanel />,
            },
          ]}
        />
      </div>
    </Card>
  )
}

function DalianShippingReservationPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState({ order_no: '', factory_order_no: '', material_no: '', part_no: '', status: [] as string[] })
  const [rows, setRows] = useState<UnshippedRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string>('')
  const [batchSaving, setBatchSaving] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([])
  const [batchDate, setBatchDate] = useState<Dayjs | null>(null)

  const urlDate = searchParams.get('date') || ''
  const [part2Date, setPart2Date] = useState<Dayjs | null>(urlDate ? dayjs(urlDate) : null)
  const [part2Rows, setPart2Rows] = useState<ReservationRow[]>([])
  const [part2Loading, setPart2Loading] = useState(false)
  const [assigneeId, setAssigneeId] = useState<number | undefined>()
  const [assigneeName, setAssigneeName] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [assigning, setAssigning] = useState(false)

  const [logOpen, setLogOpen] = useState(false)
  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [logFilter, setLogFilter] = useState({ order_no: '', material_no: '', planned_arrival_date: '', action: '' })

  const loadUnshipped = useCallback(
    async (nextPage = page, nextSize = pageSize) => {
      setLoading(true)
      try {
        const qs = new URLSearchParams()
        if (filters.order_no.trim()) qs.set('order_no', filters.order_no.trim())
        if (filters.factory_order_no.trim()) qs.set('factory_order_no', filters.factory_order_no.trim())
        if (filters.material_no.trim()) qs.set('material_no', filters.material_no.trim())
        if (filters.part_no.trim()) qs.set('part_no', filters.part_no.trim())
        filters.status.forEach((item) => qs.append('status', item))
        qs.set('page', String(nextPage))
        qs.set('page_size', String(nextSize))
        const res = await authFetch(apiUrl(`${API}/unshipped-details?${qs.toString()}`))
        const data = await readJson<{
          rows?: Omit<UnshippedRow, 'key' | 'planned_arrival_date' | 'planned_qty' | 'remark'>[]
          total?: number
          detail?: unknown
        }>(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        setRows(
          (data.rows || []).map((row) => ({
            ...row,
            key: String(row.order_detail_id),
            planned_arrival_date: '',
            planned_qty: null,
            remark: '',
            status: row.status || '',
            existing_reservations: row.existing_reservations || [],
          })),
        )
        setTotal(data.total || 0)
        setSelectedKeys([])
      } finally {
        setLoading(false)
      }
    },
    [filters, page, pageSize],
  )

  const loadPart2 = useCallback(async (dateValue: Dayjs | null) => {
    if (!dateValue) {
      setPart2Rows([])
      setAssigneeId(undefined)
      setAssigneeName('')
      return
    }
    setPart2Loading(true)
    try {
      const dateStr = toYmd(dateValue)
      const res = await authFetch(apiUrl(`${API}/reservations?planned_arrival_date=${encodeURIComponent(dateStr)}`))
      const data = await readJson<{
        rows?: ReservationRow[]
        assignee_user_id?: number | null
        assignee_name?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setPart2Rows(data.rows || [])
      setAssigneeId(data.assignee_user_id || undefined)
      setAssigneeName(data.assignee_name || '')
    } finally {
      setPart2Loading(false)
    }
  }, [])

  useEffect(() => {
    void loadUnshipped(1, pageSize)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (urlDate) {
      const parsed = dayjs(urlDate)
      if (parsed.isValid()) {
        setPart2Date(parsed)
        void loadPart2(parsed)
      }
    }
  }, [urlDate, loadPart2])

  const loadUsers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/auth/users/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: UserOption[] }>(res)
    if (!res.ok) return
    setUserOptions(data.items || [])
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const updateRow = (key: string, patch: Partial<UnshippedRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const onDateChange = (row: UnshippedRow, dateStr: string) => {
    const hit = existingForDate(row, dateStr)
    updateRow(row.key, {
      planned_arrival_date: dateStr,
      planned_qty: hit ? hit.planned_qty : row.planned_qty,
      remark: hit ? hit.remark : row.remark,
    })
  }

  const saveOne = async (row: UnshippedRow) => {
    if (!row.planned_arrival_date) {
      message.warning('请先填写预定到货日期')
      return
    }
    if (row.planned_qty === null || row.planned_qty === undefined) {
      message.warning('请填写预定到货数量')
      return
    }
    setSavingKey(row.key)
    try {
      const res = await authFetch(apiUrl(`${API}/reservations`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_detail_id: row.order_detail_id,
          planned_arrival_date: row.planned_arrival_date,
          planned_qty: row.planned_qty,
          remark: row.remark || '',
        }),
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      const split = (data as { order_split?: { remainder_created?: boolean; remainder_qty?: number } }).order_split
      message.success(
        split?.remainder_created
          ? `已保存预定，余下 ${split.remainder_qty ?? ''} 件已拆成新的订单明细`
          : '已保存预定',
      )
      notifyWorkbenchUnreadChanged()
      await loadUnshipped(page, pageSize)
      if (part2Date && toYmd(part2Date) === row.planned_arrival_date) await loadPart2(part2Date)
    } finally {
      setSavingKey('')
    }
  }

  const deleteOne = (row: UnshippedRow) => {
    const hit = existingForDate(row, row.planned_arrival_date)
    if (!hit) {
      message.warning('当前行没有已保存的该日预定，无法删除')
      return
    }
    Modal.confirm({
      title: '删除该日发货预定？',
      content: `将删除订单 ${row.order_no} / 物料 ${row.material_no} 在 ${row.planned_arrival_date} 的预定。炉号一致且尚未装箱时，数量会并回余量明细。已装箱或已有发货明细的预定不能删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await authFetch(apiUrl(`${API}/reservations/${hit.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除预定')
        notifyWorkbenchUnreadChanged()
        await loadUnshipped(page, pageSize)
        if (part2Date) await loadPart2(part2Date)
      },
    })
  }

  const handleBatchSave = async () => {
    const items = rows
      .filter((row) => row.planned_arrival_date && row.planned_qty !== null && row.planned_qty !== undefined)
      .map((row) => ({
        order_detail_id: row.order_detail_id,
        planned_arrival_date: row.planned_arrival_date,
        planned_qty: Number(row.planned_qty),
        remark: row.remark || '',
      }))
    const skipped = rows.filter((row) => !row.planned_arrival_date).length
    const missingQty = rows.filter((row) => row.planned_arrival_date && (row.planned_qty === null || row.planned_qty === undefined)).length
    if (missingQty) {
      message.warning('已填日期的行必须同时填写预定到货数量（可为 0）')
      return
    }
    if (!items.length) {
      message.warning('当前列表没有已填预定到货日期的行')
      return
    }
    setBatchSaving(true)
    try {
      const res = await authFetch(apiUrl(`${API}/reservations/batch`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await readJson<{ saved_count?: number; skipped_count?: number; errors?: string[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      const extra = data.errors?.length ? `；未成功：${data.errors.join('；')}` : ''
      message.success(`已保存 ${data.saved_count || 0} 条，跳过未填日期 ${skipped} 条${extra}`)
      notifyWorkbenchUnreadChanged()
      await loadUnshipped(page, pageSize)
      if (part2Date) await loadPart2(part2Date)
    } finally {
      setBatchSaving(false)
    }
  }

  const applyBatchDate = () => {
    if (!batchDate) {
      message.warning('请先选择要批量填入的预定到货日期')
      return
    }
    if (!selectedKeys.length) {
      message.warning('请先勾选要填入日期的行')
      return
    }
    const dateStr = toYmd(batchDate)
    const selected = new Set(selectedKeys.map(String))
    setRows((prev) =>
      prev.map((row) => {
        if (!selected.has(row.key)) return row
        const hit = existingForDate(row, dateStr)
        return {
          ...row,
          planned_arrival_date: dateStr,
          planned_qty: hit ? hit.planned_qty : row.planned_qty,
          remark: hit ? hit.remark : row.remark,
        }
      }),
    )
    message.success(`已将 ${dateStr} 填入 ${selectedKeys.length} 行`)
  }

  const savePart2Row = async (row: ReservationRow) => {
    const res = await authFetch(apiUrl(`${API}/reservations/${row.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planned_arrival_date: row.planned_arrival_date,
        planned_qty: row.planned_qty,
        remark: row.remark || '',
      }),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success('已修改预定')
    notifyWorkbenchUnreadChanged()
    await loadPart2(part2Date)
    await loadUnshipped(page, pageSize)
  }

  const deletePart2Row = (row: ReservationRow) => {
    Modal.confirm({
      title: '删除该日发货预定？',
      content: `将删除订单 ${row.order_no} / 物料 ${row.material_no} 的预定，订单明细不会改动。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await authFetch(apiUrl(`${API}/reservations/${row.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除预定')
        notifyWorkbenchUnreadChanged()
        await loadPart2(part2Date)
        await loadUnshipped(page, pageSize)
      },
    })
  }

  const handleAssign = async () => {
    if (!part2Date) {
      message.warning('请先选择预定到货日期')
      return
    }
    if (!assigneeId) {
      message.warning('请选择对接人员')
      return
    }
    setAssigning(true)
    try {
      const res = await authFetch(apiUrl(`${API}/assign`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planned_arrival_date: toYmd(part2Date),
          assignee_user_id: assigneeId,
        }),
      })
      const data = await readJson<{ action?: string; assignee_name?: string; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      message.success(data.action === 'reassign' ? `已改派给 ${data.assignee_name}` : `已指定对接人 ${data.assignee_name}`)
      notifyWorkbenchUnreadChanged()
      await loadPart2(part2Date)
    } finally {
      setAssigning(false)
    }
  }

  const loadLogs = async () => {
    setLogLoading(true)
    try {
      const qs = new URLSearchParams()
      if (logFilter.order_no.trim()) qs.set('order_no', logFilter.order_no.trim())
      if (logFilter.material_no.trim()) qs.set('material_no', logFilter.material_no.trim())
      if (logFilter.planned_arrival_date.trim()) qs.set('planned_arrival_date', logFilter.planned_arrival_date.trim())
      if (logFilter.action.trim()) qs.set('action', logFilter.action.trim())
      const res = await authFetch(apiUrl(`${API}/logs?${qs.toString()}`))
      const data = await readJson<{ rows?: LogRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  const part1Columns: ColumnsType<UnshippedRow> = [
    {
      title: '操作',
      key: 'op',
      fixed: 'left',
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button type="primary" size="small" loading={savingKey === row.key} onClick={() => void saveOne(row)}>
            保存
          </Button>
          <Button size="small" danger disabled={!existingForDate(row, row.planned_arrival_date)} onClick={() => deleteOne(row)}>
            删除
          </Button>
        </Space>
      ),
    },
    { title: '订单号', dataIndex: 'order_no', width: 120 },
    { title: '本厂单号', dataIndex: 'factory_order_no', width: 120 },
    { title: '料号', dataIndex: 'part_no', width: 120, ellipsis: true },
    { title: '物料号', dataIndex: 'material_no', width: 140, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec_model', width: 160, ellipsis: true },
    { title: '材质', dataIndex: 'material', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => (value ? <Tag color="blue">{value}</Tag> : '—'),
    },
    { title: '数量', dataIndex: 'order_qty', width: 70 },
    { title: '已预定数量', dataIndex: 'reserved_qty', width: 100 },
    { title: '可预定余量', dataIndex: 'remaining_qty', width: 100 },
    {
      title: '预定到货日期',
      dataIndex: 'planned_arrival_date',
      width: 150,
      render: (_, row) => (
        <DatePicker
          size="small"
          style={{ width: '100%' }}
          value={row.planned_arrival_date ? dayjs(row.planned_arrival_date) : null}
          onChange={(value) => onDateChange(row, toYmd(value))}
        />
      ),
    },
    {
      title: '预定到货数量',
      dataIndex: 'planned_qty',
      width: 120,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0}
          precision={0}
          style={{ width: '100%' }}
          value={row.planned_qty}
          onChange={(value) => updateRow(row.key, { planned_qty: value === null ? null : Number(value) })}
        />
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 160,
      render: (_, row) => (
        <Input size="small" value={row.remark} onChange={(e) => updateRow(row.key, { remark: e.target.value })} />
      ),
    },
  ]

  const updatePart2 = (id: number, patch: Partial<ReservationRow>) => {
    setPart2Rows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const part2Columns: ColumnsType<ReservationRow> = [
    {
      title: '操作',
      key: 'op',
      fixed: 'left',
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button type="primary" size="small" onClick={() => void savePart2Row(row)}>
            保存
          </Button>
          <Button size="small" danger onClick={() => deletePart2Row(row)}>
            删除
          </Button>
        </Space>
      ),
    },
    { title: '订单号', dataIndex: 'order_no', width: 120 },
    { title: '本厂单号', dataIndex: 'factory_order_no', width: 120 },
    { title: '料号', dataIndex: 'part_no', width: 120, ellipsis: true },
    { title: '物料号', dataIndex: 'material_no', width: 140, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec_model', width: 160, ellipsis: true },
    { title: '材质', dataIndex: 'material', width: 90 },
    { title: '数量', dataIndex: 'order_qty', width: 70 },
    { title: '已预定数量', dataIndex: 'reserved_qty', width: 100 },
    { title: '可预定余量', dataIndex: 'remaining_qty', width: 100 },
    {
      title: '预定到货日期',
      dataIndex: 'planned_arrival_date',
      width: 150,
      render: (_, row) => (
        <DatePicker
          size="small"
          style={{ width: '100%' }}
          value={row.planned_arrival_date ? dayjs(row.planned_arrival_date) : null}
          onChange={(value) => updatePart2(row.id, { planned_arrival_date: toYmd(value) })}
        />
      ),
    },
    {
      title: '预定到货数量',
      dataIndex: 'planned_qty',
      width: 120,
      render: (_, row) => (
        <InputNumber
          size="small"
          min={0}
          precision={0}
          style={{ width: '100%' }}
          value={row.planned_qty}
          onChange={(value) => updatePart2(row.id, { planned_qty: Number(value || 0) })}
        />
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 140,
      render: (_, row) => (
        <Input size="small" value={row.remark} onChange={(e) => updatePart2(row.id, { remark: e.target.value })} />
      ),
    },
    { title: '预定者', dataIndex: 'booker_name', width: 100 },
    { title: '预定时间', dataIndex: 'booked_at', width: 160 },
    {
      title: '进度',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => <Tag color={STATUS_COLOR[value] || 'default'}>{value}</Tag>,
    },
  ]

  const logColumns: ColumnsType<LogRow> = [
    { title: '时间', dataIndex: 'operated_at', width: 170 },
    {
      title: '动作',
      dataIndex: 'action',
      width: 100,
      render: (value: string) => ACTION_LABELS[value] || value,
    },
    { title: '操作人', dataIndex: 'operator_name', width: 100 },
    { title: '订单号', dataIndex: 'order_no', width: 120 },
    { title: '物料号', dataIndex: 'material_no', width: 140 },
    { title: '预定到货日期', dataIndex: 'planned_arrival_date', width: 120 },
    {
      title: '变更内容',
      dataIndex: 'change_summary',
      ellipsis: true,
      render: (value: string) => value || '—',
    },
  ]

  const userSelectOptions = useMemo(
    () => userOptions.map((item) => ({ value: item.id, label: `${item.name || item.username}${item.username ? `（${item.username}）` : ''}` })),
    [userOptions],
  )

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        title="第一部分：挑选未发明细"
        extra={
          <Button
            onClick={() => {
              setLogOpen(true)
              void loadLogs()
            }}
          >
            操作日志
          </Button>
        }
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.queryFieldFixed}>
              <div className={styles.labeledFieldName}>订单号</div>
              <Input allowClear value={filters.order_no} onChange={(e) => setFilters((p) => ({ ...p, order_no: e.target.value }))} />
            </div>
            <div className={styles.queryFieldFixed}>
              <div className={styles.labeledFieldName}>本厂单号</div>
              <Input
                allowClear
                value={filters.factory_order_no}
                onChange={(e) => setFilters((p) => ({ ...p, factory_order_no: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.queryFieldRow}>
            <div className={styles.queryFieldFixed}>
              <div className={styles.labeledFieldName}>物料号</div>
              <Input allowClear value={filters.material_no} onChange={(e) => setFilters((p) => ({ ...p, material_no: e.target.value }))} />
            </div>
            <div className={styles.queryFieldFixed}>
              <div className={styles.labeledFieldName}>料号</div>
              <Input allowClear value={filters.part_no} onChange={(e) => setFilters((p) => ({ ...p, part_no: e.target.value }))} />
            </div>
            <div className={styles.queryFieldFixed}>
              <div className={styles.labeledFieldName}>状态</div>
              <Select
                mode="multiple"
                allowClear
                style={{ width: '100%' }}
                placeholder="可多选状态"
                value={filters.status}
                options={ORDER_STATUS_OPTIONS.map((v) => ({ value: v, label: v }))}
                onChange={(value) => setFilters((p) => ({ ...p, status: value }))}
              />
            </div>
          </div>
          <div>
            <Button
              type="primary"
              onClick={() => {
                setPage(1)
                void loadUnshipped(1, pageSize)
              }}
            >
              搜索
            </Button>
          </div>
          <Space wrap className={styles.queryHalfRowGap}>
            <DatePicker value={batchDate} onChange={setBatchDate} placeholder="批量填入日期" />
            <Button type="primary" onClick={applyBatchDate}>
              填入勾选行
            </Button>
          </Space>
          <div className={styles.queryHalfRowGap}>
            <Button
              loading={batchSaving}
              onClick={() => void handleBatchSave()}
              style={{ background: '#ea580c', borderColor: '#ea580c', color: '#fff' }}
            >
              批量保存当前列表
            </Button>
          </div>
        </div>
        <Table
          className={styles.paintTable}
          size="small"
          rowKey="key"
          loading={loading}
          columns={part1Columns}
          dataSource={rows}
          scroll={{ x: 1950 }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条未发明细`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage)
              setPageSize(nextSize)
              void loadUnshipped(nextPage, nextSize)
            },
          }}
          locale={{ emptyText: '没有可预定余量的大连明细' }}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card size="small" title="第二部分：按预定到货日期确认并对接">
        <Space wrap style={{ marginBottom: 12 }}>
          <span>预定到货日期</span>
          <DatePicker
            value={part2Date}
            onChange={(value) => {
              setPart2Date(value)
              const next = new URLSearchParams(searchParams)
              if (value) next.set('date', toYmd(value))
              else next.delete('date')
              setSearchParams(next, { replace: true })
              void loadPart2(value)
            }}
          />
          <span>对接人员</span>
          <Select
            showSearch
            allowClear
            filterOption={false}
            placeholder="可检索姓名/用户名"
            style={{ width: 260 }}
            value={assigneeId}
            options={userSelectOptions}
            onSearch={(q) => void loadUsers(q)}
            onChange={(value) => setAssigneeId(value)}
          />
          <Button type="primary" loading={assigning} onClick={() => void handleAssign()}>
            {assigneeName ? '指定 / 改派' : '指定对接人员'}
          </Button>
          {assigneeName ? <Tag color="blue">当前对接：{assigneeName}</Tag> : <Tag>尚未指定对接</Tag>}
        </Space>
        <Table
          className={styles.paintTable}
          size="small"
          rowKey="id"
          loading={part2Loading}
          columns={part2Columns}
          dataSource={part2Rows}
          scroll={{ x: 2100 }}
          pagination={false}
          locale={{ emptyText: '该日暂无发货预定' }}
        />
      </Card>

      <Drawer title="发货预定操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={960}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            placeholder="订单号"
            allowClear
            value={logFilter.order_no}
            onChange={(e) => setLogFilter((p) => ({ ...p, order_no: e.target.value }))}
            style={{ width: 140 }}
          />
          <Input
            placeholder="物料号"
            allowClear
            value={logFilter.material_no}
            onChange={(e) => setLogFilter((p) => ({ ...p, material_no: e.target.value }))}
            style={{ width: 160 }}
          />
          <DatePicker
            value={logFilter.planned_arrival_date ? dayjs(logFilter.planned_arrival_date) : null}
            onChange={(value) => setLogFilter((p) => ({ ...p, planned_arrival_date: toYmd(value) }))}
            placeholder="预定到货日期"
          />
          <Select
            allowClear
            placeholder="动作"
            style={{ width: 140 }}
            value={logFilter.action || undefined}
            options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setLogFilter((p) => ({ ...p, action: value || '' }))}
          />
          <Button type="primary" onClick={() => void loadLogs()}>
            查询
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="id"
          loading={logLoading}
          columns={logColumns}
          dataSource={logRows}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: '暂无操作日志' }}
        />
      </Drawer>
    </Space>
  )
}
