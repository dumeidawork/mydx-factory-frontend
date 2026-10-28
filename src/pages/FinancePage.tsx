import { useLocation } from 'react-router-dom'
import { SettingOutlined } from '@ant-design/icons'
import TestFeeManager from '../components/TestFeeManager'
import { usePageTitle } from '../layout/usePageTitle'
import './FinancePage.css'

export default function FinancePage() {
  const { pathname } = useLocation()
  const pageTitle = usePageTitle()
  const isOther = pathname.endsWith('/other')

  return (
    <div className="finance-page">
      <div className="finance-page-header">
        <span className="finance-page-icon"><SettingOutlined /></span>
        <div>
          <h1 className="finance-page-title">{pageTitle}</h1>
          <div className="finance-page-subtitle">集中处理费用维护、报表导出与财务数据整理</div>
        </div>
      </div>
      {isOther ? (
        <div className="finance-empty">其他财务功能待开发...</div>
      ) : (
        <TestFeeManager />
      )}
    </div>
  )
}
