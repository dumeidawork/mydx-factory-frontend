import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, InputNumber, Modal, Space, Tag, Tooltip } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { saveGeneratedBlob, getDownloadFileName } from '../utils/clientFileSave'
import { message } from '../utils/feedback'
import { askSavePathAndFileName } from '../utils/savePath'
import { isDalianContractCustomer } from '../utils/customerRegion'
import {
  CONFIRM_FIELDS,
  type ConfirmFieldKey,
  type ConfirmTakeoverPayload,
  type PendingTakeoverItem,
} from './contractTakeoverTypes'
import styles from './PendingContractTakeoverPanel.module.css'

type Props = {
  open: boolean
  item: PendingTakeoverItem | null
  confirming?: boolean
  onCancel: () => void
  onDownloaded: () => void | Promise<void>
  onConfirm: (payload: ConfirmTakeoverPayload) => void | Promise<void>
}

function displayValue(item: PendingTakeoverItem, key: ConfirmFieldKey): string {
  const raw = item[key]
  const text = raw == null ? '' : String(raw).trim()
  return text || '-'
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

export default function ContractTakeoverModal({
  open,
  item,
  confirming = false,
  onCancel,
  onDownloaded,
  onConfirm,
}: Props) {
  const [checked, setChecked] = useState<ConfirmFieldKey[]>([])
  const [downloading, setDownloading] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setChecked([])
      setAmount(null)
    }
  }, [open, item?.id])

  const allChecked = checked.length === CONFIRM_FIELDS.length
  const downloaded = Boolean(item?.downloaded_after_assign)
  const amountOptional = isDalianContractCustomer(item?.customer_name)
  const amountFilled = amount != null && !Number.isNaN(amount)
  const canConfirm =
    allChecked && downloaded && (amountOptional || amountFilled) && !confirming && !downloading

  const disableReason = useMemo(() => {
    if (!item) return ''
    if (!downloaded) return '请先下载该合同的原始文件'
    if (!allChecked) return '请逐项勾选确认全部合同信息'
    if (!amountOptional && !amountFilled) return '请填入合同总金额'
    return ''
  }, [item, downloaded, allChecked, amountOptional, amountFilled])

  const handleDownload = async () => {
    if (!item) return
    const saveInfo = await askSavePathAndFileName('下载原始合同', '', item.file_name, {
      forceXlsx: false,
      okText: '确认下载',
    })
    if (!saveInfo) return
    setDownloading(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/contract-archives/${item.id}/download`))
      if (!res.ok) {
        const data = await readJson(res)
        message.error(parseApiDetail(data))
        return
      }
      const blob = await res.blob()
      const fileName = saveInfo.fileName.trim() || getDownloadFileName(res, item.file_name) || item.file_name
      const saved = await saveGeneratedBlob(blob, fileName, saveInfo.directoryPath)
      Modal.success({ title: '下载完成', content: saved ? `已保存至：${saved}` : '文件已下载' })
      await onDownloaded()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      title="确认接手合同"
      open={open}
      onCancel={onCancel}
      width={640}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void handleDownload()}>
            下载原始文件
          </Button>
          <Tooltip title={canConfirm ? undefined : disableReason}>
            <span>
              <Button
                type="primary"
                disabled={!canConfirm}
                loading={confirming}
                onClick={() => void onConfirm({ total_amount: amountFilled ? amount : null })}
              >
                确认接手
              </Button>
            </span>
          </Tooltip>
        </Space>
      }
    >
      {item ? (
        <div className={styles.modalBody}>
          <div className={styles.guide}>
            <div className={styles.guideTitle}>操作步骤</div>
            <ol className={styles.guideList}>
              <li>核对下列合同信息，逐项勾选确认</li>
              <li>下载该合同的原始文件（未下载不可确认接手）</li>
              <li>
                {amountOptional
                  ? '合同总金额非必填，可对照原件填写后点击「确认接手」'
                  : '对照原件填入合同总金额后，点击「确认接手」'}
              </li>
            </ol>
            <div className={styles.guideTitle}>规约</div>
            <ul className={styles.guideNotes}>
              <li>仅被指定的业务负责人可以确认接手</li>
              <li>必须在本次被指定之后下载过原件（列表页下载也算）</li>
              <li>
                {amountOptional
                  ? '若填写金额，须与上传时一致；不一致需确认真实金额，进度将变为【修改】并由上传者复核。不填则跳过金额核对，进度直接变为【确认】'
                  : '金额须与上传时一致；不一致需确认真实金额，进度将变为【修改】并由上传者复核'}
              </li>
            </ul>
          </div>
          <div className={styles.downloadHint}>
            {downloaded ? (
              <Tag color="success">已下载原始文件</Tag>
            ) : (
              <Tag color="warning">尚未下载原始文件</Tag>
            )}
          </div>
          <div className={styles.confirmList}>
            {CONFIRM_FIELDS.map((field) => (
              <Checkbox
                key={field.key}
                checked={checked.includes(field.key)}
                onChange={(e) => {
                  setChecked((prev) =>
                    e.target.checked ? [...prev, field.key] : prev.filter((k) => k !== field.key),
                  )
                }}
              >
                <span className={styles.fieldLabel}>{field.label}：</span>
                <span className={styles.fieldValue}>{displayValue(item, field.key)}</span>
              </Checkbox>
            ))}
          </div>
          {downloaded ? (
            <div className={styles.amountRow}>
              <span className={styles.fieldLabel}>合同总金额</span>
              <InputNumber
                min={0}
                precision={2}
                style={{ width: 220 }}
                placeholder={amountOptional ? '非必填' : '请按原件填入，不预填'}
                value={amount}
                onChange={(v) => setAmount(typeof v === 'number' ? v : null)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}
