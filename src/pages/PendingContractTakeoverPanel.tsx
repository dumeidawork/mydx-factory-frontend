import { useEffect, useState } from 'react'
import { Badge, Button, Collapse, Empty, Modal, Tag } from 'antd'
import { ReloadOutlined, SolutionOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged, useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import { getStoredUser } from '../utils/auth'
import ContractTakeoverModal from './ContractTakeoverModal'
import type { ConfirmTakeoverPayload, PendingTakeoverItem } from './contractTakeoverTypes'
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

const AMOUNT_MISMATCH = '金额不一致，请确认真实合同金额'

export default function PendingContractTakeoverPanel() {
  const { items, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<PendingTakeoverItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setActive((prev) => (prev ? items.find((x) => x.id === prev.id) || null : null))
  }, [items])

  const submitConfirm = async (payload: ConfirmTakeoverPayload) => {
    if (!active) return
    setConfirming(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/contract-archives/${active.id}/confirm-takeover`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await readJson<{ item?: { progress_status?: string }; detail?: unknown }>(res)
      if (!res.ok) {
        const detail = parseApiDetail(data)
        if (detail.includes(AMOUNT_MISMATCH) && !payload.confirm_real_amount) {
          const me = getStoredUser()
          const samePerson = Boolean(me?.id) && Number(active.uploaded_by_user_id) === Number(me?.id)
          Modal.confirm({
            title: AMOUNT_MISMATCH,
            content: samePerson
              ? `您填入的金额为 ${Number(payload.total_amount).toFixed(2)}。确认后将覆盖原金额，进度直接变为【确认】。`
              : `您填入的金额为 ${Number(payload.total_amount).toFixed(2)}。确认后将覆盖原金额，合同进度变为【修改】，并通知上传者确认。`,
            okText: '确认真实合同金额',
            cancelText: '返回修改',
            onOk: () => submitConfirm({ ...payload, confirm_real_amount: true }),
          })
          return
        }
        message.error(detail)
        await refresh()
        return
      }
      const status = data.item?.progress_status
      if (status === '修改') {
        message.success('金额已修改，已通知上传者确认')
      } else {
        message.success('已确认接手该合同')
      }
      setActive(null)
      notifyWorkbenchUnreadChanged()
      await refresh()
    } finally {
      setConfirming(false)
    }
  }

  const count = items.length
  const collapse = useCollapseWhenEmpty(count, 'pending')
  const label = (
    <span className={styles.label}>
      <SolutionOutlined />
      <span>待接手合同</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#ea580c' : '#94a3b8' }} />
      <span className={styles.hint}>{count > 0 ? `共 ${count} 份合同待您接手` : '当前没有待接手的合同'}</span>
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
            key: 'pending',
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
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待接手合同" />
              ) : (
                <ul className={styles.list}>
                  {items.map((item) => (
                    <li key={item.id}>
                      <button type="button" className={styles.itemBtn} onClick={() => setActive(item)}>
                        <Tag color="orange">分配</Tag>
                        <span className={styles.itemText}>
                          待接手合同：{item.customer_name} / {item.file_name}（{item.version}）
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <ContractTakeoverModal
        open={Boolean(active)}
        item={active}
        confirming={confirming}
        onCancel={() => setActive(null)}
        onDownloaded={refresh}
        onConfirm={submitConfirm}
      />
    </>
  )
}
