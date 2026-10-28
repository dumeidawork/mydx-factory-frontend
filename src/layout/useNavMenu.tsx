import { useMemo } from 'react'
import { Badge } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import i18n from '../i18n'
import { getStoredUser } from '../utils/auth'
import {
  ADMIN_ROLE_CODES,
  NAV_SUBMENU_KEYS,
  firstNavigablePath,
  flattenNavLeaves,
  moduleKeyFromPath,
  selectedNavKeyFromPath,
  visibleNavItems,
} from './navConfig'
import { useWorkbenchUnread } from './WorkbenchUnreadContext'

const SEARCH_LANGS = ['zh-CN', 'en-US', 'ja-JP'] as const

export type AppMenuItem = {
  key: string
  icon?: ReactNode
  label: ReactNode
  labelText: string
  children?: { key: string; label: string; labelText: string }[]
}

export type SearchableLeafPage = {
  key: string
  labelKey: string
  parentLabelKey?: string
  moduleKey: string
  searchText: string
}

function labelsAcrossLangs(key: string): string {
  return SEARCH_LANGS.map((lng) => String(i18n.t(key, { lng }))).join(' ').toLowerCase()
}

export function useNavMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = getStoredUser()
  const isAdmin = Boolean(currentUser?.role_code && ADMIN_ROLE_CODES.has(currentUser.role_code))
  const { count: unreadCount } = useWorkbenchUnread()
  const navSource = useMemo(() => visibleNavItems(isAdmin), [isAdmin])

  const menuItems = useMemo<AppMenuItem[]>(
    () =>
      navSource.map((item) => ({
        key: item.key,
        icon: item.icon,
        labelText: t(item.labelKey),
        label:
          item.key === '/' && unreadCount > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {t(item.labelKey)}
              <Badge count={unreadCount} size="small" overflowCount={99} />
            </span>
          ) : (
            t(item.labelKey)
          ),
        children: item.children?.map((child) => ({
          key: child.key,
          label: t(child.labelKey),
          labelText: t(child.labelKey),
        })),
      })),
    [navSource, t, unreadCount],
  )

  const selectedNavKey = selectedNavKeyFromPath(location.pathname)
  const activeModuleKey = moduleKeyFromPath(location.pathname)

  const topLevelItems = useMemo(
    () => menuItems.map(({ children: _children, ...rest }) => rest),
    [menuItems],
  )

  const moduleChildItems = useMemo(() => {
    const module = menuItems.find((item) => item.key === activeModuleKey)
    return module?.children ?? []
  }, [menuItems, activeModuleKey])

  const leafPages = useMemo<SearchableLeafPage[]>(
    () =>
      flattenNavLeaves(navSource).map((leaf) => ({
        ...leaf,
        searchText: [leaf.labelKey, leaf.parentLabelKey]
          .filter((key): key is string => Boolean(key))
          .map(labelsAcrossLangs)
          .join(' '),
      })),
    [navSource],
  )

  const onMenuClick = (key: string, afterNavigate?: () => void) => {
    if (!key.startsWith('/')) return
    navigate(key)
    afterNavigate?.()
  }

  const onModuleClick = (moduleKey: string, afterNavigate?: () => void) => {
    const item = navSource.find((entry) => entry.key === moduleKey)
    if (!item) return
    if (item.children?.length) {
      if (activeModuleKey === moduleKey) {
        afterNavigate?.()
        return
      }
      navigate(firstNavigablePath(item))
      afterNavigate?.()
      return
    }
    if (item.key.startsWith('/')) {
      navigate(item.key)
    }
    afterNavigate?.()
  }

  return {
    currentUser,
    isAdmin,
    menuItems,
    topLevelItems,
    moduleChildItems,
    leafPages,
    selectedNavKey,
    activeModuleKey,
    defaultOpenKeys: [...NAV_SUBMENU_KEYS],
    onMenuClick,
    onModuleClick,
  }
}
