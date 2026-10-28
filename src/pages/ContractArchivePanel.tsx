import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Collapse,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import dayjs, { type Dayjs } from 'dayjs'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { saveGeneratedBlob, getDownloadFileName } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import { isDalianContractCustomer } from '../utils/customerRegion'

type ArchiveRow = {
  id: number
  customer_name: string
  file_name: string
  version: string
  upload_date: string
  uploaded_by_user_id?: number | null
  uploaded_by_name: string
  updated_date: string
  updated_by_user_id?: number | null
  updated_by_name: string
  summary?: string | null
  owner_user_id?: number | null
  owner_name?: string | null
  progress_status?: string | null
  assigned_at?: string | null
  total_amount?: number | string | null
}

type UserOption = { id: number; name: string; username: string }

const VERSION_TIP = '格式：V主版本.次版本.修订号，例如 V0.0.0；版本更新时默认末位 +1，可手改。'
const ACCEPT_TYPES = '.pdf,.xlsx,.xls'
const CHAIRMAN_ROLE_CODE = 'super_admin'

function canDeleteOwnedRow(
  row: { uploaded_by_user_id?: number | null; updated_by_user_id?: number | null },
  userId?: number,
  roleCode?: string,
) {
  if (roleCode === CHAIRMAN_ROLE_CODE) return true
  if (!userId) return false
  return userId === row.uploaded_by_user_id || userId === row.updated_by_user_id
}

function formatAmount(v: number | string | null | undefined): string {
  if (v == null || v === '') return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return '-'
  return n.toFixed(2)
}

function bumpVersion(version: string): string {
  const raw = (version || 'V0.0.0').trim()
  const digits = raw.replace(/^V/i, '')
  const parts = digits.split('.')
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(Number(p)))) return 'V0.0.1'
  parts[2] = String(Number(parts[2]) + 1)
  return `V${parts.join('.')}`
}

