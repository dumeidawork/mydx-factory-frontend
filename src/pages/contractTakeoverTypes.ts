export type PendingTakeoverItem = {
  id: number
  customer_name: string
  file_name: string
  version: string
  upload_date: string
  uploaded_by_name: string
  uploaded_by_user_id?: number | null
  summary?: string | null
  owner_user_id?: number | null
  owner_name?: string | null
  progress_status?: string | null
  assigned_at?: string | null
  downloaded_after_assign: boolean
  total_amount?: number | string | null
  previous_total_amount?: number | string | null
}

export type AmountConfirmItem = {
  id: number
  customer_name: string
  file_name: string
  version: string
  upload_date: string
  uploaded_by_name: string
  owner_name?: string | null
  total_amount?: number | string | null
  previous_total_amount?: number | string | null
}

export type ConfirmTakeoverPayload = {
  total_amount?: number | null
  confirm_real_amount?: boolean
}

const CONFIRM_FIELDS = [
  { key: 'customer_name', label: '客户名' },
  { key: 'file_name', label: '合同附件' },
  { key: 'version', label: '版本号' },
  { key: 'upload_date', label: '上传时间' },
  { key: 'uploaded_by_name', label: '上传者' },
  { key: 'summary', label: '合同概述' },
  { key: 'owner_name', label: '业务负责人' },
] as const

export type ConfirmFieldKey = (typeof CONFIRM_FIELDS)[number]['key']

export { CONFIRM_FIELDS }

export function formatContractAmount(v: number | string | null | undefined): string {
  if (v == null || v === '') return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return '-'
  return n.toFixed(2)
}
