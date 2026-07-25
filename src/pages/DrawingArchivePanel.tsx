import { useCallback, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Space, Table, Upload } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { InboxOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'

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

export default function DrawingArchivePanel() {
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [rows, setRows] = useState<DrawingRow[]>([])
  const watchedCustomer = Form.useWatch('customer_code', form)
  const watchedDrawingNo = Form.useWatch('drawing_no', form)
  const watchedMaterial = Form.useWatch('material', form)
  const watchedSpec = Form.useWatch('spec_model', form)
  const watchedType = Form.useWatch('drawing_type', form)

  const previewDrawingName = useMemo(() => {
    const parts = [
      (watchedCustomer || '').trim(),
      (watchedDrawingNo || '').trim(),
      (watchedMaterial || '').trim(),
      (watchedSpec || '').trim(),
      (watchedType || '').trim(),
    ]
    if (parts.some((p) => !p)) return ''
    return parts.join(';')
  }, [watchedCustomer, watchedDrawingNo, watchedMaterial, watchedSpec, watchedType])

  const loadList = useCallback(async () => {
    const values = form.getFieldsValue()
    const map: Record<string, string> = {
      customer_code: (values.customer_code || '').trim(),
      drawing_no: (values.drawing_no || '').trim(),
      material: (values.material || '').trim(),
      spec_model: (values.spec_model || '').trim(),
      drawing_type: (values.drawing_type || '').trim(),
      drawing_name: (values.drawing_name_query || '').trim(),
    }
    if (!Object.values(map).some(Boolean)) {
      message.warning('请至少输入一个查询条件')
      return
    }
    const qs = new URLSearchParams()
    Object.entries(map).forEach(([k, v]) => {
      if (v) qs.set(k, v)
    })
    qs.set('limit', '200')
    setQuerying(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives?${qs.toString()}`))
      const data = await readJson<{ items?: DrawingRow[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows(data.items || [])
      if (!(data.items || []).length) {
        message.info('未查询到匹配图纸')
      }
    } finally {
      setQuerying(false)
    }
  }, [form])

  const handleUpload = async () => {
    try {
      const values = await form.validateFields([
        'customer_code',
        'drawing_no',
        'material',
        'spec_model',
        'drawing_type',
      ])
      if (!pendingFile) {
        message.warning('请选择 PDF 图纸文件')
        return
      }
      const name = pendingFile.name.toLowerCase()
      if (!name.endsWith('.pdf')) {
        message.error('仅支持 PDF 文件')
        return
      }
      setSaving(true)
      const fd = new FormData()
      fd.append('customer_code', values.customer_code.trim())
      fd.append('drawing_no', values.drawing_no.trim())
      fd.append('material', values.material.trim())
      fd.append('spec_model', values.spec_model.trim())
      fd.append('drawing_type', values.drawing_type.trim())
      fd.append('file', pendingFile)
      const res = await authFetch(apiUrl('/api/v1/drawing-archives'), { method: 'POST', body: fd })
      const data = await readJson<{ item?: DrawingRow; detail?: unknown }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      message.success(`上传成功：${data.item.drawing_name}`)
      setPendingFile(null)
      setFileList([])
      setRows((prev) => [data.item!, ...prev.filter((r) => r.id !== data.item!.id)])
    } finally {
      setSaving(false)
    }
  }

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

  const handleDelete = (row: DrawingRow) => {
    Modal.confirm({
      title: '确认删除该图纸？',
      content: `将删除磁盘文件并清除建档记录：${row.drawing_name}`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${row.id}`), { method: 'DELETE' })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除')
        setRows((prev) => prev.filter((r) => r.id !== row.id))
      },
    })
  }

  const columns: ColumnsType<DrawingRow> = [
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
      width: 140,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => void handleDownload(row)}>
            下载
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
        <Form.Item
          name="customer_code"
          label="客户代码"
          rules={[{ required: true, message: '请输入客户代码' }]}
        >
          <Input placeholder="客户代码" allowClear />
        </Form.Item>
        <Form.Item
          name="drawing_no"
          label="标准号/图纸号-版本号"
          rules={[{ required: true, message: '请输入标准号/图纸号-版本号' }]}
        >
          <Input placeholder="标准号/图纸号-版本号" allowClear />
        </Form.Item>
        <Form.Item name="material" label="材质" rules={[{ required: true, message: '请输入材质' }]}>
          <Input placeholder="材质" allowClear />
        </Form.Item>
        <Form.Item
          name="spec_model"
          label="规格型号/物料号"
          rules={[{ required: true, message: '请输入规格型号/物料号' }]}
        >
          <Input placeholder="规格型号/物料号" allowClear />
        </Form.Item>
        <Form.Item name="drawing_type" label="类型" rules={[{ required: true, message: '请输入类型' }]}>
          <Input placeholder="类型" allowClear />
        </Form.Item>
        <Form.Item label="文件名（仅 PDF）" required>
          <Upload.Dragger
            accept=".pdf,application/pdf"
            multiple={false}
            fileList={fileList}
            beforeUpload={(file) => {
              const lower = file.name.toLowerCase()
              if (!lower.endsWith('.pdf')) {
                message.error('仅支持 PDF 文件')
                return Upload.LIST_IGNORE
              }
              setPendingFile(file)
              setFileList([
                {
                  uid: file.uid,
                  name: file.name,
                  status: 'done',
                  originFileObj: file,
                },
              ])
              return false
            }}
            onRemove={() => {
              setPendingFile(null)
              setFileList([])
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖入 PDF 图纸</p>
          </Upload.Dragger>
        </Form.Item>
        {previewDrawingName ? (
          <div style={{ marginBottom: 16, color: '#666' }}>图纸名预览：{previewDrawingName}</div>
        ) : null}
        <div style={{ marginBottom: 28 }}>
          <Button
            type="primary"
            loading={saving}
            onClick={() => void handleUpload()}
            style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
          >
            上传
          </Button>
        </div>
        <Form.Item label="图纸名（查询用）" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="drawing_name_query" noStyle>
              <Input placeholder="可按图纸名模糊查询" allowClear style={{ width: '100%' }} />
            </Form.Item>
            <Button type="primary" loading={querying} onClick={() => void loadList()}>
              查询
            </Button>
          </Space.Compact>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1400 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </div>
  )
}
