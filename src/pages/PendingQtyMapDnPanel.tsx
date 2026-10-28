import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Collapse, Empty, Modal, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import {
  notifyWorkbenchUnreadChanged,
  useWorkbenchUnread,
  type QtyMapDnNoticeItem,
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

const COLUMNS: ColumnsType<{ material_no: string }> = [
  { title: '物料号', dataIndex: 'material_no' },
]

export default function PendingQtyMapDnPanel() {
  const navigate = useNavigate()
  const { qtyMapDnItems, loading, refresh } = useWorkbenchUnread()
  const [active, setActive] = useState<QtyMapDnNoticeItem | null>(null)
  const [aligning, setAligning] = useState(false)
  const item = qtyMapDnItems[0] || null
  const count = item?.missing_count || 0
  const collapse = useCollapseWhenEmpty(count, 'qty-map-dn')
  const tableRows = useMemo(
    () => (active?.material_nos || []).map((material_no) => ({ material_no })),
    [active],
  )

  const handleAlign = async () => {
    setAligning(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/france-auto-packing-qty-maps/align-dn'), { method: 'POST' })
      const data = await readJson<{
        updated_count?: number
        missing_count?: number
        missing_materials?: string[]
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      notifyWorkbenchUnreadChanged()
      await refresh()
      const updated = data.updated_count ?? 0
      const missing = data.missing_materials || []
      if (!missing.length) {
        message.success(updated ? `已对齐 DN ${updated} 条` : '对照表 DN 已与物料表一致')
        setActive(null)
        return
      }
      Modal.warning({
        title: updated ? `已对齐 ${updated} 条，仍有 ${missing.length} 个物料号取不到 DN` : `仍有 ${missing.length} 个物料号取不到 DN`,
        width: 640,
        content: (
          <div>
            <p>请先上传这些物料号的图纸信息/物料信息，上传后可再点「对齐DN」。</p>
            <div style={{ maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
              {missing.map((materialNo) => (
                <div key={materialNo}>{materialNo}</div>
              ))}
            </div>
          </div>
        ),
      })
      setActive((prev) =>
        prev
          ? { ...prev, material_nos: missing, missing_count: missing.length }
          : prev,
      )
    } finally {
      setAligning(false)
    }
  }

  return (
    <>
      <Collapse
        className={`${styles.panel} ${styles.materialPanel}`}
        activeKey={collapse.activeKey}
        onChange={collapse.onChange}
        items={[
          {
            key: 'qty-map-dn',
            label: (
              <span className={styles.label}>
                <span>物料-数量/托 缺 DN</span>
                <Badge
                  count={count}
                  showZero
                  overflowCount={99}
                  style={{ backgroundColor: count ? '#0f766e' : '#94a3b8' }}
                />
                <span className={styles.materialHint}>
                  {count > 0 ? `请上传 ${count} 个物料号的图纸/物料信息后对齐 DN` : '当前没有待对齐的 DN'}
                </span>
              </span>
            ),
            extra: (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={!count}
                  loading={aligning}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleAlign()
                  }}
                >
                  对齐DN
                </Button>
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
              </Space>
            ),
            children:
              count === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办" />
              ) : (
                <ul className={styles.list}>
                  <li>
                    <button type="button" className={styles.itemBtn} onClick={() => setActive(item)}>
                      <Tag color="cyan">对照表</Tag>
                      <span className={styles.itemText}>
                        请上传以下物料号的图纸信息/物料信息，后批量对齐【物料-数量/托】表的 DN
                        <div className={styles.hint}>共 {count} 个物料号</div>
                      </span>
                    </button>
                  </li>
                </ul>
              ),
          },
        ]}
      />
      <Modal
        title="请上传图纸信息/物料信息后对齐 DN"
        open={Boolean(active)}
        onCancel={() => setActive(null)}
        width={720}
        okText="对齐DN"
        confirmLoading={aligning}
        onOk={() => void handleAlign()}
        cancelText="关闭"
        destroyOnClose
      >
        {active ? (
          <div className={styles.modalBody}>
            <div className={styles.guide}>
              <div className={styles.guideTitle}>说明</div>
              <ul className={styles.guideNotes}>
                <li>这些物料号在【物料-数量/托】中还取不到 DN，请先上传图纸或补录物料信息。</li>
                <li>上传后可在本页或对照表点「对齐DN」，系统会按物料表批量回填。</li>
              </ul>
            </div>
            <Button type="link" style={{ paddingLeft: 0 }} onClick={() => navigate('/packing/france-auto?tab=qty-map')}>
              查看对照表
            </Button>
            <Table
              rowKey="material_no"
              size="small"
              columns={COLUMNS}
              dataSource={tableRows}
              pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 个物料号` }}
              locale={{ emptyText: '没有待补物料号' }}
              style={{ marginTop: 12 }}
            />
          </div>
        ) : null}
      </Modal>
    </>
  )
}
