import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

const LANG_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
]

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = i18n.language || 'zh-CN'

  const handleChange = (value: string) => {
    i18n.changeLanguage(value)
    localStorage.setItem('erp_lang', value)
    window.dispatchEvent(new Event('languageChange'))
  }

  return (
    <Select
      value={current}
      onChange={handleChange}
      options={LANG_OPTIONS}
      style={{ width: 120 }}
      size="small"
      placeholder={t('common.language')}
    />
  )
}
