import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Breadcrumb,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadRequestOption } from 'rc-upload/lib/interface'
import {
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  FileZipOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { askSavePathAndFileName } from '../utils/savePath'
import { getDownloadFileName, readFetchErrorMessage, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { ADMIN_ROLE_CODES } from '../layout/navConfig'
import { usePageTitle } from '../layout/usePageTitle'
import './ResourceFetchPage.css'

type PublicRoot = {
  id: number
  name: string
  remark?: string
}

type RoleItem = {
  id: number
  code: string
  name_zh: string
}

type AdminRoot = {
  id: number
  name: string
  absolute_path: string
  enabled: boolean
  sort_order: number
  remark: string
  role_ids?: number[]
  roles?: RoleItem[]
  created_by?: string
  updated_by?: string
  created_at?: string | null
  updated_at?: string | null
  path_exists?: boolean
}

type BrowseItem = {
  name: string
  kind: 'dir' | 'file' | 'archive'
  size: number
  mtime?: string | null
  rel: string
}

type BreadcrumbItem = {
  name: string
  rel: string
}

type DownloadLog = {
  id: number
  root_id: number
  root_name: string
  rel_path: string
  file_name: string
  item_kind: string
  downloaded_by: string
  downloaded_at?: string | null
}

type WriteLog = {
  id: number
  root_id: number
  root_name: string
  rel_path: string
  file_name: string
  item_kind: string
  action: string
  created_by: string
  created_at?: string | null
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

function formatBytes(size: number, kind: string) {
  if (kind === 'dir') return '-'
  if (!Number.isFinite(size) || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function kindLabel(kind: string) {
  if (kind === 'dir') return '文件夹'
  if (kind === 'archive') return '压缩包'
  return '文件'
}

function kindIcon(kind: string) {
  if (kind === 'dir') return <FolderOutlined />
  if (kind === 'archive') return <FileZipOutlined />
  return <FileOutlined />
}

function zipNameFor(rel: string, rootName: string) {
  if (!rel) return `${rootName || 'folder'}.zip`
  const parts = rel.split('/').filter(Boolean)
  return `${parts[parts.length - 1] || rootName || 'folder'}.zip`
}

function writeActionLabel(action: string) {
  if (action === 'mkdir') return '新建文件夹'
  return '上传'
}

export default function ResourceFetchPage() {
  const pageTitle = usePageTitle()
  const currentUser = getStoredUser()
  const isAdmin = Boolean(currentUser?.role_code && ADMIN_ROLE_CODES.has(currentUser.role_code))

  const [roots, setRoots] = useState<PublicRoot[]>([])
  const [rootsLoading, setRootsLoading] = useState(true)
  const [rootId, setRootId] = useState<number | null>(null)
  const [rel, setRel] = useState('')
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>([])
  const [items, setItems] = useState<BrowseItem[]>([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [downloadingRel, setDownloadingRel] = useState<string | null>(null)

  const [configOpen, setConfigOpen] = useState(false)
  const [adminRows, setAdminRows] = useState<AdminRoot[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminRoot | null>(null)
  const [editForm] = Form.useForm()
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [activeTab, setActiveTab] = useState('browse')
  const [logs, setLogs] = useState<DownloadLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsLoading, setLogsLoading] = useState(false)
  const [logKeyword, setLogKeyword] = useState('')
  const [logRootId, setLogRootId] = useState<number | undefined>()
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(50)
  const logKeywordRef = useRef(logKeyword)
  logKeywordRef.current = logKeyword

  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [mkdirSaving, setMkdirSaving] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)

  const [writeLogs, setWriteLogs] = useState<WriteLog[]>([])
  const [writeLogsTotal, setWriteLogsTotal] = useState(0)
  const [writeLogsLoading, setWriteLogsLoading] = useState(false)
  const [writeLogKeyword, setWriteLogKeyword] = useState('')
  const [writeLogRootId, setWriteLogRootId] = useState<number | undefined>()
  const [writeLogPage, setWriteLogPage] = useState(1)
  const [writeLogPageSize, setWriteLogPageSize] = useState(50)
  const writeLogKeywordRef = useRef(writeLogKeyword)
  writeLogKeywordRef.current = writeLogKeyword

  const selectedRoot = useMemo(() => roots.find((r) => r.id === rootId) || null, [roots, rootId])

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.name.toLowerCase().includes(q))
  }, [items, keyword])

  const loadRoots = useCallback(async () => {
    setRootsLoading(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/resource-fetch/roots'))
      const data = await readJson<{ items?: PublicRoot[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      const next = data.items || []
      setRoots(next)
      setRootId((prev) => {
        if (prev && next.some((r) => r.id === prev)) return prev
        return next[0]?.id ?? null
      })
    } finally {
      setRootsLoading(false)
    }
  }, [])

  const browse = useCallback(async (id: number, nextRel: string) => {
    setBrowseLoading(true)
    try {
      const qs = new URLSearchParams({ root_id: String(id), rel: nextRel })
      const res = await authFetch(apiUrl(`/api/v1/resource-fetch/browse?${qs.toString()}`))
      const data = await readJson<{
        items?: BrowseItem[]
        breadcrumbs?: BreadcrumbItem[]
        rel?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        setItems([])
        return
      }
      setItems(data.items || [])
      setCrumbs(data.breadcrumbs || [])
      setRel(data.rel || '')
    } finally {
      setBrowseLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoots()
  }, [loadRoots])

  useEffect(() => {
    if (rootId == null) {
      setItems([])
      setCrumbs([])
      setRel('')
      return
    }
    void browse(rootId, '')
  }, [rootId, browse])

  const enterDir = (nextRel: string) => {
    if (rootId == null) return
    setKeyword('')
    void browse(rootId, nextRel)
  }

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (logKeywordRef.current.trim()) qs.set('q', logKeywordRef.current.trim())
      if (logRootId) qs.set('root_id', String(logRootId))
      qs.set('limit', String(logPageSize))
      qs.set('offset', String((logPage - 1) * logPageSize))
      const res = await authFetch(apiUrl(`/api/v1/resource-fetch/download-logs?${qs.toString()}`))
      const data = await readJson<{ items?: DownloadLog[]; total?: number; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setLogs(data.items || [])
      setLogsTotal(data.total || 0)
    } finally {
      setLogsLoading(false)
    }
  }, [logRootId, logPage, logPageSize])

  useEffect(() => {
    if (activeTab === 'logs') void loadLogs()
  }, [activeTab, loadLogs])

  const loadWriteLogs = useCallback(async () => {
    if (!isAdmin) return
    setWriteLogsLoading(true)
    try {
      const qs = new URLSearchParams()
      if (writeLogKeywordRef.current.trim()) qs.set('q', writeLogKeywordRef.current.trim())
      if (writeLogRootId) qs.set('root_id', String(writeLogRootId))
      qs.set('limit', String(writeLogPageSize))
      qs.set('offset', String((writeLogPage - 1) * writeLogPageSize))
      const res = await authFetch(apiUrl(`/api/v1/resource-fetch/admin/write-logs?${qs.toString()}`))
      const data = await readJson<{ items?: WriteLog[]; total?: number; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setWriteLogs(data.items || [])
      setWriteLogsTotal(data.total || 0)
    } finally {
      setWriteLogsLoading(false)
    }
  }, [isAdmin, writeLogRootId, writeLogPage, writeLogPageSize])

  useEffect(() => {
    if (activeTab === 'write-logs') void loadWriteLogs()
  }, [activeTab, loadWriteLogs])

  const refreshCurrentDir = () => {
    if (rootId != null) void browse(rootId, rel)
  }

  const submitMkdir = async () => {
    if (rootId == null) return
    const name = mkdirName.trim()
    if (!name) {
      message.warning('请填写文件夹名称')
      return
    }
    setMkdirSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/resource-fetch/admin/mkdir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root_id: rootId, rel, name }),
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      message.success('文件夹已创建')
      setMkdirOpen(false)
      setMkdirName('')
      refreshCurrentDir()
      if (activeTab === 'write-logs') void loadWriteLogs()
    } finally {
      setMkdirSaving(false)
    }
  }

  const uploadFile = async (options: UploadRequestOption) => {
    const raw = options.file
    const file = raw instanceof File ? raw : null
    if (!file || rootId == null) {
      options.onError?.(new Error('无法上传'))
      return
    }
    const fd = new FormData()
    fd.append('root_id', String(rootId))
    fd.append('rel', rel)
    fd.append('file', file)
    setUploadingCount((n) => n + 1)
    try {
      const res = await authFetch(apiUrl('/api/v1/resource-fetch/admin/upload'), {
        method: 'POST',
        body: fd,
      })
      const data = await readJson<{ item?: { name?: string }; detail?: unknown }>(res)
      if (!res.ok) {
        const err = new Error(parseApiDetail(data))
        message.error(`${file.name}：${err.message}`)
        options.onError?.(err)
        return
      }
      message.success(`${data.item?.name || file.name} 已上传`)
      options.onSuccess?.(data)
      refreshCurrentDir()
      if (activeTab === 'write-logs') void loadWriteLogs()
    } catch (e) {
      const err = e instanceof Error ? e : new Error('上传失败')
      message.error(`${file.name}：${err.message}`)
      options.onError?.(err)
    } finally {
      setUploadingCount((n) => Math.max(0, n - 1))
    }
  }

  const downloadPath = async (targetRel: string, suggestedName: string) => {
    if (rootId == null) return
    const saveInfo = await askSavePathAndFileName('下载资材', '', suggestedName, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    setDownloadingRel(targetRel)
    try {
      const qs = new URLSearchParams({ root_id: String(rootId), rel: targetRel })
      const res = await authFetch(apiUrl(`/api/v1/resource-fetch/download?${qs.toString()}`))
      if (!res.ok) {
        message.error(await readFetchErrorMessage(res))
        return
      }
      const blob = await res.blob()
      const finalName = getDownloadFileName(res, saveInfo.fileName || suggestedName)
      const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
      if (saved) message.success('下载完成')
      if (activeTab === 'logs') void loadLogs()
    } finally {
      setDownloadingRel(null)
    }
  }

  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: `${r.name_zh || r.code}（${r.code}）` })),
    [roles],
  )

  const loadRoles = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/v1/auth/roles'))
    const data = await readJson<{ items?: RoleItem[]; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setRoles(data.items || [])
  }, [])

  const loadAdminRoots = useCallback(async () => {
    setAdminLoading(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/resource-fetch/admin/roots'))
      const data = await readJson<{ items?: AdminRoot[]; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setAdminRows(data.items || [])
    } finally {
      setAdminLoading(false)
    }
  }, [])

  const openConfig = () => {
    setConfigOpen(true)
    void loadRoles()
    void loadAdminRoots()
  }

  const openCreate = () => {
    setEditing(null)
    editForm.resetFields()
    editForm.setFieldsValue({ enabled: true, sort_order: 0, remark: '', allowed_role_ids: [] })
    if (!roles.length) void loadRoles()
    setEditOpen(true)
  }

  const openEdit = (row: AdminRoot) => {
    setEditing(row)
    editForm.setFieldsValue({
      name: row.name,
      absolute_path: row.absolute_path,
      enabled: row.enabled,
      sort_order: row.sort_order,
      remark: row.remark,
      allowed_role_ids: row.role_ids || [],
    })
    if (!roles.length) void loadRoles()
    setEditOpen(true)
  }

  const submitRoot = async () => {
    const values = await editForm.validateFields()
    const body = {
      name: String(values.name || '').trim(),
      absolute_path: String(values.absolute_path || '').trim(),
      enabled: Boolean(values.enabled),
      sort_order: Number(values.sort_order || 0),
      remark: String(values.remark || '').trim(),
      allowed_role_ids: Array.isArray(values.allowed_role_ids) ? values.allowed_role_ids : [],
    }
    const url = editing
      ? apiUrl(`/api/v1/resource-fetch/admin/roots/${editing.id}`)
      : apiUrl('/api/v1/resource-fetch/admin/roots')
    const res = await authFetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success(editing ? '目录已更新' : '目录已添加')
    setEditOpen(false)
    setEditing(null)
    await loadAdminRoots()
    await loadRoots()
  }

  const toggleEnabled = async (row: AdminRoot, enabled: boolean) => {
    const res = await authFetch(apiUrl(`/api/v1/resource-fetch/admin/roots/${row.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    await loadAdminRoots()
    await loadRoots()
  }

  const removeRoot = (row: AdminRoot) => {
    Modal.confirm({
      title: `删除目录「${row.name}」？`,
      content: '仅删除配置，不会删除磁盘上的文件。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await authFetch(apiUrl(`/api/v1/resource-fetch/admin/roots/${row.id}`), {
          method: 'DELETE',
        })
        const data = await readJson(res)
        if (!res.ok) {
          message.error(parseApiDetail(data))
          return
        }
        message.success('已删除')
        await loadAdminRoots()
        await loadRoots()
      },
    })
  }

  const columns: ColumnsType<BrowseItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (name: string, row) => (
        <span className="rf-name-cell">
          {kindIcon(row.kind)}
          {row.kind === 'dir' ? (
            <Button className="rf-name-btn" type="link" onClick={() => enterDir(row.rel)}>
              {name}
            </Button>
          ) : (
            name
          )}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 100,
      render: (kind: string) => kindLabel(kind),
    },
    {
      title: '大小',
      dataIndex: 'size',
      width: 110,
      render: (size: number, row) => formatBytes(size, row.kind),
    },
    {
      title: '修改时间',
      dataIndex: 'mtime',
      width: 180,
      render: (v?: string | null) => v || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="link"
          size="small"
          icon={<DownloadOutlined />}
          loading={downloadingRel === row.rel}
          onClick={() =>
            void downloadPath(row.rel, row.kind === 'dir' ? `${row.name}.zip` : row.name)
          }
        >
          下载
        </Button>
      ),
    },
  ]

  const adminColumns: ColumnsType<AdminRoot> = [
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '绝对路径', dataIndex: 'absolute_path', ellipsis: true },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (v: boolean, row) => (
        <Switch checked={v} onChange={(checked) => void toggleEnabled(row, checked)} />
      ),
    },
    { title: '排序', dataIndex: 'sort_order', width: 70 },
    {
      title: '可访问角色',
      dataIndex: 'roles',
      width: 220,
      render: (items?: RoleItem[]) =>
        items?.length ? (
          <Space size={[0, 4]} wrap>
            {items.map((r) => (
              <Tag key={r.id}>{r.name_zh || r.code}</Tag>
            ))}
          </Space>
        ) : (
          <Tag>全部登录用户</Tag>
        ),
    },
    {
      title: '路径',
      dataIndex: 'path_exists',
      width: 90,
      render: (v?: boolean) => (v ? <Tag color="green">存在</Tag> : <Tag>未找到</Tag>),
    },
    { title: '备注', dataIndex: 'remark', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRoot(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const logColumns: ColumnsType<DownloadLog> = [
    { title: '时间', dataIndex: 'downloaded_at', width: 180, render: (v?: string | null) => v || '-' },
    { title: '下载人', dataIndex: 'downloaded_by', width: 120 },
    { title: '根目录', dataIndex: 'root_name', width: 180, ellipsis: true },
    {
      title: '文件',
      dataIndex: 'file_name',
      ellipsis: true,
      render: (name: string, row) => (
        <span>
          {name || '-'}
          {row.rel_path ? <div className="rf-log-rel">{row.rel_path}</div> : null}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'item_kind',
      width: 90,
      render: (kind: string) => kindLabel(kind),
    },
  ]

  const writeLogColumns: ColumnsType<WriteLog> = [
    { title: '时间', dataIndex: 'created_at', width: 180, render: (v?: string | null) => v || '-' },
    { title: '操作人', dataIndex: 'created_by', width: 120 },
    {
      title: '操作',
      dataIndex: 'action',
      width: 120,
      render: (action: string) => writeActionLabel(action),
    },
    { title: '根目录', dataIndex: 'root_name', width: 180, ellipsis: true },
    {
      title: '文件',
      dataIndex: 'file_name',
      ellipsis: true,
      render: (name: string, row) => (
        <span>
          {name || '-'}
          {row.rel_path ? <div className="rf-log-rel">{row.rel_path}</div> : null}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'item_kind',
      width: 90,
      render: (kind: string) => kindLabel(kind),
    },
  ]

  return (
    <div className="rf-page">
      <div className="rf-header">
        <div className="rf-header-left">
          <span className="rf-icon">
            <FolderOpenOutlined />
          </span>
          <div>
            <h1 className="rf-title">{pageTitle}</h1>
            <div className="rf-subtitle">
              {isAdmin
                ? '浏览并下载已配置目录中的文件；也可上传文件/压缩包，或新建子文件夹'
                : '从本机（部署后为服务器）已配置目录中浏览并下载文件、文件夹或压缩包'}
            </div>
          </div>
        </div>
        {isAdmin ? (
          <Button icon={<SettingOutlined />} onClick={openConfig}>
            配置目录
          </Button>
        ) : null}
      </div>

      {rootsLoading && roots.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#667085' }}>加载中...</div>
      ) : !roots.length ? (
        <Empty description="当前角色暂无可访问目录，请联系管理员配置" />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'browse',
              label: '浏览下载',
              children: (
        <div className="rf-body">
          <aside className="rf-sider">
            <div className="rf-sider-title">根目录</div>
            <div style={{ padding: 8 }}>
              {roots.map((r) => (
                <Button
                  key={r.id}
                  type={r.id === rootId ? 'primary' : 'text'}
                  block
                  style={{ textAlign: 'left', marginBottom: 4 }}
                  onClick={() => {
                    setKeyword('')
                    if (r.id === rootId) {
                      void browse(r.id, '')
                    } else {
                      setRootId(r.id)
                    }
                  }}
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </aside>
          <section className="rf-main">
            <Breadcrumb
              items={crumbs.map((c) => ({
                title: (
                  <Button type="link" className="rf-name-btn" onClick={() => enterDir(c.rel)}>
                    {c.name || '根目录'}
                  </Button>
                ),
              }))}
            />
            <div className="rf-toolbar">
              <Input.Search
                allowClear
                placeholder="过滤当前目录文件名"
                style={{ width: 260 }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => rootId != null && void browse(rootId, rel)}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                disabled={rootId == null}
                loading={downloadingRel === rel}
                onClick={() =>
                  void downloadPath(rel, zipNameFor(rel, selectedRoot?.name || 'folder'))
                }
              >
                下载当前文件夹
              </Button>
              {isAdmin ? (
                <>
                  <Button
                    icon={<FolderAddOutlined />}
                    disabled={rootId == null}
                    onClick={() => {
                      setMkdirName('')
                      setMkdirOpen(true)
                    }}
                  >
                    新建文件夹
                  </Button>
                  <Upload
                    multiple
                    showUploadList={false}
                    disabled={rootId == null}
                    customRequest={(options) => void uploadFile(options)}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      disabled={rootId == null}
                      loading={uploadingCount > 0}
                    >
                      上传
                    </Button>
                  </Upload>
                </>
              ) : null}
            </div>
            <Table
              rowKey="rel"
              size="small"
              loading={browseLoading || rootsLoading}
              columns={columns}
              dataSource={filteredItems}
              pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `共 ${t} 项` }}
              scroll={{ x: 800 }}
              onRow={(row) => ({
                onDoubleClick: () => {
                  if (row.kind === 'dir') enterDir(row.rel)
                },
              })}
            />
          </section>
        </div>
              ),
            },
            {
              key: 'logs',
              label: '下载记录',
              children: (
                <div className="rf-logs">
                  <div className="rf-toolbar">
                    <Select
                      allowClear
                      placeholder="按根目录筛选"
                      style={{ width: 220 }}
                      value={logRootId}
                      options={roots.map((r) => ({ value: r.id, label: r.name }))}
                      onChange={(v) => {
                        setLogRootId(v)
                        setLogPage(1)
                      }}
                    />
                    <Input.Search
                      allowClear
                      placeholder="根目录 / 文件 / 下载人"
                      style={{ width: 280 }}
                      value={logKeyword}
                      onChange={(e) => setLogKeyword(e.target.value)}
                      onSearch={() => {
                        setLogPage(1)
                        void loadLogs()
                      }}
                    />
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => void loadLogs()}
                    >
                      刷新
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={logsLoading}
                    columns={logColumns}
                    dataSource={logs}
                    pagination={{
                      current: logPage,
                      pageSize: logPageSize,
                      total: logsTotal,
                      showSizeChanger: true,
                      showTotal: (t) => `共 ${t} 条`,
                      onChange: (page, size) => {
                        setLogPage(page)
                        setLogPageSize(size)
                      },
                    }}
                    scroll={{ x: 900 }}
                  />
                </div>
              ),
            },
            ...(isAdmin
              ? [
                  {
                    key: 'write-logs',
                    label: '上传记录',
                    children: (
                      <div className="rf-logs">
                        <div className="rf-toolbar">
                          <Select
                            allowClear
                            placeholder="按根目录筛选"
                            style={{ width: 220 }}
                            value={writeLogRootId}
                            options={roots.map((r) => ({ value: r.id, label: r.name }))}
                            onChange={(v: number | undefined) => {
                              setWriteLogRootId(v)
                              setWriteLogPage(1)
                            }}
                          />
                          <Input.Search
                            allowClear
                            placeholder="根目录 / 文件 / 操作人"
                            style={{ width: 280 }}
                            value={writeLogKeyword}
                            onChange={(e) => setWriteLogKeyword(e.target.value)}
                            onSearch={() => {
                              setWriteLogPage(1)
                              void loadWriteLogs()
                            }}
                          />
                          <Button icon={<ReloadOutlined />} onClick={() => void loadWriteLogs()}>
                            刷新
                          </Button>
                        </div>
                        <Table
                          rowKey="id"
                          size="small"
                          loading={writeLogsLoading}
                          columns={writeLogColumns}
                          dataSource={writeLogs}
                          pagination={{
                            current: writeLogPage,
                            pageSize: writeLogPageSize,
                            total: writeLogsTotal,
                            showSizeChanger: true,
                            showTotal: (t: number) => `共 ${t} 条`,
                            onChange: (page: number, size: number) => {
                              setWriteLogPage(page)
                              setWriteLogPageSize(size)
                            },
                          }}
                          scroll={{ x: 900 }}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <Drawer
        title="配置可访问目录"
        width={1080}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加目录
          </Button>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={adminLoading}
          columns={adminColumns}
          dataSource={adminRows}
          pagination={false}
          scroll={{ x: 1100 }}
        />
      </Drawer>

      <Modal
        title={editing ? `编辑目录：${editing.name}` : '添加目录'}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditing(null)
        }}
        onOk={() => void submitRoot()}
        destroyOnClose
        okText="保存"
        width={560}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '请填写名称' }]}>
            <Input placeholder="如：原材质保书" />
          </Form.Item>
          <Form.Item
            name="absolute_path"
            label="服务器绝对路径"
            rules={[{ required: true, message: '请填写绝对路径' }]}
            extra="开发机即本机路径；部署后填写服务器上的路径，支持盘符或 UNC（\\nas\share）"
          >
            <Input placeholder="C:\share\materials 或 \\nas\share\materials" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="allowed_role_ids"
            label="可查看/下载的角色"
            rules={[{ required: true, type: 'array', min: 1, message: '请至少选择一个角色' }]}
            extra="仅所选角色能在资材获取中看到并下载该目录。管理员始终可浏览、下载，并可以上传文件或新建文件夹。"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择角色（可多选）"
              options={roleOptions}
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建文件夹"
        open={mkdirOpen}
        onCancel={() => {
          setMkdirOpen(false)
          setMkdirName('')
        }}
        onOk={() => void submitMkdir()}
        confirmLoading={mkdirSaving}
        okText="创建"
        destroyOnClose
      >
        <Input
          autoFocus
          placeholder="文件夹名称"
          value={mkdirName}
          onChange={(e) => setMkdirName(e.target.value)}
          onPressEnter={() => void submitMkdir()}
        />
      </Modal>
    </div>
  )
}
