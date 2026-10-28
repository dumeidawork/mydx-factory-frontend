import { useState } from 'react'
import { Badge, Button, Collapse, Empty, Modal, Tag } from 'antd'
import { DollarOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged, useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import { formatContractAmount, type AmountConfirmItem } from './contractTakeoverTypes'
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

export default function PendingAmountConfirmPanel() {
  const { amountItems, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<AmountConfirmItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    if (!active) return
    setConfirming(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/contract-archives/${active.id}/confirm-amount-change`), {
        method: 'POST',
      })
      const data = await readJson(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        await refresh()
        return
      }
      message.success('已确认修改后的合同金额，进度已变为【确认】')
      setActive(null)
      notifyWorkbenchUnreadChanged()
      await refresh()
    } finally {
      setConfirming(false)
    }
  }

  const count = amountItems.length
  const collapse = useCollapseWhenEmpty(count, 'amount')
  const label = (
    <span className={styles.label}>
      <DollarOutlined />
      <span>金额修改待确认</span>
      <Badge count={count} showZero overflowCount={99} style={{ backgroundColor: count ? '#d48806' : '#94a3b8' }} />
      <span className={styles.amountHint}>
        {count > 0 ? `共 ${count} 份合同金额已修改，请确认` : '当前没有待确认的金额修改'}
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
            key: 'amount',
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
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无金额修改待确认" />
              ) : (
                <ul className={styles.list}>
                  {amountItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className={styles.amountItemBtn} onClick={() => setActive(item)}>
                        <Tag color="gold">修改</Tag>
                        <span className={styles.itemText}>
                          确认合同金额已修改，请确认：{item.customer_name} / {item.file_name}（{item.version}）
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
        title="确认合同金额已修改"
        open={Boolean(active)}
        onCancel={() => setActive(null)}
        confirmLoading={confirming}
        okText="确认金额修改"
        onOk={() => void handleConfirm()}
        destroyOnClose
      >
        {active ? (
          <div className={styles.modalBody}>
            <div className={styles.guide}>
              <div className={styles.guideTitle}>说明</div>
              <ul className={styles.guideNotes}>
                <li>业务负责人对照原件后修改了合同总金额</li>
                <li>请核对原金额与修改后金额，确认后合同进度变为【确认】</li>
              </ul>
            </div>
            <div>
              <span className={styles.fieldLabel}>客户名：</span>
              <span className={styles.fieldValue}>{active.customer_name}</span>
            </div>
            <div>
              <span className={styles.fieldLabel}>合同附件：</span>
              <span className={styles.fieldValue}>{active.file_name}</span>
            </div>
            <div>
              <span className={styles.fieldLabel}>原金额：</span>
              <span className={styles.fieldValue}>{formatContractAmount(active.previous_total_amount)}</span>
            </div>
            <div>
              <span className={styles.fieldLabel}>修改后金额：</span>
              <span className={styles.fieldValue}>{formatContractAmount(active.total_amount)}</span>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
