import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons'
import { Navigate } from 'react-router-dom'
import { apiUrl } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import { usePageTitle } from '../layout/usePageTitle'
import './UsersPage.css'

type RoleItem = {
  id: number
  code: string
  name_zh: string
}

type UserItem = {
  id: number
  name: string
  username: string
  role_id: number
  role_code: string
  role_name_zh: string
  department?: string | null
  language_preference?: string
  created_at?: string | null
}

const ADMIN_ROLE_CODES = new Set(['super_admin', 'general_manager'])

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

export default function UsersPage() {
  const pageTitle = usePageTitle()
  const currentUser = getStoredUser()
  const isAdmin = Boolean(currentUser?.role_code && ADMIN_ROLE_CODES.has(currentUser.role_code))

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [roleFilter, setRoleFilter] = useState<number | undefined>()

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<UserItem | null>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()

  const loadRoles = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/v1/auth/roles'))
    const data = await readJson<{ items?: RoleItem[] }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setRoles(data.items || [])
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (keyword.trim()) qs.set('q', keyword.trim())
      if (roleFilter != null) qs.set('role_id', String(roleFilter))
      qs.set('limit', '200')
      const res = await authFetch(apiUrl(`/api/v1/auth/users?${qs.toString()}`))
      const data = await readJson<{ items?: UserItem[]; total?: number }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setRows(data.items || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }, [keyword, roleFilter])

  useEffect(() => {
    if (!isAdmin) return
    void loadRoles()
  }, [isAdmin, loadRoles])

  useEffect(() => {
    if (!isAdmin) return
    void loadUsers()
  }, [isAdmin, loadUsers])

  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: `${r.name_zh}（${r.code}）` })),
    [roles]
  )

  const openCreate = () => {
    createForm.resetFields()
    createForm.setFieldsValue({
      role_id: 4,
      language_preference: 'zh-CN',
    })
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    const values = await createForm.validateFields()
    const res = await authFetch(apiUrl('/api/v1/auth/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: values.username.trim(),
        password: values.password,
        name: values.name.trim(),
        role_id: values.role_id,
        department: values.department?.trim() || null,
        language_preference: values.language_preference || 'zh-CN',
      }),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success('用户已创建')
    setCreateOpen(false)
    await loadUsers()
  }

  const openEdit = (row: UserItem) => {
    setEditing(row)
    editForm.setFieldsValue({
      name: row.name,
      role_id: row.role_id,
      department: row.department || '',
      language_preference: row.language_preference || 'zh-CN',
      password: '',
    })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editing) return
    const values = await editForm.validateFields()
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      role_id: values.role_id,
      department: values.department?.trim() || '',
      language_preference: values.language_preference || 'zh-CN',
    }
    if (values.password?.trim()) {
      body.password = values.password
    }
    const res = await authFetch(apiUrl(`/api/v1/auth/users/${editing.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readJson(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    message.success('用户已更新')
    setEditOpen(false)
    setEditing(null)
    await loadUsers()
  }

  const columns: ColumnsType<UserItem> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '显示名', dataIndex: 'name', width: 140 },
    { title: '用户名', dataIndex: 'username', width: 140 },
    {
      title: '角色',
      dataIndex: 'role_name_zh',
      width: 160,
      render: (text: string, row) => <Tag color={ADMIN_ROLE_CODES.has(row.role_code) ? 'red' : 'blue'}>{text || row.role_code}</Tag>,
    },
    { title: '部门', dataIndex: 'department', width: 120, render: (v: string | null) => v || '-' },
    { title: '语言', dataIndex: 'language_preference', width: 100 },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string | null) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => openEdit(row)}>
          编辑
        </Button>
      ),
    },
  ]

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="users-page">
      <div className="users-page-header">
        <span className="users-page-icon">
          <TeamOutlined />
        </span>
        <div>
          <h1 className="users-page-title">{pageTitle}</h1>
          <div className="users-page-subtitle">管理员可追加账号、调整角色与重置密码（无公开自助注册）</div>
        </div>
      </div>

      <Card>
        <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="按姓名 / 用户名 / 部门检索"
              style={{ width: 280 }}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={() => void loadUsers()}
            />
            <Select
              allowClear
              placeholder="按角色筛选"
              style={{ width: 220 }}
              options={roleOptions}
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v)
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void loadUsers()
              }}
            >
              刷新
            </Button>
            <Tag color="blue">共 {total} 人</Tag>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            追加用户
          </Button>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Modal
        title="追加用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        destroyOnClose
        okText="创建"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { pattern: /^[A-Za-z0-9_]{3,64}$/, message: '3–64 位字母、数字或下划线' },
            ]}
          >
            <Input placeholder="登录用账号" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="name" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input placeholder="界面显示的姓名" />
          </Form.Item>
          <Form.Item name="role_id" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} placeholder="请选择角色" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="language_preference" label="语言偏好">
            <Select
              options={[
                { value: 'zh-CN', label: '中文' },
                { value: 'en-US', label: 'English' },
                { value: 'ja-JP', label: '日本語' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? `编辑用户：${editing.username}` : '编辑用户'}
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditing(null)
        }}
        onOk={() => void submitEdit()}
        destroyOnClose
        okText="保存"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="显示名" rules={[{ required: true, message: '请输入显示名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role_id" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="language_preference" label="语言偏好">
            <Select
              options={[
                { value: 'zh-CN', label: '中文' },
                { value: 'en-US', label: 'English' },
                { value: 'ja-JP', label: '日本語' },
              ]}
            />
          </Form.Item>
          <Form.Item name="password" label="重置密码" extra="留空表示不修改密码；填写则至少 6 位">
            <Input.Password placeholder="留空则不修改" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
