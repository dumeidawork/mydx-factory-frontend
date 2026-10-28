import { useMemo, useState } from 'react'
import { AutoComplete, Badge, Dropdown, Input } from 'antd'
import { DownOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { AppMenuItem, SearchableLeafPage } from './useNavMenu'
import styles from './MainLayout.module.css'

type SearchProps = {
  leafPages: SearchableLeafPage[]
  onMenuClick: (key: string) => void
}

export function OverviewSearch({ leafPages, onMenuClick }: SearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pages = needle
      ? leafPages.filter((page) => page.searchText.includes(needle))
      : leafPages
    return pages.map((page) => ({
      value: page.key,
      label: page.parentLabelKey
        ? `${t(page.parentLabelKey)} / ${t(page.labelKey)}`
        : t(page.labelKey),
    }))
  }, [leafPages, query, t])

  const goFirstMatch = () => {
    if (!options.length) return
    onMenuClick(options[0].value)
    setQuery('')
  }

  return (
    <AutoComplete
      value={query}
      options={options}
      className={styles.overviewSearch}
      filterOption={false}
      defaultActiveFirstOption
      onSearch={setQuery}
      onChange={(value) => setQuery(value ?? '')}
      onSelect={(value) => {
        onMenuClick(String(value))
        setQuery('')
      }}
      allowClear
    >
      <Input
        prefix={<SearchOutlined />}
        placeholder={t('layout.searchPagesPlaceholder')}
        onPressEnter={goFirstMatch}
      />
    </AutoComplete>
  )
}

type ModuleBarProps = {
  menuItems: AppMenuItem[]
  activeModuleKey: string
  selectedNavKey: string
  unreadCount?: number
  onModuleClick: (key: string) => void
  onMenuClick: (key: string) => void
}

export function OverviewModuleBar({
  menuItems,
  activeModuleKey,
  selectedNavKey,
  unreadCount = 0,
  onModuleClick,
  onMenuClick,
}: ModuleBarProps) {
  return (
    <div className={styles.overviewModules}>
      {menuItems.map((item) => {
        const selected = item.key === activeModuleKey
        const children = item.children ?? []
        const labelNode =
          item.key === '/' && unreadCount > 0 ? (
            <span className={styles.overviewModuleLabel}>
              {item.labelText}
              <Badge count={unreadCount} size="small" overflowCount={99} />
            </span>
          ) : (
            item.labelText
          )

        if (!children.length) {
          return (
            <button
              key={item.key}
              type="button"
              className={`${styles.overviewModuleBtn} ${selected ? styles.overviewModuleBtnSelected : ''}`}
              onClick={() => onModuleClick(item.key)}
            >
              {item.icon}
              {labelNode}
            </button>
          )
        }

        return (
          <Dropdown
            key={item.key}
            trigger={['hover', 'click']}
            menu={{
              items: children.map((child) => ({
                key: child.key,
                label: child.labelText,
              })),
              selectedKeys: [selectedNavKey],
              onClick: ({ key }) => onMenuClick(key),
            }}
          >
            <span>
              <button
                type="button"
                className={`${styles.overviewModuleBtn} ${selected ? styles.overviewModuleBtnSelected : ''}`}
              >
                {item.icon}
                {labelNode}
                <DownOutlined className={styles.overviewCaret} />
              </button>
            </span>
          </Dropdown>
        )
      })}
    </div>
  )
}
