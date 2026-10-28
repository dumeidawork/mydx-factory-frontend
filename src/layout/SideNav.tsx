import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import type { AppMenuItem } from './useNavMenu'
import styles from './MainLayout.module.css'

type Props = {
  theme?: MenuProps['theme']
  items: AppMenuItem[] | NonNullable<AppMenuItem['children']>
  selectedKeys: string[]
  defaultOpenKeys?: string[]
  onClick: (key: string) => void
}

export default function SideNav({ theme, items, selectedKeys, defaultOpenKeys, onClick }: Props) {
  return (
    <Menu
      theme={theme}
      mode="inline"
      selectedKeys={selectedKeys}
      defaultOpenKeys={defaultOpenKeys}
      items={items as MenuProps['items']}
      onClick={({ key }) => onClick(key)}
      className={styles.sideMenu}
    />
  )
}
