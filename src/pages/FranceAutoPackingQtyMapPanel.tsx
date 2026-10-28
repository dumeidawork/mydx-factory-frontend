import { useEffect, useState } from 'react'
import { Button, Card, Collapse, Drawer, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import styles from './WorkflowPages.module.css'

const GENERIC_PALLETS = ['欧式托盘', '实木托盘'] as const

type PalletArchive = {
  pallet_name: string
  pallet_type: string
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
}

type QtyMapRow = {
  key: string
  id?: number
  material_no: string
  dn_value: string
  qty_per_pallet: number | null
  pallet_type: string
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  remark: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type QtyMapLogRow = {
  id: number
  row_id?: number
  material_no: string
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
  align: '对齐DN',
}

const FIELD_LABELS: Record<string, string> = {
  material_no: '物料号',
  dn_value: 'DN',
  qty_per_pallet: '数量/托',
  pallet_type: '托盘',
  length_mm: '长',
  width_mm: '宽',
  height_mm: '高',
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
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown } | string | number | null> | undefined
    if (parsed.op === 'create' && fields) {
      return `${fields.material_no ?? ''} / ${fields.pallet_type ?? ''}，${fields.qty_per_pallet ?? ''}件/托`
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
      const deleted = parsed.fields as { material_no?: string; pallet_type?: string } | undefined
      return `删除 ${deleted?.material_no || ''} / ${deleted?.pallet_type || ''}`
    }
    return raw
  } catch {
    return raw
  }
}

function emptyRow(index: number): QtyMapRow {
  return {
    key: `new-${Date.now()}-${index}`,
    material_no: '',
    dn_value: '',
    qty_per_pallet: null,
    pallet_type: '欧式托盘',
    length_mm: null,
    width_mm: null,
    height_mm: null,
    remark: '',
  }
}

function fromApi(row: Omit<QtyMapRow, 'key'> & { id: number }): QtyMapRow {
  return {
    key: String(row.id),
    id: row.id,
    material_no: row.material_no || '',
    dn_value: row.dn_value || '',
    qty_per_pallet: row.qty_per_pallet ?? null,
    pallet_type: row.pallet_type || '欧式托盘',
    length_mm: row.length_mm ?? null,
    width_mm: row.width_mm ?? null,
    height_mm: row.height_mm ?? null,
    remark: row.remark || '',
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_by: row.updated_by || '',
    updated_at: row.updated_at || '',
  }
}

