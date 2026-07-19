import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Drawer, Grid } from 'antd'
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
} from '@ant-design/icons'
import styles from './MainLayout.module.css'

const { Header, Content } = Layout

const navItems = [
  { key: '/', icon: <DashboardOutlined />, labelKey: 'nav.dashboard' },
  { key: '/contracts', icon: <FileTextOutlined />, labelKey: 'nav.contracts' },
  { key: '/qc/heat-treatment', icon: <ToolOutlined />, labelKey: 'nav.heatTreatment' },
  { key: '/production', icon: <ToolOutlined />, labelKey: 'nav.production' },
  { key: '/finance', icon: <DollarOutlined />, labelKey: 'nav.finance' },
  { key: '/qc', icon: <SafetyOutlined />, labelKey: 'nav.qc' },
  { key: '/packing', icon: <InboxOutlined />, labelKey: 'nav.packing' },
  { key: '/shipping-marks', icon: <CarOutlined />, labelKey: 'nav.shippingMarks' },
]

export default function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const screens = Grid.useBreakpoint()
  const [open, setOpen] = useState(false)
  const isMobile = !screens.lg

  const menuItems = navItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: t(item.labelKey),
  }))

  const handleLogout = () => {
    localStorage.removeItem('erp_token')
    navigate('/login', { replace: true })
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
    </Layout>
  )
}
