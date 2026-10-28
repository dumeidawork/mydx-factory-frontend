import { useMemo, useState } from 'react'
import {
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { authFetch } from '../utils/auth'
import { askSavePath } from '../utils/savePath'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import styles from './WorkflowPages.module.css'
import AutoPackingRulesBlock from './AutoPackingRulesBlock'

type PalletOption = {
  value: string
  label: string
  generic?: boolean
  length_mm?: number | null
  width_mm?: number | null
  height_mm?: number | null
  box_weight_kg?: number | null
  pallet_type?: string
}

type PackRow = {
  row_key: string
  id?: number
  item_id?: number
  box_no: number
  pos: number
  material_no: string
  spec: string
  standard: string
  material: string
  dn: string
  flange_type: string
  quantity: number
  unit_weight: number
  qty_per_pallet: number
  qty_source: string
  pallet_name: string
  pallet_type: string
  packing_remark: string
  box_length: number
  box_width: number
  box_height: number
  box_weight: number
  mixed?: boolean
  warnings: string[]
  blocking: string[]
}

type ConfirmInfo = {
  list_id: number
  source_file_name: string
  factory_order_no: string
  customer: string
  departure_date: string
  item_count: number
  merged_qty: number
  map_hit: number
  map_miss: number
  dd_hit: number
  dd_miss: number
  calc_pallets?: number
  customer_pallet_hint?: number
  pallet_count_mismatch?: boolean
  qty_preview?: Array<{ material_no: string; qty_per_pallet: number; qty_source: string; pallet_name: string; has_dd: boolean }>
  lists?: Array<{ id: number; source_file_name: string; updated_at: string }>
}

type LogRow = {
  id: number
  order_no: string
  action: string
  operator_name: string
  operated_at: string
  box_count: number
  row_count: number
  overwrite: number
  change_summary: string
}

const ACTION_LABELS: Record<string, string> = {
  preview: '预览',
  save: '保存',
  submit: '提交',
  overwrite: '覆盖',
  renumber: '重编号',
  export: '导出装箱单',
  delete: '删除',
  copy: '复制',
}

const MATERIAL_COLORS = ['#1677ff', '#d4380d', '#389e0d', '#531dab', '#c41d7f', '#08979c', '#d46b08']

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => (typeof item === 'string' ? item : (item as { msg?: string }).msg || JSON.stringify(item))).join('; ')
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

function colorOf(materialNo: string) {
  let hash = 0
  for (let i = 0; i < materialNo.length; i += 1) hash = (hash * 31 + materialNo.charCodeAt(i)) % 997
  return MATERIAL_COLORS[hash % MATERIAL_COLORS.length]
}

function boxChanged(rows: PackRow[], original: number[]) {
  const current = rows.map((row) => row.box_no)
  return current.some((boxNo, idx) => boxNo !== original[idx])
}

