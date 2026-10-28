/** 仓库管理 API 客户端 */
import { apiUrl } from '../../utils/api'
import { authFetch } from '../../utils/auth'

async function parseJson<T = any>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail
    let msg = '请求失败'
    if (typeof detail === 'string') msg = detail
    else if (Array.isArray(detail)) {
      msg = detail.map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg || JSON.stringify(d))).join('; ')
    }
    throw new Error(msg)
  }
  return data as T
}

export async function whGet<T = any>(path: string): Promise<T> {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`))
  return parseJson<T>(res)
}

export async function whPost<T = any>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<T>(res)
}

export async function whPut<T = any>(path: string, body: unknown): Promise<T> {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<T>(res)
}

export async function whDelete<T = any>(path: string): Promise<T> {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`), { method: 'DELETE' })
  return parseJson<T>(res)
}

export async function whPostForm<T = any>(path: string, form: FormData): Promise<T> {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`), {
    method: 'POST',
    body: form,
  })
  return parseJson<T>(res)
}

export async function whDownload(path: string, fallbackName: string) {
  const res = await authFetch(apiUrl(`/api/v1/warehouse${path}`))
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = (data as { detail?: string }).detail
    throw new Error(typeof detail === 'string' ? detail : '导出失败')
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  let fileName = fallbackName
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd)
  if (m) fileName = decodeURIComponent(m[1] || m[2] || fallbackName)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export const CASH_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending_verify: '待核实',
  pending_approve: '待审批',
  pending_pay: '待付款',
  paid: '已付款',
  posted: '已入账',
  rejected: '已驳回',
  confirmed: '已确认',
  voided: '已作废',
  cancelled: '已取消',
}

export const CASH_NEXT: Record<string, string> = {
  draft: 'pending_verify',
  pending_verify: 'pending_approve',
  pending_approve: 'pending_pay',
  pending_pay: 'paid',
  paid: 'posted',
}

export const CASH_NEXT_LABEL: Record<string, string> = {
  pending_verify: '提交核实',
  pending_approve: '核实通过',
  pending_pay: '审批通过',
  paid: '确认付款',
  posted: '入账',
}

const CASH_ADMIN = new Set(['super_admin', 'general_manager'])

/** 与后端 CASH_FROM_ROLES 对齐：按当前状态判断能否推进/驳回 */
export function canCashAction(status: string, roleCode?: string): boolean {
  const r = roleCode || ''
  if (status === 'draft') return true
  if (status === 'pending_verify') return r === 'warehouse' || CASH_ADMIN.has(r)
  if (status === 'pending_approve') return CASH_ADMIN.has(r)
  if (status === 'pending_pay' || status === 'paid') {
    return r === 'warehouse' || r === 'finance' || CASH_ADMIN.has(r)
  }
  return false
}

export const UOM_OPTIONS = ['个', '条', '盒', '套', '米', '卷', 'kg', '升', '桶', '双', '付', '件']
