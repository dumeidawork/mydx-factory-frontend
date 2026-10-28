import { Button, Drawer } from 'antd'
import { KeyOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import type { LayoutMode } from '../utils/auth'
import {
  THEME_CATEGORIES,
  themesInCategory,
  type ColorThemeId,
} from '../theme/themes'
import styles from './LayoutSettingsDrawer.module.css'

const OPTIONS: { mode: LayoutMode; labelKey: string }[] = [
  { mode: 'horizontal', labelKey: 'layout.horizontal' },
  { mode: 'vertical', labelKey: 'layout.vertical' },
  { mode: 'classic', labelKey: 'layout.classic' },
  { mode: 'mix', labelKey: 'layout.mix' },
  { mode: 'columns', labelKey: 'layout.columns' },
  { mode: 'overview', labelKey: 'layout.overview' },
]

type Props = {
  open: boolean
  value: LayoutMode
  colorTheme: ColorThemeId
  saving?: boolean
  onClose: () => void
  onChange: (mode: LayoutMode) => void
  onColorThemeChange: (id: ColorThemeId) => void
  onChangePassword: () => void
}

function LayoutThumb({ mode }: { mode: LayoutMode }) {
  if (mode === 'vertical') {
    return (
      <div className={`${styles.thumb} ${styles.thumbVertical}`}>
        <div className={styles.sider} />
        <div className={styles.mainCol}>
          <div className={styles.bar} />
          <div className={styles.body} />
        </div>
      </div>
    )
  }
  if (mode === 'classic') {
    return (
      <div className={`${styles.thumb} ${styles.thumbClassic}`}>
        <div className={styles.topBar} />
        <div className={styles.classicRow}>
          <div className={styles.sider} />
          <div className={styles.body} />
        </div>
      </div>
    )
  }
  if (mode === 'mix') {
    return (
      <div className={`${styles.thumb} ${styles.thumbClassic}`}>
        <div className={styles.topBar} />
        <div className={styles.classicRow}>
          <div className={styles.siderNarrow} />
          <div className={styles.body} />
        </div>
      </div>
    )
  }
  if (mode === 'columns') {
    return (
      <div className={`${styles.thumb} ${styles.thumbClassic}`}>
        <div className={styles.topBar} />
        <div className={styles.classicRow}>
          <div className={styles.rail} />
          <div className={styles.sider} />
          <div className={styles.body} />
        </div>
      </div>
    )
  }
  if (mode === 'overview') {
    return (
      <div className={`${styles.thumb} ${styles.thumbHorizontal}`}>
        <div className={styles.topBar} />
        <div className={styles.moduleBar} />
        <div className={styles.body} />
      </div>
    )
  }
  return (
    <div className={`${styles.thumb} ${styles.thumbHorizontal}`}>
      <div className={styles.topBar} />
      <div className={styles.body} />
    </div>
  )
}

export default function LayoutSettingsDrawer({
  open,
  value,
  colorTheme,
  saving,
  onClose,
  onChange,
  onColorThemeChange,
  onChangePassword,
}: Props) {
  const { t } = useTranslation()

  return (
    <Drawer title={t('layout.settings')} placement="right" width={440} open={open} onClose={onClose}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('layout.styleSection')}</div>
        <div className={styles.grid}>
          {OPTIONS.map((opt) => {
            const selected = value === opt.mode
            return (
              <button
                key={opt.mode}
                type="button"
                className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
                disabled={saving}
                onClick={() => {
                  if (!selected) onChange(opt.mode)
                }}
              >
                {selected ? <span className={styles.check}>✓</span> : null}
                <LayoutThumb mode={opt.mode} />
                <span className={styles.label}>{t(opt.labelKey)}</span>
                <span className={styles.hint}>{t(`layout.hint.${opt.mode}`)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('theme.section')}</div>
        {THEME_CATEGORIES.map((category) => (
          <div key={category} className={styles.themeCategory}>
            <div className={styles.categoryTitle}>{t(`theme.category.${category}`)}</div>
            <div className={styles.themeGrid}>
              {themesInCategory(category).map((item) => {
                const selected = colorTheme === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.themeCard} ${selected ? styles.cardSelected : ''}`}
                    disabled={saving}
                    onClick={() => {
                      if (!selected) onColorThemeChange(item.id)
                    }}
                  >
                    {selected ? <span className={styles.check}>✓</span> : null}
                    <span className={styles.swatch} aria-hidden>
                      <span style={{ background: item.colorPrimary }} />
                      <span style={{ background: item.navBg }} />
                      <span style={{ background: item.contentBg }} />
                    </span>
                    <span className={styles.label}>{t(`theme.names.${item.id}`)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('common.language')}</div>
        <LanguageSwitcher />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t('common.changePassword')}</div>
        <Button
          icon={<KeyOutlined />}
          block
          onClick={() => {
            onClose()
            onChangePassword()
          }}
        >
          {t('common.changePassword')}
        </Button>
      </div>
    </Drawer>
  )
}
