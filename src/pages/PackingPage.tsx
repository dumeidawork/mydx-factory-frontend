import { useState } from 'react'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Table, Tag } from 'antd'
import styles from './WorkflowPages.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { askSavePath } from '../utils/savePath'
import { message } from '../utils/feedback'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'

type ItemRow = {
  rowKey: string
  id?: number
  source_order_detail_id?: number
  material_no: string
  spec: string
  standard: string
  material: string
  quantity: number
  unit_weight: number
  total_weight: number
  remark1?: string
  item_no?: number
  box_no?: number | null
}

export default function PackingPage() {
  const [rows, setRows] = useState<ItemRow[]>([])
  const [selectedKeys, setSelectedKeys] = useState<(string | number)[]>([])
  const [deletedIds, setDeletedIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saveDir, setSaveDir] = useState('')
  const [form] = Form.useForm()

  const fetchWithTimeout = async (url: string, options: RequestInit) => fetch(url, options)

  const reloadRows = async (orderNo: string) => {
    const res = await fetch(apiUrl(`/api/v1/workflow/packing/load?order_no=${encodeURIComponent(orderNo)}`))
    const data = await res.json()
    if (!res.ok) {
      message.error(data.detail || '加载失败')
      return
    }
    form.setFieldsValue({ factory_order_no: data.factory_order_no || '' })
    setRows(
      (data.rows || []).map((row: Omit<ItemRow, 'rowKey'>, idx: number) => ({
        ...row,
        rowKey: String(row.id ?? `${row.material_no}-${idx}-${Date.now()}`),
      }))
    )
  }

  const loadItems = async () => {
    const { order_no } = await form.validateFields(['order_no'])
    await fetch(apiUrl('/api/v1/workflow/packing/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_no }),
    })
    setDeletedIds([])
    setSelectedKeys([])
    await reloadRows(order_no)
  }

  const saveRows = async () => {
    const { order_no } = await form.validateFields(['order_no'])
    setSaving(true)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/packing/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no,
          deleted_ids: deletedIds,
          rows: rows.map((row) => ({
            id: row.id,
            source_order_detail_id: row.source_order_detail_id,
            material_no: row.material_no,
            item_no: row.item_no ?? undefined,
            quantity: row.quantity,
            unit_weight: row.unit_weight,
            total_weight: row.total_weight,
            spec: row.spec,
            standard: row.standard,
            material: row.material,
            remark1: row.remark1 || '',
            box_no: row.box_no || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) return message.error(data.detail || '保存失败')
      setDeletedIds([])
      setRows(
        (data.rows || []).map((row: Omit<ItemRow, 'rowKey'>, idx: number) => ({
          ...row,
          rowKey: String(row.id ?? `${row.material_no}-${idx}-${Date.now()}`),
        }))
      )
      message.success('Step2 数据已保存')
    } finally {
      setSaving(false)
    }
  }

  const appendRow = (row: ItemRow) => {
    const clone: ItemRow = {
      ...row,
      id: undefined,
      box_no: row.box_no || null,
      rowKey: `new-${Date.now()}-${Math.random()}`,
    }
    setRows((prev) => {
      const next = [...prev]
      const idx = next.findIndex((x) => x.rowKey === row.rowKey)
      next.splice(idx + 1, 0, clone)
      return next
    })
  }

  const deleteRow = (row: ItemRow) => {
    if (row.id) setDeletedIds((prev) => [...prev, row.id!])
    setRows((prev) => prev.filter((x) => x.rowKey !== row.rowKey))
    setSelectedKeys((prev) => prev.filter((x) => x !== row.rowKey))
  }

  const editItemNo = (row: ItemRow) => {
    const inputId = `packing-item-${row.rowKey}`
    Modal.confirm({
      title: '修改条目',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>修改条目会记录日志，是否继续？</div>
          <Input defaultValue={row.item_no ?? ''} id={inputId} type="number" min={0} />
        </div>
      ),
      onOk: () => {
        const el = document.getElementById(inputId) as HTMLInputElement | null
        const nextValue = el?.value === '' ? undefined : Number(el?.value || 0)
        setRows((prev) => prev.map((x) => (x.rowKey === row.rowKey ? { ...x, item_no: nextValue } : x)))
      },
    })
  }

  const editFactoryOrderNo = async () => {
    const orderNo = form.getFieldValue('order_no')
    if (!orderNo) {
      message.warning('请先填写订单号并加载待装箱明细')
      return
    }
    const currentValue = form.getFieldValue('factory_order_no') || ''
    const inputId = `packing-factory-order-no-${Date.now()}`
    Modal.confirm({
      title: '修改本厂单号',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>修改本厂单号会同步更新订单明细表并记录日志，是否继续？</div>
          <Input id={inputId} defaultValue={currentValue} />
        </div>
      ),
      onOk: async () => {
        const el = document.getElementById(inputId) as HTMLInputElement | null
        const nextValue = el?.value?.trim() || ''
        const res = await fetch(apiUrl('/api/v1/workflow/packing/update_factory_order_no'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_no: orderNo, factory_order_no: nextValue }),
        })
        const data = await res.json()
        if (!res.ok) {
          message.error(data.detail || '本厂单号修改失败')
          return
        }
        form.setFieldsValue({ factory_order_no: data.factory_order_no || '' })
        message.success('本厂单号已更新')
      },
    })
  }

  const submit = async () => {
    const values = await form.validateFields(['order_no', 'box_no', 'box_length', 'box_width', 'box_height', 'box_weight', 'packing_remark'])
    const selected = rows.filter((x) => selectedKeys.includes(x.rowKey))
    if (!selected.length) return message.warning('请先勾选要入箱的物料+条目')
    if (selected.some((x) => !x.id)) {
      message.warning('存在未保存的行，请先点击【保存】')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/workflow/packing/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no: values.order_no,
          row_ids: selected.map((x) => Number(x.id)),
          box_no: values.box_no,
          box_length: values.box_length,
          box_width: values.box_width,
          box_height: values.box_height,
          gross_weight: values.box_weight,
          packing_remark: values.packing_remark || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) return message.error(data.detail || '提交失败')
      await reloadRows(values.order_no)
      setSelectedKeys([])
      form.setFieldsValue({ box_no: undefined, box_weight: 20, packing_remark: '' })
      message.success(`装箱提交成功，更新${data.count}条`)
    } finally {
      setSubmitting(false)
    }
  }

  const generateList = async () => {
    const { order_no } = await form.validateFields(['order_no'])
    const nextSaveDir = await askSavePath('生成装箱单', saveDir)
    if (nextSaveDir === null) return
    setSaveDir(nextSaveDir)
    setGenerating(true)
    const hide = message.loading('装箱单文件生成中，请稍候...', 0)
    try {
      const res = await fetchWithTimeout(apiUrl('/api/v1/workflow/packing/generate_list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_no, factory_order_no: form.getFieldValue('factory_order_no') || '' }),
      })
      if (!res.ok) return message.error(await readFetchErrorMessage(res))
      const fileName = getDownloadFileName(res, `packing_${order_no}.xlsx`)
      const blob = await res.blob()
      const saved = await saveGeneratedBlob(blob, fileName, nextSaveDir.trim())
      await reloadRows(order_no)
      message.success(`装箱单已生成：${saved}`)
    } catch (error) {
      if (isFetchGuardHandled(error)) return
      message.error(
        error instanceof DOMException
          ? '装箱单生成超时，请稍后重试'
          : error instanceof Error
            ? error.message
            : '装箱单生成失败'
      )
    } finally {
      hide()
      setGenerating(false)
    }
  }

  return (
    <Card title="装箱工作台" className={styles.pageCard}>
      <Form form={form} layout="vertical" initialValues={{ box_weight: 20 }}>
        <Card size="small" title="Step1 检索待装箱物料" className={styles.sectionCard}>
          <Space wrap align="end">
            <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}>
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Button type="primary" onClick={loadItems}>
              加载待装箱明细
            </Button>
          </Space>
          <Space wrap align="end">
            <Form.Item name="factory_order_no" label="本厂单号">
              <Input style={{ width: 220 }} readOnly placeholder="加载待装箱明细后自动读取" />
            </Form.Item>
            <Button onClick={editFactoryOrderNo}>修改</Button>
          </Space>
        </Card>

        <Card size="small" title="Step2 选择物料并定义条目" className={styles.sectionCard}>
          <div className={styles.actions} style={{ marginBottom: 10 }}>
            <Button onClick={() => setSelectedKeys(rows.map((row) => row.rowKey))}>全选</Button>
            <Button onClick={() => setSelectedKeys([])}>清空</Button>
            <Button type="primary" loading={saving} onClick={saveRows}>
              保存
            </Button>
          </div>
          <Table
            rowKey="rowKey"
            dataSource={rows}
            pagination={false}
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as (string | number)[]) }}
            columns={[
              {
                title: '箱号',
                dataIndex: 'box_no',
                width: 100,
                render: (v: number | null | undefined) => (v ? <Tag color="red">{v}</Tag> : <Tag>未装箱</Tag>),
              },
              {
                title: '条目',
                dataIndex: 'item_no',
                render: (v: number | undefined, row: ItemRow) => (
                  <Space>
                    <Tag color={v == null ? 'default' : 'blue'}>{v == null ? '留空' : v}</Tag>
                    <Button size="small" onClick={() => editItemNo(row)}>
                      编辑
                    </Button>
                  </Space>
                ),
              },
              { title: '物料号', dataIndex: 'material_no' },
              {
                title: '数量',
                dataIndex: 'quantity',
                render: (v: number, row: ItemRow) => (
                  <InputNumber
                    min={0}
                    value={v}
                    onChange={(val) => {
                      const qty = Number(val || 0)
                      setRows((prev) => prev.map((x) => (x.rowKey === row.rowKey ? { ...x, quantity: qty, total_weight: Number((qty * x.unit_weight).toFixed(2)) } : x)))
                    }}
                  />
                ),
              },
              { title: '单重', dataIndex: 'unit_weight' },
              { title: '总重', dataIndex: 'total_weight' },
              { title: '规格', dataIndex: 'spec' },
              { title: '标准', dataIndex: 'standard' },
              { title: '材质', dataIndex: 'material' },
              { title: '备注1', dataIndex: 'remark1' },
              {
                title: '操作',
                width: 160,
                render: (_: unknown, row: ItemRow) => (
                  <Space>
                    <Button size="small" onClick={() => appendRow(row)}>
                      追加
                    </Button>
                    <Button size="small" danger onClick={() => deleteRow(row)}>
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
          <div className={styles.mobileTableHint}>条目默认读取订单明细表；修改条目时会弹出确认并记录日志。</div>
        </Card>

        <Card size="small" title="Step3 物理箱体信息录入" className={styles.sectionCard}>
          <Space wrap align="end">
            <Form.Item name="box_no" label="箱号" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="box_length" label="长度" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="box_width" label="宽度" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="box_height" label="高度" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="box_weight" label="箱重(毛重)" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.01} />
            </Form.Item>
            <Form.Item name="packing_remark" label="装箱备注">
              <Input style={{ width: 240 }} />
            </Form.Item>
            <Button type="primary" loading={submitting} onClick={submit}>
              确认装箱提交
            </Button>
          </Space>
        </Card>
        <div style={{ marginTop: 12 }}>
          <Button type="primary" danger loading={generating} onClick={generateList}>
            生成装箱单
          </Button>
        </div>
      </Form>
    </Card>
  )
}