export default function FranceAutoPackingPanel() {
  const [orderNo, setOrderNo] = useState('')
  const [listId, setListId] = useState<number | undefined>()
  const [factoryOrderNo, setFactoryOrderNo] = useState('')
  const [confirm, setConfirm] = useState<ConfirmInfo | null>(null)
  const [rows, setRows] = useState<PackRow[]>([])
  const [originalBoxNos, setOriginalBoxNos] = useState<number[]>([])
  const [palletOptions, setPalletOptions] = useState<PalletOption[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveDir, setSaveDir] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [expandBoxes, setExpandBoxes] = useState<Record<number, boolean>>({})
  const [logOpen, setLogOpen] = useState(false)
  const [logRows, setLogRows] = useState<LogRow[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const [savedBoxes, setSavedBoxes] = useState<number[]>([])

  const updateRow = (key: string, patch: Partial<PackRow>) => {
    setRows((prev) => prev.map((row) => (row.row_key === key ? { ...row, ...patch } : row)))
  }

  const applyPallet = (key: string, palletName: string) => {
    const option = palletOptions.find((item) => item.value === palletName)
    updateRow(key, {
      pallet_name: palletName,
      pallet_type: option?.pallet_type || (option?.generic ? palletName : ''),
      packing_remark: option?.pallet_type || palletName,
      box_length: option?.generic ? 0 : Number(option?.length_mm || 0),
      box_width: option?.generic ? 0 : Number(option?.width_mm || 0),
      box_height: option?.generic ? 0 : Number(option?.height_mm || 0),
      box_weight: option?.generic ? 20 : Number(option?.box_weight_kg || 20),
    })
  }

  const askRenumber = async (current = rows) => {
    if (!boxChanged(current, originalBoxNos)) return false
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '箱号已改动',
        content: '是否整单按当前显示顺序重编为 1..n？',
        okText: '重编号',
        cancelText: '保持现号',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }

  const loadPreview = async (nextListId?: number, forceOverwrite = overwrite) => {
    const key = orderNo.trim()
    if (!key) {
      message.warning('请输入订单号')
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ order_no: key })
      if (nextListId) params.set('list_id', String(nextListId))
      const res = await authFetch(apiUrl(`/api/v1/france-auto-packing/preview?${params.toString()}`))
      const data = await readJson<{
        confirm?: ConfirmInfo
        rows?: PackRow[]
        has_existing_packing?: boolean
        factory_order_no?: string
        pallet_options?: PalletOption[]
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      if (data.has_existing_packing && !forceOverwrite) {
        Modal.confirm({
          title: '已有装箱明细',
          content: '覆盖手动装箱？选「否」则不自动装箱。',
          okText: '覆盖',
          cancelText: '否',
          onOk: () => {
            setOverwrite(true)
            void loadPreview(nextListId, true)
          },
        })
        return
      }
      setConfirm(data.confirm || null)
      setListId(data.confirm?.list_id)
      setFactoryOrderNo(data.factory_order_no || data.confirm?.factory_order_no || '')
      const nextRows = (data.rows || []).map((row) => ({ ...row, warnings: row.warnings || [], blocking: row.blocking || [] }))
      setRows(nextRows)
      setOriginalBoxNos(nextRows.map((row) => row.box_no))
      setSavedBoxes([])
      setPalletOptions(data.pallet_options || [])
      message.success(`已按箱单预览 ${nextRows.length} 行`)
    } finally {
      setLoading(false)
    }
  }

  const markLog = async (action: string, summary: Record<string, unknown>, rowCount = 1) => {
    const key = orderNo.trim()
    if (!key) return
    const res = await authFetch(apiUrl('/api/v1/france-auto-packing/log'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: key,
        list_id: listId,
        action,
        box_count: 1,
        row_count: rowCount,
        change_summary: summary,
      }),
    })
    if (!res.ok) {
      const data = await readJson(res)
      message.error(parseApiDetail(data))
    }
  }

  const persist = async (
    mode: 'save' | 'submit',
    boxNo?: number,
    sourceRows?: PackRow[],
    renumberMode: 'ask' | 'no' = 'ask',
  ) => {
    const current = sourceRows ?? rows
    if (!current.length) {
      message.warning('请先内容确认')
      return false
    }
    const renumber = renumberMode === 'no' ? false : await askRenumber(current)
    const payload = {
      order_no: orderNo.trim(),
      list_id: listId,
      overwrite,
      renumber,
      box_no: boxNo,
      rows: current,
    }
    const url = mode === 'save' ? '/api/v1/france-auto-packing/save-row' : '/api/v1/france-auto-packing/submit'
    const res = await authFetch(apiUrl(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await readJson<{
      rows?: PackRow[]
      detail?: unknown
      saved_box_no?: number
      splits?: Array<{ item_id: number; box_nos: number[] }>
    }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return false
    }
    if (data.rows?.length) {
      const next = data.rows.map((row) => ({ ...row, warnings: row.warnings || [], blocking: row.blocking || [] }))
      setRows(next)
      setOriginalBoxNos(next.map((row) => row.box_no))
    }
    setOverwrite(true)
    if (mode === 'save') {
      const savedNo = Number(data.saved_box_no || boxNo || 0)
      if (savedNo) setSavedBoxes((prev) => (prev.includes(savedNo) ? prev : [...prev, savedNo]))
    } else {
      setSavedBoxes((data.rows || current).map((row) => row.box_no))
    }
    if (data.splits?.length) {
      message.info(`部分条目已分箱，主箱号已回写。分箱：${data.splits.map((item) => item.box_nos.join('/')).join('，')}`)
    }
    message.success(mode === 'save' ? '该箱已保存' : '整单已提交')
    return true
  }

  const saveBox = async (boxNo: number, rowKey: string) => {
    setSavingKey(rowKey)
    try {
      await persist('save', boxNo)
    } finally {
      setSavingKey('')
    }
  }

  const submitAll = async () => {
    setSubmitting(true)
    try {
      await persist('submit')
    } finally {
      setSubmitting(false)
    }
  }

  const copyRow = async (row: PackRow) => {
    const nextBox = rows.reduce((max, item) => Math.max(max, Number(item.box_no || 0)), 0) + 1
    const copied: PackRow = {
      ...row,
      row_key: `copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      id: undefined,
      box_no: nextBox,
      warnings: [...(row.warnings || [])],
      blocking: [...(row.blocking || [])],
    }
    setRows((prev) => {
      const index = prev.findIndex((item) => item.row_key === row.row_key)
      const next = [...prev]
      next.splice(index < 0 ? next.length : index + 1, 0, copied)
      return next
    })
    await markLog('copy', {
      op: 'copy',
      from_box_no: row.box_no,
      box_no: nextBox,
      material_no: row.material_no,
      quantity: row.quantity,
      pos: row.pos,
    })
    message.success('已复制为一箱，可修改箱号、数量后点保存')
  }

  const deleteRow = (row: PackRow) => {
    Modal.confirm({
      title: `删除箱 ${row.box_no} 的 ${row.material_no || '该行'}？`,
      content: '此操作会记入操作日志。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        const nextRows = rows.filter((item) => item.row_key !== row.row_key)
        const remainingBox = nextRows.some((item) => item.box_no === row.box_no)
        const persisted = savedBoxes.includes(row.box_no) || Boolean(row.id)
        if (persisted && remainingBox) {
          await persist('save', row.box_no, nextRows, 'no')
          return
        }
        if (persisted) {
          const res = await authFetch(apiUrl('/api/v1/france-auto-packing/delete-row'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_no: orderNo.trim(),
              list_id: listId,
              box_no: row.box_no,
              packing_id: row.id,
              row_key: row.row_key,
            }),
          })
          const data = await readJson(res)
          if (!res.ok) {
            message.error(parseApiDetail(data))
            return
          }
          setRows(nextRows)
          setSavedBoxes((prev) => prev.filter((boxNo) => boxNo !== row.box_no))
          message.success('已删除')
          return
        }
        setRows(nextRows)
        await markLog('delete', {
          op: 'delete',
          persisted: false,
          box_no: row.box_no,
          material_no: row.material_no,
          quantity: row.quantity,
          pos: row.pos,
        })
        message.success('已删除')
      },
    })
  }

  const generateList = async () => {
    const key = orderNo.trim()
    if (!key) return message.warning('请输入订单号')
    const nextSaveDir = await askSavePath('生成装箱单', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('装箱单文件生成中，请稍候...', 0)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/packing/generate_list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_no: key, factory_order_no: factoryOrderNo }),
      })
      if (!res.ok) return message.error(await readFetchErrorMessage(res))
      const fileName = getDownloadFileName(res, `packing_${key}.xlsx`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      await authFetch(apiUrl('/api/v1/france-auto-packing/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_no: key, list_id: listId, action: 'export', box_count: new Set(rows.map((row) => row.box_no)).size, row_count: rows.length }),
      })
      message.success(`装箱单已生成：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '生成失败')
    } finally {
      hide()
      setGenerating(false)
    }
  }

  const loadLogs = async () => {
    setLogLoading(true)
    try {
      const params = new URLSearchParams()
      if (orderNo.trim()) params.set('order_no', orderNo.trim())
      const res = await authFetch(apiUrl(`/api/v1/france-auto-packing/logs?${params.toString()}`))
      const data = await readJson<{ rows?: LogRow[] }>(res)
      setLogRows(data.rows || [])
    } finally {
      setLogLoading(false)
    }
  }

  const boxes = useMemo(() => {
    const grouped = new Map<number, PackRow[]>()
    rows.forEach((row) => {
      const list = grouped.get(row.box_no) || []
      list.push(row)
      grouped.set(row.box_no, list)
    })
    return [...grouped.entries()].sort((a, b) => a[0] - b[0])
  }, [rows])

  const columns: ColumnsType<PackRow> = [
    {
      title: '操作',
      key: 'op',
      width: 188,
      fixed: 'left',
      render: (_, row) => (
        <Space size={0}>
          <Button size="small" type="link" loading={savingKey === row.row_key} onClick={() => void saveBox(row.box_no, row.row_key)}>
            保存
          </Button>
          <Button size="small" type="link" onClick={() => void copyRow(row)}>
            复制
          </Button>
          <Button size="small" type="link" danger onClick={() => deleteRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
    {
      title: '箱号',
      dataIndex: 'box_no',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={1} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { box_no: Number(next || 0) })} />
      ),
    },
    { title: '条目', dataIndex: 'pos', width: 70 },
    {
      title: '物料',
      dataIndex: 'material_no',
      width: 140,
      render: (value: string) => <span style={{ color: colorOf(value), fontWeight: 600 }}>{value}</span>,
    },
    { title: 'DN', dataIndex: 'dn', width: 80 },
    {
      title: '法兰类型',
      dataIndex: 'flange_type',
      width: 90,
      render: (value: string) => (value ? value : <span className={styles.autoPackBlock}>空</span>),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={1} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { quantity: Number(next || 0) })} />
      ),
    },
    {
      title: '每托',
      dataIndex: 'qty_per_pallet',
      width: 80,
      render: (value: number, row) => (
        <InputNumber
          min={0}
          value={value}
          status={value <= 0 ? 'error' : undefined}
          style={{ width: '100%' }}
          onChange={(next) => updateRow(row.row_key, { qty_per_pallet: Number(next || 0), qty_source: '手填' })}
        />
      ),
    },
    {
      title: '托盘',
      dataIndex: 'pallet_name',
      width: 150,
      render: (value: string, row) => (
        <Select
          value={value || undefined}
          options={palletOptions}
          style={{ width: '100%' }}
          status={!value ? 'error' : undefined}
          onChange={(next) => applyPallet(row.row_key, next)}
        />
      ),
    },
    {
      title: '长',
      dataIndex: 'box_length',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={0} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { box_length: Number(next || 0) })} />
      ),
    },
    {
      title: '宽',
      dataIndex: 'box_width',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={0} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { box_width: Number(next || 0) })} />
      ),
    },
    {
      title: '高',
      dataIndex: 'box_height',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={0} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { box_height: Number(next || 0) })} />
      ),
    },
    {
      title: '箱重',
      dataIndex: 'box_weight',
      width: 80,
      render: (value: number, row) => (
        <InputNumber min={0} value={value} style={{ width: '100%' }} onChange={(next) => updateRow(row.row_key, { box_weight: Number(next || 0) })} />
      ),
    },
    { title: '装箱备注', dataIndex: 'packing_remark', width: 110 },
    { title: '来源', dataIndex: 'qty_source', width: 90 },
    {
      title: '警告',
      dataIndex: 'warnings',
      width: 220,
      render: (_, row) => (
        <Space wrap size={4}>
          {(row.blocking || []).map((item) => (
            <Tag key={item} color="red">
              {item}
            </Tag>
          ))}
          {(row.warnings || []).map((item) => (
            <Tag key={item} color="gold">
              {item}
            </Tag>
          ))}
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
                    <li>输入订单号，点「内容确认」读取法国客户箱单并生成内存分箱预览（此时不写库）。</li>
                    <li>若该单已有装箱明细，会询问是否覆盖手动装箱；选「否」则不自动装箱。</li>
                    <li>同一订单号有多份箱单时，默认取最新一份；可在下拉中换一份再确认。</li>
                    <li>直接改箱号、数量、每托、托盘及长宽高、箱重，就是修改。改完点该行「保存」写入该箱。</li>
                    <li>「复制」在下一行生成新箱，可再改箱号和数量后保存。「删除」去掉该行；已保存的箱会同步删库。</li>
                    <li>点「提交」写入整单；若改过箱号，会先问是否按当前顺序重编为 1..n。</li>
                    <li>提交后再点「生成装箱单」，模板与手动装箱相同。「操作日志」可查看谁在何时做了预览、复制、保存、删除、提交和导出，保存与删除带变更前后内容。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>每托数量优先对照表，其次客户箱单 Unites/Pallets；都没有须手填后才能提交。</li>
                    <li>满托保持对照表偶数；尾箱允许奇数，表格黄字提示。</li>
                    <li>无图纸 D/d 时不做外径/高径约束，托盘与尺寸按对照表或手选。</li>
                    <li>已有手动装箱须确认覆盖后才写入。</li>
                    <li>装箱单 J 列为法兰类型；同 DN 不同法兰类型不得同箱。</li>
                    <li>实际交货日期与离港日分开，法国打包发货确认后按订单号+箱号回写箱单。</li>
                    <li>304+316 重量极少改实木：第一版不自动改托盘，请人工判断。</li>
                  </ul>
                </div>
                <AutoPackingRulesBlock scope="france" />
              </div>
            ),
          },
        ]}
      />
      <Space wrap>
        <Input
          placeholder="订单号"
          value={orderNo}
          onChange={(event) => setOrderNo(event.target.value)}
          style={{ width: 180 }}
          onPressEnter={() => void loadPreview()}
        />
        <Input placeholder="本厂单号" value={factoryOrderNo} disabled style={{ width: 180 }} />
        {confirm?.lists && confirm.lists.length > 1 ? (
          <Select
            style={{ width: 260 }}
            value={listId}
            options={confirm.lists.map((item) => ({ value: item.id, label: item.source_file_name || `#${item.id}` }))}
            onChange={(next) => {
              setListId(next)
              void loadPreview(next, overwrite)
            }}
          />
        ) : null}
        <Button type="primary" loading={loading} onClick={() => void loadPreview()}>
          内容确认
        </Button>
        <Button type="primary" className={styles.qcQueryButton} loading={submitting} onClick={() => void submitAll()}>
          提交
        </Button>
        <Button type="primary" danger loading={generating} onClick={() => void generateList()}>
          生成装箱单
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

      {confirm ? (
        <Collapse
          defaultActiveKey={['confirm']}
          items={[
            {
              key: 'confirm',
              label: '内容确认',
              children: (
                <Descriptions size="small" column={3} bordered>
                  <Descriptions.Item label="箱单文件">{confirm.source_file_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="本厂单号">{confirm.factory_order_no || factoryOrderNo || '-'}</Descriptions.Item>
                  <Descriptions.Item label="客户">{confirm.customer || '-'}</Descriptions.Item>
                  <Descriptions.Item label="离港日（预定）">{confirm.departure_date || '-'}</Descriptions.Item>
                  <Descriptions.Item label="明细行数">{confirm.item_count}</Descriptions.Item>
                  <Descriptions.Item label="合并件数">{confirm.merged_qty}</Descriptions.Item>
                  <Descriptions.Item label="对照表">{`命中 ${confirm.map_hit} / 未命中 ${confirm.map_miss}`}</Descriptions.Item>
                  <Descriptions.Item label="D/d">{`取到 ${confirm.dd_hit} / 未取到 ${confirm.dd_miss}`}</Descriptions.Item>
                  <Descriptions.Item label="托数">
                    {confirm.pallet_count_mismatch ? (
                      <span className={styles.autoPackWarn}>
                        计算 {confirm.calc_pallets}，客户 {confirm.customer_pallet_hint}
                      </span>
                    ) : (
                      confirm.calc_pallets ?? '-'
                    )}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
          ]}
        />
      ) : null}

      <div className={styles.autoPackDiagramWrap}>
        {boxes.map(([boxNo, list]) => {
          const mixed = list.some((row) => row.mixed)
          const total = list.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
          const collapsed = total > 80 && !expandBoxes[boxNo]
          return (
            <div
              key={boxNo}
              className={`${styles.autoPackBox} ${mixed ? styles.autoPackBoxMixed : ''} ${
                list.some((row) => row.row_key === selectedKey) ? styles.autoPackBoxActive : ''
              }`}
              onClick={() => setSelectedKey(list[0]?.row_key || '')}
            >
              <div className={styles.autoPackBoxTitle}>
                箱 {boxNo} · {total} 件{mixed ? ' · 混装' : ''}
              </div>
              <div className={styles.autoPackCircles}>
                {collapsed ? (
                  <button
                    type="button"
                    className={`${styles.autoPackCircle} ${styles.autoPackCircleCollapsed}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setExpandBoxes((prev) => ({ ...prev, [boxNo]: true }))
                    }}
                  >
                    {total}
                  </button>
                ) : (
                  list.flatMap((row) =>
                    Array.from({ length: Math.min(row.quantity, 80) }, (_, idx) => (
                      <span
                        key={`${row.row_key}-${idx}`}
                        className={styles.autoPackCircle}
                        style={{ color: colorOf(row.material_no) }}
                        title={`${row.material_no} 条目${row.pos}`}
                      >
                        {row.pos}
                      </span>
                    ))
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Table
        className={styles.paintTable}
        rowKey="row_key"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 1800, y: 480 }}
        size="small"
        onRow={(row) => ({
          onClick: () => setSelectedKey(row.row_key),
          style: {
            background: row.mixed ? '#fff7e6' : '#f6ffed',
            outline: row.row_key === selectedKey ? '2px solid #1677ff' : undefined,
          },
        })}
      />

      <Drawer title="自动装箱操作日志" open={logOpen} onClose={() => setLogOpen(false)} width={720}>
        <Table
          rowKey="id"
          loading={logLoading}
          dataSource={logRows}
          size="small"
          pagination={false}
          columns={[
            { title: '时间', dataIndex: 'operated_at', width: 170 },
            { title: '动作', dataIndex: 'action', width: 90, render: (value: string) => ACTION_LABELS[value] || value },
            { title: '操作者', dataIndex: 'operator_name', width: 90 },
            { title: '箱数', dataIndex: 'box_count', width: 60 },
            { title: '行数', dataIndex: 'row_count', width: 60 },
            { title: '覆盖', dataIndex: 'overwrite', width: 60, render: (value: number) => (value ? '是' : '') },
            { title: '摘要', dataIndex: 'change_summary' },
          ]}
        />
      </Drawer>
    </Space>
  )
}
