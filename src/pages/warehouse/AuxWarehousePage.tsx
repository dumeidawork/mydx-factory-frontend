import { useCallback, useState } from 'react'
import { Badge, Tabs } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'
import AuxInventoryTab from './tabs/AuxInventoryTab'
import AuxPurchaseTab from './tabs/AuxPurchaseTab'
import AuxIssueTab from './tabs/AuxIssueTab'
import AuxInboundTab from './tabs/AuxInboundTab'
import AuxBorrowTab from './tabs/AuxBorrowTab'
import AuxCashTab from './tabs/AuxCashTab'
import AuxReconcileTab from './tabs/AuxReconcileTab'
import AuxMonthlyTab from './tabs/AuxMonthlyTab'
import WarehouseAlertPanel from './WarehouseAlertPanel'
import { usePageTitle } from '../../layout/usePageTitle'
import './warehouseShared.css'

export default function AuxWarehousePage() {
  const pageTitle = usePageTitle()
  const [alertCount, setAlertCount] = useState(0)
  const onCountChange = useCallback((n: number) => setAlertCount(n), [])

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <div className="wh-page-header-main">
          <span className="wh-page-icon">
            <DatabaseOutlined />
          </span>
          <div>
            <h1 className="wh-page-title">{pageTitle}</h1>
            <div className="wh-page-subtitle">
              五金 / 劳保 / 刀具 / 消耗品 · 库存、采购、入库作废冲回、领用、借用与月结对账
            </div>
          </div>
        </div>
        <Badge count={alertCount} overflowCount={99}>
          <span style={{ color: '#64748b', fontSize: 13 }}>站内预警</span>
        </Badge>
      </div>

      <WarehouseAlertPanel domain="aux" onCountChange={onCountChange} />

      <Tabs
        className="wh-tabs"
        defaultActiveKey="inventory"
        items={[
          { key: 'inventory', label: '库存台账', children: <AuxInventoryTab /> },
          { key: 'purchase', label: '采购管理', children: <AuxPurchaseTab /> },
          { key: 'issue', label: '领用出库', children: <AuxIssueTab /> },
          { key: 'inbound', label: '入库登记', children: <AuxInboundTab /> },
          { key: 'borrow', label: '借用管理', children: <AuxBorrowTab /> },
          { key: 'cash', label: '现金账本', children: <AuxCashTab /> },
          { key: 'reconcile', label: '对账结账', children: <AuxReconcileTab /> },
          {
            key: 'monthly',
            label: (
              <span>
                月度汇总 <Badge dot={alertCount > 0} />
              </span>
            ),
            children: <AuxMonthlyTab />,
          },
        ]}
      />
    </div>
  )
}
