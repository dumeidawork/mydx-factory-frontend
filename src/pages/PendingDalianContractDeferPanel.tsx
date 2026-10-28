import { useNavigate } from 'react-router-dom'
import { Badge, Button, Collapse, Empty, Tag } from 'antd'
import { FileSyncOutlined, ReloadOutlined } from '@ant-design/icons'
import { useWorkbenchUnread, type DalianContractDeferItem } from '../layout/WorkbenchUnreadContext'
import { useCollapseWhenEmpty } from './useCollapseWhenEmpty'
import styles from './PendingContractTakeoverPanel.module.css'

export default function PendingDalianContractDeferPanel() {
  const navigate = useNavigate()
  const { dalianContractDeferItems, loading, refresh } = useWorkbenchUnread()
  const count = dalianContractDeferItems.length
  const collapse = useCollapseWhenEmpty(count, 'dalian-contract-defer')

  const openItem = (item: DalianContractDeferItem) => {
    const params = new URLSearchParams({
      tab: 'dalian-contract',
      list_id: String(item.list_id || item.id),
    })
    navigate(`/contracts/customer-packing?${params.toString()}`)
  }

  const label = (
    <span className={styles.label}>
      <FileSyncOutlined />
      <span>大连电子合同后补</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#d48806' : '#94a3b8' }} />
      <span className={styles.amountHint}>
        {count > 0 ? `共 ${count} 份电子合同待补充关联归档合同` : '当前没有合同后补待办'}
      </span>
    </span>
  )

  return (
    <Collapse
      className={styles.amountPanel}
      activeKey={collapse.activeKey}
      onChange={collapse.onChange}
      items={[
        {
          key: 'dalian-contract-defer',
          label,
          extra: (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined spin={loading} />}
              onClick={(e) => {
                e.stopPropagation()
                void refresh()
              }}
            >
              刷新
            </Button>
          ),
          children:
            count === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无大连电子合同后补待办" />
            ) : (
              <ul className={styles.list}>
                {dalianContractDeferItems.map((item) => (
                  <li key={item.list_id || item.id}>
                    <button type="button" className={styles.amountItemBtn} onClick={() => openItem(item)}>
                      <Tag color="gold">后补</Tag>
                      <span className={styles.itemText}>
                        {item.customer ? `${item.customer} / ` : ''}
                        本厂单号 {item.factory_order_no || '—'}
                        {item.order_nos ? `：待关联订单号 ${item.order_nos}` : '：请补充关联客户合同'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  )
}
