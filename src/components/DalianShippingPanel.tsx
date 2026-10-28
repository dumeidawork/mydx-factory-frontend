import { useMemo, useState } from 'react'
import { Button, Card, Collapse, DatePicker, Form, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import styles from '../pages/WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { authFetch } from '../utils/auth'
import { askSavePath } from '../utils/savePath'
import { message } from '../utils/feedback'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'

type DalianShippingRow = {
  key: string
  id: number
  planned_arrival_date: string
  delivery_date: string
  packing_no: string
  drawing_no: string
  ap1_material_no: string
  r3p_material_no: string
  spec_model: string
  material: string
  quantity: number
  unit_weight: number
  total_weight: number
  order_no: string
  factory_order_no: string
  item_no: string
  unit_price: number | null
  remark: string
  buyer: string
  heat_no: string
  heat_treatment_batch_no: string
  shipping_mark_remark: string
}

const BTN_PRIMARY = { type: 'primary' as const }
const DALIAN_TABLE_SCROLL_Y = 400
const DALIAN_TABLE_SCROLL_X = 2400

function mapDbRowToUi(row: Record<string, unknown>, idx: number): DalianShippingRow {
  return {
    key: `${row.id ?? idx}`,
    id: Number(row.id || 0),
    planned_arrival_date: String(row.planned_arrival_date || ''),
    delivery_date: String(row.delivery_date || ''),
    packing_no: String(row.packing_no || ''),
    drawing_no: String(row.drawing_no || ''),
    ap1_material_no: String(row.ap1_material_no || ''),
    r3p_material_no: String(row.r3p_material_no || ''),
    spec_model: String(row.spec_model || ''),
    material: String(row.material || ''),
    quantity: Number(row.quantity || 0),
    unit_weight: Number(row.unit_weight || 0),
    total_weight: Number(row.total_weight || 0),
    order_no: String(row.order_no || ''),
    factory_order_no: String(row.factory_order_no || ''),
    item_no: String(row.item_no || ''),
    unit_price: row.unit_price == null ? null : Number(row.unit_price),
    remark: String(row.remark || ''),
    buyer: String(row.buyer || ''),
    heat_no: String(row.heat_no || ''),
    heat_treatment_batch_no: String(row.heat_treatment_batch_no || ''),
    shipping_mark_remark: String(row.shipping_mark_remark || ''),
  }
}

function headerDate(planned: Dayjs | null | undefined, delivery: Dayjs | null | undefined): string {
  if (delivery) return delivery.format('YYYYMMDD')
  if (planned) return planned.format('YYYYMMDD')
  return ''
}

export default function DalianShippingPanel() {
  const [form] = Form.useForm()
  const [rows, setRows] = useState<DalianShippingRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveDir, setSaveDir] = useState('')

  const queryDetails = async () => {
    const values = form.getFieldsValue() as {
      planned_arrival_date?: Dayjs | null
      delivery_date?: Dayjs | null
    }
    const planned = values.planned_arrival_date
    const delivery = values.delivery_date
    if (!planned && !delivery) {
      message.warning('请填写预定到货日期或发货日期')
      return
    }
    const params = new URLSearchParams()
    if (planned) params.set('planned_arrival_date', planned.format('YYYY-MM-DD'))
    if (delivery) params.set('delivery_date', delivery.format('YYYYMMDD'))
    setLoading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/workflow/shipping/dalian/details?${params.toString()}`))
      const data = (await res.json().catch(() => ({}))) as { rows?: Record<string, unknown>[]; detail?: unknown }
      if (!res.ok) {
        message.error(typeof data.detail === 'string' ? data.detail : '查询失败')
        return
      }
      setRows((data.rows || []).map(mapDbRowToUi))
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '查询失败')
    } finally {
      setLoading(false)
    }
  }

  const generateMark = async () => {
    if (!rows.length) {
      message.warning('请先查询确认发货明细')
      return
    }
    const values = form.getFieldsValue() as {
      planned_arrival_date?: Dayjs | null
      delivery_date?: Dayjs | null
    }
    const markDate = headerDate(values.planned_arrival_date, values.delivery_date)
    if (!markDate) {
      message.warning('请填写预定到货日期或发货日期')
      return
    }
    const nextSaveDir = await askSavePath('大连唛头生成', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('正在生成唛头，请稍候...', 0)
    try {
      const res = await authFetch(apiUrl('/api/v1/workflow/shipping/dalian/generate_mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rows.map((row) => row.id), header_date: markDate }),
      })
      if (!res.ok) {
        message.error(await readFetchErrorMessage(res))
        return
      }
      const fileName = getDownloadFileName(res, `大连西门子唛头_${markDate}.xlsx`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      notifyWorkbenchUnreadChanged()
      message.success(`大连唛头已生成：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '大连唛头生成失败')
    } finally {
      hide()
      setGenerating(false)
    }
  }

  const columns: ColumnsType<DalianShippingRow> = useMemo(
    () => [
      { title: 'ID', dataIndex: 'id', width: 70, fixed: 'left' },
      { title: '预定到货日期', dataIndex: 'planned_arrival_date', width: 120, fixed: 'left' },
      { title: '发货日期', dataIndex: 'delivery_date', width: 100, fixed: 'left' },
      { title: '包装序号', dataIndex: 'packing_no', width: 90, fixed: 'left' },
      { title: '图纸号', dataIndex: 'drawing_no', width: 120 },
      { title: 'AP1料号', dataIndex: 'ap1_material_no', width: 110 },
      { title: 'R3P物料号', dataIndex: 'r3p_material_no', width: 110 },
      { title: '规格型号', dataIndex: 'spec_model', width: 180 },
      { title: '材质', dataIndex: 'material', width: 90 },
      { title: '数量', dataIndex: 'quantity', width: 80 },
      { title: '单重', dataIndex: 'unit_weight', width: 90 },
      { title: '总重', dataIndex: 'total_weight', width: 90 },
      { title: '订单号', dataIndex: 'order_no', width: 130 },
      { title: '本厂单号', dataIndex: 'factory_order_no', width: 120 },
      { title: '条目', dataIndex: 'item_no', width: 80 },
      { title: '单价', dataIndex: 'unit_price', width: 90, render: (value: number | null) => value ?? '' },
      { title: '备注', dataIndex: 'remark', width: 120 },
      { title: '采购员', dataIndex: 'buyer', width: 90 },
      { title: '炉号', dataIndex: 'heat_no', width: 110 },
      { title: '热处理批号', dataIndex: 'heat_treatment_batch_no', width: 120 },
      { title: '唛头备注', dataIndex: 'shipping_mark_remark', width: 100 },
    ],
    [],
  )

  return (
    <Form form={form} layout="vertical">
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
                    <li>填写预定到货日期或发货日期，点「查询确认」。表格只显示已经保存的发货明细。</li>
                    <li>核对包装序号、数量和唛头备注后，点「大连唛头生成」导出 Excel。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>只填预定到货日期按预定到货日查，只填发货日期按发货日查。两个都填时，满足任一日期的明细都会列出。</li>
                    <li>本页不能改明细。包装序号和实际发货日期在装箱页保存。</li>
                    <li>唛头按当前表格这批明细生成。表头日期优先用发货日期；只填了预定到货日期时，用预定到货日期。</li>
                    <li>生成成功后，这些明细关联的预定进度改为已装箱。已经是已发货的不改。没有预定行关联的旧明细不改进度。</li>
                    <li>相同包装序号必须在表格里连在一起才会合并成一组。查询结果按明细编号从小到大排列。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Card size="small" title="唛头生成" className={styles.sectionCard}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
          <Form.Item name="planned_arrival_date" label="预定到货日期" style={{ marginBottom: 0 }}>
            <DatePicker allowClear />
          </Form.Item>
          <Form.Item name="delivery_date" label="发货日期" style={{ marginBottom: 0 }}>
            <DatePicker format="YYYYMMDD" allowClear />
          </Form.Item>
          <Button {...BTN_PRIMARY} loading={loading} onClick={() => void queryDetails()}>
            查询确认
          </Button>
          <Button {...BTN_PRIMARY} loading={generating} onClick={() => void generateMark()}>
            大连唛头生成
          </Button>
        </div>
        <div style={{ marginBottom: 8, color: '#666' }}>
          按预定到货日期或发货日期查询已保存的发货明细。两个都填时，满足任一日期的明细都会列出。生成唛头后，这些明细关联的预定进度改为已装箱。
        </div>
        <Table
          className={styles.dalianShippingTable}
          rowKey="key"
          size="small"
          tableLayout="fixed"
          scroll={{ x: DALIAN_TABLE_SCROLL_X, y: DALIAN_TABLE_SCROLL_Y }}
          pagination={false}
          loading={loading}
          dataSource={rows}
          columns={columns}
          locale={{ emptyText: '请先查询确认' }}
        />
      </Card>
    </Form>
  )
}
