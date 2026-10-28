import { Card, Tabs } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import styles from './WorkflowPages.module.css'
import { usePageTitle } from '../layout/usePageTitle'
import FranceAutoPackingPanel from './FranceAutoPackingPanel'
import FranceAutoPackingQtyMapPanel from './FranceAutoPackingQtyMapPanel'
import DalianPackingPanel from './DalianPackingPanel'

export default function AutoPackingPage() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageTitle = usePageTitle()
  const isDalian = pathname.endsWith('/dalian-auto')
  const dalianDate = searchParams.get('date') || ''
  const activeTab = searchParams.get('tab') === 'qty-map' ? 'qty-map' : 'auto-pack'

  return (
    <Card title={pageTitle} className={styles.pageCard}>
      {isDalian ? (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            const next = new URLSearchParams(searchParams)
            if (key === 'qty-map') next.set('tab', 'qty-map')
            else next.delete('tab')
            setSearchParams(next)
          }}
          items={[
            {
              key: 'auto-pack',
              label: '自动装箱',
              children: <DalianPackingPanel mode="auto" initialDate={dalianDate} />,
            },
            {
              key: 'qty-map',
              label: '物料-数量/托',
              children: <FranceAutoPackingQtyMapPanel apiBase="/api/v1/dalian-auto-packing-qty-maps" />,
            },
          ]}
        />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            if (key === 'qty-map') {
              setSearchParams({ tab: 'qty-map' })
              return
            }
            setSearchParams({})
          }}
          items={[
            { key: 'auto-pack', label: '自动装箱', children: <FranceAutoPackingPanel /> },
            { key: 'qty-map', label: '物料-数量/托', children: <FranceAutoPackingQtyMapPanel /> },
          ]}
        />
      )}
    </Card>
  )
}
