import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { navTitleKeysFromPath } from './navConfig'

/** 有子模块时为「模块名/小模块名」，否则仅为模块名 */
export function usePageTitle() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { parentKey, labelKey } = navTitleKeysFromPath(pathname)
  const leaf = t(labelKey)
  return parentKey ? `${t(parentKey)}/${leaf}` : leaf
}