export default function FranceAutoPackingQtyMapPanel({
  apiBase = '/api/v1/france-auto-packing-qty-maps',
}: {
  apiBase?: string
}) {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<QtyMapRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [queryMaterialNo, setQueryMaterialNo] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<QtyMapLogRow[]>([])
  const [logMaterialNo, setLogMaterialNo] = useState('')
  const [palletArchives, setPalletArchives] = useState<PalletArchive[]>([])
  const [aligning, setAligning] = useState(false)

  const loadRows = async (materialNo = queryMaterialNo) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (materialNo.trim()) params.set('material_no', materialNo.trim())
      const res = await authFetch(apiUrl(`${apiBase}?${params.toString()}`))
      const data = await readJson<{ rows?: Array<Omit<QtyMapRow, 'key'> & { id: number }>; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows((data.rows || []).map(fromApi))
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (materialNo = logMaterialNo) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (materialNo.trim()) params.set('material_no', materialNo.trim())
      const res = await authFetch(apiUrl(`${apiBase}/logs?${params.toString()}`))
      const data = await readJson<{ rows?: QtyMapLogRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  const loadPallets = async () => {
    const res = await authFetch(apiUrl('/api/v1/pallet-archives'))
    const data = await readJson<{ rows?: PalletArchive[]; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setPalletArchives(data.rows || [])
  }

  useEffect(() => {
    void loadRows('')
    void loadPallets()
  }, [])

  const palletOptions = [
    ...GENERIC_PALLETS.map((name) => ({ value: name, label: name })),
    ...palletArchives
      .filter((item) => item.pallet_name && !GENERIC_PALLETS.includes(item.pallet_name as (typeof GENERIC_PALLETS)[number]))
      .map((item) => ({ value: item.pallet_name, label: item.pallet_name })),
  ]

  const updateRow = (key: string, patch: Partial<QtyMapRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const applyPallet = (key: string, palletName: string) => {
    const generic = (GENERIC_PALLETS as readonly string[]).includes(palletName)
    const archive = palletArchives.find((item) => item.pallet_name === palletName)
    if (generic || !archive) {
      updateRow(key, { pallet_type: palletName, length_mm: null, width_mm: null, height_mm: null })
      return
    }
    updateRow(key, {
      pallet_type: palletName,
      length_mm: archive.length_mm ?? null,
      width_mm: archive.width_mm ?? null,
      height_mm: archive.height_mm ?? null,
    })
  }

  const fillDnFromMaterial = async (row: QtyMapRow, materialNo: string) => {
    const key = materialNo.trim()
    if (!key) return
    const res = await authFetch(apiUrl(`${apiBase}/material-dn?material_no=${encodeURIComponent(key)}`))
    const data = await readJson<{ dn_value?: string; found?: boolean; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    if (data.found && data.dn_value) {
      updateRow(row.key, { dn_value: data.dn_value })
    }
  }

  const handleAppend = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)])
  }

  const isFilledRow = (row: QtyMapRow) =>
    Boolean(
      row.material_no.trim() ||
        row.dn_value.trim() ||
        row.qty_per_pallet != null ||
        row.length_mm != null ||
        row.width_mm != null ||
        row.height_mm != null ||
        row.remark.trim(),
    )

  const toPayloadRow = (row: QtyMapRow) => ({
    id: row.id,
    material_no: row.material_no,
    dn_value: row.dn_value,
    qty_per_pallet: row.qty_per_pallet,
    pallet_type: row.pallet_type,
    length_mm: row.length_mm,
    width_mm: row.width_mm,
    height_mm: row.height_mm,
    remark: row.remark,
  })

  const savePayload = async (payload: ReturnType<typeof toPayloadRow>[]) => {
    if (!payload.length) {
      message.warning('没有可保存的行，请先填写物料号、数量/托与托盘')
      return false
    }
    const res = await authFetch(apiUrl(`${apiBase}/save`), {
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
      return false
    }
    message.success(
      `已保存 ${data.saved_count ?? 0} 条（新增 ${data.inserted_count ?? 0}，更新 ${data.updated_count ?? 0}）`,
    )
    await loadRows()
    return true
  }

  const handleSave = async () => {
    const payload = rows.filter(isFilledRow).map(toPayloadRow)
    setSaving(true)
    try {
      await savePayload(payload)
    } finally {
      setSaving(false)
    }
  }

  const handleAlignDn = async () => {
    setAligning(true)
    try {
      const res = await authFetch(apiUrl(`${apiBase}/align-dn`), { method: 'POST' })
      const data = await readJson<{
        updated_count?: number
        missing_count?: number
        missing_materials?: string[]
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      await loadRows()
      notifyWorkbenchUnreadChanged()
      const updated = data.updated_count ?? 0
      const missing = data.missing_materials || []
      if (!missing.length) {
        message.success(updated ? `已对齐 DN ${updated} 条` : '对照表 DN 已与物料表一致')
        return
      }
      Modal.warning({
        title: updated ? `已对齐 ${updated} 条，仍有 ${missing.length} 个物料号取不到 DN` : `有 ${missing.length} 个物料号取不到 DN`,
        width: 640,
        content: (
          <div>
            <p>请先上传以下物料号的图纸信息/物料信息，再回到本页或工作台点「对齐DN值」批量回填。</p>
            <p>工作台已生成待办提醒。</p>
            <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
              {missing.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        ),
      })
    } finally {
      setAligning(false)
    }
  }

  const handleSaveRow = async (row: QtyMapRow) => {
    if (!isFilledRow(row)) {
      message.warning('请先填写物料号、数量/托与托盘')
      return
    }
    setSavingKey(row.key)
    try {
      await savePayload([toPayloadRow(row)])
    } finally {
      setSavingKey('')
    }
  }

  const handleDelete = (row: QtyMapRow) => {
    if (!row.id) {
      setRows((prev) => prev.filter((item) => item.key !== row.key))
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `删除物料 ${row.material_no || '该行'} / ${row.pallet_type || ''} 的数量/托对照？此操作会记入操作日志。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`${apiBase}/${row.id}`), { method: 'DELETE' })
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

  const columns: ColumnsType<QtyMapRow> = [
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'left',
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
          <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
            删除
          </Button>
        </Space>
      ),
    },
    {
      title: 'No.',
      width: 60,
      render: (_v, _row, index) => index + 1,
    },
    {
      title: '物料号',
      dataIndex: 'material_no',
      width: 160,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="物料号"
          onChange={(e) => updateRow(row.key, { material_no: e.target.value })}
          onBlur={(e) => void fillDnFromMaterial(row, e.target.value)}
          onPressEnter={(e) => void fillDnFromMaterial(row, (e.target as HTMLInputElement).value)}
        />
      ),
    },
    {
      title: 'DN',
      dataIndex: 'dn_value',
      width: 110,
      render: (value: string, row) => (
        <Input
          value={value}
          placeholder="自动带出"
          onChange={(e) => updateRow(row.key, { dn_value: e.target.value })}
        />
      ),
    },
    {
      title: '数量/托',
      dataIndex: 'qty_per_pallet',
      width: 110,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={1}
          precision={0}
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { qty_per_pallet: next ?? null })}
        />
      ),
    },
    {
      title: '托盘',
      dataIndex: 'pallet_type',
      width: 150,
      render: (value: string, row) => {
        const options = palletOptions.some((item) => item.value === value)
          ? palletOptions
          : value
            ? [...palletOptions, { value, label: value }]
            : palletOptions
        return (
          <Select
            value={value || undefined}
            options={options}
            placeholder="选择托盘"
            style={{ width: '100%' }}
            onChange={(next) => applyPallet(row.key, next)}
          />
        )
      },
    },
    {
      title: '长',
      dataIndex: 'length_mm',
      width: 100,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={0}
          precision={0}
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { length_mm: next ?? null })}
        />
      ),
    },
    {
      title: '宽',
      dataIndex: 'width_mm',
      width: 100,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={0}
          precision={0}
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { width_mm: next ?? null })}
        />
      ),
    },
    {
      title: '高',
      dataIndex: 'height_mm',
      width: 100,
      render: (value: number | null, row) => (
        <InputNumber
          value={value}
          min={0}
          precision={0}
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.key, { height_mm: next ?? null })}
        />
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 180,
      render: (value: string, row) => (
        <Input value={value} onChange={(e) => updateRow(row.key, { remark: e.target.value })} />
      ),
    },
    { title: '上传者', dataIndex: 'created_by', width: 100, render: (v?: string) => v || '—' },
    { title: '上传时间', dataIndex: 'created_at', width: 170, render: (v?: string) => v || '—' },
    { title: '更改者', dataIndex: 'updated_by', width: 100, render: (v?: string) => v || '—' },
    { title: '更改时间', dataIndex: 'updated_at', width: 170, render: (v?: string) => v || '—' },
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
                    <li>点「追加」新增一行，填写物料号、数量/托、托盘及长宽高。</li>
                    <li>物料号失焦后，DN 会从物料表自动带出，也可手改。</li>
                    <li>物料后来才建档时，点「对齐DN值」会按物料表重新带出 DN；仍取不到的物料号会发到工作台，上传图纸/物料后再对齐。</li>
                    <li>托盘下拉前两项为「欧式托盘」「实木托盘」（长宽高为空）；其后为托盘建档中的托盘名，选中后自动带出长宽高。</li>
                    <li>已保存行可直接改单元格后，点行首「保存」写入该行，或点工具栏「保存」一次写入本页。</li>
                    <li>可用物料号查询；「操作日志」可查看谁在何时改了什么。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>同一物料号 + 同一托盘只能有一条对照；同一物料可分别维护不同托盘。</li>
                    <li>数量/托必须是大于 0 的整数；长、宽、高为整数，可空，也可在带出后手改。</li>
                    <li>空行不会保存。物料号、数量/托、托盘均为必填。</li>
                    <li>空表时会按《装箱汇总表》预置对照；服务器发版后请执行部署脚本全量灌入。</li>
                    <li>「对齐DN值」按物料表重取 DN；取不到的物料号会出现在工作台，上传图纸/物料后可再对齐（上传时也会自动回填）。</li>
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
        title={<Tag color="blue">物料-数量/托</Tag>}
        extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
        className={styles.sectionCard}
      >
        <div className={styles.queryArea}>
          <div className={styles.queryFieldRow}>
            <div className={styles.labeledField}>
              <div className={styles.labeledFieldName}>物料号</div>
              <div className={styles.labeledFieldHint}>按物料号模糊查询</div>
              <Input
                placeholder="物料号"
                value={queryMaterialNo}
                onChange={(e) => setQueryMaterialNo(e.target.value)}
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
                setQueryMaterialNo('')
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
              type="primary"
              style={{ background: '#0f766e', borderColor: '#0f766e', fontWeight: 600 }}
              loading={aligning}
              onClick={() => void handleAlignDn()}
            >
              对齐DN值
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
          scroll={{ x: 1860 }}
          locale={{ emptyText: '暂无对照记录，请点「追加」新增一行' }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          style={{ marginTop: 12 }}
        />
      </Card>
      <Drawer title="物料-数量/托操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={860}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div className={styles.queryArea}>
            <div className={styles.queryFieldRow}>
              <div className={styles.labeledField}>
                <div className={styles.labeledFieldName}>物料号</div>
                <div className={styles.labeledFieldHint}>按物料号筛选操作记录</div>
                <Input
                  placeholder="物料号"
                  value={logMaterialNo}
                  onChange={(e) => setLogMaterialNo(e.target.value)}
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
                  setLogMaterialNo('')
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
              { title: '物料号', dataIndex: 'material_no', width: 140 },
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
