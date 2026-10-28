import { useState } from 'react'
import { Alert, Button, Card, Collapse, DatePicker, Drawer, Input, InputNumber, Modal, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import styles from './WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import AutoPackingRulesBlock from './AutoPackingRulesBlock'

export type DalianPackingMode = 'manual' | 'auto'

type PackingLine = {
  key: string
  reservation_id: number
  shipping_detail_id?: number | null
  order_no: string
  factory_order_no: string
  item_no: string
  drawing_no: string
  material_no: string
  spec_model: string
  material: string
  quantity: number
  unit_weight: number
  total_weight: number
  unit_price: number | null
  heat_no: string
  heat_treatment_batch_no: string
  shipping_mark_remark: string
  remark: string
  packing_no: string
  planned_qty: number
  warnings: string[]
  blocking: string[]
}

type LogRow = {
  id: number
  action: string
  operator_name: string
  operated_at: string
  reservation_id?: number | null
  shipping_detail_id?: number | null
  change_summary?: unknown
}

const ACTION_LABEL: Record<string, string> = {
  preview: '预览',
  blocked: '缺项中止',
  create: '新增',
  update: '修改',
  delete: '删除',
  copy: '复制',
}

function dayText(value: Dayjs | null) {
  return value ? value.format('YYYY-MM-DD') : ''
}

function parseDelivery(value: string) {
  if (!value) return null
  if (/^\d{8}$/.test(value)) return dayjs(value, 'YYYYMMDD')
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

function mapLine(row: Record<string, unknown>, index: number): PackingLine {
  const reservationId = Number(row.reservation_id)
  const packingNo = String(row.packing_no || '')
  return {
    key: `${reservationId}-${packingNo}-${index}`,
    reservation_id: reservationId,
    shipping_detail_id: row.shipping_detail_id == null ? null : Number(row.shipping_detail_id),
    order_no: String(row.order_no || ''),
    factory_order_no: String(row.factory_order_no || ''),
    item_no: String(row.item_no || ''),
    drawing_no: String(row.drawing_no || ''),
    material_no: String(row.material_no || ''),
    spec_model: String(row.spec_model || ''),
    material: String(row.material || ''),
    quantity: Number(row.quantity || 0),
    unit_weight: Number(row.unit_weight || 0),
    total_weight: Number(row.total_weight || 0),
    unit_price: row.unit_price == null ? null : Number(row.unit_price),
    heat_no: String(row.heat_no || ''),
    heat_treatment_batch_no: String(row.heat_treatment_batch_no || ''),
    shipping_mark_remark: String(row.shipping_mark_remark || ''),
    remark: String(row.remark || ''),
    packing_no: packingNo,
    planned_qty: Number(row.planned_qty || row.quantity || 0),
    warnings: Array.isArray(row.warnings) ? row.warnings.map(String) : [],
    blocking: Array.isArray(row.blocking) ? row.blocking.map(String) : [],
  }
}

async function readError(res: Response) {
  const data = await res.json().catch(() => ({}))
  return data.detail || '请求失败'
}

export default function DalianPackingPanel({ mode, initialDate = '' }: { mode: DalianPackingMode; initialDate?: string }) {
  const [plannedDate, setPlannedDate] = useState<Dayjs | null>(initialDate ? dayjs(initialDate) : dayjs())
  const [actualDate, setActualDate] = useState<Dayjs | null>(null)
  const [rows, setRows] = useState<PackingLine[]>([])
  const [blocked, setBlocked] = useState(false)
  const [blockMessages, setBlockMessages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [logLoading, setLogLoading] = useState(false)

  const applyPayload = (data: { rows?: Record<string, unknown>[]; actual_delivery_date?: string }) => {
    setRows((data.rows || []).map(mapLine))
    if (data.actual_delivery_date) setActualDate(parseDelivery(data.actual_delivery_date))
  }

  const loadRows = async () => {
    const planned = dayText(plannedDate)
    if (!planned) return message.warning('请选择预定到货日期')
    setLoading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/dalian-packing/load?planned_arrival_date=${encodeURIComponent(planned)}`))
      if (!res.ok) return message.error(await readError(res))
      const data = await res.json()
      setBlocked(false)
      setBlockMessages([])
      applyPayload(data)
      message.success(data.rows?.length ? `已加载 ${data.rows.length} 条待装箱明细` : '该日没有预定数量大于 0 的明细')
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const previewRows = async () => {
    const planned = dayText(plannedDate)
    if (!planned) return message.warning('请选择预定到货日期')
    setPreviewing(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/dalian-packing/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_arrival_date: planned }),
      })
      if (!res.ok) return message.error(await readError(res))
      const data = await res.json()
      setBlocked(Boolean(data.blocked))
      setBlockMessages(Array.isArray(data.messages) ? data.messages.map(String) : [])
      applyPayload(data)
      if (data.blocked) message.warning('缺 DN 或每托数量，未写入发货明细')
      else message.success('已生成包装序号，确认后保存')
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '预览失败')
    } finally {
      setPreviewing(false)
    }
  }

  const saveRows = async (sourceRows?: PackingLine[], quiet = false) => {
    const current = sourceRows ?? rows
    const planned = dayText(plannedDate)
    const actual = dayText(actualDate)
    if (!planned) {
      message.warning('请选择预定到货日期')
      return false
    }
    if (!actual) {
      message.warning('请填写实际发货日期')
      return false
    }
    if (!current.length) {
      message.warning('请先加载待装箱明细')
      return false
    }
    if (mode === 'auto' && blocked) {
      message.warning('缺项未消除，不能保存')
      return false
    }
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/dalian-packing/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planned_arrival_date: planned,
          actual_delivery_date: actual,
          mode,
          rows: current.map((row) => ({
            reservation_id: row.reservation_id,
            packing_no: row.packing_no,
            quantity: row.quantity,
          })),
        }),
      })
      if (!res.ok) {
        message.error(await readError(res))
        return false
      }
      const data = await res.json()
      setBlocked(false)
      setBlockMessages([])
      applyPayload(data)
      if (!quiet) message.success('已保存到大连发货明细')
      return true
    } catch (error) {
      if (isFetchGuardHandled(error)) return false
      message.error(error instanceof Error ? error.message : '保存失败')
      return false
    } finally {
      setSaving(false)
    }
  }

  const writeActionLog = async (action: 'copy' | 'delete', row: PackingLine, summary: Record<string, unknown>) => {
    const planned = dayText(plannedDate)
    if (!planned) return
    const res = await authFetch(apiUrl('/api/v1/dalian-packing/log'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planned_arrival_date: planned,
        reservation_id: row.reservation_id,
        action,
        change_summary: summary,
      }),
    })
    if (!res.ok) message.error(await readError(res))
  }

  const copyLine = async (row: PackingLine) => {
    const copied: PackingLine = {
      ...row,
      key: `copy-${row.reservation_id}-${Date.now()}`,
      shipping_detail_id: null,
      packing_no: '',
      warnings: [],
      blocking: [],
    }
    setRows((prev) => {
      const index = prev.findIndex((item) => item.key === row.key)
      const next = [...prev]
      next.splice(index < 0 ? next.length : index + 1, 0, copied)
      return next
    })
    await writeActionLog('copy', row, {
      op: 'copy',
      from_packing_no: row.packing_no,
      quantity: row.quantity,
      material_no: row.material_no,
      order_no: row.order_no,
    })
    message.success('已复制一行，请修改包装序号和数量后保存')
  }

  const deleteLine = (row: PackingLine) => {
    const siblings = rows.filter((item) => item.reservation_id === row.reservation_id && item.key !== row.key)
    if (!siblings.length) {
      message.warning('每条约定至少保留一行')
      return
    }
    Modal.confirm({
      title: `删除包装序号 ${row.packing_no || '空'} 的这一行？`,
      content: row.shipping_detail_id
        ? '已保存的拆分行会把数量并回同一预定的另一行，并立即写入。此操作记入操作日志。'
        : '尚未保存的行只从表格去掉，并记入操作日志。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const siblingSum = siblings.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        const planned = Number(row.planned_qty || 0)
        const deletedQty = Number(row.quantity || 0)
        const shouldMerge = Boolean(row.shipping_detail_id) && planned > 0 && siblingSum + deletedQty === planned && siblingSum !== planned
        let merged = false
        const next = rows.flatMap((item) => {
          if (item.key === row.key) return []
          if (shouldMerge && !merged && item.reservation_id === row.reservation_id) {
            merged = true
            const quantity = Number(item.quantity || 0) + deletedQty
            return [{ ...item, quantity, total_weight: Math.round(item.unit_weight * quantity * 1000) / 1000 }]
          }
          return [item]
        })
        if (row.shipping_detail_id) {
          const ok = await saveRows(next, true)
          if (!ok) return
          message.success('已删除')
          return
        }
        setRows(next)
        await writeActionLog('delete', row, {
          op: 'delete',
          persisted: false,
          packing_no: row.packing_no,
          quantity: row.quantity,
          material_no: row.material_no,
        })
        message.success('已删除')
      },
    })
  }

  const openLogs = async () => {
    const planned = dayText(plannedDate)
    if (!planned) return message.warning('请选择预定到货日期')
    setLogOpen(true)
    setLogLoading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/dalian-packing/logs?planned_arrival_date=${encodeURIComponent(planned)}`))
      if (!res.ok) return message.error(await readError(res))
      const data = await res.json()
      setLogs(data.rows || [])
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '日志加载失败')
    } finally {
      setLogLoading(false)
    }
  }

  const columns: ColumnsType<PackingLine> = [
      {
        title: '操作',
        key: 'op',
        width: 188,
        fixed: 'left',
        render: (_value, row) => (
          <Space size={0}>
            <Button size="small" type="link" loading={saving} disabled={mode === 'auto' && blocked} onClick={() => void saveRows()}>
              保存
            </Button>
            <Button size="small" type="link" onClick={() => void copyLine(row)}>
              复制
            </Button>
            <Button size="small" type="link" danger onClick={() => deleteLine(row)}>
              删除
            </Button>
          </Space>
        ),
      },
      {
        title: '包装序号',
        dataIndex: 'packing_no',
        width: 110,
        render: (_value, row) => (
          <Input
            value={row.packing_no}
            onChange={(event) => {
              const next = event.target.value
              setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, packing_no: next } : item)))
            }}
          />
        ),
      },
      { title: '订单号', dataIndex: 'order_no', width: 140 },
      { title: '本厂单号', dataIndex: 'factory_order_no', width: 120 },
      { title: '条目', dataIndex: 'item_no', width: 70 },
      { title: '图纸号', dataIndex: 'drawing_no', width: 140 },
      { title: '物料号', dataIndex: 'material_no', width: 120 },
      { title: '规格型号', dataIndex: 'spec_model', width: 160 },
      { title: '材质', dataIndex: 'material', width: 90 },
      {
        title: '数量',
        dataIndex: 'quantity',
        width: 90,
        render: (_value, row) => (
          <InputNumber
            min={1}
            value={row.quantity}
            style={{ width: '100%' }}
            onChange={(next) => {
              const quantity = Number(next || 0)
              setRows((prev) =>
                prev.map((item) =>
                  item.key === row.key
                    ? { ...item, quantity, total_weight: Math.round(item.unit_weight * quantity * 1000) / 1000 }
                    : item,
                ),
              )
            }}
          />
        ),
      },
      { title: '单重', dataIndex: 'unit_weight', width: 80 },
      { title: '总重', dataIndex: 'total_weight', width: 90 },
      { title: '单价', dataIndex: 'unit_price', width: 80, render: (value) => (value == null ? '' : value) },
      { title: '炉号', dataIndex: 'heat_no', width: 110 },
      { title: '热处理批号', dataIndex: 'heat_treatment_batch_no', width: 120 },
      { title: '唛头备注', dataIndex: 'shipping_mark_remark', width: 90 },
      { title: '预定备注', dataIndex: 'remark', width: 140 },
      {
        title: '提示',
        width: 220,
        render: (_value, row) => (
          <Space wrap size={4}>
            {row.blocking.map((item) => (
              <Tag key={item} color="red">
                {item}
              </Tag>
            ))}
            {row.warnings.map((item) => (
              <Tag key={item} color="gold">
                {item}
              </Tag>
            ))}
          </Space>
        ),
      },
  ]

  return (
    <>
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
                    {mode === 'manual' ? (
                      <>
                        <li>选择预定到货日期，点「加载待装箱明细」。只取该日预定数量大于 0 的发货预定。</li>
                        <li>直接改包装序号和数量就是修改。未拆分时数量须等于预定数量，包装序号可以先留空。</li>
                        <li>「复制」在下一行拆出同一预定，请改成不同的包装序号，并调整数量，使合计仍等于预定数量。</li>
                        <li>填写实际发货日期后，点该行或页底「保存」。整批写入大连发货明细。「删除」至少保留一行；删掉已保存的拆分行时，数量会并回同一预定的另一行。</li>
                        <li>点「操作日志」查看谁做了复制、新增、修改和删除。</li>
                      </>
                    ) : (
                      <>
                        <li>选择预定到货日期。从客户箱单点「开始自动装箱」进入时，日期会自动带入。</li>
                        <li>点「加载待装箱明细」，只取该日预定数量大于 0 的发货预定。</li>
                        <li>点「自动分箱」生成包装序号。这一步只在页面上预览，不写数据库。</li>
                        <li>直接改包装序号和数量就是修改。「复制」可再拆一箱，包装序号不能重复，数量合计须等于预定数量。</li>
                        <li>填写实际发货日期后，点该行或页底「保存」。「删除」至少保留一行；删掉已保存的拆分行时，数量会并回同一预定的另一行。</li>
                        <li>点「操作日志」查看谁做了预览、缺项中止、复制、新增、修改和删除。</li>
                      </>
                    )}
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>数量用预定数量，不用订单数量。总重按单重乘以数量计算。</li>
                    <li>AP1 取预定料号，R3P 取物料号。单价、炉号、热处理批号来自订单明细。订单明细没有采购员，该列留空。</li>
                    <li>唛头备注自动生成：材质含 A105 且热处理批号不是空的，写成绿色，否则写成白色。</li>
                    <li>保存不改变发货预定状态，也不写入法国装箱明细。</li>
                    <li>同一预定可以有多行，按包装序号各写一条发货明细。再次保存会更新原来的行；打包发货页手工粘贴、没有预定行关联的旧行，本页不合并、不覆盖。</li>
                    <li>实际发货日期和预定到货日期可以不是同一天。</li>
                    {mode === 'auto' ? (
                      <>
                        <li>缺 DN 或每托数量时只提示，不写入发货明细。</li>
                        <li>一条预定分成多箱时，按包装序号各写一条发货明细。长宽高、箱重和托盘类型不保存。</li>
                        <li>该预定已经手动保存过时，仍可以预览。保存会更新包装序号和实际发货日期，并在日志里留下旧值。</li>
                      </>
                    ) : null}
                  </ul>
                </div>
                {mode === 'auto' ? <AutoPackingRulesBlock scope="dalian" /> : null}
              </div>
            ),
          },
        ]}
      />
      <Card size="small" title="Step1 检索待装箱物料" className={styles.sectionCard}>
        <Space wrap align="end">
          <div>
            <div style={{ marginBottom: 4 }}>预定到货日期</div>
            <DatePicker value={plannedDate} onChange={setPlannedDate} allowClear={false} />
          </div>
          <Button type="primary" loading={loading} onClick={() => void loadRows()}>
            加载待装箱明细
          </Button>
          {mode === 'auto' ? (
            <Button type="primary" loading={previewing} onClick={() => void previewRows()}>
              自动分箱
            </Button>
          ) : null}
        </Space>
      </Card>

      <Card size="small" title="Step2 输入包装序号" className={styles.sectionCard}>
        {blocked ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="缺 DN 或每托数量，本次不写入发货明细"
            description={blockMessages.join('；')}
          />
        ) : null}
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 2100, y: 420 }}
          dataSource={rows}
          columns={columns}
        />
      </Card>

      <Card size="small" title="Step3 填入实际发货日期" className={styles.sectionCard}>
        <Space wrap align="end">
          <div>
            <div style={{ marginBottom: 4 }}>实际发货日期</div>
            <DatePicker value={actualDate} onChange={setActualDate} />
          </div>
          <Button type="primary" loading={saving} disabled={mode === 'auto' && blocked} onClick={() => void saveRows()}>
            保存
          </Button>
          <Button onClick={() => void openLogs()}>操作日志</Button>
        </Space>
      </Card>

      <Drawer title="操作日志" open={logOpen} width={720} onClose={() => setLogOpen(false)}>
        <Table
          rowKey="id"
          size="small"
          loading={logLoading}
          pagination={false}
          dataSource={logs}
          columns={[
            { title: '时间', dataIndex: 'operated_at', width: 170 },
            { title: '操作人', dataIndex: 'operator_name', width: 100 },
            {
              title: '动作',
              dataIndex: 'action',
              width: 90,
              render: (value: string) => ACTION_LABEL[value] || value,
            },
            { title: '预定行', dataIndex: 'reservation_id', width: 90 },
            { title: '发货明细', dataIndex: 'shipping_detail_id', width: 100 },
            {
              title: '变更内容',
              dataIndex: 'change_summary',
              render: (value) => (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2)}
                </pre>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  )
}
