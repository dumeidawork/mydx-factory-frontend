import { Badge } from 'antd'
import type { AppMenuItem } from './useNavMenu'
import styles from './MainLayout.module.css'

type Props = {
  items: AppMenuItem[]
  activeModuleKey: string
  unreadCount?: number
  onModuleClick: (key: string) => void
}

export default function ModuleRail({ items, activeModuleKey, unreadCount = 0, onModuleClick }: Props) {
  return (
    <nav className={styles.moduleRail} aria-label="modules">
      {items.map((item) => {
        const selected = item.key === activeModuleKey
        const showBadge = item.key === '/' && unreadCount > 0
        return (
          <button
            key={item.key}
            type="button"
            className={`${styles.railItem} ${selected ? styles.railItemSelected : ''}`}
            onClick={() => onModuleClick(item.key)}
            title={item.labelText}
          >
            <span className={styles.railIcon}>
              {showBadge ? (
                <Badge count={unreadCount} size="small" overflowCount={99} offset={[4, -2]}>
                  {item.icon}
                </Badge>
              ) : (
                item.icon
              )}
            </span>
            <span className={styles.railLabel}>{item.labelText}</span>
          </button>
        )
      })}
    </nav>
  )
}
