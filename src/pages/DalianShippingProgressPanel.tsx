import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Collapse, Empty, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CarOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import {
  notifyWorkbenchUnreadChanged,
  useWorkbenchUnread,
  type DalianShippingProgressDate,
  type DalianShippingProgressRow,
} from '../layout/WorkbenchUnreadContext'
import { useCollapseWhenEmpty } from './useCollapseWhenEmpty'
import styles from './PendingContractTakeoverPanel.module.css'

const STATUS_COLOR: Record<string, string> = {
  已预定: 'default',
  已指定对接: 'blue',
  存在变更内容: 'orange',
  开始装箱: 'processing',
  已装箱: 'cyan',
  已发货: 'green',
}

const LINE_COLUMNS: ColumnsType<DalianShippingProgressRow> = [
  { title: '订单号', dataIndex: 'order_no', width: 120 },
  { title: '物料号', dataIndex: 'material_no', width: 140 },
  { title: '预定数量', dataIndex: 'planned_qty', width: 90 },
  {
    title: '进度',
    dataIndex: 'status',
    width: 120,
    render: (value: string) => <Tag color={STATUS_COLOR[value] || 'default'}>{value || '—'}</Tag>,
  },
]

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg || JSON.stringify(d)))
      .join('; ')
  }
  return '请求失败'
}

export default function DalianShippingProgressPanel() {
  const navigate = useNavigate()
  const { dalianShippingProgress, loading, refresh } = useWorkbenchUnread()
  const dates = dalianShippingProgress?.dates || []
  const unreadCount = dalianShippingProgress?.unread_count || 0
  const [acking, setAcking] = useState<string>('')
  const collapse = useCollapseWhenEmpty(dates.length, 'dalian-shipping-progress')

  const ackDate = async (item: DalianShippingProgressDate) => {
    if (!item.unread && !item.has_changes) return
    setAcking(item.planned_arrival_date)
    try {
      const res = await authFetch(
        apiUrl(`/api/v1/partners/dalian-siemens/progress/${encodeURIComponent(item.planned_arrival_date)}/ack`),
        { method: 'POST' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      notifyWorkbenchUnreadChanged()
      await refresh()
    } finally {
      setAcking('')
    }
  }

  const openDate = (item: DalianShippingProgressDate) => {
    void ackDate(item)
    navigate(`/partners/dalian-siemens?date=${encodeURIComponent(item.planned_arrival_date)}`)
  }

  const openPacking = (item: DalianShippingProgressDate) => {
    navigate(`/contracts/customer-packing?tab=dalian&date=${encodeURIComponent(item.planned_arrival_date)}`)
  }

  const label = (
    <span className={styles.label}>
      <CarOutlined />
      <span>大连发货进度</span>
      <Badge
        count={unreadCount}
        showZero
        overflowCount={99}
        style={{ backgroundColor: unreadCount ? '#d48806' : '#94a3b8' }}
      />
      <span className={styles.amountHint}>
        {dates.length > 0 ? `共 ${dates.length} 个预定到货日，按日期展开查看` : '当前没有相关发货预定'}
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
          key: 'dalian-shipping-progress',
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
            dates.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无大连发货进度" />
            ) : (
              <Collapse
                accordion={false}
                onChange={(keys) => {
                  const opened = Array.isArray(keys) ? keys : keys ? [keys] : []
                  for (const key of opened) {
                    const item = dates.find((row) => row.planned_arrival_date === key)
                    if (item && (item.unread || item.has_changes)) void ackDate(item)
                  }
                }}
                items={dates.map((item) => ({
                  key: item.planned_arrival_date,
                  label: (
                    <span className={styles.label}>
                      <span>{item.planned_arrival_date}</span>
                      {item.unread ? <Tag color="gold">未读</Tag> : null}
                      {item.has_changes ? <Tag color="orange">存在变更</Tag> : null}
                      <span className={styles.amountHint}>
                        {item.line_count} 条 · 合计 {item.total_qty} 件
                        {item.assignee_name ? ` · 对接 ${item.assignee_name}` : ' · 未指定对接'}
                      </span>
                    </span>
                  ),
                  extra: (
                    <Space size={0} onClick={(e) => e.stopPropagation()}>
                      <Button type="link" size="small" onClick={() => openPacking(item)}>
                        内容确认
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        loading={acking === item.planned_arrival_date}
                        onClick={() => openDate(item)}
                      >
                        打开预定
                      </Button>
                    </Space>
                  ),
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      columns={LINE_COLUMNS}
                      dataSource={item.rows || []}
                      locale={{ emptyText: '该日预定已全部删除，对接人仍保留' }}
                    />
                  ),
                }))}
              />
            ),
        },
      ]}
    />
  )
}
