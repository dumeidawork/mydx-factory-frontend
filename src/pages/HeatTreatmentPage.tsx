import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Table, Tabs, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import styles from './WorkflowPages.module.css'
import { apiUrl, fetchPostJson } from '../utils/api'
import { authFetch, getStoredUser } from '../utils/auth'
import { message } from '../utils/feedback'
import { usePageTitle } from '../layout/usePageTitle'

type TrialRow = {
  id?: number
  rowKey: string
  test_date: string
  heat_no: string
  batch_no: string
  spec_model: string
  yield_strength: string
  tensile_strength: string
  elongation: string
  reduction_area: string
  hardness: string
  impact_test: string
  seq_no: string
  supplier_hardness: string
  material_no: string
  remark: string
  material: string
}

type ChemicalMap = Record<string, string | number>
type ResultState = {
  trial_row?: Record<string, unknown>
  chemical_record?: Record<string, unknown>
  test_result?: string
  remark?: string
  detail?: string
}

const CHEM_KEYS = ['C', 'Mn', 'P', 'S', 'Si', 'Cu', 'Ni', 'Cr', 'Mo', 'V', 'CEQ'] as const
const CHEM_LABELS: Record<(typeof CHEM_KEYS)[number], string> = {
  C: '碳 C(%)（<=0.23）',
  Mn: '锰 Mn(%)（0.60-1.65）',
  P: '磷 P(%)（<=0.035）',
  S: '硫 S(%)（<=0.025）',
  Si: '硅 Si(%)（0.10-0.35）',
  Cu: '铜 Cu(%)（<=0.40）',
  Ni: '镍 Ni(%)（<=0.40）',
  Cr: '铬 Cr(%)（<=0.30）',
  Mo: '钼 Mo(%)（<=0.12）',
  V: '钒 V(%)（<=0.08）',
  CEQ: '碳当量 CEQ（<=0.36）',
}

function emptyTrialRow(heatNo = '', batchNo = ''): TrialRow {
  return {
    rowKey: `trial-${Date.now()}-${Math.random()}`,
    test_date: '',
    heat_no: heatNo,
    batch_no: batchNo,
    spec_model: '',
    yield_strength: '',
    tensile_strength: '',
    elongation: '',
    reduction_area: '',
    hardness: '',
    impact_test: '',
    seq_no: '',
    supplier_hardness: '',
    material_no: '',
    remark: '',
    material: '',
  }
}

function emptyChemicalMap(): ChemicalMap {
  return Object.fromEntries(CHEM_KEYS.map((key) => [key, '']))
}

function normalizeDateText(value: string) {
  const text = String(value || '').trim()
  if (!text) return ''
  const dotted = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (dotted) {
    return `${dotted[1]}${dotted[2].padStart(2, '0')}${dotted[3].padStart(2, '0')}`
  }
  return text
}

function parseTrialPaste(text: string, heatNo = '', batchNo = ''): TrialRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const cols = line.split('\t')
      return {
        rowKey: `trial-paste-${Date.now()}-${idx}`,
        test_date: normalizeDateText(cols[0] || ''),
        heat_no: cols[1] || heatNo,
        batch_no: cols[2] || batchNo,
        spec_model: cols[3] || '',
        yield_strength: cols[4] || '',
        tensile_strength: cols[5] || '',
        elongation: cols[6] || '',
        reduction_area: cols[7] || '',
        hardness: [cols[8], cols[9], cols[10]].filter((value) => String(value || '').trim()).join('/'),
        impact_test: cols[11] || '',
        seq_no: cols[12] || '',
        supplier_hardness: cols[13] || '',
        material_no: cols[14] || '',
        remark: cols[15] || '',
        material: cols[16] || '',
      }
    })
}

function parseChemicalPaste(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rawLine = (lines[0] || '').split('\t')
  const selfLine = (lines[1] || '').split('\t')
  const raw = emptyChemicalMap()
  const self = emptyChemicalMap()
  ;(['C', 'Mn', 'P', 'S', 'Si', 'Cu', 'Ni', 'Cr', 'Mo', 'V'] as const).forEach((key, idx) => {
    raw[key] = rawLine[idx] || ''
    self[key] = selfLine[idx] || ''
  })
  return { raw, self }
}

