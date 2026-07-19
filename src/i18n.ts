import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'
import jaJP from './locales/ja-JP.json'

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
  'ja-JP': { translation: jaJP },
}

const savedLang = localStorage.getItem('erp_lang') as keyof typeof resources | null
const defaultLang = savedLang && resources[savedLang] ? savedLang : 'zh-CN'

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLang,
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n
