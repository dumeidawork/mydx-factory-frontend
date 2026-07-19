import { message } from './feedback'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
export const REQUEST_TIMEOUT_MS = 3 * 60 * 1000
/** 连接失败/超时后的重连次数 */
export const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1000
const PROBE_TIMEOUT_MS = 8000

let globalFetchGuardInstalled = false
let connectionFailureNotified = false
let connectionGaveUp = false
let sharedRecovery: Promise<boolean> | null = null

class FetchAttemptError extends Error {
  readonly timedOut: boolean
  readonly original: unknown

  constructor(original: unknown, timedOut: boolean) {
    super(original instanceof Error ? original.message : 'fetch failed')
    this.name = 'FetchAttemptError'
    this.original = original
    this.timedOut = timedOut
  }
}

function resetConnectionFailureNotice() {
  connectionFailureNotified = false
  connectionGaveUp = false
  sharedRecovery = null
}

function notifyConnectionFailureOnce(text: string) {
  if (connectionFailureNotified) return
  connectionFailureNotified = true
  message.error(text)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function apiUrl(path: string) {
  if (!path) return API_BASE_URL || ''
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}

function healthProbeUrl() {
  if (API_BASE_URL) return `${API_BASE_URL}/health`
  return 'http://127.0.0.1:8000/health'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRetryableFailure(error: unknown, timedOut: boolean, init: RequestInit) {
  if (init.signal?.aborted && !timedOut) return false
  if (timedOut) return true
  if (error instanceof TypeError) return true
  if (isAbortError(error)) return false
  return true
}

export function isFetchGuardHandled(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { __fetchGuardHandled?: boolean }).__fetchGuardHandled)
}

function markFetchGuardHandled(error: unknown) {
  if (!error || typeof error !== 'object') return
  try {
    Object.defineProperty(error, '__fetchGuardHandled', { value: true })
  } catch {
    ;(error as { __fetchGuardHandled?: boolean }).__fetchGuardHandled = true
  }
}

function createConnectionGaveUpError() {
  const error = new Error('服务器连接已断开，请检查后台服务后刷新页面')
  markFetchGuardHandled(error)
  return error
}

function unwrapFetchError(error: unknown) {
  return error instanceof FetchAttemptError ? error.original : error
}

function mergeAbortSignals(signals: AbortSignal[]) {
  const activeSignals = signals.filter(Boolean)
  if (activeSignals.length === 0) return undefined
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort()
  }
  activeSignals.forEach((signal) => {
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener('abort', abort, { once: true })
  })
  return controller.signal
}

async function probeBackend(originalFetch: typeof window.fetch): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await originalFetch(healthProbeUrl(), { method: 'GET', signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

async function runSharedRecovery(originalFetch: typeof window.fetch): Promise<boolean> {
  if (connectionGaveUp) return false
  if (sharedRecovery) return sharedRecovery

  sharedRecovery = (async () => {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt += 1) {
      if (await probeBackend(originalFetch)) {
        connectionGaveUp = false
        connectionFailureNotified = false
        return true
      }
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await sleep(RECONNECT_DELAY_MS * attempt)
      }
    }
    connectionGaveUp = true
    notifyConnectionFailureOnce('服务器连接失败，已重试 3 次仍未连通，请确认后台是否运行')
    return false
  })().finally(() => {
    sharedRecovery = null
  })

  return sharedRecovery
}

async function fetchOnce(
  originalFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const timeoutController = new AbortController()
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    timeoutController.abort()
  }, REQUEST_TIMEOUT_MS)
  const signal = mergeAbortSignals([timeoutController.signal, init.signal].filter(Boolean) as AbortSignal[])

  try {
    return await originalFetch(input, { ...init, signal })
  } catch (error) {
    throw new FetchAttemptError(error, timedOut)
  } finally {
    window.clearTimeout(timer)
  }
}

export function installGlobalFetchGuard() {
  if (globalFetchGuardInstalled || typeof window === 'undefined') return
  globalFetchGuardInstalled = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (connectionGaveUp) {
      throw createConnectionGaveUpError()
    }

    const execute = async () => {
      try {
        return await fetchOnce(originalFetch, input, init)
      } catch (error) {
        if (!(error instanceof FetchAttemptError)) throw error
        const { original, timedOut } = error
        if (!isRetryableFailure(original, timedOut, init)) {
          markFetchGuardHandled(original)
          throw original
        }
        throw error
      }
    }

    try {
      const response = await execute()
      resetConnectionFailureNotice()
      return response
    } catch (error) {
      if (!(error instanceof FetchAttemptError)) throw error

      const recovered = await runSharedRecovery(originalFetch)
      if (!recovered) {
        markFetchGuardHandled(unwrapFetchError(error))
        throw unwrapFetchError(error)
      }

      try {
        const response = await execute()
        resetConnectionFailureNotice()
        return response
      } catch (retryError) {
        const raw = unwrapFetchError(retryError)
        if (retryError instanceof FetchAttemptError) {
          const { timedOut } = retryError
          if (isRetryableFailure(raw, timedOut, init)) {
            connectionGaveUp = true
            notifyConnectionFailureOnce('服务器连接失败，已重试 3 次仍未连通，请确认后台是否运行')
          }
        }
        markFetchGuardHandled(raw)
        throw raw
      }
    }
  }
}

/** POST JSON，解析响应体（失败时亦尝试 JSON，便于读取 FastAPI 的 detail） */
export async function fetchPostJson<T = unknown>(path: string, body: unknown): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  let data = {} as T
  try {
    data = (await res.json()) as T
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, data }
}

export function workflowQcDetailUrl(order_no: string, material_no: string, heat_no = '', heat_treatment_batch_no = '', order_detail_id: string | number = '') {
  const qs = new URLSearchParams({
    order_no,
    material_no,
    heat_no,
    heat_treatment_batch_no,
  })
  if (order_detail_id !== '') qs.set('order_detail_id', String(order_detail_id))
  return apiUrl(`/api/v1/workflow/qc/detail?${qs.toString()}`)
}

export function workflowQcDalianDetailUrl(
  order_no: string,
  material_no: string,
  heat_no = '',
  heat_treatment_batch_no = '',
  order_detail_id: string | number = '',
  date = '',
  force_regenerate = false,
  allocate = false,
) {
  const qs = new URLSearchParams({
    order_no,
    material_no,
    heat_no,
    heat_treatment_batch_no,
  })
  if (order_detail_id !== '') qs.set('order_detail_id', String(order_detail_id))
  if (date) qs.set('date', date)
  if (force_regenerate) qs.set('force_regenerate', 'true')
  if (allocate) qs.set('allocate', 'true')
  return apiUrl(`/api/v1/workflow/qc/dalian/detail?${qs.toString()}`)
}
