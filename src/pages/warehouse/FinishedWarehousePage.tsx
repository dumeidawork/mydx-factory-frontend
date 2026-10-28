import { useCallback, useState } from 'react'
import { Badge, Tabs } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import FgInventoryTab from './tabs/FgInventoryTab'
import FgTxnTab from './tabs/FgTxnTab'
import FgStocktakeTab from './tabs/FgStocktakeTab'
import FgAlertTab from './tabs/FgAlertTab'
import WarehouseAlertPanel from './WarehouseAlertPanel'
import { usePageTitle } from '../../layout/usePageTitle'
import './warehouseShared.css'

export default function FinishedWarehousePage() {
  const pageTitle = usePageTitle()
  const [alertCount, setAlertCount] = useState(0)
  const onCountChange = useCallback((n: number) => setAlertCount(n), [])

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <div className="wh-page-header-main">
          <span className="wh-page-icon fg">
            <InboxOutlined />
          </span>
          <div>
            <h1 className="wh-page-title">{pageTitle}</h1>
            <div className="wh-page-subtitle">
              本厂成品 / 订单备库 / 自备库 / 库毛坯 · 与产品物料主数据分离的物理库存
            </div>
          </div>
        </div>
        <Badge count={alertCount} overflowCount={99}>
          <span style={{ color: '#64748b', fontSize: 13 }}>站内预警</span>
        </Badge>
      </div>

      <WarehouseAlertPanel domain="fg" onCountChange={onCountChange} />

      <Tabs
        className="wh-tabs"
        defaultActiveKey="inventory"
        items={[
          { key: 'inventory', label: '库存台账', children: <FgInventoryTab /> },
          { key: 'txn', label: '出入库流水', children: <FgTxnTab /> },
          { key: 'stocktake', label: '盘点', children: <FgStocktakeTab /> },
          {
            key: 'alert',
            label: (
              <span>
                预警报表 <Badge dot={alertCount > 0} />
              </span>
            ),
            children: <FgAlertTab />,
          },
        ]}
      />
    </div>
  )
}
