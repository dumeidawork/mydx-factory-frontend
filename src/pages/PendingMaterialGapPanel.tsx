import { useState } from 'react'
import { Badge, Button, Collapse, Empty, Modal, Space, Tag } from 'antd'
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged, useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import { useCollapseWhenEmpty } from './useCollapseWhenEmpty'
import { formatAlignMessages, type AlignConfirmResult, type MaterialGapItem } from './materialAlignTypes'
import styles from './PendingContractTakeoverPanel.module.css'

async function readJson<T = unknown>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'string' ? item : (item as { msg?: string }).msg || JSON.stringify(item)))
      .join('; ')
  }
  return '请求失败'
}

export async function confirmMaterialAlign(keys?: { drawing_no: string; material_no: string }[]) {
  const res = await authFetch(apiUrl('/api/v1/workflow/materials/align-confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: keys || [] }),
  })
  const data = await readJson<AlignConfirmResult & { detail?: unknown }>(res)
  if (!res.ok) {
    throw new Error(parseApiDetail(data))
  }
  return data
}

export function showAlignConfirmResult(data: AlignConfirmResult) {
  const { aligned, missing, missingLines } = formatAlignMessages(data)
  if (aligned && !missing.length) {
    message.success(`已对齐 ${aligned} 条物料`)
    return
  }
  if (!aligned && !missing.length) {
    message.info('当前没有可对齐的物料缺口')
    return
  }
  const missingContent = (
    <div>
      {missingLines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
  if (aligned && missing.length) {
    Modal.warning({
      title: `已对齐 ${aligned} 条，仍有 ${missing.length} 条需补录`,
      content: missingContent,
    })
    return
  }
  Modal.warning({
    title: '请先补录物料后再确认对齐',
    content: missingContent,
  })
}

function GapList({
  items,
  confirming,
  onAlign,
}: {
  items: MaterialGapItem[]
  confirming: boolean
  onAlign: (keys?: { drawing_no: string; material_no: string }[]) => void
}) {
  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办" />
  }
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key}>
          <div className={styles.itemBtn} style={{ cursor: 'default' }}>
            <Tag color={item.source === 'drawing' ? 'orange' : 'blue'}>{item.source === 'drawing' ? '图纸' : '价格拆分'}</Tag>
            <span className={styles.itemText}>
              物料号 {item.material_no}，图纸号 {item.drawing_no || '空'}
              {item.region ? `（${item.region}）` : ''}
              ；上传者 {item.uploaded_by || '-'}
              {item.updated_by ? `，更新者 ${item.updated_by}` : ''}
              <div className={styles.hint}>{item.hint}</div>
            </span>
            <Button
              type="primary"
              size="small"
              loading={confirming}
              onClick={() => onAlign([{ drawing_no: item.drawing_no, material_no: item.material_no }])}
            >
              确认对齐
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function PendingMaterialGapPanel() {
  const { materialDrawingItems, materialPriceItems, loading, refresh } = useWorkbenchUnread()
  const drawingCollapse = useCollapseWhenEmpty(materialDrawingItems.length, 'material-drawing-gap')
  const priceCollapse = useCollapseWhenEmpty(materialPriceItems.length, 'material-price-gap')
  const [confirming, setConfirming] = useState(false)

  const handleAlign = async (keys?: { drawing_no: string; material_no: string }[]) => {
    setConfirming(true)
    try {
      const data = await confirmMaterialAlign(keys)
      showAlignConfirmResult(data)
      notifyWorkbenchUnreadChanged()
      await refresh()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '对齐失败')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <>
      <Collapse
        className={`${styles.panel} ${styles.materialPanel}`}
        activeKey={drawingCollapse.activeKey}
        onChange={drawingCollapse.onChange}
        items={[
          {
            key: 'material-drawing-gap',
            label: (
              <span className={styles.label}>
                <span>图纸缺物料</span>
                <Badge
                  count={materialDrawingItems.length}
                  showZero
                  overflowCount={99}
                  style={{ backgroundColor: materialDrawingItems.length ? '#0f766e' : '#94a3b8' }}
                />
                <span className={styles.materialHint}>
                  {materialDrawingItems.length > 0 ? `共 ${materialDrawingItems.length} 条图纸在物料表中找不到` : '当前没有图纸缺物料'}
                </span>
              </span>
            ),
            extra: (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={!materialDrawingItems.length}
                  loading={confirming}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleAlign(materialDrawingItems.map((item) => ({ drawing_no: item.drawing_no, material_no: item.material_no })))
                  }}
                >
                  确认对齐
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
            children: <GapList items={materialDrawingItems} confirming={confirming} onAlign={(keys) => void handleAlign(keys)} />,
          },
        ]}
      />
      <Collapse
        className={`${styles.panel} ${styles.materialPanel}`}
        activeKey={priceCollapse.activeKey}
        onChange={priceCollapse.onChange}
        items={[
          {
            key: 'material-price-gap',
            label: (
              <span className={styles.label}>
                <span>价格拆分缺物料</span>
                <Badge
                  count={materialPriceItems.length}
                  showZero
                  overflowCount={99}
                  style={{ backgroundColor: materialPriceItems.length ? '#0f766e' : '#94a3b8' }}
                />
                <span className={styles.materialHint}>
                  {materialPriceItems.length > 0
                    ? `共 ${materialPriceItems.length} 条价格拆分在物料表中找不到`
                    : '当前没有价格拆分缺物料'}
                </span>
              </span>
            ),
            extra: (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={!materialPriceItems.length}
                  loading={confirming}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleAlign(materialPriceItems.map((item) => ({ drawing_no: item.drawing_no, material_no: item.material_no })))
                  }}
                >
                  确认对齐
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
            children: <GapList items={materialPriceItems} confirming={confirming} onAlign={(keys) => void handleAlign(keys)} />,
          },
        ]}
      />
    </>
  )
}
