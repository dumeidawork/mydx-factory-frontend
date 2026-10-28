import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Slider,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'
import { useDatamatrixMatrix } from './qrLabel/datamatrixPreview'
import QrLabelCanvas from './qrLabel/QrLabelCanvas'
import QrLabelPreview from './qrLabel/QrLabelPreview'
import type { CodeSymbology, DataMatrixModule, LabelDesign, LabelModule, PaperKey, PreviewMode, PrintSettings, TextAlign, TextModule } from './qrLabel/model'
import {
  CODE_BODY_SPEC,
  DATAMATRIX_MIN,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  FONT_FAMILIES,
  FONT_MM_MAX,
  FONT_PT_MAX_INT,
  HEIGHT_MAX,
  HEIGHT_MIN,
  PAPER_SIZES_MM,
  PLACEHOLDER_FIELDS,
  QUIET_ZONE_SPEC,
  SAMPLE_VALUES,
  WIDTH_MAX,
  WIDTH_MIN,
  belowCodeSpec,
  clampBorderPx,
  clampFontMm,
  clampModule,
  codeSizeMm,
  createModule,
  emptyDesign,
  fontMmToPt,
  fontPtToMm,
  insertPlaceholder,
  maxFit,
  normalizeDesign,
  normalizeSymbology,
  paperLabel,
  paperSizeMm,
  renderSampleText,
  setCodeAreaSize,
  setCodeBodySize,
  setQuietZone,
  snapFontPt,
  snapMm,
  snapTenth,
  validateDesign,
} from './qrLabel/model'
import canvasStyles from './qrLabel/qrLabel.module.css'

type LogRow = {
  id: number
  row_id?: number
  name: string
  action: string
  operator_name: string
  operated_at: string
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  create: '新建',
  copy: '复制',
  update: '修改',
  delete: '删除',
  render: '出标',
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
    if (parsed.op === 'create') return `新建 ${((parsed.fields as { name?: string }) || {}).name || ''}`
    if (parsed.op === 'copy') return `从 ${parsed.from_name || ''} 复制为新设计`
    if (parsed.op === 'delete') return `删除 ${((parsed.fields as { name?: string }) || {}).name || ''}`
    const fields = parsed.fields as Record<string, { before?: unknown; after?: unknown; before_count?: number; after_count?: number }>
    if (!fields) return raw
    return Object.entries(fields)
      .map(([key, value]) => {
        if (key === 'modules') return `模块数 ${value.before_count ?? ''} → ${value.after_count ?? ''}`
        if (value && 'before' in value) return `${key}: ${JSON.stringify(value.before)} → ${JSON.stringify(value.after)}`
        return key
      })
      .join('；')
  } catch {
    return raw
  }
}

function payloadOf(design: LabelDesign) {
  return {
    name: design.name.trim(),
    width_mm: design.width_mm,
    height_mm: design.height_mm,
    modules: design.modules,
    print: design.print,
  }
}

