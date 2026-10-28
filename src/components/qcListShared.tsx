import type { Dispatch, SetStateAction } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Input, InputNumber, Modal, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import styles from '../pages/WorkflowPages.module.css'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'

export type QcListRow = Record<string, unknown>
export type QcListMode = 'pending' | 'generated'

export function qcListRowKey(row: QcListRow, mode: QcListMode): string | number {
  if (mode === 'generated') {
    return Number(row.id ?? row.snapshot_id ?? 0)
  }
  return Number(row.id ?? 0)
}

export function filterSelectedQcRows(
  listRows: QcListRow[],
  selectedListKeys: (string | number)[],
  listMode: QcListMode,
): QcListRow[] {
  const selectedKeySet = new Set(selectedListKeys.map((key) => String(key)))
  return listRows.filter((row) => selectedKeySet.has(String(qcListRowKey(row, listMode))))
}

export function qcGeneratedRowClassName(row: QcListRow, mode: QcListMode, pinkClass: string): string {
  if (mode === 'pending' && row.has_generated_certificate) {
    return pinkClass
  }
  return ''
}

export function openRegenerateChoiceModal(options: {
  onSnapshot: () => void | Promise<void>
  onLive: () => void | Promise<void>
}) {
  const modal = Modal.info({
    title: '已生成过质保书',
    width: 480,
    content: (
      <div>
        <p>所选物料中包含已生成过质保书的记录，请选择生成方式。</p>
        <Space style={{ marginTop: 16 }}>
          <Button
            type="primary"
            onClick={async () => {
              modal.destroy()
              await options.onSnapshot()
            }}
          >
            按历史快照重生成
          </Button>
          <Button
            onClick={async () => {
              modal.destroy()
              await options.onLive()
            }}
          >
            按当前数据生成新的
          </Button>
        </Space>
      </div>
    ),
    okButtonProps: { style: { display: 'none' } },
    closable: true,
  })
}

export function buildSnapshotDisplayColumns(): ColumnsType<QcListRow> {
  return [
    { title: '出厂日期', dataIndex: 'factory_date', render: (v?: string) => v || '-' },
    { title: '证书编号', dataIndex: 'certificate_no', render: (v?: string) => v || '-' },
    {
      title: '最近生成时间',
      dataIndex: 'generated_at',
      render: (v?: string) => (v ? String(v).replace('T', ' ').slice(0, 19) : '-'),
    },
  ]
}

export function QcBackToListButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onClick}>
      返回列表
    </Button>
  )
}

