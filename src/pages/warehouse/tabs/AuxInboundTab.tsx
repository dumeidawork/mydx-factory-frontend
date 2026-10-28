import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { whGet, whPost } from '../warehouseApi'
import DictSelect from '../DictSelect'
import TabGuide from '../TabGuide'

type Po = { id: number; po_no: string; summary?: string; supplier_name?: string }
type Item = { id: number; name_spec: string; uom: string; last_unit_price: number; default_location_id?: number }
type Row = {
  id: number
  inbound_no: string
  biz_date: string
  source_type: string
  ref_po_no?: string
  supplier_name?: string
  total_qty?: number
  total_amount?: number
  operator_name?: string
  created_by_name?: string
  status?: string
  remark?: string
}

export default function AuxInboundTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [pos, setPos] = useState<Po[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [viewId, setViewId] = useState<number | null>(null)
  const [view, setView] = useState<{ item: Row; lines: { name_spec?: string; qty: number; unit_price?: number }[] } | null>(null)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>('/aux/inbound')
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void whGet<{ items: Item[] }>('/aux/balances').then((d) => setItems(d.items || []))
    void whGet<{ items: Po[] }>('/aux/purchases').then((d) => setPos(d.items || [])).catch(() => undefined)
  }, [load])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/aux/inbound', {
        biz_date: v.biz_date,
        source_type: v.source_type,
        supplier_name: v.supplier_name,
        ref_po_no: v.ref_po_no,
        ref_po_id: v.ref_po_id,
        operator_name: v.operator_name,
        lines: [
          {
            item_id: v.item_id,
            location_id: v.location_id,
            qty: v.qty,
            unit_price: v.unit_price,
          },
        ],
      })
      message.success('入库成功')
      setOpen(false)
      form.resetFields()
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div>
      <TabGuide
        title="入库登记 · 操作说明"
        steps={[
          '有对应采购单时：优先回「采购管理」点「入库」（带出数量、单价，选货架即可），本页会生成入库单。',
          '无采购单或补录：点「手工入库」，选择辅料、货架（可添加新货架）、数量、单价。来源选「采购入库」时从下拉带出供应商和单号，不要手填。',
          '保存后库存增加并写流水，同时按该物料自己的下限/上限刷新页头预警。',
          '操作列「查看」看明细。已过账单不可改数量；点「作废」会扣回库存、写反向流水，原单保留可查。',
        ]}
        methods={[
          '辅料必须先在「库存台账」建档。单价用于库存金额与月底货值；无单价可填 0，但货值会偏低。',
          '供应商名称须与采购单一致（如都写「鑫淼」），否则「对账结账」无法按供应商汇总。',
        ]}
        notes={[
          '已从采购页入过库的单据不要再手工录一遍。作废入库后，原采购单可再次入库。',
          '若这批货已经领用导致库存不够扣，须先作废对应领用单，再作废入库单。',
          '已作废入库不计入月度恒等式和对账。到货应先验货，规格/数量与送货单不一致时先沟通供应商。',
        ]}
      />
      <div className="wh-toolbar">
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          手工入库
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '入库单号', dataIndex: 'inbound_no', width: 160 },
          { title: '日期', dataIndex: 'biz_date', width: 110 },
          {
            title: '来源',
            dataIndex: 'source_type',
            width: 100,
            render: (s: string) => <Tag color={s === 'purchase' ? 'blue' : 'default'}>{s === 'purchase' ? '采购入库' : '手工入库'}</Tag>,
          },
          { title: '关联采购单', dataIndex: 'ref_po_no', width: 140, render: (v) => v || '—' },
          { title: '供应商', dataIndex: 'supplier_name', width: 90, render: (v) => v || '—' },
          { title: '数量合计', dataIndex: 'total_qty', width: 90 },
          { title: '金额合计', dataIndex: 'total_amount', width: 90 },
          { title: '经办人', dataIndex: 'operator_name', width: 90 },
          { title: '录入人', dataIndex: 'created_by_name', width: 90 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (s: string) => (s === 'voided' ? <Tag color="default">已作废</Tag> : <Tag color="success">已过账</Tag>),
          },
          {
            title: '操作',
            width: 120,
            render: (_, r) => (
              <Space size={0}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setViewId(r.id)
                    void whGet<{ item: Row; lines: { name_spec?: string; qty: number; unit_price?: number }[] }>(
                      `/aux/inbound/${r.id}`,
                    )
                      .then(setView)
                      .catch((e) => message.error(e instanceof Error ? e.message : '加载失败'))
                  }}
                >
                  查看
                </Button>
                {r.status !== 'voided' ? (
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: `作废入库单 ${r.inbound_no}？`,
                        content: '将扣减对应库存并写反向流水，原单保留可查。若库存已领用需先作废领用单。',
                        onOk: async () => {
                          await whPost(`/aux/inbound/${r.id}/void`, {})
                          message.success('已作废并冲回库存')
                          await load()
                        },
                      })
                    }}
                  >
                    作废
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title="入库单详情"
        open={viewId != null}
        onClose={() => {
          setViewId(null)
          setView(null)
        }}
        width={480}
      >
        {view?.item ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="单号">{view.item.inbound_no}</Descriptions.Item>
              <Descriptions.Item label="日期">{view.item.biz_date}</Descriptions.Item>
              <Descriptions.Item label="供应商">{view.item.supplier_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="采购单">{view.item.ref_po_no || '—'}</Descriptions.Item>
              <Descriptions.Item label="数量/金额">{`${view.item.total_qty ?? 0} / ${view.item.total_amount ?? 0}`}</Descriptions.Item>
              <Descriptions.Item label="状态">{view.item.status === 'voided' ? '已作废' : '已过账'}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey={(_, i) => String(i)}
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              dataSource={view.lines || []}
              columns={[
                { title: '辅料', dataIndex: 'name_spec' },
                { title: '数量', dataIndex: 'qty', width: 80 },
                { title: '单价', dataIndex: 'unit_price', width: 80 },
              ]}
            />
          </>
        ) : null}
      </Drawer>

      <Modal title="手工入库" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            source_type: 'manual',
            biz_date: new Date().toISOString().slice(0, 10),
            qty: 1,
            unit_price: 0,
          }}
        >
          <Form.Item name="biz_date" label="日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="source_type" label="来源">
            <Select
              options={[
                { value: 'manual', label: '手工入库' },
                { value: 'purchase', label: '采购入库' },
              ]}
            />
          </Form.Item>
          <Form.Item name="supplier_name" label="供应商">
            <Input />
          </Form.Item>
          <Form.Item name="ref_po_no" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="ref_po_id" label="关联采购单">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={pos.map((p) => ({
                value: p.id,
                label: `${p.po_no} ${p.summary || ''} ${p.supplier_name || ''}`.trim(),
              }))}
              onChange={(id) => {
                const p = pos.find((x) => x.id === id)
                if (p) {
                  form.setFieldsValue({
                    supplier_name: p.supplier_name,
                    ref_po_no: p.po_no,
                    source_type: 'purchase',
                  })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="item_id" label="辅料" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={items.map((i) => ({ value: i.id, label: i.name_spec }))}
              onChange={(id) => {
                const it = items.find((x) => x.id === id)
                if (it) form.setFieldsValue({ unit_price: it.last_unit_price || 0 })
              }}
            />
          </Form.Item>
          <Form.Item name="location_id" label="货架">
            <DictSelect kind="location" />
          </Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit_price" label="单价">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="operator_name" label="经办人">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
