import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { UOM_OPTIONS, whDownload, whGet, whPost, whPut } from '../warehouseApi'
import DictSelect from '../DictSelect'
import TabGuide from '../TabGuide'

type Loc = { id: number; name: string }
type Row = {
  id: number
  item_code: string
  name_spec: string
  uom: string
  uom_desc?: string
  category?: string
  location_name?: string
  default_location_id?: number
  qty_on_hand: number
  qty_min: number
  qty_max: number
  last_unit_price: number
  default_unit_price?: number
  stock_amount?: number
  stock_status?: string
  remark?: string
  created_by_name?: string
  updated_by_name?: string
}

export default function AuxInventoryTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [locationId, setLocationId] = useState<number | undefined>()
  const [onlyAlert, setOnlyAlert] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  const loadLocs = async () => {
    const d = await whGet<{ items: Loc[] }>('/aux/locations').catch(() => ({ items: [] }))
    setLocations(d.items || [])
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (keyword) qs.set('keyword', keyword)
      if (locationId) qs.set('location_id', String(locationId))
      if (onlyAlert) qs.set('only_alert', 'true')
      const data = await whGet<{ items: Row[] }>(`/aux/balances?${qs.toString()}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, locationId, onlyAlert])

  useEffect(() => {
    void loadLocs()
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/aux/items', v)
      message.success('辅料已创建')
      setOpen(false)
      form.resetFields()
      await load()
      await loadLocs()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const v = await editForm.validateFields()
    try {
      await whPut(`/aux/items/${editing.id}`, {
        name_spec: v.name_spec,
        uom: v.uom,
        uom_desc: v.uom_desc,
        category: v.category,
        default_location_id: v.default_location_id,
        default_unit_price: v.default_unit_price,
        qty_min: v.qty_min,
        qty_max: v.qty_max,
        remark: v.remark,
      })
      message.success('已保存（现存量未改）')
      setEditing(null)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  const deactivate = (r: Row) => {
    if (Number(r.qty_on_hand || 0) > 0) {
      message.warning('仍有库存，禁止停用')
      return
    }
    Modal.confirm({
      title: `停用 ${r.name_spec}？`,
      content: '无库存的辅料可停用，停用后不再出现在台账中。',
      onOk: async () => {
        await whPut(`/aux/items/${r.id}`, { is_active: 0 })
        message.success('已停用')
        await load()
      },
    })
  }

  return (
    <div>
      <TabGuide
        title="库存台账 · 操作说明"
        steps={[
          '点「新增辅料」：填编码、品名规格、单位、品类、默认货架，以及该物料自己的下限/上限。品类、货架可搜索，也可输入新值后点「添加」写入下拉。',
          '若货架上已有实物，一并填「期初数量」和「默认单价」，保存后形成库存（流水为期初调整）。没有实物则数量填 0。',
          '操作列「查看」看详情；「编辑」可改品名、品类、货架、下限/上限，不能改现存量。无库存可「停用」，有库存禁止停用。',
          '用关键词、货架筛选；「仅看预警」只列出低于下限或高于上限的物料。点「导出 Excel」下载当前台账。',
        ]}
        methods={[
          '预警数量最低值 = 每种辅料自己填的「下限」，没有全局统一阈值。「仅看预警」也按该物料下限/上限判断。',
          '单位按实物习惯（个/条/盒等）；「单位说明」可写包装规格如「10个/盒」，系统不做盒↔个换算。',
          '采购「入库」和价格预警都依赖本页主数据，建采购单时请尽量选择已建档辅料。',
        ]}
        notes={[
          '辅料编码不可重复。本页与建档里的「物料」不是同一概念，禁止把法兰成品录进来。',
          '期初只录一次。之后加库存走「采购管理 → 入库」或「入库登记」，减库存走「领用出库」。采购开单本身不加库存。',
          '已过账的入库/领用单不要改数量，到对应页点「作废」冲回库存，原单仍可查。',
        ]}
      />
      <div className="wh-toolbar">
        <Input.Search
          allowClear
          placeholder="编码 / 品名规格"
          style={{ width: 220 }}
          onSearch={setKeyword}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <Select
          allowClear
          placeholder="货架"
          style={{ width: 120 }}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          onChange={setLocationId}
        />
        <Button type={onlyAlert ? 'primary' : 'default'} onClick={() => setOnlyAlert((v) => !v)}>
          仅看预警
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload('/aux/exports/balances', '辅料库存.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出 Excel
        </Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields()
            setOpen(true)
          }}
        >
          新增辅料
        </Button>
      </div>

      <div className="wh-table-wrap">
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '编码', dataIndex: 'item_code', width: 110 },
            { title: '品名及规格', dataIndex: 'name_spec', ellipsis: true },
            {
              title: '单位',
              dataIndex: 'uom',
              width: 90,
              render: (uom: string, r) => (r.uom_desc ? `${uom}（${r.uom_desc}）` : uom),
            },
            { title: '货架', dataIndex: 'location_name', width: 90 },
            { title: '品类', dataIndex: 'category', width: 110 },
            { title: '现有库存', dataIndex: 'qty_on_hand', width: 90 },
            {
              title: '下限/上限',
              width: 100,
              render: (_, r) => `${r.qty_min ?? 0} / ${r.qty_max ?? 0}`,
            },
            {
              title: '单价(元)',
              dataIndex: 'last_unit_price',
              width: 90,
              render: (v: number) => Number(v || 0).toFixed(2),
            },
            {
              title: '库存金额',
              width: 100,
              render: (_, r) => Number(r.stock_amount ?? r.qty_on_hand * r.last_unit_price).toFixed(2),
            },
            {
              title: '状态',
              width: 100,
              render: (_, r) => {
                const s = r.stock_status || 'normal'
                if (s === 'low') return <Tag color="error">低于下限</Tag>
                if (s === 'high') return <Tag color="warning">高于上限</Tag>
                return <Tag color="success">正常</Tag>
              },
            },
            { title: '录入人', dataIndex: 'created_by_name', width: 90 },
            {
              title: '操作',
              width: 160,
              render: (_, r) => (
                <Space size={0} wrap>
                  <Button type="link" size="small" onClick={() => setViewing(r)}>
                    查看
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setEditing(r)
                      editForm.setFieldsValue({
                        name_spec: r.name_spec,
                        uom: r.uom,
                        uom_desc: r.uom_desc,
                        category: r.category,
                        default_location_id: r.default_location_id,
                        default_unit_price: r.default_unit_price ?? r.last_unit_price,
                        qty_min: r.qty_min,
                        qty_max: r.qty_max,
                        remark: r.remark,
                      })
                    }}
                  >
                    编辑
                  </Button>
                  <Button type="link" size="small" danger disabled={Number(r.qty_on_hand || 0) > 0} onClick={() => deactivate(r)}>
                    停用
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </div>

      <Modal title="新增辅料" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ uom: '个', qty_on_hand: 0, qty_min: 0, qty_max: 0, default_unit_price: 0 }}>
          <Form.Item name="item_code" label="编码" rules={[{ required: true }]}>
            <Input placeholder="如 AUX-009" />
          </Form.Item>
          <Form.Item name="name_spec" label="品名及规格" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="uom" label="单位" rules={[{ required: true }]}>
            <Select options={UOM_OPTIONS.map((u) => ({ value: u, label: u }))} />
          </Form.Item>
          <Form.Item name="uom_desc" label="单位说明">
            <Input placeholder="如 10个/盒" />
          </Form.Item>
          <Form.Item name="category" label="品类" rules={[{ required: true }]}>
            <DictSelect kind="category" />
          </Form.Item>
          <Form.Item name="default_location_id" label="货架">
            <DictSelect kind="location" />
          </Form.Item>
          <Form.Item name="qty_on_hand" label="期初数量">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="default_unit_price" label="默认单价">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="qty_min" label="下限（预警最低值）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="qty_max" label="上限">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑辅料档案" open={!!editing} onCancel={() => setEditing(null)} onOk={() => void saveEdit()} destroyOnClose>
        <Form form={editForm} layout="vertical">
          <Form.Item label="编码">
            <Input value={editing?.item_code} disabled />
          </Form.Item>
          <Form.Item label="现存量">
            <Input value={String(editing?.qty_on_hand ?? 0)} disabled />
          </Form.Item>
          <Form.Item name="name_spec" label="品名及规格" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="uom" label="单位" rules={[{ required: true }]}>
            <Select options={UOM_OPTIONS.map((u) => ({ value: u, label: u }))} />
          </Form.Item>
          <Form.Item name="uom_desc" label="单位说明">
            <Input />
          </Form.Item>
          <Form.Item name="category" label="品类" rules={[{ required: true }]}>
            <DictSelect kind="category" />
          </Form.Item>
          <Form.Item name="default_location_id" label="货架">
            <DictSelect kind="location" />
          </Form.Item>
          <Form.Item name="default_unit_price" label="默认单价">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="qty_min" label="下限（预警最低值）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="qty_max" label="上限">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="辅料详情" open={!!viewing} onClose={() => setViewing(null)} width={420}>
        {viewing ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="编码">{viewing.item_code}</Descriptions.Item>
            <Descriptions.Item label="品名规格">{viewing.name_spec}</Descriptions.Item>
            <Descriptions.Item label="单位">{viewing.uom_desc ? `${viewing.uom}（${viewing.uom_desc}）` : viewing.uom}</Descriptions.Item>
            <Descriptions.Item label="品类">{viewing.category || '—'}</Descriptions.Item>
            <Descriptions.Item label="货架">{viewing.location_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="现存量">{viewing.qty_on_hand}</Descriptions.Item>
            <Descriptions.Item label="下限 / 上限">{`${viewing.qty_min ?? 0} / ${viewing.qty_max ?? 0}`}</Descriptions.Item>
            <Descriptions.Item label="单价">{Number(viewing.last_unit_price || 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="录入人">{viewing.created_by_name || '—'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  )
}
