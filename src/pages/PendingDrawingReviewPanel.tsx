import { useEffect, useState } from 'react'
import { Badge, Button, Collapse, Empty, Tag } from 'antd'
import { FileSearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged, useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import DrawingReviewModal from './DrawingReviewModal'
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

export default function PendingDrawingReviewPanel() {
  const { drawingReviewItems, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<DrawingArchiveRow | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setActive((prev) => (prev ? drawingReviewItems.find((x) => x.id === prev.id) || null : null))
  }, [drawingReviewItems])

  const postAction = async (path: string, body?: unknown) => {
    if (!active) return
    setConfirming(true)
    try {
      const res = await authFetch(apiUrl(path), {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        await refresh()
        return
      }
      return true
    } finally {
      setConfirming(false)
    }
  }

  const handleConfirm = async () => {
    const ok = await postAction(`/api/v1/drawing-archives/${active!.id}/review-confirm`)
    if (!ok) return
    message.success('已确认，图纸状态变为【审核】')
    setActive(null)
    notifyWorkbenchUnreadChanged()
    await refresh()
  }

  const handleReject = async (remark: string) => {
    const ok = await postAction(`/api/v1/drawing-archives/${active!.id}/review-reject`, { remark })
    if (!ok) return
    message.success('已反馈给上传者，图纸状态变为【修改】')
    setActive(null)
    notifyWorkbenchUnreadChanged()
    await refresh()
  }

  const count = drawingReviewItems.length
  const collapse = useCollapseWhenEmpty(count, 'drawing-review')
  const label = (
    <span className={styles.label}>
      <FileSearchOutlined />
      <span>待审核图纸</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#ea580c' : '#94a3b8' }} />
      <span className={styles.hint}>{count > 0 ? `共 ${count} 份图纸待您审核` : '当前没有待审核图纸'}</span>
    </span>
  )

  return (
    <>
      <Collapse
        className={styles.panel}
        activeKey={collapse.activeKey}
        onChange={collapse.onChange}
        items={[
          {
            key: 'drawing-review',
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
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审核图纸" />
              ) : (
                <ul className={styles.list}>
                  {drawingReviewItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className={styles.itemBtn} onClick={() => setActive(item)}>
                        <Tag color="orange">上传</Tag>
                        <span className={styles.itemText}>
                          待审核图纸：{item.drawing_name}（上传者 {item.uploaded_by_name || '-'}）
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <DrawingReviewModal
        open={Boolean(active)}
        item={active}
        confirming={confirming}
        onCancel={() => setActive(null)}
        onDownloaded={refresh}
        onConfirm={handleConfirm}
        onReject={handleReject}
      />
    </>
  )
}
