import { useEffect, useState } from 'react'
import { Button, Card, Collapse, Drawer, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'

const FLANGE_TYPES = ['滑动', '平板', '盲板', '高径'] as const
const DEFAULT_FLANGE_TYPE = '平板'

type DrawingFlangeRow = {
  key: string
  id?: number
  drawing_no: string
  flange_type: string
  remark: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type DrawingFlangeLogRow = {
  id: number
  row_id?: number
  drawing_no: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  create: '录入',
  update: '修改',
  delete: '删除',
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
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown } | string> | undefined
    if (parsed.op === 'create' && fields) {
      return `${fields.drawing_no ?? ''} → ${fields.flange_type ?? ''}`
    }
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      const labels: Record<string, string> = {
        drawing_no: '图纸号',
        flange_type: '法兰类型',
        remark: '备注',
      }
      return Object.entries(fields)
        .map(([key, value]) => {
          if (value && typeof value === 'object' && 'before' in value) {
            return `${labels[key] || key}: ${value.before ?? ''} → ${value.after ?? ''}`
          }
          return `${labels[key] || key}: ${value ?? ''}`
        })
        .join('；')
    }
    if (parsed.op === 'delete') {
      const deleted = parsed.fields as { drawing_no?: string } | undefined
      return `删除 ${deleted?.drawing_no || ''}`
    }
    return raw
  } catch {
    return raw
  }
}

function emptyRow(index: number): DrawingFlangeRow {
  return {
    key: `new-${Date.now()}-${index}`,
    drawing_no: '',
    flange_type: DEFAULT_FLANGE_TYPE,
    remark: '',
  }
}

function fromApi(row: Omit<DrawingFlangeRow, 'key'> & { id: number }): DrawingFlangeRow {
  return {
    key: String(row.id),
    id: row.id,
    drawing_no: row.drawing_no || '',
    flange_type: row.flange_type || DEFAULT_FLANGE_TYPE,
    remark: row.remark || '',
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || '',
  }
}