function toYmd(d: Dayjs | null | undefined): string {
  if (!d) return ''
  return d.format('YYYYMMDD')
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

export default function ContractArchivePanel() {
  const currentUser = getStoredUser()
  const [uploadForm] = Form.useForm()
  const [queryForm] = Form.useForm()
  const [metaForm] = Form.useForm()
  const [versionForm] = Form.useForm()
  const [ownerForm] = Form.useForm()

  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<ArchiveRow[]>([])
  const [total, setTotal] = useState(0)
  const [unassigned, setUnassigned] = useState<ArchiveRow[]>([])
  const [selectedUnassigned, setSelectedUnassigned] = useState<React.Key[]>([])
  const [customerOptions, setCustomerOptions] = useState<{ value: string; label: string }[]>([])
  const [userOptions, setUserOptions] = useState<UserOption[]>([])

  const [ownerModalOpen, setOwnerModalOpen] = useState(false)
  const [ownerTargetIds, setOwnerTargetIds] = useState<number[]>([])
  const [metaModalOpen, setMetaModalOpen] = useState(false)
  const [metaTarget, setMetaTarget] = useState<ArchiveRow | null>(null)
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [versionTarget, setVersionTarget] = useState<ArchiveRow | null>(null)
  const [versionFileList, setVersionFileList] = useState<UploadFile[]>([])
  const [versionPendingFile, setVersionPendingFile] = useState<File | null>(null)
  const uploadCustomerName = Form.useWatch('customer_name', uploadForm)
  const metaCustomerName = Form.useWatch('customer_name', metaForm)
  const uploadAmountRequired = !isDalianContractCustomer(uploadCustomerName)
  const metaAmountRequired = !isDalianContractCustomer(metaCustomerName)
  const versionAmountRequired = !isDalianContractCustomer(versionTarget?.customer_name)

  const loadCustomers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/contract-archives/customers/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: string[] }>(res)
    if (!res.ok) return
    setCustomerOptions((data.items || []).map((name) => ({ value: name, label: name })))
  }, [])

  const loadUsers = useCallback(async (q = '') => {
    const res = await authFetch(apiUrl(`/api/v1/auth/users/suggest?q=${encodeURIComponent(q)}&limit=30`))
    const data = await readJson<{ items?: UserOption[] }>(res)
    if (!res.ok) return
    setUserOptions(data.items || [])
  }, [])

  const loadUnassigned = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/v1/contract-archives/unassigned'))
    const data = await readJson<{ items?: ArchiveRow[] }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setUnassigned(data.items || [])
  }, [])

  const loadList = useCallback(async () => {
    const values = queryForm.getFieldsValue()
    const qs = new URLSearchParams()
    const map: Record<string, string> = {
      customer_name: values.customer_name || '',
      file_name: values.file_name || '',
      version: values.version || '',
      uploaded_by: values.uploaded_by || '',
      updated_by: values.updated_by || '',
      owner_name: values.owner_name || '',
    }
    Object.entries(map).forEach(([k, v]) => {
      if (v.trim()) qs.set(k, v.trim())
    })
    if (values.upload_date_from) qs.set('upload_date_from', toYmd(values.upload_date_from))
    if (values.upload_date_to) qs.set('upload_date_to', toYmd(values.upload_date_to))
    if (values.updated_date_from) qs.set('updated_date_from', toYmd(values.updated_date_from))
    if (values.updated_date_to) qs.set('updated_date_to', toYmd(values.updated_date_to))
    qs.set('limit', '200')
    const res = await authFetch(apiUrl(`/api/v1/contract-archives?${qs.toString()}`))
    const data = await readJson<{ items?: ArchiveRow[]; total?: number; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setRows(data.items || [])
    setTotal(data.total || 0)
  }, [queryForm])

  useEffect(() => {
    uploadForm.setFieldsValue({
      version: 'V0.0.0',
      upload_date: dayjs(),
    })
    void loadCustomers()
    void loadUsers()
    void loadList()
    void loadUnassigned()
  }, [loadCustomers, loadUsers, loadList, loadUnassigned, uploadForm])

  const openOwnerModal = (ids: number[]) => {
    setOwnerTargetIds(ids)
    ownerForm.resetFields()
    setOwnerModalOpen(true)
    void loadUsers()
  }

  const handleUploadSave = async () => {
    try {
      const values = await uploadForm.validateFields()
      if (!pendingFile) {
        message.warning('请先选择并上传原始合同文件')
        return
      }
      setSaving(true)
      const fd = new FormData()
      fd.append('customer_name', values.customer_name.trim())
      fd.append('version', values.version.trim())
      fd.append('upload_date', toYmd(values.upload_date))
      // 首次上传不填更新时间，后端存空
      if (values.summary) fd.append('summary', values.summary)
      if (values.total_amount != null && values.total_amount !== '') {
        fd.append('total_amount', String(values.total_amount))
      }
      fd.append('file', pendingFile)
      const res = await authFetch(apiUrl('/api/v1/contract-archives'), { method: 'POST', body: fd })
      const data = await readJson<{ item?: ArchiveRow; owner_assigned?: boolean; detail?: unknown }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      message.success('合同上传已完成')
      setPendingFile(null)
      setFileList([])
      uploadForm.setFieldsValue({
        summary: undefined,
        version: 'V0.0.0',
        upload_date: dayjs(),
        customer_name: undefined,
        total_amount: undefined,
      })
      await loadList()
      await loadUnassigned()
      await loadCustomers(values.customer_name)
      if (!data.owner_assigned) {
        Modal.confirm({
          title: '合同上传已完成，是否指定业务负责人？',
          okText: '是',
          cancelText: '否',
          onOk: () => openOwnerModal([data.item!.id]),
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmAssignOwner = async () => {
    const values = await ownerForm.validateFields()
    const res = await authFetch(apiUrl('/api/v1/contract-archives/assign-owner'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_user_id: values.owner_user_id, archive_ids: ownerTargetIds }),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success('业务负责人已指定')
    setOwnerModalOpen(false)
    setSelectedUnassigned([])
    notifyWorkbenchUnreadChanged()
    await loadList()
    await loadUnassigned()
  }

  const handleDownload = async (row: ArchiveRow) => {
    // 按上传原文件名下载，不做 .xlsx 等扩展名改写
    const saveInfo = await askSavePathAndFileName('下载原始合同', '', row.file_name, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    const res = await authFetch(apiUrl(`/api/v1/contract-archives/${row.id}/download`))
    if (!res.ok) {
      const data = await readJson(res)
      message.error(parseApiDetail(data))
      return
    }
    const blob = await res.blob()
    // 优先使用用户确认的文件名；若为空则回退服务端/库中的原始文件名
    const fileName =
      saveInfo.fileName.trim() || getDownloadFileName(res, row.file_name) || row.file_name
    const saved = await saveGeneratedBlob(blob, fileName, saveInfo.directoryPath)
    Modal.success({ title: '下载完成', content: saved ? `已保存至：${saved}` : '文件已下载' })
  }

  const handleDelete = (row: ArchiveRow) => {
    Modal.confirm({
      title: '确认删除该合同？',
      content: `将删除合同记录及已上传文件：${row.file_name}`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/contract-archives/${row.id}`), { method: 'DELETE' })
        const data = await readJson<{ detail?: unknown }>(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除合同及文件')
        setRows((prev) => prev.filter((r) => r.id !== row.id))
        setUnassigned((prev) => prev.filter((r) => r.id !== row.id))
        setSelectedUnassigned((prev) => prev.filter((id) => id !== row.id))
        notifyWorkbenchUnreadChanged()
      },
    })
  }

  const openMetaEdit = (row: ArchiveRow) => {
    setMetaTarget(row)
    metaForm.setFieldsValue({
      customer_name: row.customer_name,
      summary: row.summary || '',
      upload_date: dayjs(row.upload_date),
      updated_date: row.updated_date ? dayjs(row.updated_date) : undefined,
      owner_user_id: row.owner_user_id || undefined,
      total_amount: row.total_amount == null || row.total_amount === '' ? undefined : Number(row.total_amount),
    })
    setMetaModalOpen(true)
  }

  const saveMetaEdit = async () => {
    if (!metaTarget) return
    const values = await metaForm.validateFields()
    Modal.confirm({
      title: `确认修改合同「${metaTarget.file_name}」的信息？`,
      onOk: async () => {
        const body: Record<string, unknown> = {
          customer_name: values.customer_name.trim(),
          summary: values.summary || '',
          upload_date: toYmd(values.upload_date),
          updated_date: values.updated_date ? toYmd(values.updated_date) : '',
          total_amount:
            values.total_amount == null || values.total_amount === '' ? null : values.total_amount,
        }
        if (values.owner_user_id) body.owner_user_id = values.owner_user_id
        else body.clear_owner = true
        const res = await authFetch(apiUrl(`/api/v1/contract-archives/${metaTarget.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已更新')
        setMetaModalOpen(false)
        notifyWorkbenchUnreadChanged()
        await loadList()
        await loadUnassigned()
      },
    })
  }

  const openVersionUpdate = (row: ArchiveRow) => {
    Modal.confirm({
      title: '不可替换原文件',
      content: '是否对该合同进行版本更新？将新增一条归档记录。',
      okText: '是',
      cancelText: '否',
      onOk: () => {
        setVersionTarget(row)
        setVersionPendingFile(null)
        setVersionFileList([])
        versionForm.setFieldsValue({
          version: bumpVersion(row.version),
          updated_date: dayjs(),
          summary: row.summary || '',
          total_amount: row.total_amount == null || row.total_amount === '' ? undefined : Number(row.total_amount),
        })
        setVersionModalOpen(true)
      },
    })
  }

  const saveVersionUpdate = async () => {
    if (!versionTarget) return
    const values = await versionForm.validateFields()
    if (!versionPendingFile) {
      message.warning('请选择新版本合同文件')
      return
    }
    const fd = new FormData()
    fd.append('version', values.version.trim())
    fd.append('updated_date', toYmd(values.updated_date))
    if (values.summary != null) fd.append('summary', values.summary)
    if (values.total_amount != null) fd.append('total_amount', String(values.total_amount))
    fd.append('file', versionPendingFile)
    const res = await authFetch(apiUrl(`/api/v1/contract-archives/${versionTarget.id}/versions`), {
      method: 'POST',
      body: fd,
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success('合同版本已更新')
    setVersionModalOpen(false)
    notifyWorkbenchUnreadChanged()
    await loadList()
    await loadUnassigned()
  }

  const archiveColumns: ColumnsType<ArchiveRow> = useMemo(
    () => [
      { title: '客户名', dataIndex: 'customer_name', width: 240, fixed: 'left', ellipsis: false },
      {
        title: '合同附件',
        dataIndex: 'file_name',
        width: 320,
        fixed: 'left',
        ellipsis: false,
        render: (name: string, row) => (
          <Button type="link" size="small" className="contract-full-name-link" onClick={() => void handleDownload(row)}>
            {name}
          </Button>
        ),
      },
      { title: '版本号', dataIndex: 'version', width: 100 },
      {
        title: '合同总金额',
        dataIndex: 'total_amount',
        width: 130,
        render: (v: number | string | null) => formatAmount(v),
      },
      {
        title: '合同概述',
        dataIndex: 'summary',
        ellipsis: true,
        width: 160,
        render: (v: string | null) => v || '-',
      },
      { title: '上传时间', dataIndex: 'upload_date', width: 120 },
      { title: '上传者', dataIndex: 'uploaded_by_name', width: 100 },
      {
        title: '更新时间',
        dataIndex: 'updated_date',
        width: 120,
        render: (v: string | null) => v || '-',
      },
      { title: '更新者', dataIndex: 'updated_by_name', width: 100, render: (v: string | null) => v || '-' },
      {
        title: '业务负责人',
        dataIndex: 'owner_name',
        width: 120,
        render: (v: string | null) => v || <Tag>未指定</Tag>,
      },
      {
        title: '进度状态',
        dataIndex: 'progress_status',
        width: 90,
        render: (v: string | null) => {
          const s = v || '上传'
          const color = s === '确认' ? 'success' : s === '分配' ? 'orange' : s === '修改' ? 'gold' : 'default'
          return <Tag color={color}>{s}</Tag>
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 260,
        fixed: 'right',
        render: (_, row) => (
          <Space size={0} wrap>
            <Button type="link" size="small" onClick={() => openMetaEdit(row)}>
              编辑
            </Button>
            <Button type="link" size="small" onClick={() => openVersionUpdate(row)}>
              版本更新
            </Button>
            <Button type="link" size="small" onClick={() => void handleDownload(row)}>
              下载
            </Button>
            {canDeleteOwnedRow(row, currentUser?.id, currentUser?.role_code) ? (
              <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
                删除
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [currentUser]
  )

  const unassignedColumns: ColumnsType<ArchiveRow> = useMemo(
    () => [
      { title: '客户名', dataIndex: 'customer_name', width: 200 },
      { title: '文件名', dataIndex: 'file_name' },
      { title: '版本', dataIndex: 'version', width: 90 },
      { title: '上传时间', dataIndex: 'upload_date', width: 120 },
      { title: '上传者', dataIndex: 'uploaded_by_name', width: 100 },
      {
        title: '操作',
        key: 'action',
        width: 180,
        render: (_, row) => (
          <Space size={0} wrap>
            <Button type="link" size="small" onClick={() => openOwnerModal([row.id])}>
              指定负责人
            </Button>
            {canDeleteOwnedRow(row, currentUser?.id, currentUser?.role_code) ? (
              <Button type="link" size="small" danger onClick={() => handleDelete(row)}>
                删除
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [currentUser]
  )

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <div className="contract-upload-section">
        <Form form={uploadForm} layout="vertical" className="contract-archive-form">
          <div className="contract-form-row">
            <Form.Item
              name="customer_name"
              label="客户名"
              rules={[{ required: true, message: '客户名必须入力' }]}
              tooltip="可模糊检索历史客户名，也可直接输入新客户"
            >
              <AutoComplete
                style={{ width: 360 }}
                options={customerOptions}
                onSearch={(q) => void loadCustomers(q)}
                placeholder="请输入或选择客户名"
                allowClear
                filterOption={false}
              />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Form.Item name="upload_date" label="上传时间" rules={[{ required: true, message: '请选择上传日期' }]}>
              <DatePicker format="YYYYMMDD" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item label="上传者">
              <Input style={{ width: 160 }} disabled value={currentUser?.name || '当前用户'} />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Form.Item label="原始合同文件" required>
              <Upload
                accept={ACCEPT_TYPES}
                beforeUpload={(file) => {
                  const ext = file.name.split('.').pop()?.toLowerCase()
                  if (!ext || !['pdf', 'xlsx', 'xls'].includes(ext)) {
                    message.error('仅支持 pdf / excel')
                    return Upload.LIST_IGNORE
                  }
                  setPendingFile(file)
                  setFileList([{ uid: '-1', name: file.name, status: 'done' }])
                  return false
                }}
                maxCount={1}
                fileList={fileList}
                onRemove={() => {
                  setPendingFile(null)
                  setFileList([])
                }}
              >
                <Button>选择/拖拽文件</Button>
              </Upload>
            </Form.Item>
            <Form.Item
              name="version"
              label={
                <Tooltip title={VERSION_TIP}>
                  <span>版本号</span>
                </Tooltip>
              }
              rules={[
                { required: true, message: '版本号必须入力' },
                { pattern: /^V?\d+\.\d+\.\d+$/i, message: '格式如 V0.0.0' },
              ]}
            >
              <Input style={{ width: 140 }} placeholder="V0.0.0" />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Form.Item
              name="total_amount"
              label="合同总金额"
              rules={uploadAmountRequired ? [{ required: true, message: '请填入合同总金额' }] : []}
            >
              <InputNumber
                min={0}
                precision={2}
                style={{ width: 180 }}
                placeholder={uploadAmountRequired ? '0.00' : '非必填'}
              />
            </Form.Item>
            <Form.Item
              name="summary"
              label="合同概述"
              style={{ flex: 1, maxWidth: 720 }}
            >
              <Input.TextArea rows={2} placeholder="非必填" />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Button className="contract-upload-save-btn" loading={saving} onClick={() => void handleUploadSave()}>
              上传并保存
            </Button>
          </div>
        </Form>
      </div>

      <Collapse
        items={[
          {
            key: 'unassigned',
            label: (
              <span className="contract-unassigned-title">
                {`暂未指定业务负责人的合同（${unassigned.length}）`}
              </span>
            ),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Button
                    disabled={selectedUnassigned.length === 0}
                    onClick={() => openOwnerModal(selectedUnassigned.map((k) => Number(k)))}
                  >
                    批量指定负责人
                  </Button>
                  <Tag>{selectedUnassigned.length} 条已选</Tag>
                </Space>
                <Table
                  rowKey="id"
                  size="small"
                  columns={unassignedColumns}
                  dataSource={unassigned}
                  pagination={{ pageSize: 5 }}
                  rowSelection={{
                    selectedRowKeys: selectedUnassigned,
                    onChange: setSelectedUnassigned,
                  }}
                />
              </Space>
            ),
          },
        ]}
      />

      <div className="contract-query-section">
        <div className="contract-query-title">查询条件</div>
        <Form form={queryForm} layout="vertical" className="contract-archive-form">
          <div className="contract-form-row">
            <Form.Item name="customer_name" label="客户名">
              <AutoComplete
                style={{ width: 360 }}
                options={customerOptions}
                onSearch={(q) => void loadCustomers(q)}
                placeholder="请输入或选择客户名"
                allowClear
                filterOption={false}
              />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Form.Item name="file_name" label="文件名">
              <Input allowClear style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="version" label="版本号">
              <Input allowClear style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="owner_name" label="业务负责人">
              <Input allowClear style={{ width: 160 }} />
            </Form.Item>
          </div>
          <div className="contract-form-row contract-form-row--dates">
            <Form.Item label="上传日期">
              <Space>
                <Form.Item name="upload_date_from" noStyle>
                  <DatePicker format="YYYYMMDD" placeholder="从" />
                </Form.Item>
                <span>到</span>
                <Form.Item name="upload_date_to" noStyle>
                  <DatePicker format="YYYYMMDD" placeholder="到" />
                </Form.Item>
              </Space>
            </Form.Item>
            <Form.Item name="uploaded_by" label="上传者">
              <Input allowClear style={{ width: 140 }} />
            </Form.Item>
          </div>
          <div className="contract-form-row contract-form-row--dates">
            <Form.Item label="更新日期">
              <Space>
                <Form.Item name="updated_date_from" noStyle>
                  <DatePicker format="YYYYMMDD" placeholder="从" />
                </Form.Item>
                <span>到</span>
                <Form.Item name="updated_date_to" noStyle>
                  <DatePicker format="YYYYMMDD" placeholder="到" />
                </Form.Item>
              </Space>
            </Form.Item>
            <Form.Item name="updated_by" label="更新者">
              <Input allowClear style={{ width: 140 }} />
            </Form.Item>
          </div>
          <div className="contract-form-row">
            <Button type="primary" onClick={() => void loadList()}>
              查询
            </Button>
            <Tag color="blue" style={{ marginLeft: 8, alignSelf: 'center' }}>
              共 {total} 条
            </Tag>
          </div>
        </Form>
      </div>

      <Table
        className="contract-archive-table"
        rowKey="id"
        columns={archiveColumns}
        dataSource={rows}
        scroll={{ x: 1960 }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title="指定业务负责人"
        open={ownerModalOpen}
        onCancel={() => setOwnerModalOpen(false)}
        onOk={() => void confirmAssignOwner()}
        destroyOnClose
      >
        <Form form={ownerForm} layout="vertical">
          <Form.Item name="owner_user_id" label="业务负责人" rules={[{ required: true, message: '请选择业务负责人' }]}>
            <Select
              showSearch
              placeholder="模糊检索用户"
              options={userOptions.map((u) => ({
                value: u.id,
                label: `${u.name}（${u.username}）`,
              }))}
              onSearch={(q) => void loadUsers(q)}
              filterOption={false}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑合同信息"
        open={metaModalOpen}
        onCancel={() => setMetaModalOpen(false)}
        onOk={() => void saveMetaEdit()}
        destroyOnClose
      >
        <Form form={metaForm} layout="vertical">
          <Form.Item name="customer_name" label="客户名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="total_amount"
            label="合同总金额"
            rules={metaAmountRequired ? [{ required: true, message: '请填入合同总金额' }] : []}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              placeholder={metaAmountRequired ? '0.00' : '非必填'}
            />
          </Form.Item>
          <Form.Item name="summary" label="合同概述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="upload_date" label="上传时间" rules={[{ required: true }]}>
            <DatePicker format="YYYYMMDD" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="updated_date" label="更新时间" rules={[{ required: true }]}>
            <DatePicker format="YYYYMMDD" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="owner_user_id" label="业务负责人">
            <Select
              allowClear
              showSearch
              placeholder="可清空表示未指定"
              options={userOptions.map((u) => ({ value: u.id, label: `${u.name}（${u.username}）` }))}
              onSearch={(q) => void loadUsers(q)}
              filterOption={false}
            />
          </Form.Item>
          <div style={{ color: '#888', fontSize: 12 }}>修改文件或版本号请使用「版本更新」，不可原地替换文件。</div>
        </Form>
      </Modal>

      <Modal
        title="合同版本更新"
        open={versionModalOpen}
        onCancel={() => setVersionModalOpen(false)}
        onOk={() => void saveVersionUpdate()}
        destroyOnClose
      >
        <Form form={versionForm} layout="vertical">
          <Form.Item label="原版本">{versionTarget?.version}</Form.Item>
          <Form.Item
            name="version"
            label={<Tooltip title={VERSION_TIP}><span>新版本号</span></Tooltip>}
            rules={[{ required: true }, { pattern: /^V?\d+\.\d+\.\d+$/i, message: '格式如 V0.0.1' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="updated_date" label="更新时间" rules={[{ required: true }]}>
            <DatePicker format="YYYYMMDD" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="更新者">
            <Input disabled value={currentUser?.name || ''} />
          </Form.Item>
          <Form.Item label="新文件" required>
            <Upload
              accept={ACCEPT_TYPES}
              beforeUpload={(file) => {
                setVersionPendingFile(file)
                setVersionFileList([{ uid: '-1', name: file.name, status: 'done' }])
                return false
              }}
              maxCount={1}
              fileList={versionFileList}
              onRemove={() => {
                setVersionPendingFile(null)
                setVersionFileList([])
              }}
            >
              <Button>选择文件</Button>
            </Upload>
          </Form.Item>
          <Form.Item
            name="total_amount"
            label="合同总金额"
            rules={versionAmountRequired ? [{ required: true, message: '请填入合同总金额' }] : []}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              placeholder={versionAmountRequired ? '0.00' : '非必填'}
            />
          </Form.Item>
          <Form.Item name="summary" label="合同概述">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
