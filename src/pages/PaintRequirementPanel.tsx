import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import { normalizeDrawingRevForDb } from '../utils/specParser'
import styles from './WorkflowPages.module.css'

type PaintRow = {
  id: number
  drawing_rev_no: string
  skip_green_paint: number
  remark: string
  created_by: string
  created_at: string
  updated_by: string
  updated_at: string
}

type PaintLogRow = {
  id: number
  row_id?: number
  drawing_rev_no: string
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

const DRAWING_HINT = 'A5E02970605A Rev017 或 A5E02970605A-017'

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
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown }> | undefined
    if (parsed.op === 'create' && fields) {
      return `图纸号 ${fields.drawing_rev_no ?? parsed.drawing_rev_no ?? ''}，${
        Number(fields.skip_green_paint) === 1 ? '不划绿漆' : '划绿漆'
      }`
    }
    if (fields && Object.keys(fields).length) {
      const labels: Record<string, string> = {
        drawing_rev_no: '图纸号-版本号',
        skip_green_paint: '不划绿漆',
        remark: '备注',
      }
      const paintLabel = (value: unknown) => (Number(value) === 1 ? '不划绿漆' : '划绿漆')
      return Object.entries(fields)
        .map(([key, value]) => {
          if (key === 'skip_green_paint') {
            return `${labels[key]}: ${paintLabel(value?.before)} → ${paintLabel(value?.after)}`
          }
          return `${labels[key] || key}: ${value?.before ?? ''} → ${value?.after ?? ''}`
        })
        .join('；')
    }
    if (parsed.op === 'delete') {
      return `删除 ${parsed.fields && typeof parsed.fields === 'object' ? (parsed.fields as { drawing_rev_no?: string }).drawing_rev_no || '' : ''}`
    }
    return raw
  } catch {
    return raw
  }
}

function PaintSwitch({ value, onChange }: { value?: boolean; onChange?: (checked: boolean) => void }) {
  const skip = Boolean(value)
  return (
    <div className={styles.paintSwitch}>
      <span className={skip ? styles.paintSwitchMuted : styles.paintSwitchActiveGreen}>划绿漆</span>
      <Switch checked={skip} onChange={onChange} />
      <span className={skip ? styles.paintSwitchActiveOrange : styles.paintSwitchMuted}>不划绿漆</span>
    </div>
  )
}

