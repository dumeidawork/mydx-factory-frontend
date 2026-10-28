import { useEffect, useState } from 'react'
import { apiUrl } from '../../utils/api'
import { authFetch } from '../../utils/auth'
import type { CodeSymbology } from './model'
import { DEFAULT_SYMBOLOGY, SAMPLE_VALUES } from './model'

export async function fetchDatamatrixMatrix(
  template: string,
  values?: Record<string, string>,
  symbology: CodeSymbology = DEFAULT_SYMBOLOGY,
): Promise<{ payload: string; matrix: number[][] }> {
  const res = await authFetch(apiUrl('/api/v1/qr-label-designs/encode-preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: template || '',
      values: values && Object.keys(values).length ? values : SAMPLE_VALUES,
      symbology: symbology === 'qr' ? 'qr' : 'ecc200',
    }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    payload?: string
    matrix?: number[][]
    detail?: string
  }
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : '编码预览失败')
  }
  return { payload: data.payload || '', matrix: data.matrix || [] }
}

export function useDatamatrixMatrix(
  template?: string,
  values?: Record<string, string>,
  symbology: CodeSymbology = DEFAULT_SYMBOLOGY,
) {
  const [matrix, setMatrix] = useState<number[][]>()
  const [payload, setPayload] = useState('')
  useEffect(() => {
    if (template == null) {
      setMatrix(undefined)
      setPayload('')
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void fetchDatamatrixMatrix(template, values, symbology)
        .then((data) => {
          if (cancelled) return
          setMatrix(data.matrix)
          setPayload(data.payload)
        })
        .catch(() => {
          if (!cancelled) {
            setMatrix(undefined)
            setPayload('')
          }
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [template, JSON.stringify(values || {}), symbology])
  return { matrix, payload }
}
