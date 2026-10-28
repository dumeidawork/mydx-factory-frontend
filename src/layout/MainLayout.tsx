import { Outlet, useNavigate } from 'react-router-dom'
import { Layout, Menu, Button, Drawer, Grid, Form, Input, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import {
  authFetch,
  clearAuthSession,
  getStoredUser,
  normalizeLayoutMode,
  updateStoredUser,
  type LayoutMode,
} from '../utils/auth'
import { message } from '../utils/feedback'
import { useColorTheme } from '../theme/ThemeProvider'
import { normalizeColorTheme, type ColorThemeId } from '../theme/themes'
import LayoutSettingsDrawer from './LayoutSettingsDrawer'
import ModuleRail from './ModuleRail'
import { OverviewModuleBar, OverviewSearch } from './OverviewNav'
import SideNav from './SideNav'
import { useNavMenu } from './useNavMenu'
import { useWorkbenchUnread } from './WorkbenchUnreadContext'
import styles from './MainLayout.module.css'

const { Header, Content, Sider } = Layout
const SUBNAV_COLLAPSED_KEY = 'erp_subnav_collapsed'

function readSubNavCollapsed(): boolean {
  try {
    return localStorage.getItem(SUBNAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeSubNavCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SUBNAV_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
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

export default function MainLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const [open, setOpen] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [subNavCollapsed, setSubNavCollapsed] = useState(readSubNavCollapsed)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() =>
    normalizeLayoutMode(getStoredUser()?.layout_mode),
  )
  const { themeId, theme, setThemeId } = useColorTheme()
  const navTheme = theme.navTheme
  const [pwdForm] = Form.useForm()
  const isMobile = !screens.lg
  const {
    currentUser,
    menuItems,
    topLevelItems,
    moduleChildItems,
    leafPages,
    selectedNavKey,
    activeModuleKey,
    defaultOpenKeys,
    onMenuClick,
    onModuleClick,
  } = useNavMenu()
  const { count: unreadCount } = useWorkbenchUnread()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch(apiUrl('/api/v1/auth/me'))
        if (!res.ok) return
        const data = (await res.json()) as { layout_mode?: string; color_theme?: string }
        if (cancelled) return
        const mode = normalizeLayoutMode(data.layout_mode)
        const nextTheme = normalizeColorTheme(data.color_theme)
        updateStoredUser({ layout_mode: mode, color_theme: nextTheme })
        setLayoutMode(mode)
        setThemeId(nextTheme)
      } catch {
        /* ignore sync errors; keep local preference */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setThemeId])

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

  const changeLayoutMode = async (mode: LayoutMode) => {
    const previous = layoutMode
    setLayoutMode(mode)
    updateStoredUser({ layout_mode: mode })
    setPrefsSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/auth/me'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout_mode: mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLayoutMode(previous)
        updateStoredUser({ layout_mode: previous })
        message.error(parseApiDetail(data))
        return
      }
      const next = normalizeLayoutMode((data as { layout_mode?: string }).layout_mode || mode)
      updateStoredUser({ layout_mode: next })
      setLayoutMode(next)
      message.success(t('layout.saved'))
    } catch {
      setLayoutMode(previous)
      updateStoredUser({ layout_mode: previous })
      message.error(t('layout.saveFailed'))
    } finally {
      setPrefsSaving(false)
    }
  }

  const changeColorTheme = async (id: ColorThemeId) => {
    const previous = themeId
    setThemeId(id)
    updateStoredUser({ color_theme: id })
    setPrefsSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/auth/me'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_theme: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setThemeId(previous)
        updateStoredUser({ color_theme: previous })
        message.error(parseApiDetail(data))
        return
      }
      const next = normalizeColorTheme((data as { color_theme?: string }).color_theme || id)
      updateStoredUser({ color_theme: next })
      setThemeId(next)
      message.success(t('theme.saved'))
    } catch {
      setThemeId(previous)
      updateStoredUser({ color_theme: previous })
      message.error(t('theme.saveFailed'))
    } finally {
      setPrefsSaving(false)
    }
  }

  const settingsButton = (
    <Button
      type="link"
      icon={<SettingOutlined />}
      onClick={() => setSettingsOpen(true)}
      className={styles.actionBtn}
      title={t('layout.settings')}
      aria-label={t('layout.settings')}
    />
  )

  const headerActions = (
    <div className={styles.headerActions}>
      {currentUser?.name ? <span className={styles.userName}>{currentUser.name}</span> : null}
      {settingsButton}
      <Button type="link" onClick={handleLogout} className={styles.actionBtn}>
        {t('common.logout')}
      </Button>
    </div>
  )

  const siderFooter = (
    <div className={styles.siderFooter}>
      <div className={styles.siderFooterTop}>
        <span className={styles.siderUserName}>{currentUser?.name || ''}</span>
        <Button
          type="text"
          icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
          className={styles.siderGearBtn}
          title={t('layout.settings')}
          aria-label={t('layout.settings')}
        />
      </div>
      <Button type="default" block onClick={handleLogout} className={styles.siderLogoutBtn}>
        {t('common.logout')}
      </Button>
    </div>
  )

  const mobileDrawer = (
    <Drawer
      title={t('app.shortName')}
      placement="left"
      width={260}
      onClose={() => setOpen(false)}
      open={open}
    >
      <Menu
        mode="inline"
        selectedKeys={[selectedNavKey]}
        defaultOpenKeys={defaultOpenKeys}
        items={menuItems}
        onClick={({ key }) => onMenuClick(key, () => setOpen(false))}
      />
    </Drawer>
  )

  const passwordModal = (
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
  )

  const settingsDrawer = (
    <LayoutSettingsDrawer
      open={settingsOpen}
      value={layoutMode}
      colorTheme={themeId}
      saving={prefsSaving}
      onClose={() => setSettingsOpen(false)}
      onChange={(mode) => void changeLayoutMode(mode)}
      onColorThemeChange={(id) => void changeColorTheme(id)}
      onChangePassword={openChangePassword}
    />
  )

  const mobileHeader = (
    <Header className={styles.header}>
      <div className={styles.headerLeft}>
        <Button
          type="text"
          icon={<MenuOutlined />}
          className={styles.mobileMenuBtn}
          onClick={() => setOpen(true)}
        />
        <span className={styles.brand}>{t('app.shortName')}</span>
      </div>
      {headerActions}
    </Header>
  )

  const content = (
    <Content className={styles.content}>
      <Outlet />
    </Content>
  )

  const changeSubNavCollapsed = (collapsed: boolean) => {
    setSubNavCollapsed(collapsed)
    writeSubNavCollapsed(collapsed)
  }

  const subNavSider =
    moduleChildItems.length > 0 ? (
      <Sider
        width={200}
        collapsedWidth={0}
        collapsed={subNavCollapsed}
        collapsible
        onCollapse={(next) => changeSubNavCollapsed(next)}
        theme={navTheme}
        className={`${styles.sider} ${styles.classicSider} ${styles.subNavSider}`}
        trigger={
          <span title={subNavCollapsed ? t('layout.expandSubnav') : t('layout.collapseSubnav')}>
            {subNavCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>
        }
        zeroWidthTriggerStyle={{ top: 12 }}
      >
        <div className={styles.siderMenuWrap}>
          <SideNav
            theme={navTheme}
            items={moduleChildItems}
            selectedKeys={[selectedNavKey]}
            onClick={(key) => onMenuClick(key)}
          />
        </div>
      </Sider>
    ) : null

  // Mobile: always use top bar + drawer (ignore desktop layout_mode)
  if (isMobile) {
    return (
      <Layout className={styles.layout} data-layout-mode="mobile" data-nav-theme={navTheme}>
        {mobileHeader}
        {mobileDrawer}
        {content}
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  if (layoutMode === 'vertical') {
    return (
      <Layout className={styles.layout} data-layout-mode="vertical" data-nav-theme={navTheme}>
        <Sider width={220} theme={navTheme} className={styles.sider}>
          <div className={styles.siderInner}>
            <div className={styles.siderBrand}>{t('app.shortName')}</div>
            <div className={styles.siderMenuWrap}>
              <SideNav
                theme={navTheme}
                items={menuItems}
                selectedKeys={[selectedNavKey]}
                defaultOpenKeys={defaultOpenKeys}
                onClick={(key) => onMenuClick(key)}
              />
            </div>
            {siderFooter}
          </div>
        </Sider>
        <Layout>{content}</Layout>
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  if (layoutMode === 'classic') {
    return (
      <Layout className={styles.layout} data-layout-mode="classic" data-nav-theme={navTheme}>
        <Header className={styles.header}>
          <span className={styles.brand}>{t('app.shortName')}</span>
          {headerActions}
        </Header>
        <Layout className={styles.classicBody}>
          <Sider width={220} theme={navTheme} className={`${styles.sider} ${styles.classicSider}`}>
            <div className={styles.siderMenuWrap}>
              <SideNav
                theme={navTheme}
                items={menuItems}
                selectedKeys={[selectedNavKey]}
                defaultOpenKeys={defaultOpenKeys}
                onClick={(key) => onMenuClick(key)}
              />
            </div>
          </Sider>
          {content}
        </Layout>
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  if (layoutMode === 'mix') {
    return (
      <Layout className={styles.layout} data-layout-mode="mix" data-nav-theme={navTheme}>
        <Header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.brand}>{t('app.shortName')}</span>
            <Menu
              theme={navTheme}
              mode="horizontal"
              selectedKeys={[activeModuleKey]}
              items={topLevelItems}
              onClick={({ key }) => onModuleClick(key)}
              className={styles.desktopNav}
            />
          </div>
          {headerActions}
        </Header>
        <Layout className={styles.classicBody}>
          {subNavSider}
          {content}
        </Layout>
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  if (layoutMode === 'columns') {
    return (
      <Layout className={styles.layout} data-layout-mode="columns" data-nav-theme={navTheme}>
        <Header className={styles.header}>
          <span className={styles.brand}>{t('app.shortName')}</span>
          {headerActions}
        </Header>
        <Layout className={styles.classicBody}>
          <Sider width={72} theme={navTheme} className={`${styles.sider} ${styles.railSider}`} trigger={null}>
            <div className={styles.railInner}>
              <ModuleRail
                items={topLevelItems}
                activeModuleKey={activeModuleKey}
                unreadCount={unreadCount}
                onModuleClick={onModuleClick}
              />
            </div>
          </Sider>
          {subNavSider}
          {content}
        </Layout>
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  if (layoutMode === 'overview') {
    return (
      <Layout className={styles.layout} data-layout-mode="overview" data-nav-theme={navTheme}>
        <Header className={styles.overviewHeader}>
          <div className={styles.overviewHeaderTop}>
            <span className={styles.brand}>{t('app.shortName')}</span>
            <OverviewSearch leafPages={leafPages} onMenuClick={(key) => onMenuClick(key)} />
            {headerActions}
          </div>
          <OverviewModuleBar
            menuItems={menuItems}
            activeModuleKey={activeModuleKey}
            selectedNavKey={selectedNavKey}
            unreadCount={unreadCount}
            onModuleClick={onModuleClick}
            onMenuClick={(key) => onMenuClick(key)}
          />
        </Header>
        {content}
        {passwordModal}
        {settingsDrawer}
      </Layout>
    )
  }

  // horizontal (default)
  return (
    <Layout className={styles.layout} data-layout-mode="horizontal" data-nav-theme={navTheme}>
      <Header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.brand}>{t('app.shortName')}</span>
          <Menu
            theme={navTheme}
            mode="horizontal"
            selectedKeys={[selectedNavKey]}
            items={menuItems}
            onClick={({ key }) => onMenuClick(key)}
            className={styles.desktopNav}
          />
        </div>
        {headerActions}
      </Header>
      {content}
      {passwordModal}
      {settingsDrawer}
    </Layout>
  )
}
