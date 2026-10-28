import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Card, Collapse, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import DalianShippingPanel from '../components/DalianShippingPanel'
import styles from './WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { askSavePath } from '../utils/savePath'
import { message } from '../utils/feedback'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'
import { usePageTitle } from '../layout/usePageTitle'

type BoxRow = { box_no: number; gross_weight: number; delivery_date?: string }
type PresetKey = 'A3' | 'A4' | 'A5' | 'LETTER' | 'LABEL' | 'CUSTOM'

const SIZE_PRESETS: Record<Exclude<PresetKey, 'CUSTOM'>, { label: string; width: number; height: number }> = {
  A3: { label: 'A3 (29.7×42.0)', width: 29.7, height: 42.0 },
  A4: { label: 'A4 (21.0×29.7 默认)', width: 21.0, height: 29.7 },
  A5: { label: 'A5 (14.8×21.0)', width: 14.8, height: 21.0 },
  LETTER: { label: 'Letter美标 (21.59×27.94)', width: 21.59, height: 27.94 },
  LABEL: { label: 'Label热敏标 (10×15)', width: 10, height: 15 },
}

function FranceShippingPanel() {
  const [rows, setRows] = useState<BoxRow[]>([])
  const [selected, setSelected] = useState<(string | number)[]>([])
  const [batchDeliveryDate, setBatchDeliveryDate] = useState<Dayjs | undefined>()
  const [markReady, setMarkReady] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveDir, setSaveDir] = useState('')
  const [title, setTitle] = useState('ZHANGQIU MINGYUAN MACHINERY CO.,LTD')
  const [preset, setPreset] = useState<PresetKey>('A4')
  const [fontSize, setFontSize] = useState<number>(12)
  const [length, setLength] = useState<number>(29.7)
  const [width, setWidth] = useState<number>(21.0)
  const [detailFmt, setDetailFmt] = useState(
    'PO NO.：{{po_no}} Item NO.：{{item_no}} R3P Material NO：{{material_no}}\nSpecifications：{{standard}} {{spec}} Qty/unit：{{qty}} PCS Net weight：{{net_weight}} KG'
  )
  const [form] = Form.useForm()
  const toolbarFieldWidth = 220

  const fetchWithTimeout = async (url: string, options: RequestInit) => fetch(url, options)

  const loadBoxes = async () => {
    const { order_no } = await form.validateFields(['order_no'])
    const res = await fetch(apiUrl(`/api/v1/workflow/shipping/boxes?order_no=${encodeURIComponent(order_no)}`))
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '加载失败')
    const loadedRows: BoxRow[] = data.rows || []
    setRows(loadedRows)
    setSelected(loadedRows.map((r) => r.box_no))
    setBatchDeliveryDate(undefined)
    setMarkReady(false)
  }

  const applyBatchDeliveryDate = (date: Dayjs | null) => {
    setBatchDeliveryDate(date ?? undefined)
    if (!date) return
    const dateStr = date.format('YYYY-MM-DD')
    const selectedSet = new Set(selected)
    setRows((prev) =>
      prev.map((r) => (selectedSet.has(r.box_no) ? { ...r, delivery_date: dateStr } : r))
    )
  }

  const updateDates = async () => {
    const order_no = form.getFieldValue('order_no')
    const res = await fetch(apiUrl('/api/v1/workflow/shipping/update_delivery_dates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no,
        rows: rows.map((r) => ({ box_no: r.box_no, delivery_date: r.delivery_date || '' })),
      }),
    })
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '更新失败')
    message.success(`交货日期已更新${data.updated_count}条`)
  }

  const generate = async () => {
    const order_no = form.getFieldValue('order_no')
    const picked = rows.filter((r) => selected.includes(r.box_no))
    if (!picked.length) return message.warning('请勾选箱号')
    if (picked.some((x) => !x.delivery_date)) return message.error('所选箱号存在未填写交货日期')
    const nextSaveDir = await askSavePath('唛头作成', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('唛头文件生成中，请稍候...', 0)
    try {
      const res = await fetchWithTimeout(apiUrl('/api/v1/workflow/shipping/generate_mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no,
          box_nos: picked.map((x) => x.box_no),
          title,
          detail_format: detailFmt,
          font_size: fontSize,
          length_cm: length,
          width_cm: width,
        }),
      })
      if (!res.ok) return message.error(await readFetchErrorMessage(res))
      const fileName = getDownloadFileName(res, `shipping_${order_no}.docx`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      setMarkReady(true)
      message.success(`唛头作成成功：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(
        error instanceof DOMException
          ? '唛头生成超时，请稍后重试'
          : error instanceof Error
            ? error.message
            : '唛头作成失败'
      )
    } finally {
      hide()
      setGenerating(false)
    }
  }

  const advance = async (target_status: '打包' | '发货') => {
    const order_no = form.getFieldValue('order_no')
    const res = await fetch(apiUrl('/api/v1/workflow/shipping/advance_status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_no, target_status }),
    })
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '状态推进失败')
    message.success(`订单已转入${target_status}`)
  }

  const applyPreset = (key: PresetKey) => {
    setPreset(key)
    if (key === 'CUSTOM') return
    const size = SIZE_PRESETS[key]
    setWidth(size.width)
    setLength(size.height)
  }

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
                    <li>先定纸张、字号、公司抬头和明细格式。默认 A4。改了宽或高会变成自定义尺寸。</li>
                    <li>输入订单号，点「加载装箱箱号」。只列出该订单已经装箱的箱号。</li>
                    <li>勾选要出唛头的箱，填写交货日期，点「确认交货日期」写入装箱明细。</li>
                    <li>点「唛头作成」生成 Word。成功后才能点「转入打包」或「确认发货」。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>勾选的箱必须都有交货日期，否则不能生成唛头。</li>
                    <li>「转入打包」「确认发货」要求该订单每一个箱号都已填写交货日期，并会改该订单明细的状态。</li>
                    <li>确认交货日期会同时回写法国客户箱单上对应箱号的实际交货日期。</li>
                    <li>明细格式里的 {"{{po_no}}"}、{"{{material_no}}"}、{"{{qty}}"} 等会在生成时替换成箱内数据。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Card size="small" title="Step1 唛头版式与内容设计区" className={styles.sectionCard}>
        <Space wrap align="end">
          <div>
            <div>预设规格</div>
            <Select
              style={{ width: 220 }}
              value={preset}
              onChange={(value) => applyPreset(value)}
              options={[
                { value: 'A3', label: SIZE_PRESETS.A3.label },
                { value: 'A4', label: SIZE_PRESETS.A4.label },
                { value: 'A5', label: SIZE_PRESETS.A5.label },
                { value: 'LETTER', label: SIZE_PRESETS.LETTER.label },
                { value: 'LABEL', label: SIZE_PRESETS.LABEL.label },
                { value: 'CUSTOM', label: '自定义' },
              ]}
            />
          </div>
          <div>
            <div>预设字号</div>
            <InputNumber min={1} step={1} value={fontSize} onChange={(v) => setFontSize(Number(v || 12))} />
          </div>
          <div>
            <div>宽度(CM)</div>
            <InputNumber
              min={1}
              step={0.01}
              value={width}
              onChange={(v) => {
                setPreset('CUSTOM')
                setWidth(Number(v || 0))
              }}
            />
          </div>
          <div>
            <div>高度(CM)</div>
            <InputNumber
              min={1}
              step={0.01}
              value={length}
              onChange={(v) => {
                setPreset('CUSTOM')
                setLength(Number(v || 0))
              }}
            />
          </div>
          <Button
            type="primary"
            onClick={() =>
              Modal.confirm({
                title: '修改公司名称',
                content: <Input defaultValue={title} onChange={(e) => setTitle(e.target.value)} />,
              })
            }
          >
            修改公司抬头
          </Button>
          <Button
            type="primary"
            onClick={() =>
              Modal.confirm({
                title: '修改明细格式',
                content: <Input.TextArea rows={4} defaultValue={detailFmt} onChange={(e) => setDetailFmt(e.target.value)} />,
              })
            }
          >
            修改明细格式
          </Button>
          <Button
            type="primary"
            onClick={() => setDetailFmt('PO NO.：{{po_no}} Item NO.：{{item_no}} R3P Material NO：{{material_no}}\nSpecifications：{{standard}} {{spec}} Qty/unit：{{qty}} PCS Net weight：{{net_weight}} KG')}
          >
            重置默认格式
          </Button>
        </Space>
        <div style={{ marginTop: 8, color: '#666' }}>
          预览：{title} | 尺寸 {width} x {length} cm | 字号 {fontSize}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', color: '#666' }}>{detailFmt}</div>
      </Card>

      <Card size="small" title="Step2 打包信息与交货日期维护" className={styles.sectionCard}>
        <div className={styles.toolbarRow}>
          <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}>
            <Input style={{ width: toolbarFieldWidth }} />
          </Form.Item>
          <Button type="primary" onClick={loadBoxes}>
            加载装箱箱号
          </Button>
        </div>
        <div className={styles.toolbarRow}>
          <Form.Item label="交货日期">
            <DatePicker
              style={{ width: toolbarFieldWidth }}
              disabled={!rows.length}
              value={batchDeliveryDate}
              onChange={applyBatchDeliveryDate}
            />
          </Form.Item>
          <Button type="primary" disabled={!rows.length} onClick={updateDates}>
            确认交货日期
          </Button>
        </div>
        <Table
          rowKey="box_no"
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as (string | number)[]) }}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '箱号', dataIndex: 'box_no' },
            { title: '箱重/毛重', dataIndex: 'gross_weight' },
            {
              title: '交货日期',
              dataIndex: 'delivery_date',
              render: (v: string | undefined, row: BoxRow) => (
                <DatePicker
                  value={v ? dayjs(v) : undefined}
                  onChange={(d) => setRows((prev) => prev.map((x) => (x.box_no === row.box_no ? { ...x, delivery_date: d?.format('YYYY-MM-DD') } : x)))}
                />
              ),
            },
          ]}
        />
        <div className={styles.mobileTableHint}>移动端建议横屏选择箱号并维护交货日期。</div>
      </Card>

      <Card size="small" title="Step3 生成与流转控制" className={styles.sectionCard}>
        <Space>
          <Button type="primary" loading={generating} onClick={generate}>
            唛头作成
          </Button>
          <Button type="primary" disabled={!markReady} onClick={() => advance('打包')}>
            转入打包
          </Button>
          <Button type="primary" disabled={!markReady} onClick={() => advance('发货')}>
            确认发货
          </Button>
        </Space>
      </Card>
    </Form>
  )
}

export default function ShippingMarksPage() {
  const { pathname } = useLocation()
  const pageTitle = usePageTitle()
  const isDalian = pathname.endsWith('/dalian')

  return (
    <Card title={pageTitle} className={styles.pageCard}>
      {isDalian ? <DalianShippingPanel /> : <FranceShippingPanel />}
    </Card>
  )
}