export default function QrLabelDesignPanel() {
  const currentUser = getStoredUser()
  const [rows, setRows] = useState<LabelDesign[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [mode, setMode] = useState<'list' | 'design'>('list')
  const [design, setDesign] = useState<LabelDesign | null>(null)
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [showGrid, setShowGrid] = useState(true)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('page')
  const [createOpen, setCreateOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copying, setCopying] = useState<LabelDesign | null>(null)
  const [createForm] = Form.useForm()
  const [copyForm] = Form.useForm()
  const [logOpen, setLogOpen] = useState(false)
  const [logLoading, setLogLoading] = useState(false)
  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [logName, setLogName] = useState('')

  const selected = design?.modules.find((m) => m.id === selectedId)
  const dmModule = design?.modules.find((m) => m.type === 'datamatrix')
  const { matrix: barcodeMatrix, payload: dmPayload } = useDatamatrixMatrix(
    dmModule && dmModule.type === 'datamatrix' ? dmModule.content || '' : undefined,
    SAMPLE_VALUES,
    dmModule && dmModule.type === 'datamatrix' ? normalizeSymbology(dmModule.symbology) : undefined,
  )

  const loadRows = async (name = queryName) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (name.trim()) params.set('name', name.trim())
      const res = await authFetch(apiUrl(`/api/v1/qr-label-designs?${params.toString()}`))
      const data = await readJson<{ rows?: LabelDesign[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows(data.rows || [])
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async (name = logName) => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (name.trim()) params.set('name', name.trim())
      const res = await authFetch(apiUrl(`/api/v1/qr-label-designs/logs?${params.toString()}`))
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

  useEffect(() => {
    void loadRows('')
  }, [])

  const patchDesign = (patch: Partial<LabelDesign>) => {
    setDesign((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
  }

  const changeSize = (widthMm: number, heightMm: number) => {
    if (!design) return
    const modules = design.modules.map((mod) => clampModule(mod, widthMm, heightMm))
    const paper = paperSizeMm(design.print.paper, design.print.orientation, design.print.paper_w_mm, design.print.paper_h_mm)
    const maxCols = Math.max(1, maxFit(paper.width, widthMm, design.print.gap_x_mm, design.print.margin_mm))
    const maxRows = Math.max(1, maxFit(paper.height, heightMm, design.print.gap_y_mm, design.print.margin_mm))
    patchDesign({
      width_mm: widthMm,
      height_mm: heightMm,
      modules,
      print: {
        ...design.print,
        cols: Math.min(design.print.cols, maxCols),
        rows: Math.min(design.print.rows, maxRows),
      },
    })
  }

  const changePrint = (patch: Partial<PrintSettings>) => {
    if (!design) return
    const next = { ...design.print, ...patch }
    if (patch.border_width_px != null) next.border_width_px = clampBorderPx(Number(patch.border_width_px))
    const paper = paperSizeMm(next.paper, next.orientation, next.paper_w_mm, next.paper_h_mm)
    const maxCols = Math.max(1, maxFit(paper.width, design.width_mm, next.gap_x_mm, next.margin_mm))
    const maxRows = Math.max(1, maxFit(paper.height, design.height_mm, next.gap_y_mm, next.margin_mm))
    if (next.cols > maxCols) next.cols = maxCols
    if (next.rows > maxRows) next.rows = maxRows
    patchDesign({ print: next })
  }

  const openDesign = (row: LabelDesign) => {
    setDesign(normalizeDesign(row))
    setSelectedId(undefined)
    setDirty(false)
    setPreviewMode('page')
    setMode('design')
  }

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    const draft = emptyDesign(String(values.name).trim(), Number(values.width_mm), Number(values.height_mm))
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/qr-label-designs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadOf(draft)),
      })
      const data = await readJson<{ row?: LabelDesign; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      if (!data.row) return
      setCreateOpen(false)
      createForm.resetFields()
      message.success('已新建，请在画布上放置模块后保存')
      openDesign(data.row)
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    if (!copying?.id) return
    const values = await copyForm.validateFields()
    setSaving(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/qr-label-designs/${copying.id}/copy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(values.name).trim() }),
      })
      const data = await readJson<{ row?: LabelDesign; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      if (!data.row) return
      setCopyOpen(false)
      copyForm.resetFields()
      setCopying(null)
      message.success('已复制')
      openDesign(data.row)
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!design?.id) return
    const error = validateDesign(design)
    if (error) {
      message.error(error)
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/qr-label-designs/${design.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadOf(design)),
      })
      const data = await readJson<{ row?: LabelDesign; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      if (data.row) setDesign(normalizeDesign(data.row))
      setDirty(false)
      message.success('已保存')
      await loadRows()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (row: LabelDesign) => {
    if (!row.id) return
    Modal.confirm({
      title: '确认删除',
      content: `删除标签设计「${row.name}」？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/qr-label-designs/${row.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除')
        if (design?.id === row.id) {
          setMode('list')
          setDesign(null)
        }
        await loadRows()
      },
    })
  }

  const leaveDesigner = () => {
    const go = () => {
      setMode('list')
      setDesign(null)
      setDirty(false)
      void loadRows()
    }
    if (!dirty) {
      go()
      return
    }
    Modal.confirm({
      title: '尚未保存',
      content: '画布有未保存的修改，确定返回列表？',
      okText: '返回',
      onOk: go,
    })
  }

  const addModule = (type: LabelModule['type']) => {
    if (!design) return
    const next = createModule(type, design.width_mm, design.height_mm, design.modules)
    if (typeof next === 'string') {
      message.warning(next)
      return
    }
    patchDesign({ modules: [...design.modules, next] })
    setSelectedId(next.id)
  }

  const updateModule = (next: LabelModule) => {
    if (!design) return
    patchDesign({ modules: design.modules.map((mod) => (mod.id === next.id ? next : mod)) })
  }

  const removeSelected = () => {
    if (!design || !selectedId) return
    patchDesign({ modules: design.modules.filter((mod) => mod.id !== selectedId) })
    setSelectedId(undefined)
  }

  const invalidIds = useMemo(() => {
    if (!design) return []
    return design.modules
      .filter((mod) => {
        if (mod.type !== 'datamatrix') return false
        return belowCodeSpec(mod)
      })
      .map((mod) => mod.id)
  }, [design])

  const paperHint = useMemo(() => {
    if (!design) return ''
    const paper = paperSizeMm(design.print.paper, design.print.orientation, design.print.paper_w_mm, design.print.paper_h_mm)
    const cols = maxFit(paper.width, design.width_mm, design.print.gap_x_mm, design.print.margin_mm)
    const rows = maxFit(paper.height, design.height_mm, design.print.gap_y_mm, design.print.margin_mm)
    return `当前纸张最多横 ${cols} × 竖 ${rows}`
  }, [design])

  const columns: ColumnsType<LabelDesign> = [
    { title: '标签名', dataIndex: 'name', width: 220 },
    {
      title: '尺寸 mm',
      width: 120,
      render: (_v, row) => `${row.width_mm} × ${row.height_mm}`,
    },
    {
      title: '模块',
      width: 100,
      render: (_v, row) => {
        const count = row.modules?.length || 0
        const hasDm = row.modules?.some((mod) => mod.type === 'datamatrix')
        if (!count) return '空'
        return hasDm ? `${count}（有码）` : `${count}（无码）`
      },
    },
    {
      title: '打印纸',
      width: 180,
      render: (_v, row) => (row.print ? paperLabel(row.print) : '—'),
    },
    {
      title: '排版',
      width: 120,
      render: (_v, row) => (row.print ? `横 ${row.print.cols} × 竖 ${row.print.rows}` : '—'),
    },
    { title: '上传者', dataIndex: 'created_by', width: 100, render: (v?: string) => v || '—' },
    { title: '上传时间', dataIndex: 'created_at', width: 170, render: (v?: string) => v || '—' },
    { title: '更改者', dataIndex: 'updated_by', width: 100, render: (v?: string) => v || '—' },
    { title: '更改时间', dataIndex: 'updated_at', width: 170, render: (v?: string) => v || '—' },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_v, row) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openDesign(row)}>
            打开
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setCopying(row)
              copyForm.setFieldsValue({ name: `${row.name}-副本` })
              setCopyOpen(true)
            }}
          >
            复制
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const logColumns: ColumnsType<LogRow> = [
    { title: '时间', dataIndex: 'operated_at', width: 170 },
    {
      title: '操作',
      dataIndex: 'action',
      width: 80,
      render: (v: string) => ACTION_LABELS[v] || v,
    },
    { title: '标签名', dataIndex: 'name', width: 180 },
    { title: '操作人', dataIndex: 'operator_name', width: 100 },
    { title: '变更', dataIndex: 'change_summary', render: (v: string) => formatChangeSummary(v) },
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
                    <li>点「新建」，必须填写标签名，并设定宽 50–80 mm、高 25–40 mm，进入画布。</li>
                    <li>左侧放置打孔器（圆）、二维码生成区域或文本框。码区与 Data Matrix 是同一模块：改码区+净空会算出码体，改码区+码体会算出净空。</li>
                    <li>文本框可插入打字要求明细表头。字号用毫米（可到 0），并可设字体、加粗、斜体、下划线。</li>
                    <li>选中码区可设定扫码内容模板：固定字 + 表头占位符。出标时替换真实明细后再编进 Data Matrix。</li>
                    <li>右侧设打印纸、每页横×竖、间隙；预览在画布下方，可切单枚 / 整页（假数据）。</li>
                    <li>改完点「保存」。列表可查询、复制、删除；操作日志可溯源。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>画布网格 1 mm，移动和缩放吸附 0.5 mm。坐标按毫米存储。</li>
                    <li>规范建议码区 ≥ 20 mm、净空 ≥ 2.5 mm、Data Matrix ≥ 15 mm；低于建议值会标红，仍可保存。一张标签只能有一个码区。</li>
                    <li>整页预览只看排版是否摆得下，不保证和打印机毫米级对齐，也不生成可扫码。</li>
                    <li>标签名唯一。增删改复制都会记操作人和时间。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />

      {mode === 'list' && (
        <Card
          size="small"
          title={<Tag color="blue">二维码标签设计</Tag>}
          extra={<Tag>{currentUser?.name ? `当前操作人：${currentUser.name}` : '未登录'}</Tag>}
          className={styles.sectionCard}
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <Input
              placeholder="按标签名查询"
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              style={{ width: 220 }}
              allowClear
              onPressEnter={() => void loadRows()}
            />
            <Button type="primary" onClick={() => void loadRows()}>
              查询
            </Button>
            <Button
              type="primary"
              onClick={() => {
                createForm.setFieldsValue({ name: '', width_mm: DEFAULT_WIDTH, height_mm: DEFAULT_HEIGHT })
                setCreateOpen(true)
              }}
            >
              新建
            </Button>
            <Button
              onClick={() => {
                setLogOpen(true)
                void loadLogs('')
              }}
            >
              操作日志
            </Button>
          </Space>
          <Table
            rowKey={(row) => String(row.id)}
            size="small"
            loading={loading}
            columns={columns}
            dataSource={rows}
            scroll={{ x: 1400 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            locale={{ emptyText: '还没有标签设计，请点「新建」' }}
          />
        </Card>
      )}

      {mode === 'design' && design && (
        <Card
          size="small"
          title={<Tag color="orange">设计画布：{design.name}</Tag>}
          extra={
            <Space>
              {dirty ? <Tag color="gold">未保存</Tag> : <Tag>已保存</Tag>}
              <Button onClick={leaveDesigner}>返回列表</Button>
              <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                保存
              </Button>
            </Space>
          }
          className={styles.sectionCard}
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <span>标签名</span>
            <Input
              value={design.name}
              onChange={(e) => patchDesign({ name: e.target.value })}
              style={{ width: 220 }}
            />
            <span>宽 mm</span>
            <InputNumber
              min={WIDTH_MIN}
              max={WIDTH_MAX}
              step={0.5}
              value={design.width_mm}
              onChange={(v) => changeSize(snapMm(Number(v || DEFAULT_WIDTH)), design.height_mm)}
            />
            <span>高 mm</span>
            <InputNumber
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              step={0.5}
              value={design.height_mm}
              onChange={(v) => changeSize(design.width_mm, snapMm(Number(v || DEFAULT_HEIGHT)))}
            />
            <span>网格</span>
            <Switch checked={showGrid} onChange={setShowGrid} />
            <span>边框</span>
            <Switch
              checked={Boolean(design.print.border_enabled)}
              onChange={(checked) => changePrint({ border_enabled: checked })}
            />
            {design.print.border_enabled ? (
              <>
                <span>线宽 px</span>
                <InputNumber
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={design.print.border_width_px}
                  onChange={(v) => changePrint({ border_width_px: Number(v || 1) })}
                  style={{ width: 72 }}
                />
              </>
            ) : null}
          </Space>

          <div className={canvasStyles.designer}>
            <Card size="small" title="模块" className={canvasStyles.sideCard}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button block onClick={() => addModule('punch')}>
                  放置打孔器
                </Button>
                <Button block onClick={() => addModule('datamatrix')}>
                  放置二维码生成区域
                </Button>
                <Button block onClick={() => addModule('text')}>
                  放置文本框
                </Button>
                <Button block danger disabled={!selected} onClick={removeSelected}>
                  删除选中模块
                </Button>
                {selected?.type === 'text' && (
                  <>
                    <div>插入打字要求表头</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="选择表头插入占位符"
                      value={null}
                      options={PLACEHOLDER_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
                      onChange={(key) => {
                        const text = selected as TextModule
                        updateModule({ ...text, content: insertPlaceholder(text.content, String(key)) })
                      }}
                    />
                    <Input.TextArea
                      rows={4}
                      value={selected.content}
                      onChange={(e) => updateModule({ ...selected, content: e.target.value })}
                      placeholder="固定字 + {{表头}}"
                    />
                    <div>字号（mm / pt 均可改；pt 按整数调节。建议 ≥ 2 mm ≈ {snapFontPt(fontMmToPt(2))} pt）</div>
                    {selected.font_mm < 1.5 ? (
                      <div style={{ color: '#9a3412', fontSize: 12 }}>当前字号过小，印刷后几乎看不见。</div>
                    ) : null}
                    <div>毫米 mm</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Slider
                        style={{ flex: 1, margin: 0 }}
                        min={0}
                        max={FONT_MM_MAX}
                        step={0.001}
                        value={selected.font_mm}
                        onChange={(v) => updateModule({ ...selected, font_mm: clampFontMm(Number(v)) })}
                      />
                      <InputNumber
                        min={0}
                        max={FONT_MM_MAX}
                        step={0.001}
                        precision={3}
                        value={selected.font_mm}
                        onChange={(v) => updateModule({ ...selected, font_mm: clampFontMm(Number(v ?? 0)) })}
                        style={{ width: 92 }}
                      />
                    </div>
                    <div>磅 pt（整数）</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Slider
                        style={{ flex: 1, margin: 0 }}
                        min={0}
                        max={FONT_PT_MAX_INT}
                        step={1}
                        value={snapFontPt(fontMmToPt(selected.font_mm))}
                        onChange={(v) => updateModule({ ...selected, font_mm: clampFontMm(fontPtToMm(snapFontPt(Number(v)))) })}
                      />
                      <InputNumber
                        min={0}
                        max={FONT_PT_MAX_INT}
                        step={1}
                        precision={0}
                        value={snapFontPt(fontMmToPt(selected.font_mm))}
                        onChange={(v) => updateModule({ ...selected, font_mm: clampFontMm(fontPtToMm(snapFontPt(Number(v ?? 0)))) })}
                        style={{ width: 92 }}
                      />
                    </div>
                    <div>字体</div>
                    <Select
                      value={selected.font_family}
                      style={{ width: '100%' }}
                      options={FONT_FAMILIES}
                      onChange={(font_family) => updateModule({ ...selected, font_family })}
                    />
                    <Space wrap>
                      <Checkbox checked={selected.bold} onChange={(e) => updateModule({ ...selected, bold: e.target.checked })}>
                        加粗
                      </Checkbox>
                      <Checkbox checked={selected.italic} onChange={(e) => updateModule({ ...selected, italic: e.target.checked })}>
                        斜体
                      </Checkbox>
                      <Checkbox checked={selected.underline} onChange={(e) => updateModule({ ...selected, underline: e.target.checked })}>
                        下划线
                      </Checkbox>
                    </Space>
                    <div>对齐</div>
                    <Select
                      value={selected.align}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'left', label: '左' },
                        { value: 'center', label: '中' },
                        { value: 'right', label: '右' },
                      ]}
                      onChange={(align: TextAlign) => updateModule({ ...selected, align })}
                    />
                    <Space>
                      <span>自动换行</span>
                      <Switch checked={selected.wrap} onChange={(wrap) => updateModule({ ...selected, wrap })} />
                    </Space>
                  </>
                )}
                {selected?.type === 'punch' && (
                  <>
                    <div>直径 mm</div>
                    <InputNumber
                      min={3}
                      max={Math.min(design.width_mm, design.height_mm)}
                      step={0.5}
                      value={selected.size_mm}
                      onChange={(v) => updateModule(clampModule({ ...selected, size_mm: snapMm(Number(v || 6)) }, design.width_mm, design.height_mm))}
                    />
                  </>
                )}
                {selected?.type === 'datamatrix' && (
                  <>
                    <div>码区边长 mm</div>
                    <InputNumber
                      min={1}
                      max={Math.min(design.width_mm, design.height_mm)}
                      step={0.5}
                      value={selected.size_mm}
                      onChange={(v) =>
                        updateModule(clampModule(setCodeAreaSize(selected, Number(v || selected.size_mm)), design.width_mm, design.height_mm))
                      }
                    />
                    <div>净空 mm（四周各一边）</div>
                    <InputNumber
                      min={0}
                      max={snapTenth(selected.size_mm / 2)}
                      step={0.1}
                      value={selected.quiet_mm}
                      onChange={(v) => updateModule(setQuietZone(selected, Number(v ?? 0)))}
                    />
                    <div>码体边长 mm（自动/可改）</div>
                    <InputNumber
                      min={0}
                      max={selected.size_mm}
                      step={0.1}
                      value={codeSizeMm(selected)}
                      onChange={(v) => updateModule(setCodeBodySize(selected, Number(v ?? 0)))}
                    />
                    <div>码制</div>
                    <Radio.Group
                      value={normalizeSymbology(selected.symbology)}
                      onChange={(e) => updateModule({ ...selected, symbology: e.target.value as CodeSymbology })}
                    >
                      <Radio value="ecc200">ECC200（32×32）</Radio>
                      <Radio value="qr">旧版 QR</Radio>
                    </Radio.Group>
                    <div style={{ color: '#64748b', fontSize: 12 }}>
                      {normalizeSymbology(selected.symbology) === 'qr'
                        ? '与一线 Excel 同款 QR，微信 / 旧扫码枪可扫。扫码内容模板两种码制共用。'
                        : '西门子规范 Data Matrix ECC200，需支持点阵码的扫码枪或 App。'}
                    </div>
                    <div>扫码内容模板</div>
                    <Select
                      style={{ width: '100%' }}
                      placeholder="选择表头插入占位符"
                      value={null}
                      options={PLACEHOLDER_FIELDS.map((f) => ({ value: f.key, label: f.label }))}
                      onChange={(key) => {
                        const code = selected as DataMatrixModule
                        updateModule({ ...code, content: insertPlaceholder(code.content || '', String(key)) })
                      }}
                    />
                    <Input.TextArea
                      rows={4}
                      value={selected.content || ''}
                      onChange={(e) => updateModule({ ...selected, content: e.target.value })}
                      placeholder="固定字 + {{表头}}，例如 1P{{material_no}}+K{{order_no}}"
                    />
                    <div style={{ color: '#475569', fontSize: 12, wordBreak: 'break-all' }}>
                      扫码将得到：{dmPayload || renderSampleText(selected.content || '') || '（空）'}
                    </div>
                    <div style={{ color: belowCodeSpec(selected) ? '#9a3412' : '#64748b', fontSize: 12 }}>
                      码区 − 净空×2 = 码体。改码区或净空会重算码体；改码体则重算净空。规范建议 {DATAMATRIX_MIN}/{QUIET_ZONE_SPEC}/{CODE_BODY_SPEC} mm
                      {belowCodeSpec(selected) ? '，当前低于建议值。' : '。'}
                      出标时按上面模板替换真实明细后再按所选码制生成。
                    </div>
                  </>
                )}
                {!selected && (
                  <div style={{ color: '#64748b' }}>
                    点画布上的模块可改属性；拖动移动，右下角方块缩放。
                    {design.modules.length === 0 ? ' 当前是空画布，请先添加码区，否则出标没有二维码。' : ''}
                  </div>
                )}
              </Space>
            </Card>

            <div className={canvasStyles.canvasWrap}>
              <QrLabelCanvas
                widthMm={design.width_mm}
                heightMm={design.height_mm}
                modules={design.modules}
                selectedId={selectedId}
                showGrid={showGrid}
                sampleText={false}
                barcodeMatrix={barcodeMatrix}
                interactive
                invalidIds={invalidIds}
                borderEnabled={design.print.border_enabled}
                borderWidthPx={design.print.border_width_px}
                onSelect={setSelectedId}
                onChangeModule={updateModule}
              />
            </div>

            <Card size="small" title="打印设置" className={canvasStyles.sideCard}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>纸张</div>
                <Select
                  value={design.print.paper}
                  style={{ width: '100%' }}
                  options={[
                    ...Object.entries(PAPER_SIZES_MM).map(([value, item]) => ({ value, label: item.label })),
                    { value: 'CUSTOM', label: '自定义' },
                  ]}
                  onChange={(paper: PaperKey) => changePrint({ paper })}
                />
                <div>方向</div>
                <Select
                  value={design.print.orientation}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'portrait', label: '纵向' },
                    { value: 'landscape', label: '横向' },
                  ]}
                  onChange={(orientation: PrintSettings['orientation']) => changePrint({ orientation })}
                />
                {design.print.paper === 'CUSTOM' && (
                  <Space>
                    <InputNumber
                      min={20}
                      step={0.5}
                      value={design.print.paper_w_mm ?? 210}
                      onChange={(v) => changePrint({ paper_w_mm: snapMm(Number(v || 210)) })}
                    />
                    <InputNumber
                      min={20}
                      step={0.5}
                      value={design.print.paper_h_mm ?? 297}
                      onChange={(v) => changePrint({ paper_h_mm: snapMm(Number(v || 297)) })}
                    />
                  </Space>
                )}
                <Space>
                  <span>横</span>
                  <InputNumber min={1} value={design.print.cols} onChange={(v) => changePrint({ cols: Number(v || 1) })} />
                  <span>竖</span>
                  <InputNumber min={1} value={design.print.rows} onChange={(v) => changePrint({ rows: Number(v || 1) })} />
                </Space>
                <Space>
                  <span>横间隙</span>
                  <InputNumber min={0} step={0.5} value={design.print.gap_x_mm} onChange={(v) => changePrint({ gap_x_mm: snapMm(Number(v || 0)) })} />
                </Space>
                <Space>
                  <span>竖间隙</span>
                  <InputNumber min={0} step={0.5} value={design.print.gap_y_mm} onChange={(v) => changePrint({ gap_y_mm: snapMm(Number(v || 0)) })} />
                </Space>
                <Space>
                  <span>页边距</span>
                  <InputNumber min={0} step={0.5} value={design.print.margin_mm} onChange={(v) => changePrint({ margin_mm: snapMm(Number(v || 0)) })} />
                </Space>
                <div style={{ color: '#1d4ed8', fontSize: 12 }}>{paperHint}</div>
              </Space>
            </Card>
          </div>

          <Card
            size="small"
            title="打印预览"
            className={canvasStyles.previewDock}
            extra={
              <Select
                value={previewMode}
                style={{ width: 200 }}
                options={[
                  { value: 'single', label: '单枚预览（假数据）' },
                  { value: 'page', label: '整页预览（假数据）' },
                ]}
                onChange={(v: PreviewMode) => setPreviewMode(v)}
              />
            }
          >
            <QrLabelPreview design={design} mode={previewMode} />
          </Card>
        </Card>
      )}

      <Modal
        title="新建标签设计"
        open={createOpen}
        onOk={() => void handleCreate()}
        confirmLoading={saving}
        onCancel={() => setCreateOpen(false)}
        okText="进入画布"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="标签名" rules={[{ required: true, message: '请输入新建标签名' }]}>
            <Input maxLength={128} placeholder="例如：西门子法兰-70x32" />
          </Form.Item>
          <Form.Item name="width_mm" label="宽度 mm（50–80）" rules={[{ required: true }]}>
            <InputNumber min={WIDTH_MIN} max={WIDTH_MAX} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="height_mm" label="高度 mm（25–40）" rules={[{ required: true }]}>
            <InputNumber min={HEIGHT_MIN} max={HEIGHT_MAX} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`复制「${copying?.name || ''}」`}
        open={copyOpen}
        onOk={() => void handleCopy()}
        confirmLoading={saving}
        onCancel={() => {
          setCopyOpen(false)
          setCopying(null)
        }}
        okText="复制并打开"
      >
        <Form form={copyForm} layout="vertical">
          <Form.Item name="name" label="新标签名" rules={[{ required: true, message: '请输入新标签名' }]}>
            <Input maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="二维码标签设计操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={960}>
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="按标签名筛选"
            value={logName}
            onChange={(e) => setLogName(e.target.value)}
            onPressEnter={() => void loadLogs()}
            allowClear
          />
          <Button onClick={() => void loadLogs()}>查询</Button>
        </Space>
        <Table
          rowKey="id"
          size="small"
          loading={logLoading}
          columns={logColumns}
          dataSource={logRows}
          pagination={{ pageSize: 20 }}
        />
      </Drawer>
    </div>
  )
}