export default function DrawingFlangeTypeMapPanel() {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<DrawingFlangeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [queryDrawing, setQueryDrawing] = useState('')
  const [queryType, setQueryType] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<DrawingFlangeLogRow[]>([])
  const [logDrawing, setLogDrawing] = useState('')

  const loadRows = async (drawing = queryDrawing, flangeType = queryType) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (drawing.trim()) params.set('drawing_no', drawing.trim())
      if (flangeType.trim()) params.set('flange_type', flangeType.trim())
      const res = await authFetch(apiUrl(`/api/v1/drawing-flange-type-maps?${params.toString()}`))
      const data = await readJson<{ rows?: Array<Omit<DrawingFlangeRow, 'key'> & { id: number }>; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows((data.rows || []).map(fromApi))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (drawing = logDrawing) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (drawing.trim()) params.set('drawing_no', drawing.trim())
      const res = await authFetch(apiUrl(`/api/v1/drawing-flange-type-maps/logs?${params.toString()}`))
      const data = await readJson<{ rows?: DrawingFlangeLogRow[]; detail?: unknown }>(res)
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

  const updateRow = (key: string, patch: Partial<DrawingFlangeRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const handleAppend = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleCopy = (row: DrawingFlangeRow) => {
    const copied: DrawingFlangeRow = {
      key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      drawing_no: row.drawing_no,
      flange_type: row.flange_type || DEFAULT_FLANGE_TYPE,
      remark: row.remark,
    }
    setRows((prev) => {
      const idx = prev.findIndex((item) => item.key === row.key)
      if (idx < 0) return [...prev, copied]
      const next = [...prev]
      next.splice(idx + 1, 0, copied)
      return next
    })
    message.success('已复制一行，请修改图纸号后保存')
  }

  const toPayloadRow = (row: DrawingFlangeRow) => ({
    id: row.id,
    drawing_no: row.drawing_no,
    flange_type: row.flange_type,
    remark: row.remark,
  })

  const isFilledRow = (row: DrawingFlangeRow) =>
    Boolean(row.drawing_no.trim() || row.flange_type.trim() || row.remark.trim())

  const savePayload = async (payload: ReturnType<typeof toPayloadRow>[], replaceKey?: string) => {
    if (!payload.length) {
      message.warning('没有可保存的行，请先点「追加」填写图纸号与法兰类型')
      return false
    }
    const res = await authFetch(apiUrl('/api/v1/drawing-flange-type-maps/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payload }),
    })
    const data = await readJson<{
      rows?: Array<Omit<DrawingFlangeRow, 'key'> & { id: number }>
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

  const handleSaveRow = async (row: DrawingFlangeRow) => {
    if (!row.drawing_no.trim()) {
      message.warning('请先填写图纸号')
      return
    }
    if (!row.flange_type.trim()) {
      message.warning('请先选择法兰类型')
      return
    }
    setSavingKey(row.key)
    try {
      await savePayload([toPayloadRow(row)], row.key)
    } finally {
      setSavingKey('')
    }
  }

  const handleDelete = (row: DrawingFlangeRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除图纸号 ${row.drawing_no || '该行'} 与法兰类型 ${row.flange_type || ''} 的对照？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/drawing-flange-type-maps/${row.id}`), { method: 'DELETE' })
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

  const columns: ColumnsType<DrawingFlangeRow> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      render: (value?: number) => value ?? '—',
    },
    {
      title: '图纸号',
      dataIndex: 'drawing_no',
      width: 220,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="A5E00702852A"
          onChange={(e) => updateRow(row.key, { drawing_no: e.target.value })}
        />
      ),
    },
    {
      title: '法兰类型',
      dataIndex: 'flange_type',
      width: 140,
      render: (value: string, row) => (
        <Select
          value={value || DEFAULT_FLANGE_TYPE}
          style={{ width: '100%' }}
          options={FLANGE_TYPES.map((item) => ({ value: item, label: item }))}
          onChange={(next) => updateRow(row.key, { flange_type: next })}
        />
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="可选备注说明"
          onChange={(e) => updateRow(row.key, { remark: e.target.value })}
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
                    <li>点「追加」新增一行，填写图纸号并选择法兰类型。</li>
                    <li>图纸号请填不带版本号的本体，如 A5E00702852A；若误填 Rev002 会在保存时自动去掉。</li>
                    <li>法兰类型为滑动、平板、盲板、高径，新增行默认为平板。</li>
                    <li>可填备注。顶部「保存」一次性写入本页表格；右侧「保存」只提交该行。</li>
                    <li>已保存行可直接改单元格后再保存；右侧「复制」会在下一行插入同样内容，改图纸号后再保存；「删除」可去掉该行。</li>
                    <li>可用图纸号或法兰类型查询；「操作日志」可查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>同一图纸号只能有一条对照。生成订单明细时按去版本图纸号匹配，写入订单备注1。</li>
                    <li>空行不会保存。图纸号与法兰类型均为必填。</li>
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
        title={<Tag color="blue">图纸-法兰类型对照</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>图纸号</div>
              <div className={styles.labeledFieldHint}>如 A5E00702852A；带版本号也可查</div>
              <Input
                placeholder="A5E00702852A"
                value={queryDrawing}
                onChange={(e) => setQueryDrawing(e.target.value)}
                onPressEnter={() => void loadRows()}
                allowClear
              />
            </div>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>法兰类型</div>
              <div className={styles.labeledFieldHint}>滑动 / 平板 / 盲板 / 高径</div>
              <Select
                allowClear
                placeholder="全部"
                value={queryType || undefined}
                style={{ width: 160 }}
                options={FLANGE_TYPES.map((item) => ({ value: item, label: item }))}
                onChange={(next) => setQueryType(next || '')}
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
                setQueryDrawing('')
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
          scroll={{ x: 1400 }}
          locale={{ emptyText: '暂无对照记录，请点「追加」新增一行' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer title="图纸-法兰类型操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={860}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>图纸号</div>
                <div className={styles.labeledFieldHint}>按图纸号筛选操作记录</div>
                <Input
                  placeholder="A5E00702852A"
                  value={logDrawing}
                  onChange={(e) => setLogDrawing(e.target.value)}
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
                  setLogDrawing('')
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
              { title: '图纸号', dataIndex: 'drawing_no', width: 180 },
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
