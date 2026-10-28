/** 登录态与带 Authorization 的请求辅助 */

const TOKEN_KEY = 'erp_token'
const USER_KEY = 'erp_user'

export type LayoutMode = 'horizontal' | 'vertical' | 'classic' | 'mix' | 'columns' | 'overview'

export type AuthUser = {
  id: number
  name: string
  username: string
  role_id: number
  role_code?: string
  role_name_zh?: string
  department?: string | null
  language_preference?: string
  layout_mode?: LayoutMode | string
  color_theme?: string
}

const LAYOUT_MODES = new Set<LayoutMode>([
  'horizontal',
  'vertical',
  'classic',
  'mix',
  'columns',
  'overview',
])

export function normalizeLayoutMode(value: unknown): LayoutMode {
  const mode = String(value || 'horizontal').trim()
  return LAYOUT_MODES.has(mode as LayoutMode) ? (mode as LayoutMode) : 'horizontal'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const AUTH_CHANGED_EVENT = 'erp-auth-changed'

function notifyAuthChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  notifyAuthChanged()
}

export function updateStoredUser(patch: Partial<AuthUser>) {
  const current = getStoredUser()
  if (!current) return null
  const next = { ...current, ...patch }
  localStorage.setItem(USER_KEY, JSON.stringify(next))
  return next
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  notifyAuthChanged()
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

function redirectToLogin() {
  if (typeof window === 'undefined') return
  clearAuthSession()
  if (window.location.protocol === 'file:') {
    window.location.hash = '#/login'
    return
  }
  if (!window.location.pathname.endsWith('/login')) {
    window.location.assign('/login')
  }
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    redirectToLogin()
  }
  return res
}
