import { useCallback, useEffect, useState } from 'react'
import { Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Table, message } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { whDownload, whGet, whPost, whPut } from '../warehouseApi'
import TabGuide from '../TabGuide'

type Wh = { id: number; code: string; name: string }
type Row = {
  id: number
  item_id?: number
  warehouse: string
  item_code: string
  name_spec: string
  material_grade?: string
  heat_no?: string
  order_no?: string
  qty_on_hand: number
  uom: string
  location_name?: string
  remark?: string
  created_by_name?: string
}

export default function FgInventoryTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [warehouses, setWarehouses] = useState<Wh[]>([])
  const [warehouseId, setWarehouseId] = useState<number | undefined>()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = warehouseId ? `?warehouse_id=${warehouseId}` : ''
      const data = await whGet<{ items: Row[] }>(`/fg/balances${qs}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [warehouseId])

  useEffect(() => {
    void whGet<{ items: Wh[] }>('/fg/warehouses').then((d) => setWarehouses(d.items || []))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/fg/items', v)
      message.success('仓库物料已创建（请通过出入库流水增加库存）')
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
        title="成品库存台账 · 操作说明"
        steps={[
          '先点「新增仓库物料」建立成品/毛坯档案（编码、规格、材质、单位）。',
          '再用「出入库流水」办理完工入库或发货出库，库存数量才会变化。',
          '操作列「查看」看该行库存（仓库、炉号、订单、数量）；「编辑」只改档案字段（规格、材质、单位），不改现存量。',
          '无库存可「停用」。可用仓库类型筛选后点「导出 Excel」，列与本页台账一致。',
        ]}
        methods={[
          '仓库物料表示「库里实际有什么」，与建档「可生产物料/图纸」分开维护。',
          '炉号、订单号在出入库时填写，用于质量追溯与订单关联。',
        ]}
        notes={[
          '仅建档案不会产生库存，必须做入库流水。有库存禁止停用。',
          '发货扣减请走出库流水，避免账实不符。本页一期为手工管理骨架，与生产/发货自动联动后续开放。',
        ]}
      />
      <div className="wh-toolbar">
        <Select
          allowClear
          placeholder="仓库类型"
          style={{ width: 160 }}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          onChange={setWarehouseId}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            const qs = warehouseId ? `?warehouse_id=${warehouseId}` : ''
            void whDownload(`/fg/exports/balances${qs}`, '成品库存.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出 Excel
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新增仓库物料
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '仓库类型', dataIndex: 'warehouse', width: 110 },
          { title: '编码', dataIndex: 'item_code', width: 110 },
          { title: '规格型号', dataIndex: 'name_spec' },
          { title: '材质', dataIndex: 'material_grade', width: 90 },
          { title: '炉号', dataIndex: 'heat_no', width: 120 },
          { title: '订单号', dataIndex: 'order_no', width: 120 },
          { title: '数量', dataIndex: 'qty_on_hand', width: 70 },
          { title: '单位', dataIndex: 'uom', width: 70 },
          { title: '库位', dataIndex: 'location_name', width: 100 },
          { title: '录入人', dataIndex: 'created_by_name', width: 90 },
          {
            title: '操作',
            width: 150,
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
                      material_grade: r.material_grade,
                      uom: r.uom,
                      remark: r.remark,
                    })
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={Number(r.qty_on_hand || 0) > 0}
                  onClick={() => {
                    if (!r.item_id) return
                    Modal.confirm({
                      title: '停用该成品档案？',
                      onOk: async () => {
                        await whPut(`/fg/items/${r.item_id}`, { is_active: 0 })
                        message.success('已停用')
                        await load()
                      },
                    })
                  }}
                >
                  停用
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal title="新增仓库物料" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ uom: '件' }}>
          <Form.Item name="item_code" label="编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_spec" label="规格型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="material_grade" label="材质">
            <Input />
          </Form.Item>
          <Form.Item name="uom" label="单位">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑成品档案"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => {
          void (async () => {
            if (!editing?.item_id) return
            const v = await editForm.validateFields()
            await whPut(`/fg/items/${editing.item_id}`, v)
            message.success('档案已保存')
            setEditing(null)
            await load()
          })()
        }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name_spec" label="规格型号" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="material_grade" label="材质">
            <Input />
          </Form.Item>
          <Form.Item name="uom" label="单位">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="成品库存详情" open={!!viewing} onClose={() => setViewing(null)} width={420}>
        {viewing ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="仓库">{viewing.warehouse}</Descriptions.Item>
            <Descriptions.Item label="编码">{viewing.item_code}</Descriptions.Item>
            <Descriptions.Item label="规格">{viewing.name_spec}</Descriptions.Item>
            <Descriptions.Item label="材质">{viewing.material_grade || '—'}</Descriptions.Item>
            <Descriptions.Item label="炉号">{viewing.heat_no || '—'}</Descriptions.Item>
            <Descriptions.Item label="订单号">{viewing.order_no || '—'}</Descriptions.Item>
            <Descriptions.Item label="数量">{`${viewing.qty_on_hand} ${viewing.uom}`}</Descriptions.Item>
            <Descriptions.Item label="库位">{viewing.location_name || '—'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  )
}
