import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Select, Table, Tag, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { whGet, whPost } from '../warehouseApi'
import TabGuide from '../TabGuide'

const typeColor: Record<string, string> = {
  inbound_finish: 'blue',
  outbound_ship: 'orange',
  inbound_outsource: 'cyan',
  manual: 'default',
}

const typeLabel: Record<string, string> = {
  inbound_finish: '完工入库',
  outbound_ship: '发货出库',
  inbound_outsource: '外协入库',
  manual: '手工',
}

type Wh = { id: number; name: string }
type Item = { id: number; name_spec: string; item_code: string }
type Row = {
  id: number
  txn_no: string
  biz_date: string
  txn_type: string
  warehouse: string
  name_spec: string
  heat_no?: string
  qty: number
  order_no?: string
  operator_name?: string
}

export default function FgTxnTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>('/fg/txns')
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void whGet<{ items: Wh[] }>('/fg/warehouses').then((d) => setWarehouses(d.items || []))
    void whGet<{ items: Item[] }>('/fg/items').then((d) => setItems(d.items || []))
  }, [load])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/fg/txns', {
        ...v,
        qty: Number(v.qty),
      })
      message.success('流水已登记')
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
        title="成品出入库流水 · 操作说明"
        steps={[
          '确认目标物料已在「库存台账」建档。',
          '点「手工出入库」，选择类型、仓库、物料、数量，可填炉号/订单号/库位。',
          '完工入库、外协入库：数量为正，增加库存。',
          '发货出库：选择对应类型，系统按出库扣减库存。',
        ]}
        methods={[
          '类型说明：完工入库 / 发货出库 / 外协入库 / 手工。',
          '同一物料按「仓库 + 炉号 + 订单号」分别记账，便于追溯。',
        ]}
        notes={[
          '出库时库存不足会失败，请先核对实物与台账。',
          '流水一经登记不可在本页随意删除，错误请用反向流水冲正（后续可增强）。',
          '操作人、时间会自动记录，满足溯源要求。',
        ]}
      />
      <div className="wh-toolbar">
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          手工出入库
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '单号', dataIndex: 'txn_no', width: 140 },
          { title: '日期', dataIndex: 'biz_date', width: 110 },
          {
            title: '类型',
            dataIndex: 'txn_type',
            width: 100,
            render: (t: string) => <Tag color={typeColor[t] || 'default'}>{typeLabel[t] || t}</Tag>,
          },
          { title: '仓库', dataIndex: 'warehouse', width: 100 },
          { title: '物料', dataIndex: 'name_spec' },
          { title: '炉号', dataIndex: 'heat_no', width: 120 },
          {
            title: '数量',
            dataIndex: 'qty',
            width: 80,
            render: (q: number) => (
              <span style={{ color: q < 0 ? '#cf1322' : '#389e0d' }}>{q > 0 ? `+${q}` : q}</span>
            ),
          },
          { title: '关联订单', dataIndex: 'order_no', width: 120 },
          { title: '经办人', dataIndex: 'operator_name', width: 90 },
        ]}
      />

      <Modal title="手工出入库" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ biz_date: new Date().toISOString().slice(0, 10), txn_type: 'inbound_finish', qty: 1 }}
        >
          <Form.Item name="biz_date" label="日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="txn_type" label="类型" rules={[{ required: true }]}>
            <Select
              options={Object.entries(typeLabel).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="warehouse_id" label="仓库" rules={[{ required: true }]}>
            <Select options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="item_id" label="物料" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={items.map((i) => ({ value: i.id, label: `${i.item_code} ${i.name_spec}` }))}
            />
          </Form.Item>
          <Form.Item name="heat_no" label="炉号">
            <Input />
          </Form.Item>
          <Form.Item name="order_no" label="订单号">
            <Input />
          </Form.Item>
          <Form.Item name="location_name" label="库位">
            <Input />
          </Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
