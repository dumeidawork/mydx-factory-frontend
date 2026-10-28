import { useEffect, useState } from 'react'
import { Button, Card, Collapse, Drawer, Input, InputNumber, Modal, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'

type PalletRow = {
  key: string
  id?: number
  pallet_name: string
  pallet_type: string
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  box_weight_kg: number | null
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type PalletLogRow = {
  id: number
  row_id?: number
  pallet_name: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  create: '录入',
  update: '修改',
  delete: '删除',
  upload: '上传',
  export: '导出',
}

const FIELD_LABELS: Record<string, string> = {
  pallet_name: '托盘名',
  pallet_type: '托盘类型',
  length_mm: '长',
  width_mm: '宽',
  height_mm: '高',
  box_weight_kg: '箱重',
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

function formatChangeSummary(raw: string) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown } | string | number | null> | undefined
    if (parsed.op === 'create' && fields) {
      return `${fields.pallet_name ?? ''} / ${fields.pallet_type ?? ''}，${fields.length_mm ?? ''}×${fields.width_mm ?? ''}×${fields.height_mm ?? ''}，箱重 ${fields.box_weight_kg ?? ''}KG`
    }
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      return Object.entries(fields)
        .map(([key, value]) => {
          if (value && typeof value === 'object' && 'before' in value) {
            return `${FIELD_LABELS[key] || key}: ${value.before ?? ''} → ${value.after ?? ''}`
          }
          return `${FIELD_LABELS[key] || key}: ${value ?? ''}`
        })
        .join('；')
    }
    if (parsed.op === 'delete') {
      const deleted = parsed.fields as { pallet_name?: string } | undefined
      return `删除 ${deleted?.pallet_name || ''}`
    }
    return raw
  } catch {
    return raw
  }
}

function emptyRow(index: number): PalletRow {
  return {
    key: `new-${Date.now()}-${index}`,
    pallet_name: '',
    pallet_type: '',
    length_mm: null,
    width_mm: null,
    height_mm: null,
    box_weight_kg: 20,
  }
}

function fromApi(row: Omit<PalletRow, 'key'> & { id: number }): PalletRow {
  return {
    key: String(row.id),
    id: row.id,
    pallet_name: row.pallet_name || '',
    pallet_type: row.pallet_type || '',
    length_mm: row.length_mm ?? null,
    width_mm: row.width_mm ?? null,
    height_mm: row.height_mm ?? null,
    box_weight_kg: row.box_weight_kg ?? 20,
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || '',
  }
}

