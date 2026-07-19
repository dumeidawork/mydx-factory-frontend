import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import jaJP from 'antd/locale/ja_JP'
import './i18n'
import App from './App'
import './index.css'
import { installGlobalFetchGuard } from './utils/api'
import { installGlobalActionErrorDialog } from './utils/feedback'
import { installGlobalTableColumnResize } from './utils/resizableTables'

installGlobalFetchGuard()
installGlobalActionErrorDialog()
installGlobalTableColumnResize()

const antdLocales: Record<string, typeof zhCN> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
}

function Root() {
  const [lang, setLang] = React.useState(() => {
    return localStorage.getItem('erp_lang') || 'zh-CN'
  })
  React.useEffect(() => {
    const handler = () => setLang(localStorage.getItem('erp_lang') || 'zh-CN')
    window.addEventListener('languageChange', handler)
    return () => window.removeEventListener('languageChange', handler)
  }, [])
  return (
    <ConfigProvider locale={antdLocales[lang] || zhCN}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
