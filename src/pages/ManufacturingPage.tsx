import type React from 'react'
import { useState } from 'react'
import { Button, Card, Form, Input, Space, Table, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import styles from './WorkflowPages.module.css'

type DrawingRow = {
  id: number
  customer_code: string
  drawing_no: string
  material: string
  spec_model: string
  drawing_type: string
  drawing_name: string
  uploaded_at: string
  uploaded_by_name: string
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

function EmptyPlaceholder({ text }: { text: string }) {
  return <div style={{ padding: 24, color: '#999' }}>{text}</div>
}

function DrawingDownloadPanel() {
  const [nameForm] = Form.useForm()
  const [orderForm] = Form.useForm()
  const [nameRows, setNameRows] = useState<DrawingRow[]>([])
  const [orderRows, setOrderRows] = useState<DrawingRow[]>([])
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [nameLoading, setNameLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  const handleDownload = async (row: DrawingRow) => {
    const fileName = `${row.drawing_name}.pdf`
    const saveInfo = await askSavePathAndFileName('下载图纸', '', fileName, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${row.id}/download`))
    if (!res.ok) {
      const data = await readJson(res)
      message.error(parseApiDetail(data))
      return
    }
    const blob = await res.blob()
    const finalName = getDownloadFileName(res, saveInfo.fileName || fileName)
    const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
    if (saved) message.success('下载完成')
  }

  const queryByName = async () => {
    const values = await nameForm.validateFields()
    setNameLoading(true)
    try {
      const qs = new URLSearchParams({ drawing_name: values.drawing_name.trim() })
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives/by-drawing-name?${qs.toString()}`))
      const data = await readJson<{ items?: DrawingRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setNameRows(data.items || [])
      if (!(data.items || []).length) message.info('未找到该图纸名')
    } finally {
      setNameLoading(false)
    }
  }

  const queryByOrder = async () => {
    const values = await orderForm.validateFields()
    setOrderLoading(true)
    try {
      const qs = new URLSearchParams({ order_no: values.order_no.trim() })
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives/by-order?${qs.toString()}`))
      const data = await readJson<{ items?: DrawingRow[]; message?: string; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setOrderRows(data.items || [])
      setSelectedKeys([])
      if (data.message) message.info(data.message)
      else if (!(data.items || []).length) message.info('未查询到图纸')
    } finally {
      setOrderLoading(false)
    }
  }

  const batchDownload = async () => {
    if (!selectedKeys.length) {
      message.warning('请先勾选要下载的图纸')
      return
    }
    const orderNo = String(orderForm.getFieldValue('order_no') || '').trim()
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const zipName = orderNo ? `${orderNo}_dr_${stamp}.zip` : `dr_${stamp}.zip`
    const saveInfo = await askSavePathAndFileName('批量下载图纸', '', zipName, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    setBatchLoading(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/drawing-archives/batch-download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedKeys.map((k) => Number(k)),
          order_no: orderNo || undefined,
        }),
      })
      if (!res.ok) {
        const data = await readJson(res)
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      const finalName = getDownloadFileName(res, saveInfo.fileName || zipName)
      const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
      if (saved) message.success('批量下载完成')
    } finally {
      setBatchLoading(false)
    }
  }

  const baseColumns: ColumnsType<DrawingRow> = [
    { title: '客户代码', dataIndex: 'customer_code', width: 100 },
    { title: '标准号/图纸号-版本号', dataIndex: 'drawing_no', width: 160 },
    { title: '材质', dataIndex: 'material', width: 100 },
    { title: '规格型号/物料号', dataIndex: 'spec_model', width: 140 },
    { title: '类型', dataIndex: 'drawing_type', width: 100 },
    { title: '图纸名', dataIndex: 'drawing_name', width: 260 },
    { title: '上传时间', dataIndex: 'uploaded_at', width: 160 },
    { title: '上传者', dataIndex: 'uploaded_by_name', width: 100 },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 90,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => void handleDownload(row)}>
          下载
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Card size="small" title="按图纸名下载" style={{ marginBottom: 16 }}>
        <Form form={nameForm} layout="inline" onFinish={() => void queryByName()}>
          <Form.Item
            name="drawing_name"
            label="图纸名"
            rules={[{ required: true, message: '请输入图纸名' }]}
          >
            <Input placeholder="不含 .pdf，如 FJ;JIS;Q235;5K 15A;SOP-FF" style={{ width: 360 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={nameLoading}>
              查询
            </Button>
          </Form.Item>
        </Form>
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          size="small"
          columns={baseColumns}
          dataSource={nameRows}
          scroll={{ x: 1300 }}
          pagination={false}
        />
      </Card>

      <Card size="small" title="按订单号下载">
        <Form form={orderForm} layout="inline" onFinish={() => void queryByOrder()}>
          <Form.Item name="order_no" label="订单号" rules={[{ required: true, message: '请输入订单号' }]}>
            <Input placeholder="订单号" style={{ width: 240 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={orderLoading}>
                查询
              </Button>
              <Button loading={batchLoading} disabled={!selectedKeys.length} onClick={() => void batchDownload()}>
                批量下载(ZIP)
              </Button>
            </Space>
          </Form.Item>
        </Form>
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          size="small"
          columns={baseColumns}
          dataSource={orderRows}
          scroll={{ x: 1300 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys),
          }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </div>
  )
}

export default function ManufacturingPage() {
  return (
    <Card title="生产" className={styles.pageCard}>
      <Tabs
        defaultActiveKey="drawing-download"
        items={[
          {
            key: 'plan',
            label: '生产计划',
            children: <EmptyPlaceholder text="生产计划功能待开发..." />,
          },
          {
            key: 'order-split',
            label: '订单分割',
            children: <EmptyPlaceholder text="订单分割功能待开发..." />,
          },
          {
            key: 'drawing-download',
            label: '图纸下载',
            children: <DrawingDownloadPanel />,
          },
          {
            key: 'typing',
            label: '打字要求',
            children: <EmptyPlaceholder text="打字要求功能待开发..." />,
          },
        ]}
      />
    </Card>
  )
}
