import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Drawer, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Upload, message } from 'antd'
import type { UploadFile } from 'antd/es/upload/interface'
import { PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { getStoredUser } from '../../../utils/auth'
import {
  CASH_NEXT,
  CASH_NEXT_LABEL,
  CASH_STATUS_LABEL,
  canCashAction,
  whDelete,
  whDownload,
  whGet,
  whPost,
  whPostForm,
  whPut,
} from '../warehouseApi'
import DictSelect from '../DictSelect'
import TabGuide from '../TabGuide'

type AuxItem = { id: number; name_spec: string; uom: string; last_unit_price?: number }
type Row = {
  id: number
  po_no: string
  biz_date: string
  supplier_name?: string
  summary?: string
  total_qty?: number
  total_amount?: number
  purchaser_name?: string
  status: string
  pay_type: string
  created_by_name?: string
  can_inbound?: boolean
  already_inbound?: boolean
  inbound_no?: string
  inbound_id?: number
  attachment_count?: number
  linked_item_count?: number
  line_count?: number
}

const cashColor: Record<string, string> = {
  draft: 'default',
  pending_verify: 'processing',
  pending_approve: 'orange',
  pending_pay: 'gold',
  paid: 'green',
  posted: 'success',
  rejected: 'error',
  confirmed: 'blue',
}

export default function AuxPurchaseTab() {
  const roleCode = getStoredUser()?.role_code
  const [mode, setMode] = useState<'monthly' | 'cash'>('monthly')
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<AuxItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [form] = Form.useForm()
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detailAtts, setDetailAtts] = useState<{ id: number; file_name: string; file_size?: number }[]>([])
  const [inboundPo, setInboundPo] = useState<Row | null>(null)
  const [inboundForm] = Form.useForm()
  const [editPo, setEditPo] = useState<Row | null>(null)
  const [editForm] = Form.useForm()
  const [receiptKw, setReceiptKw] = useState('')
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receipts, setReceipts] = useState<{ kind?: string; id?: number; file_name: string; archived_ym?: string; title?: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>(`/aux/purchases?pay_type=${mode}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void whGet<{ items: AuxItem[] }>('/aux/balances').then((d) => setItems(d.items || [])).catch(() => undefined)
  }, [])

  const createPo = async () => {
    const v = await form.validateFields()
    const item = items.find((x) => x.id === v.item_id)
    try {
      const res = await whPost<{ item: Row; price_warnings?: { title: string }[] }>('/aux/purchases', {
        pay_type: mode,
        biz_date: v.biz_date,
        supplier_name: v.supplier_name,
        purchaser_name: v.purchaser_name || v.applicant,
        lines: [
          {
            item_id: v.item_id || null,
            name_spec: v.summary || item?.name_spec || v.name_spec,
            uom: v.uom || item?.uom || '个',
            qty: v.qty || 1,
            unit_price: v.unit_price ?? 0,
          },
        ],
      })
      const poId = res.item?.id
      if (mode === 'cash' && poId && fileList.length) {
        for (const f of fileList) {
          if (!f.originFileObj) continue
          const fd = new FormData()
          fd.append('file', f.originFileObj)
          await whPostForm(`/aux/purchases/${poId}/attachments`, fd)
        }
      }
      if (res.price_warnings?.length) {
        message.warning(res.price_warnings.map((w) => w.title).join('；'))
      } else {
        message.success('采购单已创建')
      }
      setOpen(false)
      form.resetFields()
      setFileList([])
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  const advance = async (id: number, to_status: string) => {
    try {
      await whPost(`/aux/purchases/${id}/advance`, { to_status })
      message.success(`状态已更新为「${CASH_STATUS_LABEL[to_status] || to_status}」`)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const reject = async (id: number) => {
    try {
      await whPost(`/aux/purchases/${id}/reject`, { comment: '驳回' })
      message.success('已驳回上一状态')
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '驳回失败')
    }
  }

  const openDetail = async (id: number) => {
    setDetailId(id)
    try {
      const data = await whGet<{ attachments: { id: number; file_name: string; file_size?: number }[] }>(
        `/aux/purchases/${id}`,
      )
      setDetailAtts(data.attachments || [])
    } catch {
      setDetailAtts([])
    }
  }

  const uploadMore = async (file: File) => {
    if (!detailId) return false
    try {
      const fd = new FormData()
      fd.append('file', file)
      await whPostForm(`/aux/purchases/${detailId}/attachments`, fd)
      message.success('附件已上传')
      await openDetail(detailId)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '上传失败')
    }
    return false
  }

  const doInbound = async () => {
    if (!inboundPo) return
    const v = await inboundForm.validateFields()
    try {
      await whPost(`/aux/purchases/${inboundPo.id}/inbound`, {
        biz_date: v.biz_date,
        location_id: v.location_id,
        operator_name: v.operator_name,
      })
      message.success('已生成入库单并增加库存')
      setInboundPo(null)
      inboundForm.resetFields()
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '入库失败')
    }
  }

  const pendingCount = rows.filter((r) => ['pending_verify', 'pending_approve', 'pending_pay'].includes(r.status)).length

  return (
    <div>
      <TabGuide
        title="采购管理 · 操作说明"
        steps={[
          '用上方切换「月结采购 / 现金采购」。新建时尽量选择库存台账已建档的「辅料主数据」，否则不能从本页入库。',
          '月结：保存即为已确认。货到后点「入库」，确认日期和货架，系统才加库存。列表会显示入库单号，可到「入库登记」核对。',
          '现金：新建时可先选收据；点「查看」可继续上传。按 提交核实 → 核实通过 → 审批通过 → 确认付款 → 入账。提交核实前至少 1 张收据。',
          '草稿可「编辑/删除」；已确认未入库可「作废」；已入库须先到入库登记作废入库单。工具栏「查收据」按文件名/申请人/摘要模糊查询。',
        ]}
        methods={[
          '角色：任意登录人可建单、提交核实；核实=库管；审批=总经理/超管；付款=库管或财务。无权限时按钮不显示。',
          '收据：jpg/png/pdf，单文件不超过 10MB，最多 5 张。新文件按「日期-申请人-摘要-数量」命名，落在 receipts/年月/。每月 15 日起把上上月打成 zip，已归档月份只能下载压缩包。',
          '本次单价高于该物料历史最高价 10% 时会提示并写入页头预警，不拦单。无历史价不预警。',
        ]}
        notes={[
          '同一采购单同时只能有一张有效入库单；作废入库后可再次入库。现金「入账」不会自动加库存，实物验收后仍要点「入库」。',
          '确认付款后会自动在「现金账本」记一笔花费（只能改备注、不能作废该行），请勿再到账本里手工重复登记。已付款不可驳回。',
          '只填品名、不选主数据的单据请到「入库登记」手工入库，或先回库存台账建档。',
        ]}
      />
      <div className="wh-toolbar">
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as 'monthly' | 'cash')}
          options={[
            { label: '月结采购', value: 'monthly' },
            {
              label: (
                <span>
                  现金采购 <Badge count={pendingCount} size="small" />
                </span>
              ),
              value: 'cash',
            },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <Input.Search
          allowClear
          placeholder="收据关键词"
          style={{ width: 180 }}
          onSearch={(v) => {
            setReceiptKw(v)
            setReceiptOpen(true)
            void whGet<{ items: { kind?: string; id?: number; file_name: string; archived_ym?: string; title?: string }[] }>(
              `/aux/receipts?keyword=${encodeURIComponent(v)}`,
            )
              .then((d) => setReceipts(d.items || []))
              .catch((e) => message.error(e instanceof Error ? e.message : '查询失败'))
          }}
        />
        <Button
          icon={<SearchOutlined />}
          onClick={() => {
            setReceiptOpen(true)
            void whGet<{ items: { kind?: string; id?: number; file_name: string; archived_ym?: string; title?: string }[] }>(
              `/aux/receipts?keyword=${encodeURIComponent(receiptKw)}`,
            )
              .then((d) => setReceipts(d.items || []))
              .catch((e) => message.error(e instanceof Error ? e.message : '查询失败'))
          }}
        >
          查收据
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          {mode === 'monthly' ? '新建月结采购' : '新建现金采购'}
        </Button>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '单号', dataIndex: 'po_no', width: 160 },
          { title: '日期', dataIndex: 'biz_date', width: 110 },
          ...(mode === 'monthly'
            ? [
                { title: '供应商', dataIndex: 'supplier_name', width: 90 },
                { title: '物品摘要', dataIndex: 'summary' },
                { title: '数量', dataIndex: 'total_qty', width: 70 },
                { title: '金额(元)', dataIndex: 'total_amount', width: 90 },
                { title: '采购人', dataIndex: 'purchaser_name', width: 90 },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (s: string) => <Tag>{CASH_STATUS_LABEL[s] || s}</Tag>,
                },
              ]
            : [
                { title: '申请人', dataIndex: 'purchaser_name', width: 90 },
                { title: '摘要', dataIndex: 'summary' },
                { title: '金额(元)', dataIndex: 'total_amount', width: 90 },
                {
                  title: '附件',
                  dataIndex: 'attachment_count',
                  width: 60,
                  render: (n: number) => n || 0,
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 100,
                  render: (s: string) => <Tag color={cashColor[s] || 'default'}>{CASH_STATUS_LABEL[s] || s}</Tag>,
                },
              ]),
          { title: '录入人', dataIndex: 'created_by_name', width: 80 },
          {
            title: '操作',
            width: mode === 'cash' ? 280 : 200,
            render: (_: unknown, r: Row) => (
              <Space size={0} wrap>
                <Button type="link" size="small" onClick={() => void openDetail(r.id)}>
                  查看
                </Button>
                {r.status === 'draft' ? (
                  <>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        setEditPo(r)
                        editForm.setFieldsValue({
                          biz_date: r.biz_date,
                          supplier_name: r.supplier_name,
                          purchaser_name: r.purchaser_name,
                          summary: r.summary,
                        })
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        Modal.confirm({
                          title: `删除草稿 ${r.po_no}？`,
                          onOk: async () => {
                            await whDelete(`/aux/purchases/${r.id}`)
                            message.success('已删除')
                            await load()
                          },
                        })
                      }}
                    >
                      删除
                    </Button>
                  </>
                ) : r.status !== 'voided' && !r.already_inbound ? (
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: `作废采购单 ${r.po_no}？`,
                        content: '未入库的已确认单据可作废；已入库须先作废入库单。',
                        onOk: async () => {
                          await whPost(`/aux/purchases/${r.id}/void`, {})
                          message.success('已作废')
                          await load()
                        },
                      })
                    }}
                  >
                    作废
                  </Button>
                ) : null}
                {mode === 'cash' ? (
                  <>
                    {CASH_NEXT[r.status] && canCashAction(r.status, roleCode) ? (
                      <Button type="link" size="small" onClick={() => void advance(r.id, CASH_NEXT[r.status])}>
                        {CASH_NEXT_LABEL[CASH_NEXT[r.status]] || '推进'}
                      </Button>
                    ) : null}
                    {['pending_verify', 'pending_approve', 'pending_pay'].includes(r.status) &&
                    canCashAction(r.status, roleCode) ? (
                      <Button type="link" size="small" danger onClick={() => void reject(r.id)}>
                        驳回
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {r.can_inbound ? (
                  <Button type="link" size="small" onClick={() => setInboundPo(r)}>
                    入库
                  </Button>
                ) : r.already_inbound ? (
                  <Tag color="blue">{r.inbound_no || '已入库'}</Tag>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={mode === 'monthly' ? '新建月结采购' : '新建现金采购'}
        open={open}
        onCancel={() => {
          setOpen(false)
          setFileList([])
        }}
        onOk={() => void createPo()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ biz_date: new Date().toISOString().slice(0, 10), qty: 1, unit_price: 0, uom: '个' }}
        >
          <Form.Item name="biz_date" label="日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          {mode === 'monthly' ? (
            <>
              <Form.Item name="supplier_name" label="供应商" rules={[{ required: true }]}>
                <Input placeholder="如 鑫淼" />
              </Form.Item>
              <Form.Item name="purchaser_name" label="采购人">
                <Input />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="applicant" label="申请人" rules={[{ required: true }]}>
              <Input placeholder="车间主任姓名" />
            </Form.Item>
          )}
          <Form.Item name="item_id" label="辅料主数据（可选，入库必填）">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={items.map((i) => ({ value: i.id, label: i.name_spec }))}
              onChange={(id) => {
                const it = items.find((x) => x.id === id)
                if (it) {
                  form.setFieldsValue({
                    summary: it.name_spec,
                    uom: it.uom,
                    unit_price: it.last_unit_price || 0,
                  })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="summary" label="物品摘要" rules={[{ required: true }]}>
            <Input placeholder="品名规格" />
          </Form.Item>
          <Form.Item name="uom" label="单位">
            <Input />
          </Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit_price" label={mode === 'cash' ? '单价/金额' : '单价'} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {mode === 'cash' && (
            <Form.Item label="收据/二联单（jpg/png/pdf，最多 5 张）">
              <Upload
                beforeUpload={() => false}
                fileList={fileList}
                onChange={({ fileList: fl }) => setFileList(fl.slice(0, 5))}
                maxCount={5}
                accept=".jpg,.jpeg,.png,.pdf"
              >
                <Button icon={<UploadOutlined />}>选择文件</Button>
              </Upload>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer title="采购附件" open={detailId != null} onClose={() => setDetailId(null)} width={420}>
        <Upload
          beforeUpload={(f) => {
            void uploadMore(f)
            return false
          }}
          showUploadList={false}
          accept=".jpg,.jpeg,.png,.pdf"
        >
          <Button icon={<UploadOutlined />} style={{ marginBottom: 12 }}>
            继续上传
          </Button>
        </Upload>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={detailAtts}
          columns={[
            { title: '文件', dataIndex: 'file_name' },
            {
              title: '操作',
              width: 80,
              render: (_: unknown, a: { id: number; file_name: string }) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    void whDownload(`/aux/attachments/${a.id}/file`, a.file_name || 'attachment')
                  }}
                >
                  下载
                </Button>
              ),
            },
          ]}
        />
      </Drawer>

      <Modal
        title={`入库 ${inboundPo?.po_no || ''}`}
        open={!!inboundPo}
        onCancel={() => setInboundPo(null)}
        onOk={() => void doInbound()}
        destroyOnClose
      >
        <Form
          form={inboundForm}
          layout="vertical"
          initialValues={{ biz_date: new Date().toISOString().slice(0, 10) }}
        >
          <Form.Item name="biz_date" label="入库日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="location_id" label="货架（可空，默认物料货架）">
            <DictSelect kind="location" />
          </Form.Item>
          <Form.Item name="operator_name" label="经办人">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`编辑草稿 ${editPo?.po_no || ''}`}
        open={!!editPo}
        onCancel={() => setEditPo(null)}
        onOk={() => {
          void (async () => {
            if (!editPo) return
            const v = await editForm.validateFields()
            try {
              await whPut(`/aux/purchases/${editPo.id}`, {
                biz_date: v.biz_date,
                supplier_name: v.supplier_name,
                purchaser_name: v.purchaser_name,
                remark: v.remark,
              })
              message.success('草稿已保存')
              setEditPo(null)
              await load()
            } catch (e) {
              message.error(e instanceof Error ? e.message : '保存失败')
            }
          })()
        }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="biz_date" label="日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="supplier_name" label="供应商">
            <Input />
          </Form.Item>
          <Form.Item name="purchaser_name" label="采购人/申请人">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="查收据" open={receiptOpen} onClose={() => setReceiptOpen(false)} width={480}>
        <Table
          rowKey={(r, i) => String(r.id || r.archived_ym || i)}
          size="small"
          pagination={false}
          dataSource={receipts}
          columns={[
            {
              title: '文件',
              render: (_, r) => r.title || r.file_name,
            },
            {
              title: '操作',
              width: 90,
              render: (_, r) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    if (r.kind === 'zip' && r.archived_ym) {
                      void whDownload(`/aux/receipts/archives/${r.archived_ym}/file`, `${r.archived_ym}.zip`)
                    } else if (r.id) {
                      void whDownload(`/aux/attachments/${r.id}/file`, r.file_name || 'receipt')
                    }
                  }}
                >
                  下载
                </Button>
              ),
            },
          ]}
        />
      </Drawer>
    </div>
  )
}