function toNumber(value: string | number) {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const IMPACT_TEST_MIN = 27
const IMPACT_TEST_MAX = 300

/** 从冲击标准字符串提取全部数值，支持 T:198,150,141/R:... 与 T:218.182.156/R:... */
function extractImpactTestValues(value: string): number[] {
  const matches = String(value || '').match(/\d+/g)
  return matches ? matches.map((item) => Number(item)) : []
}

function validateImpactTest(value: string): string | null {
  const numbers = extractImpactTestValues(value)
  if (!numbers.length) return '-20℃下冲击标准未识别到有效数值'
  const outOfRange = numbers.filter((n) => n < IMPACT_TEST_MIN || n > IMPACT_TEST_MAX)
  if (outOfRange.length) {
    return `-20℃下冲击标准单个值须在${IMPACT_TEST_MIN}～${IMPACT_TEST_MAX}之间，超出范围：${outOfRange.join('、')}`
  }
  return null
}

function splitHardness(value: string): [string, string, string] {
  const parts = String(value || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
  while (parts.length < 3) parts.push('')
  return [parts[0], parts[1], parts[2]]
}

function hardnessPartSignature(part: string): number | string {
  const text = String(part || '').trim()
  if (!text) return ''
  const parsed = Number(text)
  return Number.isNaN(parsed) ? text : parsed
}

function hardnessSignature(value: string): string {
  return JSON.stringify(splitHardness(value).map(hardnessPartSignature))
}

function impactSignature(value: string): string {
  return JSON.stringify(extractImpactTestValues(value))
}

function formatHardnessDisplay(value: string): string {
  return splitHardness(value).filter(Boolean).join('/')
}

function collectPeerDuplicateErrors(rows: TrialRow[]): Array<{ rowKey: string; message: string }> {
  const hardnessIndexes = new Map<string, number[]>()
  const impactIndexes = new Map<string, number[]>()
  rows.forEach((row, index) => {
    if (String(row.hardness || '').trim()) {
      const key = hardnessSignature(row.hardness)
      const list = hardnessIndexes.get(key) || []
      list.push(index)
      hardnessIndexes.set(key, list)
    }
    if (String(row.impact_test || '').trim()) {
      const key = impactSignature(row.impact_test)
      const list = impactIndexes.get(key) || []
      list.push(index)
      impactIndexes.set(key, list)
    }
  })

  const errors: Array<{ rowKey: string; message: string }> = []
  const seen = new Set<string>()
  const pushError = (index: number, message: string) => {
    const rowKey = rows[index]?.rowKey
    if (!rowKey) return
    const dedupeKey = `${rowKey}::${message}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    errors.push({ rowKey, message })
  }

  rows.forEach((row, index) => {
    if (String(row.hardness || '').trim()) {
      const peers = hardnessIndexes.get(hardnessSignature(row.hardness)) || []
      if (peers.length > 1) {
        pushError(index, `第${index + 1}行：硬度1/硬度2/硬度3 与已有记录重复（${formatHardnessDisplay(row.hardness)}）`)
      }
    }
    if (String(row.impact_test || '').trim()) {
      const peers = impactIndexes.get(impactSignature(row.impact_test)) || []
      if (peers.length > 1) {
        pushError(index, `第${index + 1}行：-20℃下冲击标准 与已有记录重复`)
      }
    }
  })
  return errors
}

function rowHasIdentifiers(row: TrialRow) {
  return Boolean(String(row.heat_no || '').trim() && String(row.batch_no || '').trim())
}

function trialRowHasMeaningfulContent(row: TrialRow) {
  const keys: (keyof TrialRow)[] = ['test_date', 'yield_strength', 'tensile_strength', 'spec_model', 'material_no', 'hardness', 'impact_test']
  return keys.some((k) => String(row[k] ?? '').trim())
}

function calcCeq(values: ChemicalMap) {
  const c = toNumber(values.C) || 0
  const mn = toNumber(values.Mn) || 0
  const cr = toNumber(values.Cr) || 0
  const mo = toNumber(values.Mo) || 0
  const v = toNumber(values.V) || 0
  const ni = toNumber(values.Ni) || 0
  const cu = toNumber(values.Cu) || 0
  const hasAny = ['C', 'Mn', 'P', 'S', 'Si', 'Cu', 'Ni', 'Cr', 'Mo', 'V'].some((key) => String(values[key] ?? '').trim() !== '')
  if (!hasAny) return ''
  return Number((c + mn / 6 + (cr + mo + v) / 5 + (ni + cu) / 15).toFixed(3))
}

export default function HeatTreatmentPage() {
  const pageTitle = usePageTitle()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const currentUser = getStoredUser()
  const currentUserName = currentUser?.name || currentUser?.username || ''
  const [activeTab, setActiveTab] = useState('chemical')
  const [trialRows, setTrialRows] = useState<TrialRow[]>([])
  const [trialPasteText, setTrialPasteText] = useState('')
  const [trialExists, setTrialExists] = useState(false)
  const [trialRefreshReady, setTrialRefreshReady] = useState(false)
  const [trialRowErrors, setTrialRowErrors] = useState<Set<string>>(new Set())
  const [chemicalRaw, setChemicalRaw] = useState<ChemicalMap>(emptyChemicalMap())
  const [chemicalSelf, setChemicalSelf] = useState<ChemicalMap>(emptyChemicalMap())
  const [chemicalPasteText, setChemicalPasteText] = useState('')
  const [chemicalExists, setChemicalExists] = useState(false)
  const [resultState, setResultState] = useState<ResultState>({})

  const ensureLoggedInUser = () => {
    if (!currentUserName) {
      message.warning('未获取到登录用户，请重新登录后再操作')
      return false
    }
    return true
  }

  const resetAll = () => {
    form.resetFields()
    setTrialRows([])
    setTrialPasteText('')
    setTrialExists(false)
    setTrialRefreshReady(false)
    setTrialRowErrors(new Set())
    setChemicalRaw(emptyChemicalMap())
    setChemicalSelf(emptyChemicalMap())
    setChemicalPasteText('')
    setChemicalExists(false)
    setResultState({})
  }

  const loadTrial = async () => {
    const values = await form.validateFields(['heat_no', 'batch_no'])
    const res = await fetch(apiUrl('/api/v1/heat-treatment/trial/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heat_no: values.heat_no || '', batch_no: values.batch_no || '' }),
    })
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '试验记录查询失败')
    setTrialRows(
      (data.rows || []).map((row: Omit<TrialRow, 'rowKey'>, idx: number) => ({
        ...row,
        rowKey: String(row.id ?? `trial-${idx}-${Date.now()}`),
      }))
    )
    setTrialExists(Boolean(data.exists))
    setTrialRefreshReady(false)
    setTrialRowErrors(new Set())
    setActiveTab('trial')
    message.success(data.exists ? '已加载试验记录' : '未查询到试验记录，可直接新建')
  }

  const loadChemical = async () => {
    const values = await form.validateFields(['heat_no'])
    const res = await fetch(apiUrl('/api/v1/heat-treatment/chemical/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heat_no: values.heat_no || '' }),
    })
    const data = await res.json()
    if (!res.ok) return message.error(data.detail || '化学成分查询失败')
    setChemicalRaw({ ...emptyChemicalMap(), ...(data.record?.raw || {}) })
    setChemicalSelf({ ...emptyChemicalMap(), ...(data.record?.self || {}) })
    setChemicalExists(Boolean(data.exists))
    setActiveTab('chemical')
    message.success(data.exists ? '已加载化学成分' : '未查询到化学成分，可直接新建')
  }

  const refreshResult = async () => {
    const values = await form.validateFields(['heat_no', 'batch_no'])
    const { ok, data } = await fetchPostJson<ResultState>('/api/v1/heat-treatment/result/query', {
      order_no: form.getFieldValue('order_no') || '',
      heat_no: values.heat_no || '',
      batch_no: values.batch_no || '',
    })
    if (!ok) return message.error((data as { detail?: string }).detail || '测试结果查询失败')
    setResultState(data || {})
    setActiveTab('result')
  }

  const queryAll = async () => {
    await loadChemical()
    if (form.getFieldValue('batch_no')) {
      await loadTrial()
      await refreshResult()
    }
  }

  const applyTrialPaste = () => {
    const rows = parseTrialPaste(trialPasteText, form.getFieldValue('heat_no') || '', form.getFieldValue('batch_no') || '')
    if (!rows.length) {
      message.warning('未识别到试验记录粘贴数据')
      return
    }
    setTrialRows(rows)
    setTrialRefreshReady(false)
    message.success(`已粘贴 ${rows.length} 行试验记录`)
  }

  const applyChemicalPaste = () => {
    const parsed = parseChemicalPaste(chemicalPasteText)
    setChemicalRaw({ ...parsed.raw, CEQ: calcCeq(parsed.raw) })
    setChemicalSelf({ ...parsed.self, CEQ: calcCeq(parsed.self) })
    message.success('已应用化学成分粘贴数据')
  }

  const saveTrial = async () => {
    const values = await form.validateFields(['heat_no', 'batch_no'])
    if (!ensureLoggedInUser()) return

    const impactErrors: Array<{ rowKey: string; message: string }> = []
    trialRows.forEach((row, index) => {
      if (!String(row.impact_test || '').trim()) return
      const impactError = validateImpactTest(row.impact_test)
      if (impactError) {
        impactErrors.push({ rowKey: row.rowKey, message: `第${index + 1}行：${impactError}` })
      }
    })
    if (impactErrors.length) {
      setTrialRowErrors(new Set(impactErrors.map((item) => item.rowKey)))
      Modal.error({
        title: '提交失败',
        content: (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {impactErrors.map((item) => item.message).join('\n')}
          </div>
        ),
      })
      return
    }

    const peerDuplicateErrors = collectPeerDuplicateErrors(trialRows)
    if (peerDuplicateErrors.length) {
      setTrialRowErrors(new Set(peerDuplicateErrors.map((item) => item.rowKey)))
      Modal.error({
        title: '提交失败',
        content: (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {peerDuplicateErrors.map((item) => item.message).join('\n')}
          </div>
        ),
      })
      return
    }

    type TrialSaveResponse = {
      status?: string
      detail?: string | { message?: string; code?: string; row_indexes?: number[] }
      message?: string
      conflicts?: Array<{ index: number; label: string; existing_id: number }>
      rows?: Array<Partial<TrialRow> & { index?: number }>
      saved_count?: number
    }

    const doSave = async (confirmUpdateIndices: number[] = []) => {
      const res = await authFetch(apiUrl('/api/v1/heat-treatment/trial/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no: form.getFieldValue('order_no') || '',
          heat_no: values.heat_no || '',
          batch_no: values.batch_no || '',
          confirm_update_indices: confirmUpdateIndices,
          rows: trialRows.map((row) => ({
            id: row.id,
            test_date: row.test_date,
            heat_no: row.heat_no,
            batch_no: row.batch_no,
            spec_model: row.spec_model,
            yield_strength: row.yield_strength,
            tensile_strength: row.tensile_strength,
            elongation: row.elongation,
            reduction_area: row.reduction_area,
            hardness: row.hardness,
            impact_test: row.impact_test,
            seq_no: row.seq_no,
            supplier_hardness: row.supplier_hardness,
            material_no: row.material_no,
            remark: row.remark,
            material: row.material,
          })),
        }),
      })
      const data: TrialSaveResponse = await res.json()

      if (!res.ok) {
        const detail = data.detail
        if (detail && typeof detail === 'object' && (detail.code === 'id_mismatch' || detail.code === 'duplicate_trial_values')) {
          const errorKeys = new Set(
            (detail.row_indexes || [])
              .map((index) => trialRows[index]?.rowKey)
              .filter((rowKey): rowKey is string => Boolean(rowKey))
          )
          setTrialRowErrors(errorKeys)
          Modal.error({
            title: '提交失败',
            content: (
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {detail.message || (detail.code === 'duplicate_trial_values' ? '硬度或冲击标准与已有记录重复' : 'id重复，请删除该行信息确认后重新提交')}
              </div>
            ),
          })
          return
        }
        const messageText = typeof detail === 'string' ? detail : detail?.message || '试验记录保存失败'
        Modal.error({ title: '提交失败', content: `提交失败。${messageText}` })
        return
      }

      if (data.status === 'unchanged') {
        setTrialRowErrors(new Set())
        Modal.info({ title: '提示', content: data.message || '已存在相同数据，无数据更新' })
        return
      }

      if (data.status === 'confirm_required') {
        Modal.confirm({
          title: '确认更新试验记录',
          content: data.message || '已存在相同业务键的数据，是否更新该条数据的试验记录？',
          onOk: () => doSave((data.conflicts || []).map((item) => item.index)),
        })
        return
      }

      const savedRows = data.rows || []
      setTrialRows((prev) => {
        const next = [...prev]
        savedRows.forEach((savedRow) => {
          if (typeof savedRow.index !== 'number' || typeof savedRow.id !== 'number') return
          next[savedRow.index] = { ...next[savedRow.index], id: savedRow.id }
        })
        return next
      })
      setTrialRowErrors(new Set())
      setTrialExists(true)
      setTrialRefreshReady(true)
      setTrialPasteText('')
      message.success(`提交成功（${data.saved_count ?? savedRows.length}条）`)
    }

    await doSave()
  }

  const saveChemical = async () => {
    const values = await form.validateFields(['heat_no'])
    if (!ensureLoggedInUser()) return
    const doSave = async () => {
      const res = await authFetch(apiUrl('/api/v1/heat-treatment/chemical/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_no: form.getFieldValue('order_no') || '',
          heat_no: values.heat_no || '',
          batch_no: form.getFieldValue('batch_no') || '',
          raw: { ...chemicalRaw, CEQ: calcCeq(chemicalRaw) },
          self: { ...chemicalSelf, CEQ: calcCeq(chemicalSelf) },
        }),
      })
      const data = await res.json()
      if (!res.ok) return message.error(data.detail || '化学成分保存失败')
      setChemicalRaw({ ...emptyChemicalMap(), ...(data.record?.raw || {}) })
      setChemicalSelf({ ...emptyChemicalMap(), ...(data.record?.self || {}) })
      setChemicalExists(true)
      setChemicalPasteText('')
      if (form.getFieldValue('batch_no')) {
        await refreshResult()
      }
      message.success('化学成分已提交')
    }
    if (chemicalExists) {
      Modal.confirm({
        title: '确认修改化学成分',
        content: '当前是在修改已查询出的化学成分，提交后会覆盖原数据并记录日志，是否继续？',
        onOk: doSave,
      })
      return
    }
    await doSave()
  }

  const loadResultForMaterial = useCallback(
    async (row: TrialRow) => {
      const { ok, data } = await fetchPostJson<ResultState>('/api/v1/heat-treatment/result/material-query', {
        order_no: form.getFieldValue('order_no') || '',
        heat_no: row.heat_no,
        batch_no: row.batch_no,
        material_no: row.material_no || '',
      })
      if (!ok) return message.error(data.detail || '加载测试结果失败')
      setResultState(data || {})
      setActiveTab('result')
      message.success('已载入测试结果')
    },
    [form]
  )

  const confirmRefreshTrialRow = useCallback(
    (row: TrialRow) => {
      if (!ensureLoggedInUser()) return
      Modal.confirm({
        title: '确认刷新测试结果',
        width: 520,
        content: (
          <div>
            <p>是否刷新测试结果？</p>
            <p>
              炉号【{row.heat_no || '/'}】热处理号【{row.batch_no || '/'}】物料号【{row.material_no || '/'}】
            </p>
          </div>
        ),
        onOk: async () => {
          const res = await authFetch(apiUrl('/api/v1/heat-treatment/result/sync-row'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_no: form.getFieldValue('order_no') || '',
              heat_no: row.heat_no,
              batch_no: row.batch_no,
              material_no: row.material_no || '',
            }),
          })
          const data = (await res.json()) as { detail?: string; chemical_missing?: boolean }
          if (!res.ok) return message.error(data.detail || '刷新失败')
          if (data.chemical_missing) {
            Modal.warning({
              title: '请确认',
              content: `炉号【${row.heat_no || '/'}】未录入化学成分，请确认后重新提交测试结果。`,
            })
          } else {
            message.success('已同步测试结果表')
          }
          await loadResultForMaterial(row)
        },
      })
    },
    [currentUserName, form, loadResultForMaterial]
  )

  const deleteTrialRow = useCallback(async (row: TrialRow) => {
    if (!row.id) {
      setTrialRows((prev) => prev.filter((item) => item.rowKey !== row.rowKey))
      setTrialRefreshReady(false)
      Modal.success({ title: '删除成功', content: '删除成功' })
      return
    }

    try {
      const { ok, data } = await fetchPostJson<{ detail?: string }>('/api/v1/heat-treatment/trial/delete', { id: row.id })
      if (!ok) {
        Modal.error({ title: '删除失败', content: data.detail || '删除失败' })
        return
      }
      setTrialRows((prev) => {
        const next = prev.filter((item) => item.rowKey !== row.rowKey)
        setTrialExists(next.some((item) => Boolean(item.id)))
        return next
      })
      setTrialRefreshReady(false)
      Modal.success({ title: '删除成功', content: '删除成功' })
    } catch {
      Modal.error({ title: '删除失败', content: '删除失败' })
    }
  }, [])

  const submitResult = async () => {
    const values = await form.validateFields(['heat_no', 'batch_no'])
    if (!ensureLoggedInUser()) return
    const res = await authFetch(apiUrl('/api/v1/heat-treatment/result/submit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_no: form.getFieldValue('order_no') || '',
        heat_no: values.heat_no || '',
        batch_no: values.batch_no || '',
        material_no: String(resultState.trial_row?.material_no || ''),
      }),
    })
    const data = (await res.json()) as {
      detail?: string
      record?: { test_result?: string; remark?: string }
    }
    if (!res.ok) return message.error(data.detail || '测试结果提交失败')
    setResultState((prev) => ({
      ...prev,
      test_result: data.record?.test_result || prev.test_result,
      remark: data.record?.remark || prev.remark,
    }))
    message.success('测试结果已提交到热处理测试结果表')
  }

  useEffect(() => {
    const order_no = searchParams.get('order_no') || ''
    const heat_no = searchParams.get('heat_no') || ''
    const batch_no = searchParams.get('batch_no') || ''
    if (!heat_no) return
    form.setFieldsValue({ order_no, heat_no, batch_no })
    loadChemical().catch(() => null)
    if (batch_no) {
      loadTrial().catch(() => null)
      refreshResult().catch(() => null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trialColumns = useMemo(
    () => [
      {
        title: '刷新',
        fixed: 'left' as const,
        width: 128,
        render: (_: unknown, row: TrialRow) =>
          rowHasIdentifiers(row) && trialRowHasMeaningfulContent(row) ? (
            <Button
              size="small"
              type="primary"
              disabled={!trialRefreshReady}
              style={trialRefreshReady ? { background: '#52c41a', borderColor: '#52c41a' } : undefined}
              onClick={() => confirmRefreshTrialRow(row)}
            >
              刷新测试结果
            </Button>
          ) : null,
      },
      {
        title: '测试结果',
        fixed: 'left' as const,
        width: 96,
        render: (_: unknown, row: TrialRow) =>
          rowHasIdentifiers(row) ? (
            <Button size="small" type="primary" onClick={() => void loadResultForMaterial(row)}>
              测试结果
            </Button>
          ) : null,
      },
      {
        title: '日期',
        dataIndex: 'test_date',
        width: 110,
        render: (value: string, row: TrialRow) => (
          <Input
            value={value}
            placeholder="yyyymmdd"
            onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, test_date: e.target.value } : item)))}
            onBlur={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, test_date: normalizeDateText(e.target.value) } : item)))}
          />
        ),
      },
      {
        title: '炉号',
        dataIndex: 'heat_no',
        width: 120,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, heat_no: e.target.value } : item)))} />,
      },
      {
        title: '热处理批号',
        dataIndex: 'batch_no',
        width: 140,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, batch_no: e.target.value } : item)))} />,
      },
      {
        title: '规格型号',
        dataIndex: 'spec_model',
        width: 140,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, spec_model: e.target.value } : item)))} />,
      },
      {
        title: '屈服标准（>=250）',
        dataIndex: 'yield_strength',
        width: 110,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, yield_strength: e.target.value } : item)))} />,
      },
      {
        title: '抗拉标准（>=485）',
        dataIndex: 'tensile_strength',
        width: 110,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, tensile_strength: e.target.value } : item)))} />,
      },
      {
        title: '延伸标准（>=22）',
        dataIndex: 'elongation',
        width: 110,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, elongation: e.target.value } : item)))} />,
      },
      {
        title: 'Z标准（>=30）',
        dataIndex: 'reduction_area',
        width: 110,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, reduction_area: e.target.value } : item)))} />,
      },
      {
        title: '硬度1/硬度2/硬度3（137-187）',
        dataIndex: 'hardness',
        width: 180,
        render: (value: string, row: TrialRow) => (
          <Input value={value} placeholder="如：150/152/149" onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, hardness: e.target.value } : item)))} />
        ),
      },
      {
        title: '-20℃下冲击标准（27-300）',
        dataIndex: 'impact_test',
        width: 160,
        render: (value: string, row: TrialRow) => (
          <Input
            value={value}
            status={trialRowErrors.has(row.rowKey) ? 'error' : undefined}
            placeholder="如：T:198,150,141/R:198,146,148"
            onChange={(e) => {
              const nextValue = e.target.value
              setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, impact_test: nextValue } : item)))
              if (trialRowErrors.has(row.rowKey)) {
                setTrialRowErrors((prev) => {
                  const next = new Set(prev)
                  next.delete(row.rowKey)
                  return next
                })
              }
            }}
          />
        ),
      },
      {
        title: '序号',
        dataIndex: 'seq_no',
        width: 90,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, seq_no: e.target.value } : item)))} />,
      },
      {
        title: '热处理厂硬度',
        dataIndex: 'supplier_hardness',
        width: 120,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, supplier_hardness: e.target.value } : item)))} />,
      },
      {
        title: '物料号',
        dataIndex: 'material_no',
        width: 140,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, material_no: e.target.value } : item)))} />,
      },
      {
        title: '备注',
        dataIndex: 'remark',
        width: 140,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, remark: e.target.value } : item)))} />,
      },
      {
        title: '材料',
        dataIndex: 'material',
        width: 120,
        render: (value: string, row: TrialRow) => <Input value={value} onChange={(e) => setTrialRows((prev) => prev.map((item) => (item.rowKey === row.rowKey ? { ...item, material: e.target.value } : item)))} />,
      },
      {
        title: '操作',
        width: 120,
        fixed: 'right' as const,
        render: (_: unknown, row: TrialRow) => (
          <Space>
            <Button
              size="small"
              onClick={() =>
                setTrialRows((prev) => {
                  const next = [...prev]
                  const index = next.findIndex((item) => item.rowKey === row.rowKey)
                  next.splice(index + 1, 0, { ...row, id: undefined, rowKey: `trial-copy-${Date.now()}-${Math.random()}` })
                  return next
                })
              }
            >
              追加
            </Button>
            <Button size="small" danger onClick={() => void deleteTrialRow(row)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [trialRefreshReady, trialRowErrors, confirmRefreshTrialRow, loadResultForMaterial, deleteTrialRow]
  )

  const chemicalTableColumns = useMemo(
    () => [
      {
        title: '',
        dataIndex: 'label',
        fixed: 'left' as const,
        width: 110,
      },
      ...CHEM_KEYS.map((key) => ({
        title: <div style={{ fontSize: 12, color: '#666' }}>{CHEM_LABELS[key]}</div>,
        dataIndex: key,
        width: 110,
        render: (value: string | number, row: { type: 'raw' | 'self' }) =>
          key === 'CEQ' ? (
            <Tag color="blue">{String(value || '') || '/'}</Tag>
          ) : (
            <InputNumber
              style={{ width: '100%' }}
              step={0.001}
              precision={3}
              controls={false}
              value={value === '' ? undefined : Number(value)}
              onChange={(next) => {
                const updater = row.type === 'raw' ? setChemicalRaw : setChemicalSelf
                const current = row.type === 'raw' ? chemicalRaw : chemicalSelf
                const nextMap = { ...current, [key]: next == null ? '' : Number(next) }
                nextMap.CEQ = calcCeq(nextMap)
                updater(nextMap)
              }}
            />
          ),
      })),
    ],
    [chemicalRaw, chemicalSelf]
  )

  const mechanicalResultRows = useMemo(
    () => [
      { key: 'yield_strength', label: '屈服标准（>=250）', value: String((resultState.trial_row?.yield_strength as string) || '') || '/' },
      { key: 'tensile_strength', label: '抗拉标准（>=485）', value: String((resultState.trial_row?.tensile_strength as string) || '') || '/' },
      { key: 'elongation', label: '延伸标准（>=22）', value: String((resultState.trial_row?.elongation as string) || '') || '/' },
      { key: 'reduction_area', label: 'Z标准（>=30）', value: String((resultState.trial_row?.reduction_area as string) || '') || '/' },
      {
        key: 'hardness',
        label: '硬度1/硬度2/硬度3（137-187）',
        value: String((resultState.trial_row?.hardness as string) || '') || '/',
      },
      { key: 'impact_test', label: '-20℃下冲击标准（27-300）', value: String((resultState.trial_row?.impact_test as string) || '') || '/' },
    ],
    [resultState]
  )

  return (
    <Card title={pageTitle} className={styles.pageCard}>
      <Form form={form} layout="vertical">
        <Card size="small" title="检索条件" className={styles.sectionCard}>
          <Space wrap align="end">
            <Form.Item name="order_no" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="heat_no" label="炉号">
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Form.Item name="batch_no" label="热处理批号">
              <Input style={{ width: 220 }} />
            </Form.Item>
            <Button type="primary" onClick={queryAll}>
              联合查询
            </Button>
            <Button type="primary" onClick={loadChemical}>查询化学成分</Button>
            <Button type="primary" onClick={loadTrial}>查询试验记录</Button>
            <Button type="primary" onClick={resetAll}>重置</Button>
          </Space>
        </Card>
      </Form>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'chemical',
            label: '化学成分',
            children: (
              <Card size="small" className={styles.sectionCard}>
                <Space wrap align="end" style={{ marginBottom: 12 }}>
                  <Input style={{ width: 220 }} disabled value={currentUserName || '当前用户'} addonBefore="更新者" />
                  <Button type="primary" onClick={saveChemical}>
                    提交
                  </Button>
                  <Tag color={chemicalExists ? 'blue' : 'green'}>{chemicalExists ? '已查询到历史记录' : '新建数据'}</Tag>
                </Space>
                <Input.TextArea rows={3} value={chemicalPasteText} onChange={(e) => setChemicalPasteText(e.target.value)} placeholder={'可直接粘贴两行数据：\n原材碳\t原材锰\t...\n自检碳\t自检锰\t...'} />
                <div style={{ marginTop: 8, marginBottom: 12 }}>
                  <Button type="primary" onClick={applyChemicalPaste}>应用粘贴</Button>
                </div>
                <Table
                  rowKey="label"
                  pagination={false}
                  scroll={{ x: 1400 }}
                  dataSource={[
                    { label: '原厂材质单', type: 'raw' as const, ...chemicalRaw, CEQ: calcCeq(chemicalRaw) || '' },
                    { label: '光谱数据', type: 'self' as const, ...chemicalSelf, CEQ: calcCeq(chemicalSelf) || '' },
                  ]}
                  columns={chemicalTableColumns}
                />
                <div className={styles.mobileTableHint}>碳当量 CEQ 会根据 C+Mn/6+(Cr+Mo+V)/5+(Ni+Cu)/15 自动计算。</div>
              </Card>
            ),
          },
          {
            key: 'trial',
            label: '试验记录',
            children: (
              <Card size="small" className={styles.sectionCard}>
                <Space wrap align="end" style={{ marginBottom: 12 }}>
                  <Input style={{ width: 220 }} disabled value={currentUserName || '当前用户'} addonBefore="更新者" />
                  <Button
                    type="primary"
                    onClick={() => {
                      setTrialRows((prev) => [...prev, emptyTrialRow(form.getFieldValue('heat_no') || '', form.getFieldValue('batch_no') || '')])
                      setTrialRefreshReady(false)
                    }}
                  >
                    追加行
                  </Button>
                  <Button type="primary" onClick={saveTrial}>
                    提交
                  </Button>
                  <Tag color={trialExists ? 'blue' : 'green'}>{trialExists ? '已查询到历史记录' : '新建数据'}</Tag>
                </Space>
                <Input.TextArea rows={4} value={trialPasteText} onChange={(e) => setTrialPasteText(e.target.value)} placeholder="可直接粘贴 Excel 数据，列顺序：日期/炉号/热处理批号/规格型号/屈服标准/抗拉标准/延伸标准/Z标准/硬度1/硬度2/硬度3/-20℃下冲击标准/序号/热处理厂硬度/物料号/备注/材料" />
                <div style={{ marginTop: 8, marginBottom: 12 }}>
                  <Button type="primary" onClick={applyTrialPaste}>应用粘贴</Button>
                </div>
                <Table
                  rowKey="rowKey"
                  pagination={false}
                  scroll={{ x: 2600 }}
                  dataSource={trialRows}
                  columns={trialColumns}
                  rowClassName={(row) => (trialRowErrors.has(row.rowKey) ? styles.trialRowError : '')}
                />
              </Card>
            ),
          },
          {
            key: 'result',
            label: '测试结果',
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Card size="small" className={styles.sectionCard}>
                  <Space wrap align="center">
                    <span>测试结果：</span>
                    <Tag color={resultState.test_result === 'NG' ? 'red' : resultState.test_result === 'OK' ? 'green' : 'default'}>
                      {resultState.test_result || '未判定'}
                    </Tag>
                    <span>备注：</span>
                    <Tag color="gold">{resultState.remark || '无'}</Tag>
                    <Button type="primary" onClick={submitResult}>
                      提交
                    </Button>
                  </Space>
                </Card>
                <Card size="small" title="试验记录摘要" className={styles.sectionCard}>
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="日期">{String((resultState.trial_row?.test_date as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="规格型号">{String((resultState.trial_row?.spec_model as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="序号">{String((resultState.trial_row?.seq_no as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="热处理厂硬度">{String((resultState.trial_row?.supplier_hardness as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="物料号">{String((resultState.trial_row?.material_no as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="材料">{String((resultState.trial_row?.material as string) || '') || '/'}</Descriptions.Item>
                    <Descriptions.Item label="备注" span={2}>
                      {String((resultState.trial_row?.remark as string) || '') || '/'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
                <Card size="small" title="机械判定数据" className={styles.sectionCard}>
                  <Table rowKey="key" pagination={false} dataSource={mechanicalResultRows} columns={[{ title: '项目', dataIndex: 'label' }, { title: '值', dataIndex: 'value' }]} />
                </Card>
                <Card size="small" title="化学判定数据" className={styles.sectionCard}>
                  <Table
                    rowKey="label"
                    pagination={false}
                    scroll={{ x: 1400 }}
                    dataSource={[
                      { label: '原厂材质单', ...(resultState.chemical_record?.raw || {}) },
                      { label: '光谱数据', ...(resultState.chemical_record?.self || {}) },
                    ]}
                    columns={[
                      { title: '', dataIndex: 'label', width: 110 },
                      ...CHEM_KEYS.map((key) => ({ title: CHEM_LABELS[key], dataIndex: key, width: 140 })),
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  )
}
