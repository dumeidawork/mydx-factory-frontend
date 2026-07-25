/** 登录态与带 Authorization 的请求辅助 */

const TOKEN_KEY = 'erp_token'
const USER_KEY = 'erp_user'

export type AuthUser = {
  id: number
  name: string
  username: string
  role_id: number
  role_code?: string
  role_name_zh?: string
  department?: string | null
  language_preference?: string
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

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
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
