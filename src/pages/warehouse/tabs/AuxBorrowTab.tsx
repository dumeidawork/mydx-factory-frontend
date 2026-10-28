import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Space, Table, Tag, message } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { whDelete, whDownload, whGet, whPost, whPut } from '../warehouseApi'
import DictSelect from '../DictSelect'
import TabGuide from '../TabGuide'

const statusMap: Record<string, { color: string; label: string }> = {
  borrowed: { color: 'processing', label: '借用中' },
  returned: { color: 'success', label: '已归还' },
  overdue: { color: 'error', label: '逾期' },
}

type Row = {
  id: number
  item_name_spec: string
  qty: number
  department?: string
  borrow_date: string
  due_date?: string
  return_date?: string
  borrower_name: string
  keeper_name?: string
  purpose?: string
  status: string
}

export default function AuxBorrowTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  const qs = () => {
    const p = new URLSearchParams()
    if (range?.[0]) p.set('date_from', range[0].format('YYYY-MM-DD'))
    if (range?.[1]) p.set('date_to', range[1].format('YYYY-MM-DD'))
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>(`/aux/borrows${qs()}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  useEffect(() => {
    void load()
  }, [load])

  const markReturn = async (id: number) => {
    try {
      await whPost(`/aux/borrows/${id}/return`, {})
      message.success('已标记归还')
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/aux/borrows', {
        item_name_spec: v.name_spec,
        qty: v.qty,
        department: v.department,
        borrow_date: v.borrow_date ? dayjs(v.borrow_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        due_date: v.due_date ? dayjs(v.due_date).format('YYYY-MM-DD') : undefined,
        borrower_name: v.borrower,
        keeper_name: v.keeper,
        purpose: v.purpose,
      })
      message.success('借用登记已创建')
      setOpen(false)
      form.resetFields()
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  const returned = (s: string) => s === 'returned'

  return (
    <div>
      <TabGuide
        title="借用管理 · 操作说明"
        steps={[
          '点「借用登记」，填写物品名称规格、数量、部门、借用人；约定归还日用日历选择。部门、用途可搜索，也可输入新值后点「添加」。',
          '未归还可「查看/编辑」日期、用途等，也可「删除」。已归还只读，只能查看。',
          '超过约定归还日未还，列表显示「逾期」并进入页头总预警。实物还回时点「归还」，记下实际归还日。',
          '用借用日期筛选后点「导出」下载台账。',
        ]}
        methods={[
          '用途常见：还、1换1、检验、维修。库管员默认当前登录人，可改成实际保管员。',
          '本页是独立台账，不扣辅料库存。消耗掉的物料请另走「领用出库」。',
        ]}
        notes={[
          '工具/量具务必写清规格与编号。逾期请仓管催还，重要量具建议当面交接。',
          '「1换1」仍建议先借用登记，报废或换新再办领用，保证台账完整。',
          '借用不参与月度数量恒等式。不要用领用单代替借用，否则库存被扣、归还时无法加回。',
        ]}
      />
      <div className="wh-toolbar">
        <DatePicker.RangePicker value={range as [Dayjs, Dayjs] | null} onChange={(v) => setRange(v)} style={{ width: 240 }} />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload(`/aux/exports/borrows${qs()}`, '借用登记.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          借用登记
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '物品名称规格', dataIndex: 'item_name_spec', ellipsis: true },
          { title: '数量', dataIndex: 'qty', width: 70 },
          { title: '部门', dataIndex: 'department', width: 80 },
          { title: '借用日期', dataIndex: 'borrow_date', width: 110 },
          { title: '约定归还', dataIndex: 'due_date', width: 110 },
          { title: '实际归还', dataIndex: 'return_date', width: 110, render: (v) => v || '—' },
          { title: '借用人', dataIndex: 'borrower_name', width: 90 },
          { title: '库管员', dataIndex: 'keeper_name', width: 90 },
          { title: '用途', dataIndex: 'purpose', width: 90 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (s: string) => {
              const m = statusMap[s] || { color: 'default', label: s }
              return <Tag color={m.color}>{m.label}</Tag>
            },
          },
          {
            title: '操作',
            width: 180,
            render: (_, r) => (
              <Space size={0} wrap>
                <Button type="link" size="small" onClick={() => setViewing(r)}>
                  查看
                </Button>
                {!returned(r.status) ? (
                  <>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        setEditing(r)
                        editForm.setFieldsValue({
                          item_name_spec: r.item_name_spec,
                          qty: r.qty,
                          department: r.department,
                          borrow_date: r.borrow_date ? dayjs(r.borrow_date) : undefined,
                          due_date: r.due_date ? dayjs(r.due_date) : undefined,
                          borrower_name: r.borrower_name,
                          keeper_name: r.keeper_name,
                          purpose: r.purpose,
                        })
                      }}
                    >
                      编辑
                    </Button>
                    <Button type="link" size="small" onClick={() => void markReturn(r.id)}>
                      归还
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        Modal.confirm({
                          title: '删除该借用记录？',
                          onOk: async () => {
                            await whDelete(`/aux/borrows/${r.id}`)
                            message.success('已删除')
                            await load()
                          },
                        })
                      }}
                    >
                      删除
                    </Button>
                  </>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="借用登记" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ qty: 1, keeper: '陈晓丽', borrow_date: dayjs() }}>
          <Form.Item name="name_spec" label="物品名称规格" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <DictSelect kind="department" placeholder="如 车一 / 3号锤" />
          </Form.Item>
          <Form.Item name="borrower" label="借用人" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="borrow_date" label="借用日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="due_date" label="约定归还日" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="keeper" label="库管员">
            <Input />
          </Form.Item>
          <Form.Item name="purpose" label="用途/去向">
            <DictSelect kind="purpose" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑借用"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => {
          void (async () => {
            if (!editing) return
            const v = await editForm.validateFields()
            try {
              await whPut(`/aux/borrows/${editing.id}`, {
                item_name_spec: v.item_name_spec,
                qty: v.qty,
                department: v.department,
                borrow_date: v.borrow_date ? dayjs(v.borrow_date).format('YYYY-MM-DD') : undefined,
                due_date: v.due_date ? dayjs(v.due_date).format('YYYY-MM-DD') : undefined,
                borrower_name: v.borrower_name,
                keeper_name: v.keeper_name,
                purpose: v.purpose,
              })
              message.success('已保存')
              setEditing(null)
              await load()
            } catch (e) {
              message.error(e instanceof Error ? e.message : '保存失败')
            }
          })()
        }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="item_name_spec" label="物品名称规格" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="qty" label="数量">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <DictSelect kind="department" />
          </Form.Item>
          <Form.Item name="borrow_date" label="借用日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="due_date" label="约定归还日">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="borrower_name" label="借用人">
            <Input />
          </Form.Item>
          <Form.Item name="keeper_name" label="库管员">
            <Input />
          </Form.Item>
          <Form.Item name="purpose" label="用途/去向">
            <DictSelect kind="purpose" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="借用详情" open={!!viewing} onClose={() => setViewing(null)} width={420}>
        {viewing ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="物品">{viewing.item_name_spec}</Descriptions.Item>
            <Descriptions.Item label="数量">{viewing.qty}</Descriptions.Item>
            <Descriptions.Item label="部门">{viewing.department || '—'}</Descriptions.Item>
            <Descriptions.Item label="借用日">{viewing.borrow_date}</Descriptions.Item>
            <Descriptions.Item label="约定归还">{viewing.due_date || '—'}</Descriptions.Item>
            <Descriptions.Item label="实际归还">{viewing.return_date || '—'}</Descriptions.Item>
            <Descriptions.Item label="借用人">{viewing.borrower_name}</Descriptions.Item>
            <Descriptions.Item label="用途">{viewing.purpose || '—'}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusMap[viewing.status]?.label || viewing.status}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  )
}
