import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { type Dayjs } from 'dayjs'
import { whDownload, whGet, whPost } from '../warehouseApi'
import DictSelect from '../DictSelect'
import TabGuide from '../TabGuide'

type Item = { id: number; name_spec: string; qty_on_hand: number; uom: string; last_unit_price: number }
type Row = {
  id: number
  issue_no: string
  biz_date: string
  cost_center_code: string
  cost_center_name?: string
  receiver_name: string
  summary?: string
  total_qty?: number
  total_amount?: number
  keeper_name?: string
  issue_mode: string
  created_by_name?: string
  status?: string
}

export default function AuxIssueTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [center, setCenter] = useState<string | undefined>()
  const [keyword, setKeyword] = useState('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<{ item: Row; lines: { name_spec?: string; qty: number }[] } | null>(null)
  const [form] = Form.useForm()

  const qs = () => {
    const p = new URLSearchParams()
    if (center) p.set('cost_center', center)
    if (keyword) p.set('keyword', keyword)
    if (range?.[0]) p.set('date_from', range[0].format('YYYY-MM-DD'))
    if (range?.[1]) p.set('date_to', range[1].format('YYYY-MM-DD'))
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>(`/aux/issues${qs()}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, keyword, range])

  useEffect(() => {
    void whGet<{ items: Item[] }>('/aux/balances').then((d) => setItems(d.items || []))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/aux/issues', {
        biz_date: v.biz_date,
        cost_center_code: v.cost_center_code,
        receiver_name: v.receiver,
        keeper_name: v.keeper,
        issue_mode: v.issue_mode,
        lines: [{ item_id: v.item_id, qty: v.qty }],
      })
      message.success('领用出库成功')
      setOpen(false)
      form.resetFields()
      await load()
      const bal = await whGet<{ items: Item[] }>('/aux/balances')
      setItems(bal.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div>
      <TabGuide
        title="领用出库 · 操作说明"
        steps={[
          '点「新增领用」，选择成本中心、领用人、辅料与数量；可选保管员。成本中心可搜索，也可输入新车间后点「添加」。',
          '锯条 / 丝锥钻头 / 刀头等可将类型选为「以旧换新」（只打标记，不建旧件库存）。保存后立即扣库存并写流水。',
          '已过账单不可改数量。点「作废」会加回库存、写反向流水，原单保留可查。',
          '用日期起止、成本中心、领用人/摘要筛选后，点「导出领用表」。',
        ]}
        methods={[
          '成本中心含机加一/二、1号锤、3号锤、下料、包装、化验室、办公室等，也可添加新车间。月度「分类消耗」按本页金额汇总。',
          '单价默认取最近入库价，没有则用辅料默认单价。未指定货架时从有库存的货架扣。',
        ]}
        notes={[
          '库存不足无法出库。工具/量具临时拿走请走「借用管理」，不要用领用，否则库存被扣且归还时无法加回。',
          '作废领用后库存加回。若要作废对应入库单，须先作废已从该批货领出的出库单。',
          '已作废领用不计入月度恒等式和分类消耗。请督促各车间及时登记。',
        ]}
      />
      <div className="wh-toolbar">
        <DatePicker.RangePicker
          value={range as [Dayjs, Dayjs] | null}
          onChange={(v) => setRange(v)}
          style={{ width: 240 }}
        />
        <DictSelect kind="cost_center" value={center} onChange={(v) => setCenter(v ? String(v) : undefined)} placeholder="成本中心" style={{ width: 160 }} />
        <Input.Search
          allowClear
          placeholder="领用人 / 摘要"
          style={{ width: 180 }}
          onSearch={setKeyword}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload(`/aux/exports/issues${qs()}`, '领用表.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出领用表
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新增领用
        </Button>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '单号', dataIndex: 'issue_no', width: 160 },
          { title: '日期', dataIndex: 'biz_date', width: 110 },
          {
            title: '成本中心',
            width: 110,
            render: (_, r) => r.cost_center_name || r.cost_center_code,
          },
          { title: '领用人', dataIndex: 'receiver_name', width: 90 },
          { title: '物品摘要', dataIndex: 'summary' },
          { title: '数量', dataIndex: 'total_qty', width: 70 },
          { title: '金额(元)', dataIndex: 'total_amount', width: 90 },
          { title: '保管员', dataIndex: 'keeper_name', width: 90 },
          {
            title: '类型',
            dataIndex: 'issue_mode',
            width: 100,
            render: (m: string) => (m === 'exchange' ? <Tag color="purple">以旧换新</Tag> : <Tag>普通</Tag>),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: (s: string) => (s === 'voided' ? <Tag>已作废</Tag> : <Tag color="success">已过账</Tag>),
          },
          { title: '录入人', dataIndex: 'created_by_name', width: 90 },
          {
            title: '操作',
            width: 120,
            render: (_, r) => (
              <Space size={0}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    void whGet<{ item: Row; lines: { name_spec?: string; qty: number }[] }>(`/aux/issues/${r.id}`)
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
                        title: `作废领用单 ${r.issue_no}？`,
                        content: '将加回库存并写反向流水，原单保留可查。',
                        onOk: async () => {
                          await whPost(`/aux/issues/${r.id}/void`, {})
                          message.success('已作废并加回库存')
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

      <Drawer title="领用单详情" open={!!view} onClose={() => setView(null)} width={480}>
        {view?.item ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="单号">{view.item.issue_no}</Descriptions.Item>
              <Descriptions.Item label="日期">{view.item.biz_date}</Descriptions.Item>
              <Descriptions.Item label="成本中心">{view.item.cost_center_name || view.item.cost_center_code}</Descriptions.Item>
              <Descriptions.Item label="领用人">{view.item.receiver_name}</Descriptions.Item>
              <Descriptions.Item label="摘要">{view.item.summary}</Descriptions.Item>
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
              ]}
            />
          </>
        ) : null}
      </Drawer>

      <Modal title="新增领用出库" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            issue_mode: 'normal',
            keeper: '陈晓丽',
            biz_date: new Date().toISOString().slice(0, 10),
            qty: 1,
          }}
        >
          <Form.Item name="biz_date" label="日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="cost_center_code" label="成本中心" rules={[{ required: true }]}>
            <DictSelect kind="cost_center" />
          </Form.Item>
          <Form.Item name="receiver" label="领用人" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="item_id" label="辅料" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={items.map((i) => ({
                value: i.id,
                label: `${i.name_spec}（库存 ${i.qty_on_hand}${i.uom}）`,
              }))}
            />
          </Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0.001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="issue_mode" label="领用类型">
            <Select
              options={[
                { value: 'normal', label: '普通领用' },
                { value: 'exchange', label: '以旧换新' },
              ]}
            />
          </Form.Item>
          <Form.Item name="keeper" label="保管员">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