export async function saveQcListRowQty(row: QcListRow, qty: number): Promise<boolean> {
  const fd = new FormData()
  fd.append('order_no', String(row.order_no || ''))
  fd.append('material_no', String(row.material_no || ''))
  fd.append('heat_no', String(row.heat_no || ''))
  fd.append('heat_treatment_batch_no', String(row.heat_treatment_batch_no || ''))
  fd.append('order_detail_id', String(row.id))
  fd.append('qty', String(qty))
  const res = await fetch(apiUrl('/api/v1/workflow/qc/update_delivery_qty'), { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) {
    message.error(data.detail || '保存失败')
    return false
  }
  if (data.no_update) {
    message.info('无更新')
    return true
  }
  message.success('保存成功')
  return true
}

export async function copyQcListRow(row: QcListRow, reload: () => Promise<void>) {
  const res = await authFetch(apiUrl('/api/v1/workflow/orders/detail/append'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      based_on_id: Number(row.id),
      row: { quantity: row.quantity },
      confirm_summary: '质检列表复制',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    message.error(data.detail || '复制失败')
    return
  }
  message.success(`已复制一行，新 ID：${data.row?.id ?? ''}`)
  await reload()
}

export function deleteQcListRow(row: QcListRow, reload: () => Promise<void>) {
  const rowId = Number(row.id)
  Modal.confirm({
    title: '确认删除',
    content: `确定删除 order_details 表中 id 为 ${rowId} 的记录吗？若该订单号+物料号+条目已无剩余订单行，将同步清除对应装箱记录。`,
    onOk: async () => {
      const res = await authFetch(apiUrl(`/api/v1/workflow/orders/detail/${rowId}`), { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        message.error(typeof data.detail === 'string' ? data.detail : '删除失败')
        return
      }
      message.success(data.message || `已删除 id 为 ${rowId} 的 1 条数据`)
      await reload()
    },
  })
}

type BuildQcListColumnsOptions = {
  pendingQty: Record<number, number>
  setPendingQty: Dispatch<SetStateAction<Record<number, number>>>
  onEnter: (row: QcListRow) => void
  reload: () => Promise<void>
  extraColumns?: ColumnsType<QcListRow>
  pendingCertNo?: Record<number, string>
  setPendingCertNo?: Dispatch<SetStateAction<Record<number, string>>>
  savedCertNo?: Record<number, string>
  setSavedCertNo?: Dispatch<SetStateAction<Record<number, string>>>
  confirmedDateText?: string
  confirmedDateForRow?: (row: QcListRow) => string
  listMode?: QcListMode
}

export function buildQcListColumns({
  pendingQty,
  setPendingQty,
  onEnter,
  reload,
  extraColumns = [],
  pendingCertNo,
  setPendingCertNo,
  savedCertNo,
  setSavedCertNo,
  confirmedDateText = '',
  confirmedDateForRow,
  listMode = 'pending',
}: BuildQcListColumnsOptions): ColumnsType<QcListRow> {
  const isGenerated = listMode === 'generated'
  return [
    {
      title: '操作',
      fixed: 'left',
      width: isGenerated ? 120 : 320,
      render: (_: unknown, row: QcListRow) => {
        if (isGenerated) {
          return <span style={{ color: '#999' }}>快照记录</span>
        }
        const rowId = Number(row.id)
        const displayQty = pendingQty[rowId] ?? Number(row.quantity ?? 0)
        const trialMissing = Boolean(row.trial_data_missing)
        const chemicalMissing = Boolean(row.chemical_data_missing)
        const dataMissing = trialMissing || chemicalMissing
        const missingHints: string[] = []
        if (trialMissing) missingHints.push('试验记录缺失')
        if (chemicalMissing) missingHints.push('化学分析数据缺失')
        return (
          <Space wrap size="small">
            <Button
              type="primary"
              size="small"
              className={dataMissing ? styles.qcEnterMissingButton : undefined}
              title={dataMissing ? missingHints.join('；') : undefined}
              onClick={() => onEnter(row)}
            >
              进入质检中
            </Button>
            <Button size="small" onClick={() => copyQcListRow(row, reload)}>
              复制
            </Button>
            <Button size="small" danger onClick={() => deleteQcListRow(row, reload)}>
              删除
            </Button>
            <Button
              size="small"
              type="default"
              onClick={async () => {
                const okQty = await saveQcListRowQty(row, displayQty)
                if (okQty) {
                  setPendingQty((prev) => {
                    const next = { ...prev }
                    delete next[rowId]
                    return next
                  })
                }
                const rowDateText = confirmedDateForRow?.(row) || confirmedDateText
                if (
                  pendingCertNo &&
                  setPendingCertNo &&
                  savedCertNo &&
                  setSavedCertNo &&
                  rowDateText &&
                  rowId in pendingCertNo
                ) {
                  const certText = pendingCertNo[rowId] ?? ''
                  const okCert = await saveQcListRowCertificateNo(row, certText, rowDateText)
                  if (okCert) {
                    setSavedCertNo((prev) => ({ ...prev, [rowId]: certText }))
                    setPendingCertNo((prev) => {
                      const next = { ...prev }
                      delete next[rowId]
                      return next
                    })
                  }
                }
                if (okQty) await reload()
              }}
            >
              保存
            </Button>
          </Space>
        )
      },
    },
    ...extraColumns,
    ...(pendingCertNo && setPendingCertNo && !isGenerated
      ? [
          {
            title: '证书编号',
            width: 180,
            render: (_: unknown, row: QcListRow) => {
              const rowId = Number(row.id)
              const baseline = savedCertNo?.[rowId] ?? ''
              const value = pendingCertNo[rowId] ?? baseline
              return (
                <Input
                  size="small"
                  value={value}
                  placeholder="请先确认出厂日期"
                  onChange={(e) =>
                    setPendingCertNo((prev) => ({
                      ...prev,
                      [rowId]: e.target.value,
                    }))
                  }
                />
              )
            },
          } as const,
        ]
      : []),
    {
      title: '数量',
      width: 100,
      render: (_: unknown, row: QcListRow) => {
        if (isGenerated) {
          const delivery = (row.delivery_content as Array<Record<string, unknown>> | undefined)?.[0]
          return delivery?.qty ?? '-'
        }
        const rowId = Number(row.id)
        const value = pendingQty[rowId] ?? Number(row.quantity ?? 0)
        return (
          <InputNumber
            min={0}
            size="small"
            value={value}
            onChange={(v) =>
              setPendingQty((prev) => ({
                ...prev,
                [rowId]: Number(v ?? 0),
              }))
            }
          />
        )
      },
    },
  ]
}

export async function saveQcListRowCertificateNo(
  row: QcListRow,
  certificateNo: string,
  dateText: string,
): Promise<boolean> {
  const res = await fetch(apiUrl('/api/v1/workflow/qc/dalian/update_certificate_no'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_detail_id: Number(row.id),
      order_no: String(row.order_no || ''),
      material_no: String(row.material_no || ''),
      item_no: row.item_no != null && row.item_no !== '' ? Number(row.item_no) : null,
      date: dateText,
      certificate_no: certificateNo,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    message.error(data.detail || '证书编号保存失败')
    return false
  }
  message.success('证书编号已保存')
  return true
}

export function hasPendingCertNoChanges(
  pendingCertNo: Record<number, string>,
  savedCertNo: Record<number, string>,
  rows: QcListRow[],
) {
  return rows.some((row) => {
    const rowId = Number(row.id)
    if (!(rowId in pendingCertNo)) return false
    const baseline = savedCertNo[rowId] ?? ''
    return pendingCertNo[rowId] !== baseline
  })
}

export function hasPendingQtyChanges(pendingQty: Record<number, number>, rows: QcListRow[]) {
  return rows.some((row) => {
    const rowId = Number(row.id)
    if (!(rowId in pendingQty)) return false
    return pendingQty[rowId] !== Number(row.quantity ?? 0)
  })
}

export function hasMissingConfirmedCertNo(savedCertNo: Record<number, string>, rows: QcListRow[]) {
  return rows.some((row) => {
    const rowId = Number(row.id)
    return !String(savedCertNo[rowId] || '').trim()
  })
}
