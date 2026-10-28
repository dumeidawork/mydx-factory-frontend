import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Collapse, Empty, Tag } from 'antd'
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { whGet } from './warehouseApi'

export type WarehouseAlertItem = {
  id: number | string
  level?: string
  title: string
  alert_type?: string
  created_at?: string
}

type Props = {
  domain: 'aux' | 'fg'
  /** 预警数量变化时回调（用于页头 Badge） */
  onCountChange?: (count: number) => void
}

async function loadAlerts(domain: 'aux' | 'fg'): Promise<WarehouseAlertItem[]> {
  if (domain === 'aux') {
    const [alertsRes, borrowsRes] = await Promise.all([
      whGet<{ items: WarehouseAlertItem[] }>('/aux/alerts'),
      whGet<{ items: { id: number; item_name_spec: string; borrower_name: string; status: string; due_date?: string }[] }>(
        '/aux/borrows',
      ).catch(() => ({ items: [] })),
    ])
    const stockAlerts = alertsRes.items || []
    const overdue = (borrowsRes.items || [])
      .filter((b) => b.status === 'overdue')
      .map((b) => ({
        id: `borrow-${b.id}`,
        level: 'warning',
        alert_type: 'borrow_overdue',
        title: `借用逾期：${b.item_name_spec} / ${b.borrower_name}${b.due_date ? `（应还 ${b.due_date}）` : ''}`,
      }))
    return [...stockAlerts, ...overdue]
  }
  const data = await whGet<{ items: WarehouseAlertItem[] }>('/fg/alerts')
  return data.items || []
}

/** 页面级总预警（Tabs 上方，浅橘色可展开） */
export default function WarehouseAlertPanel({ domain, onCountChange }: Props) {
  const [items, setItems] = useState<WarehouseAlertItem[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await loadAlerts(domain)
      setItems(list)
      onCountChange?.(list.length)
    } catch {
      setItems([])
      onCountChange?.(0)
    } finally {
      setLoading(false)
    }
  }, [domain, onCountChange])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(t)
  }, [refresh])

  const count = items.length
  const label = (
    <span className="wh-alert-panel-label">
      <WarningOutlined />
      <span>总预警</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#ea580c' : '#94a3b8' }} />
      <span className="wh-alert-panel-hint">
        {count > 0 ? `共 ${count} 条待处理` : '当前无待处理预警'}
      </span>
    </span>
  )

  return (
    <Collapse
      className="wh-alert-panel"
      defaultActiveKey={[]}
      items={[
        {
          key: 'alerts',
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无预警（低库存、超储、价格异常、对账差异、现金偏低、逾期借用均正常）" />
            ) : (
              <ul className="wh-alert-panel-list">
                {items.map((a) => (
                  <li key={String(a.id)}>
                    <Tag color={a.level === 'error' ? 'error' : 'warning'}>
                      {a.level === 'error' ? '紧急' : '提醒'}
                    </Tag>
                    <span className="wh-alert-panel-text">{a.title}</span>
                    {a.created_at ? <span className="wh-alert-panel-time">{a.created_at}</span> : null}
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  )
}
