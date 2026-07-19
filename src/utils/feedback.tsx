import { Modal } from 'antd'

let globalActionErrorDialogInstalled = false

function formatFeedback(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          const loc = Array.isArray(obj.loc) ? obj.loc.join('.') : ''
          const msg = String(obj.msg || obj.message || JSON.stringify(obj))
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .join('\n')
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const main = String(obj.message || obj.detail || '')
    const errors = Array.isArray(obj.errors)
      ? obj.errors
          .map((item) => {
            const err = item as Record<string, unknown>
            return err.message ? `第${err.row || ''}行 ${err.message}` : JSON.stringify(err)
          })
          .join('\n')
      : ''
    return [main, errors].filter(Boolean).join('\n') || JSON.stringify(value, null, 2)
  }
  return String(value)
}

function isHandledByFetchGuard(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { __fetchGuardHandled?: boolean }).__fetchGuardHandled)
}

function isAntdValidationError(error: unknown) {
  return Boolean(error && typeof error === 'object' && Array.isArray((error as { errorFields?: unknown[] }).errorFields))
}

function getUnhandledReason(event: PromiseRejectionEvent | ErrorEvent) {
  if ('reason' in event) return event.reason
  return event.error || event.message
}

export function installGlobalActionErrorDialog() {
  if (globalActionErrorDialogInstalled || typeof window === 'undefined') return
  globalActionErrorDialogInstalled = true

  const showUnhandledError = (event: PromiseRejectionEvent | ErrorEvent) => {
    const reason = getUnhandledReason(event)
    if (isHandledByFetchGuard(reason) || isAntdValidationError(reason)) return
    message.error(reason || '操作处理失败')
  }

  window.addEventListener('unhandledrejection', showUnhandledError)
  window.addEventListener('error', showUnhandledError)
}

export const message = {
  success(content: unknown) {
    Modal.success({ title: '处理成功', content: formatFeedback(content) || '操作已完成' })
  },
  error(content: unknown) {
    Modal.error({ title: '处理失败', content: formatFeedback(content) || '操作失败' })
  },
  warning(content: unknown) {
    Modal.warning({ title: '请确认', content: formatFeedback(content) || '请检查输入内容' })
  },
  info(content: unknown) {
    Modal.info({ title: '提示', content: formatFeedback(content) || '操作已完成' })
  },
  loading(content: unknown, _duration?: number) {
    const modal = Modal.info({ title: '处理中', content: formatFeedback(content) || '请稍候...' })
    return () => modal.destroy()
  },
}
