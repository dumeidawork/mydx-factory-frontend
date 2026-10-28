import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Input, Modal, Space, Table, Tag, Tooltip } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { getDownloadFileName, saveGeneratedBlob } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { drawingReviewFieldsFor, type DrawingArchiveRow } from './drawingReviewTypes'
import styles from './PendingContractTakeoverPanel.module.css'

type Props = {
  open: boolean
  item: DrawingArchiveRow | null
  confirming?: boolean
  onCancel: () => void
  onDownloaded: () => void | Promise<void>
  onConfirm: () => void | Promise<void>
  onReject: (remark: string) => void | Promise<void>
}

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

export default function DrawingReviewModal({
  open,
  item,
  confirming = false,
  onCancel,
  onDownloaded,
  onConfirm,
  onReject,
}: Props) {
  const [checked, setChecked] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const [remark, setRemark] = useState('')

  useEffect(() => {
    if (open) {
      setChecked([])
      setRemark('')
    }
  }, [open, item?.id])

  const reviewFields = item ? drawingReviewFieldsFor(item) : []
  const downloaded = Boolean(item?.downloaded_after_submit)
  const allChecked = reviewFields.length > 0 && checked.length === reviewFields.length
  const canConfirm = allChecked && downloaded && !confirming && !downloading

  const disableReason = useMemo(() => {
    if (!item) return ''
    if (!downloaded) return '请先下载该图纸并对照核对'
    if (!allChecked) return '请逐项勾选确认录入内容与图纸一致'
    return ''
  }, [item, downloaded, allChecked])

  const handleDownload = async () => {
    if (!item) return
    const fileName = `${item.drawing_name}.pdf`
    const saveInfo = await askSavePathAndFileName('下载图纸', '', fileName, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    setDownloading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/drawing-archives/${item.id}/download`))
      if (!res.ok) {
        const data = await readJson(res)
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      const finalName = getDownloadFileName(res, saveInfo.fileName || fileName)
      const saved = await saveGeneratedBlob(blob, finalName, saveInfo.directoryPath)
      if (saved) {
        message.success('下载完成，请对照图纸核对录入内容')
        await onDownloaded()
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      open={open}
      title="图纸审核"
      onCancel={onCancel}
      width={860}
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button danger disabled={confirming || downloading} onClick={() => void onReject(remark)}>
            不一致
          </Button>
          <Tooltip title={disableReason}>
            <Button type="primary" disabled={!canConfirm} loading={confirming} onClick={() => void onConfirm()}>
              确认
            </Button>
          </Tooltip>
        </Space>
      }
    >
      {item ? (
        <div className={styles.modalBody}>
          <div>
            <Tag color="orange">{item.status || '上传'}</Tag>
            <span style={{ marginLeft: 8 }}>{item.drawing_name}</span>
          </div>
          <div className={styles.guide}>请下载 PDF，逐项核对录入内容是否与图纸一致。一致后点确认，不一致则反馈给上传者。</div>
          <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void handleDownload()}>
            下载图纸
          </Button>
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={reviewFields.map((f) => ({
              key: f.key,
              label: f.label,
              value: String(item[f.key] ?? '').trim() || '-',
            }))}
            columns={[
              { title: '项目', dataIndex: 'label', width: 180 },
              { title: '录入值', dataIndex: 'value' },
              {
                title: '已核对',
                width: 90,
                render: (_, row) => (
                  <Checkbox
                    checked={checked.includes(row.key)}
                    onChange={(e) => {
                      setChecked((prev) =>
                        e.target.checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                      )
                    }}
                  />
                ),
              },
            ]}
          />
          <Input.TextArea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="不一致时可选填说明，将反馈给上传者"
          />
        </div>
      ) : null}
    </Modal>
  )
}
