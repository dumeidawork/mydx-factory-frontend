import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Drawer, Grid, Form, Input, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useState } from 'react'
import {
  DashboardOutlined,
  FileTextOutlined,
  ToolOutlined,
  DollarOutlined,
  SafetyOutlined,
  CarOutlined,
  InboxOutlined,
  MenuOutlined,
  TeamOutlined,
  KeyOutlined,
  BuildOutlined,
} from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch, clearAuthSession, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import styles from './MainLayout.module.css'

const { Header, Content } = Layout

const ADMIN_ROLE_CODES = new Set(['super_admin', 'general_manager'])

const navItems = [
  { key: '/', icon: <DashboardOutlined />, labelKey: 'nav.dashboard' },
  { key: '/contracts', icon: <FileTextOutlined />, labelKey: 'nav.contracts' },
  { key: '/manufacturing', icon: <BuildOutlined />, labelKey: 'nav.manufacturing' },
  { key: '/qc/heat-treatment', icon: <ToolOutlined />, labelKey: 'nav.heatTreatment' },
  { key: '/production', icon: <ToolOutlined />, labelKey: 'nav.production' },
  { key: '/finance', icon: <DollarOutlined />, labelKey: 'nav.finance' },
  { key: '/qc', icon: <SafetyOutlined />, labelKey: 'nav.qc' },
  { key: '/packing', icon: <InboxOutlined />, labelKey: 'nav.packing' },
  { key: '/shipping-marks', icon: <CarOutlined />, labelKey: 'nav.shippingMarks' },
  { key: '/users', icon: <TeamOutlined />, labelKey: 'nav.users', adminOnly: true },
]

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

export default function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const [open, setOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdForm] = Form.useForm()
  const isMobile = !screens.lg

  const currentUser = getStoredUser()
  const isAdmin = Boolean(currentUser?.role_code && ADMIN_ROLE_CODES.has(currentUser.role_code))

  const menuItems = navItems
    .filter((item) => !item.adminOnly || isAdmin)
    .map((item) => ({
      key: item.key,
      icon: item.icon,
      label: t(item.labelKey),
    }))

  const handleLogout = () => {
    clearAuthSession()
    navigate('/login', { replace: true })
  }

  const openChangePassword = () => {
    pwdForm.resetFields()
    setPwdOpen(true)
  }

  const submitChangePassword = async () => {
    const values = await pwdForm.validateFields()
    setPwdSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/auth/change-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_password: values.old_password,
          new_password: values.new_password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setPwdOpen(false)
      Modal.success({
        title: '密码已修改',
        content: '请使用新密码重新登录',
        onOk: handleLogout,
      })
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <Layout className={styles.layout}>
      <Header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              className={styles.mobileMenuBtn}
              onClick={() => setOpen(true)}
            />
          )}
          <span className={styles.brand}>{t('app.shortName')}</span>
          {!isMobile && (
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[location.pathname || '/']}
              items={menuItems}
              onClick={({ key }) => navigate(key)}
              className={styles.desktopNav}
            />
          )}
        </div>
        <div className={styles.rightActions}>
          {currentUser?.name ? <span className={styles.userName}>{currentUser.name}</span> : null}
          <Button type="link" icon={<KeyOutlined />} onClick={openChangePassword} className={styles.logoutBtn}>
            {t('common.changePassword')}
          </Button>
          <LanguageSwitcher />
          <Button type="link" onClick={handleLogout} className={styles.logoutBtn}>
            {t('common.logout')}
          </Button>
        </div>
      </Header>
      <Drawer
        title={t('app.shortName')}
        placement="left"
        width={260}
        onClose={() => setOpen(false)}
        open={open}
      >
        <Menu
          mode="inline"
          selectedKeys={[location.pathname || '/']}
          items={menuItems}
          onClick={({ key }) => {
            navigate(key)
            setOpen(false)
          }}
        />
      </Drawer>
      <Content className={styles.content}>
        <Outlet />
      </Content>

      <Modal
        title="修改密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => void submitChangePassword()}
        confirmLoading={pwdSaving}
        destroyOnClose
        okText="确认修改"
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item name="old_password" label="旧密码" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '至少 6 位' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                  return Promise.reject(new Error('两次输入的新密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}
