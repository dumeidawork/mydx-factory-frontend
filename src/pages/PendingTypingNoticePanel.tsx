import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Collapse, Empty, Modal, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FormOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import {
  notifyWorkbenchUnreadChanged,
  useWorkbenchUnread,
  type TypingNoticeChangedRow,
  type TypingNoticeItem,
} from '../layout/WorkbenchUnreadContext'
import { useCollapseWhenEmpty } from './useCollapseWhenEmpty'
import styles from './PendingContractTakeoverPanel.module.css'

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

async function readJson<T = unknown>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

const CHANGED_COLUMNS: ColumnsType<TypingNoticeChangedRow> = [
  { title: '订单号', dataIndex: 'order_no', width: 130, render: (v?: string) => v || '—' },
  { title: '条目', dataIndex: 'item_no', width: 70, render: (v?: number | null) => (v === null || v === undefined ? '—' : v) },
  { title: '物料号', dataIndex: 'material_no', width: 160, render: (v?: string) => v || '—' },
  { title: '图纸号', dataIndex: 'drawing_no', width: 180, render: (v?: string) => v || '—' },
  { title: '数量', dataIndex: 'quantity', width: 80, render: (v?: number | null) => (v === null || v === undefined ? '—' : v) },
  { title: '炉号', dataIndex: 'heat_no', width: 120, render: (v?: string) => v || '—' },
  { title: '热处理批号', dataIndex: 'heat_treatment_batch_no', width: 140, render: (v?: string) => v || '—' },
]

export default function PendingTypingNoticePanel() {
  const navigate = useNavigate()
  const { typingNoticeItems, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<TypingNoticeItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  const changedRows = useMemo(() => active?.changed_rows || [], [active])

  const openNotice = (item: TypingNoticeItem) => {
    setActive(item)
  }

  const closeNotice = () => {
    setActive(null)
  }

  const handleConfirmView = async () => {
    if (!active) return
    setConfirming(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/workbench/typing-notices/${active.id}/confirm`), {
        method: 'POST',
      })
      const data = await readJson<{
        order_no?: string
        order_detail_ids?: number[]
        generated?: { error?: string }
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        await refresh()
        return
      }
      if (data.generated?.error) {
        message.warning(data.generated.error)
      }
      const orderNo = (data.order_no || active.order_no || '').trim()
      const ids = (data.order_detail_ids?.length
        ? data.order_detail_ids
        : changedRows.map((row) => row.order_detail_id)
      ).filter((id) => Number(id) > 0)
      closeNotice()
      notifyWorkbenchUnreadChanged()
      await refresh()
      const params = new URLSearchParams({ order_no: orderNo })
      if (ids.length) params.set('detail_ids', ids.join(','))
      navigate(`/manufacturing/typing?${params.toString()}`)
    } finally {
      setConfirming(false)
    }
  }

  const count = typingNoticeItems.length
  const collapse = useCollapseWhenEmpty(count, 'typing-notice')
  const label = (
    <span className={styles.label}>
      <FormOutlined />
      <span>打字要求提醒</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#d48806' : '#94a3b8' }} />
      <span className={styles.amountHint}>
        {count > 0 ? `共 ${count} 条已自动生成的打字要求，请确认查看` : '当前没有打字要求提醒'}
      </span>
    </span>
  )

  return (
    <>
      <Collapse
        className={styles.amountPanel}
        activeKey={collapse.activeKey}
        onChange={collapse.onChange}
        items={[
          {
            key: 'typing-notice',
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
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无打字要求提醒" />
              ) : (
                <ul className={styles.list}>
                  {typingNoticeItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className={styles.amountItemBtn} onClick={() => openNotice(item)}>
                        <Tag color="gold">通知</Tag>
                        <span className={styles.itemText}>
                          订单 {item.order_no}：实验建档已自动生成/更新打字要求，请确认查看
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <Modal
        title="打字要求已自动生成"
        open={Boolean(active)}
        onCancel={closeNotice}
        width={960}
        confirmLoading={confirming}
        okText="确认并查看"
        onOk={() => void handleConfirmView()}
        cancelText="关闭"
        destroyOnClose
      >
        {active ? (
          <div className={styles.modalBody}>
            <div className={styles.guide}>
              <div className={styles.guideTitle}>说明</div>
              <ul className={styles.guideNotes}>
                <li>实验建档已按变动明细自动生成/更新打字要求（手工改过的字段会保留）。</li>
                <li>点「确认并查看」后本条提醒消失，并跳转到打字要求页展示本次相关明细。</li>
              </ul>
            </div>
            <div>
              <span className={styles.fieldLabel}>订单号：</span>
              <span className={styles.fieldValue}>{active.order_no}</span>
            </div>
            {active.trigger_user_name ? (
              <div>
                <span className={styles.fieldLabel}>建档操作人：</span>
                <span className={styles.fieldValue}>{active.trigger_user_name}</span>
              </div>
            ) : null}
            <Table
              rowKey="order_detail_id"
              size="small"
              columns={CHANGED_COLUMNS}
              dataSource={changedRows}
              pagination={false}
              scroll={{ x: 880 }}
              locale={{ emptyText: '没有本次变动明细快照' }}
              style={{ marginTop: 12 }}
            />
          </div>
        ) : null}
      </Modal>
    </>
  )
}