export default function PalletArchivePanel() {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<PalletRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [queryName, setQueryName] = useState('')
  const [queryType, setQueryType] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<PalletLogRow[]>([])
  const [logName, setLogName] = useState('')

  const loadRows = async (name = queryName, palletType = queryType) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (name.trim()) params.set('pallet_name', name.trim())
      if (palletType.trim()) params.set('pallet_type', palletType.trim())
      const res = await authFetch(apiUrl(`/api/v1/pallet-archives?${params.toString()}`))
      const data = await readJson<{ rows?: Array<Omit<PalletRow, 'key'> & { id: number }>; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows((data.rows || []).map(fromApi))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (name = logName) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (name.trim()) params.set('pallet_name', name.trim())
      const res = await authFetch(apiUrl(`/api/v1/pallet-archives/logs?${params.toString()}`))
      const data = await readJson<{ rows?: PalletLogRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  useEffect(() => {
    void loadRows('', '')
  }, [])

  const updateRow = (key: string, patch: Partial<PalletRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const handleAppend = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleCopy = (row: PalletRow) => {
    const copied: PalletRow = {
      key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pallet_name: row.pallet_name,
      pallet_type: row.pallet_type,
      length_mm: row.length_mm,
      width_mm: row.width_mm,
      height_mm: row.height_mm,
      box_weight_kg: row.box_weight_kg,
    }
    setRows((prev) => {
      const idx = prev.findIndex((item) => item.key === row.key)
      if (idx < 0) return [...prev, copied]
      const next = [...prev]
      next.splice(idx + 1, 0, copied)
      return next
    })
    message.success('已复制一行，请修改托盘名后保存')
  }

  const isFilledRow = (row: PalletRow) =>
    Boolean(
      row.pallet_name.trim() ||
        row.pallet_type.trim() ||
        row.length_mm != null ||
        row.width_mm != null ||
        row.height_mm != null,
    )

  const toPayloadRow = (row: PalletRow) => ({
    id: row.id,
    pallet_name: row.pallet_name,
    pallet_type: row.pallet_type,
    length_mm: row.length_mm,
    width_mm: row.width_mm,
    height_mm: row.height_mm,
    box_weight_kg: row.box_weight_kg,
  })

  const rowReady = (row: PalletRow) => {
    if (!row.pallet_name.trim()) {
      message.warning('请先填写托盘名')
      return false
    }
    if (!row.pallet_type.trim()) {
      message.warning('请先填写托盘类型')
      return false
    }
    if (row.length_mm == null || row.width_mm == null || row.height_mm == null) {
      message.warning('请先填写长、宽、高')
      return false
    }
    return true
  }

  const savePayload = async (payload: ReturnType<typeof toPayloadRow>[], replaceKey?: string) => {
    if (!payload.length) {
      message.warning('没有可保存的行，请先点「追加」填写托盘名、类型和长宽高')
      return false
    }
    const res = await authFetch(apiUrl('/api/v1/pallet-archives/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payload }),
    })
    const data = await readJson<{
      rows?: Array<Omit<PalletRow, 'key'> & { id: number }>
      inserted_count?: number
      updated_count?: number
      saved_count?: number
      detail?: unknown
    }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return false
    }
    message.success(
      `已保存 ${data.saved_count ?? 0} 条（新增 ${data.inserted_count ?? 0}，更新 ${data.updated_count ?? 0}）`,
    )
    const saved = data.rows || []
    if (replaceKey && saved.length === 1) {
      setRows((prev) => prev.map((row) => (row.key === replaceKey ? fromApi(saved[0]) : row)))
      return true
    }
    await loadRows()
    return true
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await savePayload(rows.filter(isFilledRow).map(toPayloadRow))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRow = async (row: PalletRow) => {
    if (!rowReady(row)) return
    setSavingKey(row.key)
    try {
      await savePayload([toPayloadRow(row)], row.key)
    } finally {
      setSavingKey('')
    }
  }

  const handleDelete = (row: PalletRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除托盘 ${row.pallet_name || '该行'}（${row.pallet_type || ''}）？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/pallet-archives/${row.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除')
        await loadRows()
      },
    })
  }

  const columns: ColumnsType<PalletRow> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      render: (value?: number) => value ?? '自动生成',
    },
    {
      title: '托盘名',
      dataIndex: 'pallet_name',
      width: 180,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="如 欧式200"
          onChange={(e) => updateRow(row.key, { pallet_name: e.target.value })}
        />
      ),
    },
    {
      title: '托盘类型',
      dataIndex: 'pallet_type',
      width: 180,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="如 欧式托盘"
          onChange={(e) => updateRow(row.key, { pallet_type: e.target.value })}
        />
      ),
    },
    {
      title: '长',
      dataIndex: 'length_mm',
      width: 110,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={1}
          precision={0}
          placeholder="mm"
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { length_mm: next ?? null })}
        />
      ),
    },
    {
      title: '宽',
      dataIndex: 'width_mm',
      width: 110,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={1}
          precision={0}
          placeholder="mm"
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { width_mm: next ?? null })}
        />
      ),
    },
    {
      title: '高',
      dataIndex: 'height_mm',
      width: 110,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={1}
          precision={0}
          placeholder="mm"
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { height_mm: next ?? null })}
        />
      ),
    },
    {
      title: '箱重',
      dataIndex: 'box_weight_kg',
      width: 150,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={0}
          step={0.01}
          precision={2}
          addonAfter="KG"
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { box_weight_kg: next ?? 20 })}
        />
      ),
    },
    { title: '上传者', dataIndex: 'created_by', width: 100, render: (v?: string) => v || '—' },
    { title: '上传时间', dataIndex: 'created_at', width: 170, render: (v?: string) => v || '—' },
    { title: '更改者', dataIndex: 'updated_by', width: 100, render: (v?: string) => v || '—' },
    { title: '更改时间', dataIndex: 'updated_at', width: 170, render: (v?: string) => v || '—' },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_v, row) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            loading={savingKey === row.key}
            onClick={() => void handleSaveRow(row)}
          >
            保存
          </Button>
          <Button type="link" size="small" onClick={() => handleCopy(row)}>
            复制
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

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
                    <li>点「追加」新增一行，填写托盘名、托盘类型和长宽高。箱重默认 20KG，可改。</li>
                    <li>托盘名用于区分同类型不同高度，如 欧式200、欧式400。</li>
                    <li>改完点该行「保存」只写入这一行；工具栏「保存」写入本页已填写的行。已保存行可直接改单元格后再保存。</li>
                    <li>「复制」在下一行插入同样内容（不含 ID）。托盘名不能重复，请改名后再保存。</li>
                    <li>可用托盘名、托盘类型查询；「操作日志」可查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>同一托盘名只能有一条记录。ID 由系统自动生成，保存后可见。</li>
                    <li>长、宽、高为毫米正整数。箱重默认 20KG，可改。空行不会保存。托盘名、类型、尺寸均为必填。</li>
                    <li>增删改都会留下操作人、时间和变更内容，便于溯源。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Card
        size="small"
        title={<Tag color="blue">托盘建档</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>托盘名</div>
              <div className={styles.labeledFieldHint}>如 欧式200、周转400</div>
              <Input
                placeholder="欧式200"
                value={queryName}
                onChange={(e) => setQueryName(e.target.value)}
                onPressEnter={() => void loadRows()}
                allowClear
              />
            </div>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>托盘类型</div>
              <div className={styles.labeledFieldHint}>如 欧式托盘、周转托盘</div>
              <Input
                placeholder="欧式托盘"
                value={queryType}
                onChange={(e) => setQueryType(e.target.value)}
                onPressEnter={() => void loadRows()}
                allowClear
              />
            </div>
          </div>
          <Space wrap>
            <Button type="primary" onClick={() => void loadRows()}>
              查询
            </Button>
            <Button
              type="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
              onClick={() => {
                setQueryName('')
                setQueryType('')
                void loadRows('', '')
              }}
            >
              显示全部
            </Button>
            <Button
              type="primary"
              style={{ background: '#ea580c', borderColor: '#ea580c', fontWeight: 600 }}
              onClick={handleAppend}
            >
              追加
            </Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
            <Button
              onClick={() => {
                setLogOpen(true)
                void loadLogs()
              }}
            >
              操作日志
            </Button>
          </Space>
        </div>
        <Table
          className={styles.paintTable}
          rowKey="key"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1690 }}
          locale={{ emptyText: '暂无托盘记录，请点「追加」新增一行' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer title="托盘建档操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={860}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>托盘名</div>
                <div className={styles.labeledFieldHint}>按托盘名筛选操作记录</div>
                <Input
                  placeholder="欧式200"
                  value={logName}
                  onChange={(e) => setLogName(e.target.value)}
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
                  setLogName('')
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
              { title: '时间', dataIndex: 'operated_at', width: 170 },
              { title: '操作人', dataIndex: 'operator_name', width: 100 },
              {
                title: '动作',
                dataIndex: 'action',
                width: 80,
                render: (value: string) => ACTION_LABELS[value] || value,
              },
              { title: '托盘名', dataIndex: 'pallet_name', width: 120 },
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
    </div>
  )
}
