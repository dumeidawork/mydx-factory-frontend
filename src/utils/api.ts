import { message } from './feedback'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
export const REQUEST_TIMEOUT_MS = 3 * 60 * 1000
/** 连接失败/超时后的重连次数 */
export const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1000
const PROBE_TIMEOUT_MS = 8000
/**
 * 开发服务异常退出后大约 2 秒才会被重新拉起。
 * 后台健康检查已经通过时，先等这一轮再重试业务请求。
 */
const CHANNEL_RETRY_DELAY_MS = 3000
/** 判定后台不可达后，短时间内不再重复探测，避免轮询把失败放大。 */
const GAVE_UP_COOLDOWN_MS = 3000
const BACKEND_DOWN_MESSAGE = '服务器连接失败，已重试 3 次仍未连通，请确认后台是否运行'
const CHANNEL_INTERRUPTED_MESSAGE = '请求未完成。后台可以连通，请再试一次'
const REQUEST_TIMEOUT_MESSAGE = '请求超时。后台可以连通，请稍后再试'

let globalFetchGuardInstalled = false
let connectionFailureNotified = false
let connectionGaveUp = false
let connectionGaveUpAt = 0
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
  connectionGaveUpAt = 0
  sharedRecovery = null
}

function giveUpBackend() {
  connectionGaveUp = true
  connectionGaveUpAt = Date.now()
  notifyConnectionFailureOnce(BACKEND_DOWN_MESSAGE)
}

function isGaveUpCoolingDown() {
  return connectionGaveUp && Date.now() - connectionGaveUpAt < GAVE_UP_COOLDOWN_MS
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
  const error = new Error('服务器连接已断开，请确认后台是否运行后再试')
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
        connectionGaveUpAt = 0
        connectionFailureNotified = false
        return true
      }
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        await sleep(RECONNECT_DELAY_MS * attempt)
      }
    }
    giveUpBackend()
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

function failHandled(error: unknown): never {
  markFetchGuardHandled(error)
  throw error
}

export function installGlobalFetchGuard() {
  if (globalFetchGuardInstalled || typeof window === 'undefined') return
  globalFetchGuardInstalled = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (isGaveUpCoolingDown()) {
      throw createConnectionGaveUpError()
    }
    if (connectionGaveUp) {
      connectionGaveUp = false
      connectionGaveUpAt = 0
    }

    const execute = async () => {
      try {
        return await fetchOnce(originalFetch, input, init)
      } catch (error) {
        if (!(error instanceof FetchAttemptError)) throw error
        const { original, timedOut } = error
        if (!isRetryableFailure(original, timedOut, init)) {
          failHandled(original)
        }
        throw error
      }
    }

    const retryAfterBackendConfirmed = async () => {
      try {
        const response = await execute()
        resetConnectionFailureNotice()
        return response
      } catch (retryError) {
        const raw = unwrapFetchError(retryError)
        if (!(retryError instanceof FetchAttemptError)) failHandled(raw)
        const { timedOut } = retryError
        if (!isRetryableFailure(raw, timedOut, init)) failHandled(raw)
        if (timedOut) {
          notifyConnectionFailureOnce(REQUEST_TIMEOUT_MESSAGE)
          failHandled(raw)
        }

        await sleep(CHANNEL_RETRY_DELAY_MS)
        if (init.signal?.aborted) failHandled(raw)
        if (!(await probeBackend(originalFetch))) {
          giveUpBackend()
          failHandled(raw)
        }

        try {
          const response = await execute()
          resetConnectionFailureNotice()
          return response
        } catch (finalError) {
          const finalRaw = unwrapFetchError(finalError)
          if (finalError instanceof FetchAttemptError) {
            const finalTimedOut = finalError.timedOut
            if (isRetryableFailure(finalRaw, finalTimedOut, init)) {
              notifyConnectionFailureOnce(finalTimedOut ? REQUEST_TIMEOUT_MESSAGE : CHANNEL_INTERRUPTED_MESSAGE)
            }
          }
          failHandled(finalRaw)
        }
      }
    }

    try {
      const response = await execute()
      resetConnectionFailureNotice()
      return response
    } catch (error) {
      if (!(error instanceof FetchAttemptError)) throw error

      const recovered = await runSharedRecovery(originalFetch)
      if (!recovered) failHandled(unwrapFetchError(error))
      if (error.timedOut) {
        notifyConnectionFailureOnce(REQUEST_TIMEOUT_MESSAGE)
        failHandled(unwrapFetchError(error))
      }
      return retryAfterBackendConfirmed()
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