export default function PaintRequirementPanel() {
  const currentUser = getStoredUser()
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()
  const [rows, setRows] = useState<PaintRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [queryDrawing, setQueryDrawing] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<PaintRow | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<PaintLogRow[]>([])
  const [logDrawing, setLogDrawing] = useState('')

  const loadRows = async (drawing = queryDrawing) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (drawing.trim()) params.set('drawing_rev_no', drawing.trim())
      const res = await authFetch(apiUrl(`/api/v1/paint-requirements?${params.toString()}`))
      const data = await readJson<{ rows?: PaintRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (drawing = logDrawing) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (drawing.trim()) params.set('drawing_rev_no', drawing.trim())
      const res = await authFetch(apiUrl(`/api/v1/paint-requirements/logs?${params.toString()}`))
      const data = await readJson<{ rows?: PaintLogRow[]; detail?: unknown }>(res)
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
    void loadRows('')
  }, [])

  const handleCreate = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/paint-requirements'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawing_rev_no: normalizeDrawingRevForDb(String(values.drawing_rev_no || '')),
          skip_green_paint: Boolean(values.skip_green_paint),
          remark: String(values.remark || '').trim(),
        }),
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      message.success('已保存划漆要求')
      form.resetFields()
      form.setFieldsValue({ skip_green_paint: false })
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (row: PaintRow) => {
    setEditing(row)
    editForm.setFieldsValue({
      drawing_rev_no: row.drawing_rev_no,
      skip_green_paint: Boolean(row.skip_green_paint),
      remark: row.remark,
    })
    setEditOpen(true)
  }

  const handleUpdate = async () => {
    if (!editing) return
    const values = await editForm.validateFields()
    setSaving(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/paint-requirements/${editing.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawing_rev_no: normalizeDrawingRevForDb(String(values.drawing_rev_no || '')),
          skip_green_paint: Boolean(values.skip_green_paint),
          remark: String(values.remark || '').trim(),
        }),
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      message.success('已更新划漆要求')
      setEditOpen(false)
      setEditing(null)
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (row: PaintRow) => {
    Modal.confirm({
      title: '确认删除',
      content: `删除图纸号 ${row.drawing_rev_no} 的划漆要求？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/paint-requirements/${row.id}`), { method: 'DELETE' })
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

  const columns: ColumnsType<PaintRow> = [
    {
      title: '图纸号-版本号',
      dataIndex: 'drawing_rev_no',
      width: 240,
      render: (value: string) => <span className={styles.paintDrawingNo}>{value}</span>,
    },
    {
      title: '划漆',
      dataIndex: 'skip_green_paint',
      width: 110,
      render: (value: number) =>
        value ? <Tag color="orange">不划绿漆</Tag> : <Tag color="green">划绿漆</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      ellipsis: true,
      render: (value: string) =>
        value ? (
          <Tooltip title={value}>
            <span>{value}</span>
          </Tooltip>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        ),
    },
    { title: '上传者', dataIndex: 'created_by', width: 100 },
    { title: '上传时间', dataIndex: 'created_at', width: 170 },
    { title: '更改者', dataIndex: 'updated_by', width: 100 },
    { title: '更改时间', dataIndex: 'updated_at', width: 170 },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_v, row) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            编辑
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
                    <li>填写图纸号-版本号，支持 A5E02970605A Rev017 或 A5E02970605A-017。</li>
                    <li>默认划绿漆；需要不划时把滑块拨到右侧「不划绿漆」。</li>
                    <li>可填备注后点「保存」。</li>
                    <li>可用图纸号查询、编辑、删除已有记录。</li>
                    <li>点「操作日志」可按图纸号查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>入库统一为 A5E… Rev… 形；连字符写法会自动转换。</li>
                    <li>滑块在左=划绿漆（默认），拨到右=不划绿漆。</li>
                    <li>同一图纸号-版本号不可重复建档。</li>
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
        title={<Tag color="orange">新增划漆要求</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <Form form={form} layout="vertical" initialValues={{ skip_green_paint: false }}>
          <div className={styles.requiredFieldRow}>
            <div className={styles.queryFieldRow}>
              <Form.Item
                name="drawing_rev_no"
                label="图纸号-版本号"
                rules={[{ required: true, message: '请填写图纸号-版本号' }]}
                extra="支持两种写法，入库统一为 A5E… Rev…"
                style={{ marginBottom: 0, flex: '1 1 320px' }}
              >
                <Input
                  placeholder={DRAWING_HINT}
                  allowClear
                  onBlur={(e) => {
                    const next = normalizeDrawingRevForDb(e.target.value)
                    if (next !== e.target.value) form.setFieldValue('drawing_rev_no', next)
                  }}
                />
              </Form.Item>
              <Form.Item
                name="skip_green_paint"
                label="划漆"
                valuePropName="checked"
                extra="默认划绿漆，拨到右侧为不划绿漆"
                style={{ marginBottom: 0 }}
              >
                <PaintSwitch />
              </Form.Item>
              <Form.Item name="remark" label="备注" style={{ marginBottom: 0, flex: '1 1 240px' }}>
                <Input placeholder="可选备注说明" allowClear />
              </Form.Item>
            </div>
            <Space wrap>
              <Button type="primary" loading={saving} onClick={() => void handleCreate()}>
                保存
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
      <Card
        size="small"
        title={<Tag color="blue">查询与列表</Tag>}
        extra={<span style={{ color: '#64748b', fontSize: 12 }}>共 {rows.length} 条</span>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>图纸号-版本号</div>
              <div className={styles.labeledFieldHint}>两种写法均可，按图纸号筛选当前列表</div>
              <Input
                placeholder={DRAWING_HINT}
                value={queryDrawing}
                onChange={(e) => setQueryDrawing(e.target.value)}
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
                setQueryDrawing('')
                void loadRows('')
              }}
            >
              显示全部
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
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1180 }}
          locale={{ emptyText: '暂无划漆要求，请先在上方新增' }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Modal
        title="编辑划漆要求"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditing(null)
        }}
        onOk={() => void handleUpdate()}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="drawing_rev_no"
            label="图纸号-版本号"
            rules={[{ required: true, message: '请填写图纸号-版本号' }]}
            extra="支持两种写法，入库统一为 A5E… Rev…"
          >
            <Input
              placeholder={DRAWING_HINT}
              onBlur={(e) => {
                const next = normalizeDrawingRevForDb(e.target.value)
                if (next !== e.target.value) editForm.setFieldValue('drawing_rev_no', next)
              }}
            />
          </Form.Item>
          <Form.Item
            name="skip_green_paint"
            label="划漆"
            valuePropName="checked"
            extra="默认划绿漆，拨到右侧为不划绿漆"
          >
            <PaintSwitch />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选备注说明" />
          </Form.Item>
        </Form>
      </Modal>
      <Drawer title="划漆要求操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={860}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>图纸号-版本号</div>
                <div className={styles.labeledFieldHint}>按图纸号筛选操作记录</div>
                <Input
                  placeholder={DRAWING_HINT}
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
              { title: '图纸号-版本号', dataIndex: 'drawing_rev_no', width: 200 },
              {
                title: '变更内容',
                dataIndex: 'change_summary',
                render: (value: string) => formatChangeSummary(value),
              },
            ]}
          />
        </Space>
      </Drawer>
    </div>
  )
}
