import { useEffect, useState } from 'react'
import { Badge, Button, Collapse, Empty, Modal, Tag } from 'antd'
import { EditOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged, useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import DrawingReviseModal from './DrawingReviseModal'
import type { DrawingArchiveRow } from './drawingReviewTypes'
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

export default function PendingDrawingRevisePanel() {
  const { drawingReviseItems, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<DrawingArchiveRow | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setActive((prev) => (prev ? drawingReviseItems.find((x) => x.id === prev.id) || null : null))
  }, [drawingReviseItems])

  const handleSubmit = async (values: Record<string, string>) => {
    if (!active) return
    setSubmitting(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${active.id}/resubmit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await readJson<{ material_action?: string; detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        await refresh()
        return
      }
      message.success('已重新提交，图纸状态变为【上传】，请等待审核人再次审核')
      if (data.material_action === 'updated') {
        Modal.warning({ title: '物料已覆盖', content: '物料表已存在该物料，已覆盖原数据' })
      }
      setActive(null)
      notifyWorkbenchUnreadChanged()
      await refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const count = drawingReviseItems.length
  const collapse = useCollapseWhenEmpty(count, 'drawing-revise')
  const label = (
    <span className={styles.label}>
      <EditOutlined />
      <span>待修改图纸</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#d48806' : '#94a3b8' }} />
      <span className={styles.amountHint}>
        {count > 0 ? `共 ${count} 份图纸需核对修改` : '当前没有待修改图纸'}
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
            key: 'drawing-revise',
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
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待修改图纸" />
              ) : (
                <ul className={styles.list}>
                  {drawingReviseItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className={styles.itemBtn} onClick={() => setActive(item)}>
                        <Tag color="gold">修改</Tag>
                        <span className={styles.itemText}>
                          待修改图纸：{item.drawing_name}
                          {item.review_remark ? `（${item.review_remark}）` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <DrawingReviseModal
        open={Boolean(active)}
        item={active}
        submitting={submitting}
        onCancel={() => setActive(null)}
        onSubmit={handleSubmit}
      />
    </>
  )
}
