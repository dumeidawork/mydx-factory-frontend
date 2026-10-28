import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Select, Space, Table, Tag } from 'antd'
import { apiUrl } from '../../utils/api'
import { authFetch } from '../../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../../utils/clientFileSave'
import { message } from '../../utils/feedback'
import { printPdfBlob } from '../../utils/printPdf'
import { askSavePathAndFileName } from '../../utils/savePath'
import { useDatamatrixMatrix } from './datamatrixPreview'
import QrLabelCanvas from './QrLabelCanvas'
import type { LabelDesign } from './model'
import { labelPageCount, normalizeDesign, normalizeSymbology } from './model'

export type LabelSourceRow = {
  key: string
  order_no: string
  factory_order_no?: string
  item_no?: number | null
  drawing_rev_no: string
  material_no: string
  part_name: string
  typing_content: string
  spec: string
  model_standard: string
  qr_spec: string
  heat_no: string
  heat_treatment_batch_no: string
  quantity: number | null
  unit_weight: number | null
  remark: string
}

type Props = {
  open: boolean
  rows: LabelSourceRow[]
  factoryOrderNo?: string
  onClose: () => void
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

function toValues(row: LabelSourceRow, factoryOrderNo: string): Record<string, string> {
  return {
    order_no: row.order_no || '',
    factory_order_no: row.factory_order_no || factoryOrderNo || '',
    item_no: row.item_no == null ? '' : String(row.item_no),
    drawing_rev_no: row.drawing_rev_no || '',
    material_no: row.material_no || '',
    part_name: row.part_name || '',
    typing_content: row.typing_content || '',
    spec: row.spec || '',
    model_standard: row.model_standard || '',
    qr_spec: row.qr_spec || '',
    heat_no: row.heat_no || '',
    heat_treatment_batch_no: row.heat_treatment_batch_no || '',
    quantity: row.quantity == null ? '' : String(row.quantity),
    unit_weight: row.unit_weight == null ? '' : String(row.unit_weight),
    remark: row.remark || '',
  }
}

function toPayloadItem(row: LabelSourceRow, factoryOrderNo: string) {
  return {
    order_no: row.order_no || '',
    factory_order_no: row.factory_order_no || factoryOrderNo || '',
    item_no: row.item_no ?? null,
    drawing_rev_no: row.drawing_rev_no || '',
    material_no: row.material_no || '',
    part_name: row.part_name || '',
    typing_content: row.typing_content || '',
    spec: row.spec || '',
    model_standard: row.model_standard || '',
    qr_spec: row.qr_spec || '',
    heat_no: row.heat_no || '',
    heat_treatment_batch_no: row.heat_treatment_batch_no || '',
    quantity: row.quantity ?? 0,
    unit_weight: row.unit_weight,
    remark: row.remark || '',
  }
}

export default function GenerateLabelDialog({ open, rows, factoryOrderNo = '', onClose }: Props) {
  const [designs, setDesigns] = useState<LabelDesign[]>([])
  const [designId, setDesignId] = useState<number>()
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState<'print' | 'pdf' | null>(null)

  useEffect(() => {
    if (!open) return
    setWorking(null)
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await authFetch(apiUrl('/api/v1/qr-label-designs'))
        const data = await readJson<{ rows?: LabelDesign[]; detail?: unknown }>(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        if (cancelled) return
        const list = (data.rows || []).map(normalizeDesign)
        setDesigns(list)
        setDesignId((prev) => (list.some((item) => item.id === prev) ? prev : list[0]?.id))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open])

  const design = designs.find((item) => item.id === designId)
  const cols = design?.print.cols || 1
  const rowsPerPage = design?.print.rows || 1
  const perPage = cols * rowsPerPage

  const summaries = useMemo(
    () =>
      rows.map((row) => ({
        key: row.key,
        drawing_rev_no: row.drawing_rev_no,
        material_no: row.material_no,
        quantity: row.quantity ?? 0,
        pages: design ? labelPageCount(row.quantity ?? 0, cols, rowsPerPage) : 0,
      })),
    [rows, design, cols, rowsPerPage],
  )

  const totalLabels = summaries.reduce((sum, row) => sum + Math.max(0, row.quantity), 0)
  const totalPages = summaries.reduce((sum, row) => sum + row.pages, 0)
  const previewValues = rows[0] ? toValues(rows[0], factoryOrderNo) : undefined
  const dmModule = design?.modules.find((item) => item.type === 'datamatrix')
  const { matrix: barcodeMatrix } = useDatamatrixMatrix(
    design ? (dmModule && dmModule.type === 'datamatrix' ? dmModule.content || '' : '') : undefined,
    previewValues,
    dmModule && dmModule.type === 'datamatrix' ? normalizeSymbology(dmModule.symbology) : undefined,
  )

  const runRender = async (mode: 'print' | 'pdf') => {
    if (!design?.id) {
      message.warning('请先选择二维码标签模板')
      return
    }
    if (!totalLabels) {
      message.warning('所选明细的数量均为 0，无法生成标签')
      return
    }
    setWorking(mode)
    try {
      const res = await authFetch(apiUrl(`/api/v1/qr-label-designs/${design.id}/render`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: rows.map((row) => toPayloadItem(row, factoryOrderNo)) }),
      })
      if (!res.ok) {
        const data = await readJson(res)
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      if (mode === 'print') {
        await printPdfBlob(blob)
        message.success(`已送打（${totalLabels} 枚 / ${totalPages} 页）`)
        onClose()
        return
      }
      const defaultName = getDownloadFileName(res, `${design.name || '标签'}.pdf`)
      const saveInfo = await askSavePathAndFileName('生成标签 PDF', '', defaultName, {
        forceXlsx: false,
        okText: '确认保存',
      })
      if (!saveInfo) return
      const saved = await saveGeneratedBlob(blob, saveInfo.fileName || defaultName, saveInfo.directoryPath)
      message.success(saved ? `已保存：${saved}` : '已生成 PDF')
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '生成标签失败')
    } finally {
      setWorking(null)
    }
  }

  return (
    <Modal
      title="生成标签"
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={working === 'print'} disabled={!design || !totalLabels} onClick={() => void runRender('print')}>
            直接打印
          </Button>
          <Button type="primary" loading={working === 'pdf'} disabled={!design || !totalLabels} onClick={() => void runRender('pdf')}>
            生成 PDF
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <div style={{ marginBottom: 6, color: '#334155' }}>二维码标签模板</div>
          <Select
            style={{ width: '100%' }}
            loading={loading}
            placeholder={loading ? '正在加载模板…' : '请选择模板'}
            value={designId}
            onChange={(value) => setDesignId(value)}
            options={designs.map((item) => {
              const code = item.modules.find((mod) => mod.type === 'datamatrix')
              const mode =
                code && code.type === 'datamatrix' ? (normalizeSymbology(code.symbology) === 'qr' ? '旧版QR' : 'ECC200') : '无码区'
              return {
                value: item.id,
                label: `${item.name}（${item.width_mm}×${item.height_mm} mm） · ${mode}`,
              }
            })}
            notFoundContent="还没有模板，请先到「二维码标签设计」新建"
          />
        </div>
        {design ? (
          <div style={{ color: '#475569', fontSize: 13 }}>
            排版：横 {cols} × 竖 {rowsPerPage}（每页 {perPage} 枚）。页数 = 数量 ÷ 排版，向上取整。
            本批共 <Tag color="blue">{totalLabels} 枚</Tag>
            <Tag color="purple">{totalPages} 页</Tag>
          </div>
        ) : null}
        {design && !dmModule ? (
          <Alert type="warning" showIcon message="当前模板没有码区，打印出来不会有 Data Matrix。请改选带码区的模板，或先到「二维码标签设计」添加码区。" />
        ) : null}
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={summaries}
          columns={[
            { title: '图纸号', dataIndex: 'drawing_rev_no', ellipsis: true },
            { title: 'R3P物料号', dataIndex: 'material_no', width: 160, ellipsis: true },
            { title: '数量', dataIndex: 'quantity', width: 70 },
            { title: '打印页数', dataIndex: 'pages', width: 90 },
          ]}
        />
        {design && previewValues ? (
          <div>
            <div style={{ marginBottom: 6, color: '#64748b', fontSize: 12 }}>首枚预览（真实明细）</div>
            <QrLabelCanvas
              widthMm={design.width_mm}
              heightMm={design.height_mm}
              modules={design.modules}
              showGrid={false}
              sampleText={false}
              values={previewValues}
              barcodeMatrix={barcodeMatrix}
              interactive={false}
              pxPerMm={5}
              borderEnabled={design.print.border_enabled}
              borderWidthPx={design.print.border_width_px}
            />
          </div>
        ) : null}
      </Space>
    </Modal>
  )
}
