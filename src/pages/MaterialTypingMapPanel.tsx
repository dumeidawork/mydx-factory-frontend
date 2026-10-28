import { useEffect, useState } from 'react'
import { Button, Card, Collapse, Drawer, Input, Modal, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'

type MaterialTypingRow = {
  key: string
  id?: number
  material_key: string
  typing_material: string
  remark: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type MaterialTypingLogRow = {
  id: number
  row_id?: number
  material_key: string
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

const FIELD_LABELS: Record<string, string> = {
  material_key: '材质',
  typing_material: '打字材质',
  remark: '备注',
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
    if (!fields || typeof fields !== 'object') return raw
    if (parsed.op === 'create') {
      return `${(fields as Record<string, string>).material_key ?? ''} → ${(fields as Record<string, string>).typing_material ?? ''}`
    }
    if (parsed.op === 'delete') {
      return `删除 ${(fields as Record<string, string>).material_key ?? ''}`
    }
    return Object.entries(fields)
      .map(([key, value]) => {
        if (value && typeof value === 'object' && 'before' in value) {
          return `${FIELD_LABELS[key] || key}: ${value.before ?? ''} → ${value.after ?? ''}`
        }
        return `${FIELD_LABELS[key] || key}: ${value ?? ''}`
      })
      .join('；')
  } catch {
    return raw
  }
}

function emptyRow(index: number): MaterialTypingRow {
  return {
    key: `new-${Date.now()}-${index}`,
    material_key: '',
    typing_material: '',
    remark: '',
  }
}

function fromApi(row: Omit<MaterialTypingRow, 'key'> & { id: number }): MaterialTypingRow {
  return {
    key: String(row.id),
    id: row.id,
    material_key: row.material_key || '',
    typing_material: row.typing_material || '',
    remark: row.remark || '',
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || '',
  }
}

export default function MaterialTypingMapPanel() {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<MaterialTypingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [queryKey, setQueryKey] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<MaterialTypingLogRow[]>([])
  const [logKey, setLogKey] = useState('')

  const loadRows = async (key = queryKey) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (key.trim()) params.set('material_key', key.trim())
      const res = await authFetch(apiUrl(`/api/v1/material-typing-maps?${params.toString()}`))
      const data = await readJson<{
        rows?: Array<Omit<MaterialTypingRow, 'key'> & { id: number }>
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows((data.rows || []).map(fromApi))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (key = logKey) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (key.trim()) params.set('material_key', key.trim())
      const res = await authFetch(apiUrl(`/api/v1/material-typing-maps/logs?${params.toString()}`))
      const data = await readJson<{ rows?: MaterialTypingLogRow[]; detail?: unknown }>(res)
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

  const updateRow = (key: string, patch: Partial<MaterialTypingRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const handleAppend = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleSave = async () => {
    const payload = rows
      .filter((row) => row.material_key.trim() || row.typing_material.trim() || row.remark.trim())
      .map((row) => ({
        id: row.id,
        material_key: row.material_key,
        typing_material: row.typing_material,
        remark: row.remark,
      }))
    if (!payload.length) {
      message.warning('没有可保存的行，请先点「追加」填写材质与打字材质')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/material-typing-maps/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      })
      const data = await readJson<{
        inserted_count?: number
        updated_count?: number
        saved_count?: number
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      message.success(
        `已保存 ${data.saved_count ?? 0} 条（新增 ${data.inserted_count ?? 0}，更新 ${data.updated_count ?? 0}）`,
      )
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (row: MaterialTypingRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除 ${row.material_key || '该行'} → ${row.typing_material || ''} 的对照？删除后打字要求里该材质会标粉色。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/material-typing-maps/${row.id}`), { method: 'DELETE' })
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

  const columns: ColumnsType<MaterialTypingRow> = [
    {
      title: 'No.',
      width: 70,
      render: (_v, _row, index) => index + 1,
    },
    {
      title: '材质',
      dataIndex: 'material_key',
      width: 160,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="A105"
          onChange={(e) => updateRow(row.key, { material_key: e.target.value })}
        />
      ),
    },
    {
      title: '打字材质',
      dataIndex: 'typing_material',
      width: 260,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="A105+QT"
          onChange={(e) => updateRow(row.key, { typing_material: e.target.value })}
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
      width: 90,
      fixed: 'right',
      render: (_v, row) => (
        <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
          删除
        </Button>
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
                    <li>点「追加」新增一行，左侧填订单里的材质，右侧填打字用的材质。</li>
                    <li>系统已预置：A105 → A105+QT、304 → A182 F304+AT、316 → A182 F316/F316L+AT。</li>
                    <li>可填备注。点「保存」一次性写入本页表格。</li>
                    <li>已保存行可直接改单元格后再点「保存」；右侧「删除」可去掉该行。</li>
                    <li>可用材质查询；「操作日志」可查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>本表决定「打字要求」里打字内容的材质那一段，改完需回打字要求页重新生成才生效。</li>
                    <li>材质会自动去空格转大写，同一材质只能有一条对照。</li>
                    <li>订单里出现本表没有的材质时，打字要求页会标粉色提示来这里补录。</li>
                    <li>空行不会保存。材质与打字材质均为必填。</li>
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
        title={<Tag color="blue">材质-打字材质对照</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>材质</div>
              <div className={styles.labeledFieldHint}>如 A105；也可按打字材质关键字筛选</div>
              <Input
                placeholder="A105 或 F304"
                value={queryKey}
                onChange={(e) => setQueryKey(e.target.value)}
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
                setQueryKey('')
                void loadRows('')
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
          scroll={{ x: 1380 }}
          locale={{ emptyText: '暂无对照记录，请点「追加」新增一行' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer
        title="材质-打字材质操作日志"
        open={logOpen}
        onClose={() => setLogOpen(false)}
        width={860}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>材质</div>
                <div className={styles.labeledFieldHint}>按材质筛选操作记录</div>
                <Input
                  placeholder="A105"
                  value={logKey}
                  onChange={(e) => setLogKey(e.target.value)}
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
                  setLogKey('')
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
              { title: '材质', dataIndex: 'material_key', width: 120 },
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
