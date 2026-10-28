import { useEffect, useState } from 'react'
import { Button, Card, Collapse, Drawer, Input, Modal, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'

type DnInchRow = {
  key: string
  id?: number
  dn_value: string
  inch_value: string
  remark: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type DnInchLogRow = {
  id: number
  row_id?: number
  dn_value: string
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
      return `DN ${fields.dn_value ?? ''} → ${fields.inch_value ?? ''}`
    }
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      const labels: Record<string, string> = {
        dn_value: 'DN值',
        inch_value: '英寸',
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
      const deleted = parsed.fields as { dn_value?: string } | undefined
      return `删除 ${deleted?.dn_value || ''}`
    }
    return raw
  } catch {
    return raw
  }
}

function emptyRow(index: number): DnInchRow {
  return {
    key: `new-${Date.now()}-${index}`,
    dn_value: '',
    inch_value: '',
    remark: '',
  }
}

function fromApi(row: Omit<DnInchRow, 'key'> & { id: number }): DnInchRow {
  return {
    key: String(row.id),
    id: row.id,
    dn_value: row.dn_value || '',
    inch_value: row.inch_value || '',
    remark: row.remark || '',
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || '',
  }
}

export default function DnInchMapPanel() {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<DnInchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [queryDn, setQueryDn] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<DnInchLogRow[]>([])
  const [logDn, setLogDn] = useState('')

  const loadRows = async (dn = queryDn) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dn.trim()) params.set('dn_value', dn.trim())
      const res = await authFetch(apiUrl(`/api/v1/dn-inch-maps?${params.toString()}`))
      const data = await readJson<{ rows?: Array<Omit<DnInchRow, 'key'> & { id: number }>; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows((data.rows || []).map(fromApi))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (dn = logDn) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (dn.trim()) params.set('dn_value', dn.trim())
      const res = await authFetch(apiUrl(`/api/v1/dn-inch-maps/logs?${params.toString()}`))
      const data = await readJson<{ rows?: DnInchLogRow[]; detail?: unknown }>(res)
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

  const updateRow = (key: string, patch: Partial<DnInchRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const handleAppend = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleSave = async () => {
    const payload = rows
      .filter((row) => row.dn_value.trim() || row.inch_value.trim() || row.remark.trim())
      .map((row) => ({
        id: row.id,
        dn_value: row.dn_value,
        inch_value: row.inch_value,
        remark: row.remark,
      }))
    if (!payload.length) {
      message.warning('没有可保存的行，请先点「追加」填写 DN 值与英寸')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/dn-inch-maps/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      })
      const data = await readJson<{
        rows?: Array<Omit<DnInchRow, 'key'> & { id: number }>
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

  const handleDelete = (row: DnInchRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除 ${row.dn_value || '该行'} 与英寸 ${row.inch_value || ''} 的对照？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/dn-inch-maps/${row.id}`), { method: 'DELETE' })
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

  const columns: ColumnsType<DnInchRow> = [
    {
      title: 'No.',
      width: 70,
      render: (_v, _row, index) => index + 1,
    },
    {
      title: 'DN值',
      dataIndex: 'dn_value',
      width: 160,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="DN15"
          onChange={(e) => updateRow(row.key, { dn_value: e.target.value })}
        />
      ),
    },
    {
      title: '英寸',
      dataIndex: 'inch_value',
      width: 160,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder={'1/2"'}
          onChange={(e) => updateRow(row.key, { inch_value: e.target.value })}
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
                    <li>点「追加」新增一行，填写 DN 值与对应英寸。</li>
                    <li>DN 值如 DN15、DN32、DN300；英寸如 1/2”、1 1/4”、12”。</li>
                    <li>可填备注。点「保存」一次性写入本页表格。</li>
                    <li>已保存行可直接改单元格后再点「保存」；右侧「删除」可去掉该行。</li>
                    <li>可用 DN 值查询；「操作日志」可按 DN 值查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>同一 DN 值只能有一条对照。只填数字（如 15）会自动存成 DN15。</li>
                    <li>英寸请带引号，如 1/2”、1 1/4”、12”；中文引号会自动转成 "。</li>
                    <li>空行不会保存。DN 值与英寸均为必填。</li>
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
        title={<Tag color="blue">DN值-英寸对照</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>DN值</div>
              <div className={styles.labeledFieldHint}>如 DN15；也可按英寸关键字筛选</div>
              <Input
                placeholder={'DN15 或 1/2"'}
                value={queryDn}
                onChange={(e) => setQueryDn(e.target.value)}
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
                setQueryDn('')
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
          scroll={{ x: 1280 }}
          locale={{ emptyText: '暂无对照记录，请点「追加」新增一行' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer title="DN值-英寸操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={860}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>DN值</div>
                <div className={styles.labeledFieldHint}>按 DN 值筛选操作记录</div>
                <Input
                  placeholder="DN15"
                  value={logDn}
                  onChange={(e) => setLogDn(e.target.value)}
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
                  setLogDn('')
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
              { title: 'DN值', dataIndex: 'dn_value', width: 120 },
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
