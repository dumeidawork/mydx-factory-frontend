import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Collapse,
  DatePicker,
  Form,
  Input,
  Radio,
  Space,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import styles from './WorkflowPages.module.css'
import './ContractOrdersPage.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { askSavePath } from '../utils/savePath'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { usePageTitle } from '../layout/usePageTitle'

type LicenseItem = {
  line_key: string
  item_no_raw: string
  qty: number
  amount: string
  weight: string
  spec_model: string
  material: string
  material_no: string
  grade: string | null
}

type PreviewData = {
  order_no: string
  source: string
  has_source: boolean
  counts: { A105: number; '304': number; '316': number; unknown: number }
  items: LicenseItem[]
  skipped: LicenseItem[]
  totals: {
    contract_amount: string
    contract_weight: string
    cs_amount: string
    cs_weight: string
    cs_unit_price: string
    ss_amount: string
    ss_weight: string
    ss_unit_price: string
  }
  planned_files: string[]
}

type ArchiveRow = {
  id: number
  customer_name: string
  file_name: string
  version: string
  upload_date: string
  uploaded_by_name: string
  updated_date: string
  updated_by_name: string
  owner_name?: string | null
}

type UserOption = { id: number; name: string; username: string }

function toYmd(d: Dayjs | null | undefined): string {
  if (!d) return ''
  return d.format('YYYYMMDD')
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

export default function LicensePage() {
  const pageTitle = usePageTitle()
  const currentUser = getStoredUser()
  const [orderForm] = Form.useForm()
  const [optionForm] = Form.useForm()
  const [queryForm] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatingBank, setGeneratingBank] = useState(false)
  const [generatingShipping, setGeneratingShipping] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [saveDir, setSaveDir] = useState('')
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [customerOptions, setCustomerOptions] = useState<{ value: string; label: string }[]>([])
  const [archives, setArchives] = useState<ArchiveRow[]>([])
  const [archiveTotal, setArchiveTotal] = useState(0)
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<number[]>([])

  useEffect(() => {
    optionForm.setFieldsValue({
      inspector_name: currentUser?.name || '',
      pad_item_no: true,
      batch_date: dayjs(),
    })
  }, [currentUser?.name, optionForm])

  const loadUsers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/auth/users/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: UserOption[] }>(res)
    if (!res.ok) return
    setUserOptions(data.items || [])
  }, [])

  const loadCustomers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/contract-archives/customers/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: string[] }>(res)
    if (!res.ok) return
    setCustomerOptions((data.items || []).map((name) => ({ value: name, label: name })))
  }, [])

  const loadArchives = useCallback(async () => {
    const values = queryForm.getFieldsValue()
    const qs = new URLSearchParams()
    const map: Record<string, string> = {
      customer_name: values.customer_name || '',
      file_name: values.file_name || '',
      version: values.version || '',
      uploaded_by: values.uploaded_by || '',
      updated_by: values.updated_by || '',
      owner_name: values.owner_name || '',
    }
    Object.entries(map).forEach(([k, v]) => {
      if (v.trim()) qs.set(k, v.trim())
    })
    if (values.upload_date_from) qs.set('upload_date_from', toYmd(values.upload_date_from))
    if (values.upload_date_to) qs.set('upload_date_to', toYmd(values.upload_date_to))
    if (values.updated_date_from) qs.set('updated_date_from', toYmd(values.updated_date_from))
    if (values.updated_date_to) qs.set('updated_date_to', toYmd(values.updated_date_to))
    qs.set('limit', '200')
    const res = await authFetch(apiUrl(`/api/v1/contract-archives?${qs.toString()}`))
    const data = await readJson<{ items?: ArchiveRow[]; total?: number; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setArchives(data.items || [])
    setArchiveTotal(data.total || 0)
  }, [queryForm])

  useEffect(() => {
    void loadUsers()
    void loadCustomers()
    void loadArchives()
  }, [loadArchives, loadCustomers, loadUsers])

  const loadPreview = async () => {
    const { order_no } = await orderForm.validateFields(['order_no'])
    setLoading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/license/preview?order_no=${encodeURIComponent(order_no)}`))
      const data = await readJson<PreviewData & { detail?: unknown }>(res)
      if (!res.ok) {
        setPreview(null)
        message.error(parseApiDetail(data))
        return
      }
      setPreview(data)
      message.success(`已加载 ${data.items.length} 条可生成行`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const generate = async () => {
    const { order_no } = await orderForm.validateFields(['order_no'])
    const options = await optionForm.validateFields()
    const nextSaveDir = await askSavePath('生成许可证文件', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('许可证文件生成中，请稍候...', 0)
    try {
      const res = await authFetch(apiUrl('/api/v1/license/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no,
          inspector_name: String(options.inspector_name || '').trim(),
          pad_item_no: Boolean(options.pad_item_no),
          batch_date: options.batch_date ? options.batch_date.format('YYYY-MM-DD') : undefined,
          archive_ids: selectedArchiveIds,
        }),
      })
      if (!res.ok) {
        message.error(await readFetchErrorMessage(res))
        return
      }
      const fileName = getDownloadFileName(res, `${order_no}许可证.zip`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      message.success(`许可证已生成：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '生成失败')
    } finally {
      hide()
      setGenerating(false)
    }
  }

  const generateBankInvoice = async () => {
    const { order_no } = await orderForm.validateFields(['order_no'])
    const options = await optionForm.validateFields(['transport', 'batch_date'])
    const nextSaveDir = await askSavePath('生成银行发票', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGeneratingBank(true)
    const hide = message.loading('银行发票生成中，请稍候...', 0)
    try {
      const res = await authFetch(apiUrl('/api/v1/license/bank-invoice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no,
          transport: options.transport,
          batch_date: options.batch_date ? options.batch_date.format('YYYY-MM-DD') : undefined,
        }),
      })
      const data = await readJson<{ files?: { file_name: string; content_base64: string }[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      const files = data.files || []
      if (!files.length) {
        message.error('没有可生成的银行发票')
        return
      }
      const savedPaths: string[] = []
      for (const file of files) {
        const binary = atob(file.content_base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        savedPaths.push(await saveGeneratedBlob(blob, file.file_name, nextSaveDir.trim()))
      }
      message.success(`银行发票已生成：${savedPaths.join('；')}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '生成失败')
    } finally {
      hide()
      setGeneratingBank(false)
    }
  }

  const generateShippingDocs = async () => {
    const { order_no } = await orderForm.validateFields(['order_no'])
    const options = await optionForm.validateFields(['transport', 'batch_date'])
    const nextSaveDir = await askSavePath('生成出货资料', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGeneratingShipping(true)
    const hide = message.loading('出货资料生成中，请稍候...', 0)
    try {
      const res = await authFetch(apiUrl('/api/v1/license/shipping-docs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no,
          transport: options.transport,
          batch_date: options.batch_date ? options.batch_date.format('YYYY-MM-DD') : undefined,
        }),
      })
      const data = await readJson<{ files?: { file_name: string; content_base64: string }[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      const files = data.files || []
      if (!files.length) {
        message.error('没有可生成的出货资料')
        return
      }
      const savedPaths: string[] = []
      for (const file of files) {
        const binary = atob(file.content_base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        savedPaths.push(await saveGeneratedBlob(blob, file.file_name, nextSaveDir.trim()))
      }
      message.success(`出货资料已生成：${savedPaths.join('；')}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(error instanceof Error ? error.message : '生成失败')
    } finally {
      hide()
      setGeneratingShipping(false)
    }
  }

  const itemColumns: ColumnsType<LicenseItem> = useMemo(
    () => [
      { title: '材质类', dataIndex: 'grade', width: 80 },
      { title: '条目', dataIndex: 'item_no_raw', width: 80 },
      { title: '规格型号', dataIndex: 'spec_model', ellipsis: true },
      { title: '材质', dataIndex: 'material', width: 120 },
      { title: '物料号', dataIndex: 'material_no', width: 140 },
      { title: '数量', dataIndex: 'qty', width: 70 },
      { title: '含税总价', dataIndex: 'amount', width: 110 },
      { title: '总重', dataIndex: 'weight', width: 100 },
    ],
    [],
  )

  const archiveColumns: ColumnsType<ArchiveRow> = useMemo(
    () => [
      { title: '客户名', dataIndex: 'customer_name', width: 200 },
      { title: '文件名', dataIndex: 'file_name', ellipsis: true },
      { title: '版本号', dataIndex: 'version', width: 90 },
      { title: '业务负责人', dataIndex: 'owner_name', width: 110, render: (v: string | null) => v || '-' },
      { title: '上传时间', dataIndex: 'upload_date', width: 120 },
      { title: '上传者', dataIndex: 'uploaded_by_name', width: 100 },
      { title: '更新时间', dataIndex: 'updated_date', width: 120, render: (v: string | null) => v || '-' },
      { title: '更新者', dataIndex: 'updated_by_name', width: 100, render: (v: string | null) => v || '-' },
    ],
    [],
  )

  return (
    <Card title={pageTitle} className={styles.pageCard}>
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
                    <li>本页只做法国许可证。订单号须以 2 开头；大连订单请走其他模块。</li>
                    <li>输入订单号后点【加载预览】。系统优先取法国客户箱单（PO / 条目 / 数量 / 单重 / 产品单价 / 规格型号 / 材质）；没有箱单时才用订单明细。加载后可核对立项条数、金额重量和拟生成文件名。</li>
                    <li>填写生成选项：【检查责任者】从用户列表选择或手输姓名，写入合格证页眉；【条目】决定合同附件中的条目号是否五位补零；【日期】写入合格证页眉，默认当天，可改。</li>
                    <li>在「客户合同」用与【合同归档】相同的条件查询（客户名、文件名、版本号、业务负责人、上传/更新时间与人员），勾选要随包复制的原件，可多选。复制时保留归档文件名（如 PO2000983138.pdf）。</li>
                    <li>点【生成许可证】，选择本机保存目录。系统写入一份「订单号+许可证.zip」，解压后即为勾选合同、合同附件 xlsx 与质量合格证书 docx。缺某材质类则不会生成该类文件。</li>
                    <li>选空运或海运后点【生成银行发票】，再选保存目录。有碳钢才写「PO订单号 invoice-银行.xlsx」，有不锈钢才写「PO订单号-2 invoice-银行.xlsx」。金额和单价与合同附件相同。运输方式不影响【生成许可证】。</li>
                    <li>选空运或海运后点【生成出货资料】，再选保存目录。须已有该订单的法国客户箱单，且装箱表已有从 1 连续的箱号。空运按碳钢、不锈钢分别写出发票和装箱单；海运写出分材质发票、一份整单装箱单和一份截单数据。没有的材质不写出对应发票。模板上的电子图章会一并带出。日期用本页选择的日期。</li>
                  </ol>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>会生成哪些文件</div>
                  <ul className={styles.opGuideList}>
                    <li>客户合同：仅复制本次勾选的归档原件，不重新排版。</li>
                    <li>合同附件：全部 A105 一份「订单号+合同附件（碳钢）.xlsx」；全部 304+316 合一份「订单号+合同附件（不锈钢）.xlsx」。</li>
                    <li>质量合格证书：A105「订单号+质量合格证书 （碳钢）.docx」（括号前有空格）；304 / 316 各一本「订单号+量合格证书（不锈钢）_304.docx」「订单号+量合格证书（不锈钢）_316.docx」（按客户写法，缺「质」字）。</li>
                    <li>A105 每 6 条一页，304 每 4 条一页，316 每 3 条一页；末页空行保留。规格只填主表「规格型号」，不拼接规格/标准。</li>
                  </ul>
                </div>
                <div className={styles.opGuideBlock}>
                  <div className={styles.opGuideLabel}>注意事项</div>
                  <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
                    <li>许可证与质检完全无关：不要求质检完成，也不使用质检炉号、试验数据或质保书。做许可证不阻断装箱，装箱也不依赖本页是否已生成。</li>
                    <li>整单一次生成，不分批发货。材质按文字归类：含 A105 为碳钢，含 304 / 316 为不锈钢（同时含 316 时按 316）。未归类行只在预览中列出，不进入附件和合格证。</li>
                    <li>合同附件金额 = 产品单价 × 数量，重量 = 单重 × 数量；本文件合计写入 class_*，整单 A105+304+316 合计写入 contract_*。单价 = 向上取整后的 class 金额 ÷ class 重量，四舍五入保留 4 位（仅算单价时对金额向上取整，例如 686.02 → 687）。</li>
                    <li>合格证编号：A105 为订单号 + 1；304 与 316 共用订单号 + 2。化学成分与机械性能按闭区间每行独立随机，首次写入后锁定，同一订单再次生成不会改已有行。</li>
                    <li>请先【加载预览】核对来源（箱单或订单明细）和未归类材质，再生成。只勾选合同、没有任何 A105/304/316 时，zip 里可以只有合同原件。</li>
                    <li>本页生成许可证、银行发票和出货资料，都不改变订单状态。出货资料不是装箱页的车间装箱单。一箱同时有碳钢和不锈钢时会提示先拆箱。产品质保书、原材质保书和高总审核仍不在本页。</li>
                    <li>生成结果是 zip。请解压后再按客户目录归档；浏览器下载时若未弹出目录框，文件会落到浏览器默认下载位置。</li>
                  </ul>
                </div>
              </div>
            ),
          },
        ]}
      />
      <Card size="small" title="订单与生成选项" className={styles.sectionCard}>
        <Form form={orderForm} layout="vertical">
          <div className={styles.toolbarRow}>
            <Form.Item name="order_no" label="订单号" rules={[{ required: true, message: '请输入法国订单号' }]}>
              <Input style={{ width: 220 }} placeholder="以 2 开头" allowClear />
            </Form.Item>
            <Button type="primary" loading={loading} onClick={() => void loadPreview()}>
              加载预览
            </Button>
            {preview ? (
              <Space>
                <Tag color="blue">{preview.source === 'packing' ? '来源：法国客户箱单' : '来源：订单明细'}</Tag>
                <Tag>A105 {preview.counts.A105}</Tag>
                <Tag>304 {preview.counts['304']}</Tag>
                <Tag>316 {preview.counts['316']}</Tag>
                {preview.counts.unknown > 0 ? <Tag color="orange">未归类 {preview.counts.unknown}</Tag> : null}
              </Space>
            ) : null}
          </div>
        </Form>
        <Form form={optionForm} layout="vertical">
          <div className={styles.toolbarRow}>
            <Form.Item name="inspector_name" label="检查责任者">
              <AutoComplete
                style={{ width: 220 }}
                options={userOptions.map((u) => ({ value: u.name, label: `${u.name}（${u.username}）` }))}
                onSearch={(q) => void loadUsers(q)}
                placeholder="选择用户或手输姓名"
                allowClear
                filterOption={false}
              />
            </Form.Item>
            <Form.Item name="pad_item_no" label="条目">
              <Radio.Group
                optionType="button"
                options={[
                  { label: '五位补零', value: true },
                  { label: '不补零', value: false },
                ]}
              />
            </Form.Item>
            <Form.Item name="batch_date" label="日期">
              <DatePicker format="YYYY-MM-DD" allowClear={false} />
            </Form.Item>
            <Form.Item name="transport" label="运输方式" rules={[{ required: true, message: '请选择空运或海运' }]}>
              <Radio.Group
                optionType="button"
                options={[
                  { label: '空运', value: 'air' },
                  { label: '海运', value: 'sea' },
                ]}
              />
            </Form.Item>
            <Button type="primary" loading={generating} onClick={() => void generate()}>
              生成许可证
            </Button>
            <Button type="primary" loading={generatingBank} onClick={() => void generateBankInvoice()}>
              生成银行发票
            </Button>
            <Button type="primary" loading={generatingShipping} onClick={() => void generateShippingDocs()}>
              生成出货资料
            </Button>
          </div>
        </Form>
      </Card>

      <Card size="small" title="客户合同（勾选后随包复制原件）" className={styles.sectionCard}>
        <div className="contract-query-section">
          <div className="contract-query-title">查询条件</div>
          <Form form={queryForm} layout="vertical" className="contract-archive-form">
            <div className="contract-form-row">
              <Form.Item name="customer_name" label="客户名">
                <AutoComplete
                  style={{ width: 280 }}
                  options={customerOptions}
                  onSearch={(q) => void loadCustomers(q)}
                  placeholder="请输入或选择客户名"
                  allowClear
                  filterOption={false}
                />
              </Form.Item>
              <Form.Item name="file_name" label="文件名">
                <Input allowClear style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="version" label="版本号">
                <Input allowClear style={{ width: 120 }} />
              </Form.Item>
              <Form.Item name="owner_name" label="业务负责人">
                <Input allowClear style={{ width: 160 }} />
              </Form.Item>
            </div>
            <div className="contract-form-row contract-form-row--dates">
              <Form.Item label="上传日期">
                <Space>
                  <Form.Item name="upload_date_from" noStyle>
                    <DatePicker format="YYYYMMDD" placeholder="从" />
                  </Form.Item>
                  <span>到</span>
                  <Form.Item name="upload_date_to" noStyle>
                    <DatePicker format="YYYYMMDD" placeholder="到" />
                  </Form.Item>
                </Space>
              </Form.Item>
              <Form.Item name="uploaded_by" label="上传者">
                <Input allowClear style={{ width: 140 }} />
              </Form.Item>
            </div>
            <div className="contract-form-row contract-form-row--dates">
              <Form.Item label="更新日期">
                <Space>
                  <Form.Item name="updated_date_from" noStyle>
                    <DatePicker format="YYYYMMDD" placeholder="从" />
                  </Form.Item>
                  <span>到</span>
                  <Form.Item name="updated_date_to" noStyle>
                    <DatePicker format="YYYYMMDD" placeholder="到" />
                  </Form.Item>
                </Space>
              </Form.Item>
              <Form.Item name="updated_by" label="更新者">
                <Input allowClear style={{ width: 140 }} />
              </Form.Item>
              <Button type="primary" onClick={() => void loadArchives()}>
                查询
              </Button>
              <Tag color="blue" style={{ alignSelf: 'center' }}>
                共 {archiveTotal} 条，已选 {selectedArchiveIds.length} 份
              </Tag>
            </div>
          </Form>
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={archiveColumns}
          dataSource={archives}
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 8, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          rowSelection={{
            selectedRowKeys: selectedArchiveIds,
            onChange: (keys) => setSelectedArchiveIds(keys.map((k) => Number(k))),
          }}
        />
      </Card>

      {preview ? (
        <Card size="small" title="行预览与拟生成文件" className={styles.sectionCard}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Tag>整单金额 {preview.totals.contract_amount}</Tag>
            <Tag>整单重量 {preview.totals.contract_weight}</Tag>
            <Tag>碳钢金额 {preview.totals.cs_amount}</Tag>
            <Tag>碳钢单价 {preview.totals.cs_unit_price || '-'}</Tag>
            <Tag>不锈钢金额 {preview.totals.ss_amount}</Tag>
            <Tag>不锈钢单价 {preview.totals.ss_unit_price || '-'}</Tag>
          </Space>
          <div style={{ marginBottom: 8 }}>
            {preview.planned_files.length
              ? preview.planned_files.map((name) => (
                  <Tag key={name} color="geekblue">
                    {name}
                  </Tag>
                ))
              : <Tag>当前材质不生成附件/合格证，仍可复制勾选合同</Tag>}
          </div>
          <Table
            rowKey="line_key"
            size="small"
            columns={itemColumns}
            dataSource={preview.items}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          />
          {preview.skipped.length ? (
            <>
              <div style={{ margin: '12px 0 8px', fontWeight: 600 }}>未归类材质（不生成许可证文件）</div>
              <Table
                rowKey="line_key"
                size="small"
                columns={itemColumns}
                dataSource={preview.skipped}
                pagination={false}
              />
            </>
          ) : null}
        </Card>
      ) : null}
    </Card>
  )
}
