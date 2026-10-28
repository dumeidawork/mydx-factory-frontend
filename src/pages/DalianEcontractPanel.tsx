import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { notifyWorkbenchUnreadChanged } from '../layout/WorkbenchUnreadContext'
import { normalizeDrawingInput } from '../utils/specParser'

type ContractHit = {
  id: number
  customer_name: string
  file_name: string
  version: string
  owner_user_id?: number | null
  owner_name?: string | null
  total_amount?: number | null
  can_link: boolean
}

type OrderContractLink = {
  order_no?: string
  contract_archive_id?: number
  id?: number
  file_name?: string
  version?: string
  contract_file_name?: string
  contract_version?: string
  customer_name?: string
  owner_name?: string
  owner_user_id?: number | null
  total_amount?: number | null
  contract_total_amount_live?: number | null
  defer_contract?: boolean
}

function toContractHit(row: OrderContractLink): ContractHit {
  return {
    id: Number(row.contract_archive_id || row.id),
    customer_name: row.customer_name || '',
    file_name: row.file_name || row.contract_file_name || '',
    version: row.version || row.contract_version || '',
    owner_user_id: row.owner_user_id,
    owner_name: row.owner_name,
    total_amount: row.total_amount ?? row.contract_total_amount_live ?? null,
    can_link: true,
  }
}

function contractsToMap(rows?: OrderContractLink[]): Record<string, ContractHit> {
  const out: Record<string, ContractHit> = {}
  for (const row of rows || []) {
    const orderNo = String(row.order_no || '').trim()
    const archiveId = Number(row.contract_archive_id || row.id || 0)
    if (!orderNo || row.defer_contract || archiveId <= 0) continue
    out[orderNo] = toContractHit(row)
  }
  return out
}

function deferredOrdersFromLinks(rows?: OrderContractLink[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const row of rows || []) {
    const orderNo = String(row.order_no || '').trim()
    const archiveId = Number(row.contract_archive_id || 0)
    if (!orderNo) continue
    if (row.defer_contract && archiveId <= 0) out[orderNo] = true
  }
  return out
}

function contractLabel(hit: ContractHit | undefined) {
  if (!hit) return ''
  return `#${hit.id} ${hit.customer_name ? `${hit.customer_name} / ` : ''}${hit.file_name} / ${hit.version}`
}

type EcontractItem = {
  key: string
  id?: number
  seq: number
  part_no: string
  material_no: string
  dn: string
  order_no: string
  excel_unit_price: number
  split_unit_price: number
  material_unit_price: number
  price_mismatch: number
  quantity: number
  drawing_no: string
  spec_model: string
  spec: string
  model: string
  material: string
  unit_weight: number
  total_weight: number
  remark1: string
  drawing_candidates: string[]
  multi_drawing: number
  drawing_confirmed: number
  match_warning: string
}

type SavedList = {
  id: number
  contract_archive_id: number
  contract_file_name: string
  contract_version: string
  source_file_name?: string
  factory_order_no?: string
  customer?: string
  price_checked?: number
  created_by?: string
  created_at?: string
}

type SavedListDetail = SavedList & {
  items: EcontractItem[]
  customer_name?: string
  owner_name?: string
  order_contracts?: OrderContractLink[]
}

function parseApiDetail(data: unknown): string {
  if (!data || typeof data !== 'object') return '请求失败'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : (d as { msg?: string }).msg || JSON.stringify(d)))
      .join('; ')
  }
  if (detail && typeof detail === 'object') {
    const obj = detail as { message?: string; warnings?: string[] }
    if (obj.message) {
      const extra = Array.isArray(obj.warnings) && obj.warnings.length ? `：${obj.warnings.join('；')}` : ''
      return `${obj.message}${extra}`
    }
  }
  return '请求失败'
}

function extractWarnings(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const detail = (data as { detail?: unknown }).detail
  if (detail && typeof detail === 'object' && Array.isArray((detail as { warnings?: string[] }).warnings)) {
    return (detail as { warnings: string[] }).warnings
  }
  return []
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

function nextKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function round2(value: number) {
  return Math.round(Number(value || 0) * 100) / 100
}

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(2)
}

type ComparableRow = {
  seq: number
  part_no: string
  material_no: string
  dn: string
  order_no: string
  excel_unit_price: number
  quantity: number
  drawing_no: string
  remark1: string
}

function comparableRow(row: EcontractItem): ComparableRow {
  return {
    seq: Number(row.seq || 0),
    part_no: String(row.part_no || '').trim(),
    material_no: String(row.material_no || '').trim(),
    dn: String(row.dn || '').trim(),
    order_no: String(row.order_no || '').trim(),
    excel_unit_price: round2(Number(row.excel_unit_price || 0)),
    quantity: Number(row.quantity || 0),
    drawing_no: String(row.drawing_no || '').trim(),
    remark1: String(row.remark1 || '').trim(),
  }
}

function snapshotById(rows: EcontractItem[]): Record<number, ComparableRow> {
  const out: Record<number, ComparableRow> = {}
  for (const row of rows) {
    if (row.id) out[row.id] = comparableRow(row)
  }
  return out
}

function isRowDirty(row: EcontractItem, saved: Record<number, ComparableRow>) {
  if (!row.id) return false
  const baseline = saved[row.id]
  if (!baseline) return true
  return JSON.stringify(comparableRow(row)) !== JSON.stringify(baseline)
}

function normalizeItem(raw: Partial<EcontractItem>, fallbackSeq = 1): EcontractItem {
  const quantity = Number(raw.quantity || 0)
  const unit_weight = Number(raw.unit_weight || 0)
  return {
    key: raw.key || (raw.id ? `id-${raw.id}` : nextKey()),
    id: raw.id,
    seq: Number(raw.seq || fallbackSeq),
    part_no: String(raw.part_no || ''),
    material_no: String(raw.material_no || ''),
    dn: String(raw.dn || ''),
    order_no: String(raw.order_no || ''),
    excel_unit_price: round2(Number(raw.excel_unit_price || 0)),
    split_unit_price: round2(Number(raw.split_unit_price || 0)),
    material_unit_price: round2(Number(raw.material_unit_price || 0)),
    price_mismatch: Number(raw.price_mismatch || 0),
    quantity,
    drawing_no: String(raw.drawing_no || ''),
    spec_model: String(raw.spec_model || ''),
    spec: String(raw.spec || ''),
    model: String(raw.model || ''),
    material: String(raw.material || ''),
    unit_weight,
    total_weight: Number(raw.total_weight || round2(quantity * unit_weight)),
    remark1: String(raw.remark1 || ''),
    drawing_candidates: Array.isArray(raw.drawing_candidates) ? raw.drawing_candidates : [],
    multi_drawing: Number(raw.multi_drawing || 0),
    drawing_confirmed: Number(raw.drawing_confirmed || 0),
    match_warning: String(raw.match_warning || ''),
  }
}

function emptyItem(seq: number): EcontractItem {
  return normalizeItem({ seq, material_no: '', order_no: '', part_no: '' }, seq)
}

export default function DalianEcontractPanel() {
  const [searchParams] = useSearchParams()
  const [contractForm] = Form.useForm()
  const [listForm] = Form.useForm()
  const [contractHits, setContractHits] = useState<ContractHit[]>([])
  const [linkedByOrder, setLinkedByOrder] = useState<Record<string, ContractHit>>({})
  const [deferredByOrder, setDeferredByOrder] = useState<Record<string, boolean>>({})
  const [linkingOrderNo, setLinkingOrderNo] = useState<string | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sourceFileName, setSourceFileName] = useState('')
  const [items, setItems] = useState<EcontractItem[]>([])
  const [savedById, setSavedById] = useState<Record<number, ComparableRow>>({})
  const [savedLists, setSavedLists] = useState<SavedList[]>([])
  const [listId, setListId] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [priceChecked, setPriceChecked] = useState(false)
  const [savedPriceChecked, setSavedPriceChecked] = useState(false)
  const [checkOpen, setCheckOpen] = useState(false)
  const [factoryOrderNo, setFactoryOrderNo] = useState('')
  const [customer, setCustomer] = useState('')
  const [customerOptions, setCustomerOptions] = useState<{ value: string; label: string }[]>([])
  const [detailPage, setDetailPage] = useState(1)
  const detailPageSize = 10

  const loadCustomers = useCallback(async (q = '') => {
    try {
      const res = await authFetch(
        apiUrl(`/api/v1/contract-archives/customers/suggest?q=${encodeURIComponent(q)}&limit=50`),
      )
      const data = (await res.json()) as { items?: string[] }
      if (!res.ok) return
      setCustomerOptions((data.items || []).map((name) => ({ value: name, label: name })))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadCustomers('')
  }, [loadCustomers])

  const mismatchRows = useMemo(() => items.filter((row) => Number(row.price_mismatch || 0) === 1), [items])
  const orderSummaries = useMemo(() => {
    const map = new Map<string, { order_no: string; rowCount: number; amountSum: number }>()
    for (const row of items) {
      const order_no = String(row.order_no || '').trim()
      const cur = map.get(order_no) || { order_no, rowCount: 0, amountSum: 0 }
      cur.rowCount += 1
      cur.amountSum = round2(cur.amountSum + Number(row.excel_unit_price || 0) * Number(row.quantity || 0))
      map.set(order_no, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.order_no.localeCompare(b.order_no, 'zh-CN'))
  }, [items])
  const orderNos = useMemo(
    () => orderSummaries.map((row) => row.order_no).filter(Boolean),
    [orderSummaries],
  )
  const allOrdersLinked = orderNos.length > 0 && orderNos.every((orderNo) => linkedByOrder[orderNo])
  const allOrdersReady =
    orderNos.length > 0 &&
    orderNos.every((orderNo) => Boolean(linkedByOrder[orderNo] || deferredByOrder[orderNo]))
  const deferredCount = orderNos.filter((orderNo) => !linkedByOrder[orderNo] && deferredByOrder[orderNo]).length

  const invalidatePriceCheck = () => {
    setPriceChecked(false)
    setSavedPriceChecked(false)
  }

  const updateItem = (key: string, patch: Partial<EcontractItem>) => {
    invalidatePriceCheck()
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        if ('quantity' in patch || 'unit_weight' in patch) {
          next.total_weight = round2(Number(next.quantity || 0) * Number(next.unit_weight || 0))
        }
        return next
      }),
    )
  }

  const searchContracts = async () => {
    const values = contractForm.getFieldsValue()
    const qs = new URLSearchParams()
    if (values.customer_name) qs.set('customer_name', values.customer_name)
    if (values.file_name) qs.set('file_name', values.file_name)
    if (values.version) qs.set('version', values.version)
    if (values.owner_name) qs.set('owner_name', values.owner_name)
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/contracts?${qs.toString()}`))
    const data = await readJson<{ items?: ContractHit[]; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setContractHits(data.items || [])
  }

  const searchSaved = async () => {
    const values = listForm.getFieldsValue()
    const qs = new URLSearchParams()
    if (values.order_no) qs.set('order_no', values.order_no)
    if (values.contract_file_name) qs.set('contract_file_name', values.contract_file_name)
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/lists?${qs.toString()}`))
    const data = await readJson<{ items?: SavedList[]; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setSavedLists(data.items || [])
  }

  const loadSaved = async (id: number) => {
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/lists/${id}`))
    const data = await readJson<{ list?: SavedListDetail; detail?: unknown }>(res)
    if (!res.ok || !data.list) {
      message.error(parseApiDetail(data))
      return
    }
    const header = data.list
    setListId(header.id)
    setSourceFileName(header.source_file_name || '')
    setFactoryOrderNo(header.factory_order_no || '')
    setCustomer(header.customer || '')
    const loadedMaps = contractsToMap(header.order_contracts)
    const deferredMaps = deferredOrdersFromLinks(header.order_contracts)
    setLinkedByOrder(loadedMaps)
    setDeferredByOrder(deferredMaps)
    const firstOrder =
      Object.keys(loadedMaps)[0] ||
      Object.keys(deferredMaps)[0] ||
      (header.items || []).map((row) => String(row.order_no || '').trim()).find(Boolean) ||
      null
    setLinkingOrderNo(firstOrder)
    const loaded = (header.items || []).map((row, idx) => normalizeItem(row, idx + 1))
    setItems(loaded)
    setSavedById(snapshotById(loaded))
    setDetailPage(1)
    const checked = Number(header.price_checked || 0) === 1
    setPriceChecked(checked)
    setSavedPriceChecked(checked)
    message.success('已加载电子合同')
  }

  const loadSavedRef = useRef(loadSaved)
  loadSavedRef.current = loadSaved
  const loadedQueryIdRef = useRef<number | null>(null)
  const listIdParam = Number(searchParams.get('list_id') || 0)
  useEffect(() => {
    if (listIdParam > 0 && loadedQueryIdRef.current !== listIdParam) {
      loadedQueryIdRef.current = listIdParam
      void loadSavedRef.current(listIdParam)
    }
  }, [listIdParam])

  const parseFile = async (file: File) => {
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await authFetch(apiUrl('/api/v1/customer-packing/dalian/parse'), { method: 'POST', body: fd })
      const data = await readJson<{
        items?: Partial<EcontractItem>[]
        source_file_name?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setSourceFileName(data.source_file_name || file.name)
      const loaded = (data.items || []).map((row, idx) => normalizeItem(row, idx + 1))
      const keepNos = new Set(loaded.map((row) => String(row.order_no || '').trim()).filter(Boolean))
      setItems(loaded)
      setLinkedByOrder((prev) => {
        const next: Record<string, ContractHit> = {}
        for (const [orderNo, hit] of Object.entries(prev)) {
          if (keepNos.has(orderNo)) next[orderNo] = hit
        }
        return next
      })
      setDeferredByOrder((prev) => {
        const next: Record<string, boolean> = {}
        for (const [orderNo, flag] of Object.entries(prev)) {
          if (keepNos.has(orderNo) && flag) next[orderNo] = true
        }
        return next
      })
      setDetailPage(1)
      setSavedById({})
      setListId(null)
      invalidatePriceCheck()
      message.success(`已解析 ${data.items?.length || 0} 行，请在下方按订单号分别关联合同后保存`)
    } finally {
      setParsing(false)
    }
  }

  const enrichRow = async (row: EcontractItem, drawingNo = '') => {
    const res = await authFetch(apiUrl('/api/v1/customer-packing/dalian/enrich'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_no: row.part_no,
        material_no: row.material_no,
        dn: row.dn,
        drawing_no: normalizeDrawingInput(drawingNo || row.drawing_no),
        quantity: row.quantity,
        excel_unit_price: row.excel_unit_price,
        unit_weight: row.unit_weight,
      }),
    })
    const data = await readJson<Partial<EcontractItem> & { detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    updateItem(row.key, {
      drawing_no: data.drawing_no || '',
      spec_model: data.spec_model || '',
      spec: data.spec || '',
      model: data.model || '',
      material: data.material || '',
      unit_weight: Number(data.unit_weight || 0),
      total_weight: Number(data.total_weight || 0),
      split_unit_price: Number(data.split_unit_price || 0),
      material_unit_price: Number(data.material_unit_price || 0),
      price_mismatch: Number(data.price_mismatch || 0),
      drawing_candidates: data.drawing_candidates || [],
      multi_drawing: Number(data.multi_drawing || 0),
      drawing_confirmed: Number(data.drawing_confirmed || 0),
      match_warning: data.match_warning || '',
    })
  }

  const saveAll = async () => {
    if (!allOrdersReady) {
      message.warning('请为每个订单号分别确认关联本人负责的合同，或打开【合同后补】')
      return
    }
    if (!items.length) {
      message.warning('没有可保存的明细')
      return
    }
    if (!priceChecked) {
      message.warning('请先【核对单价】并确认后再保存整单')
      return
    }
    const factoryOrderNoText = factoryOrderNo.trim()
    const customerText = customer.trim()
    if (!factoryOrderNoText) {
      message.warning('请填写本厂单号')
      return
    }
    if (!customerText) {
      message.warning('请填写客户')
      return
    }
    setSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/v1/customer-packing/dalian/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_archive_id: orderNos.map((orderNo) => linkedByOrder[orderNo]).find(Boolean)?.id || 0,
          source_file_name: sourceFileName,
          factory_order_no: factoryOrderNoText,
          customer: customerText,
          price_checked: true,
          order_contracts: orderNos.map((orderNo) => ({
            order_no: orderNo,
            contract_archive_id: linkedByOrder[orderNo]?.id || 0,
            defer_contract: !linkedByOrder[orderNo] && Boolean(deferredByOrder[orderNo]),
          })),
          items: items.map((row, idx) => ({
            ...row,
            seq: row.seq || idx + 1,
            drawing_candidates: row.drawing_candidates || [],
          })),
        }),
      })
      const data = await readJson<{ list?: SavedListDetail; overwritten?: boolean; detail?: unknown }>(res)
      if (!res.ok || !data.list) {
        message.error(parseApiDetail(data))
        return
      }
      setListId(data.list.id)
      setFactoryOrderNo(data.list.factory_order_no || factoryOrderNoText)
      setCustomer(data.list.customer || customerText)
      setLinkedByOrder(contractsToMap(data.list.order_contracts))
      setDeferredByOrder(deferredOrdersFromLinks(data.list.order_contracts))
      const savedItems = (data.list.items || []).map((row, idx) => normalizeItem(row, idx + 1))
      setItems(savedItems)
      setSavedById(snapshotById(savedItems))
      setPriceChecked(true)
      setSavedPriceChecked(true)
      notifyWorkbenchUnreadChanged()
      message.success(data.overwritten ? '已覆盖同一订单号的旧电子合同并保存' : '电子合同已保存')
    } finally {
      setSaving(false)
    }
  }

  const saveRow = async (row: EcontractItem) => {
    if (!listId || !row.id) {
      message.warning('请先保存整单后再逐行保存')
      return
    }
    if (!isRowDirty(row, savedById)) {
      message.warning('该行未修改，无需保存')
      return
    }
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/items/${row.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: {
          seq: row.seq,
          part_no: row.part_no,
          material_no: row.material_no,
          dn: row.dn,
          order_no: row.order_no,
          excel_unit_price: row.excel_unit_price,
          quantity: row.quantity,
          drawing_no: row.drawing_no,
          remark1: row.remark1,
        },
      }),
    })
    const data = await readJson<{ item?: EcontractItem; detail?: unknown }>(res)
    if (!res.ok || !data.item) {
      message.error(parseApiDetail(data))
      return
    }
    const saved = normalizeItem({ ...data.item, key: row.key })
    setItems((prev) => prev.map((it) => (it.key === row.key ? saved : it)))
    if (saved.id) {
      setSavedById((prev) => ({ ...prev, [saved.id!]: comparableRow(saved) }))
    }
    invalidatePriceCheck()
    message.success('该行已保存')
  }

  const deleteRow = async (row: EcontractItem) => {
    if (row.id && listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/items/${row.id}`), { method: 'DELETE' })
      const data = await readJson<{ detail?: unknown }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
    }
    setItems((prev) => {
      const next = prev.filter((it) => it.key !== row.key)
      const maxPage = Math.max(1, Math.ceil(next.length / detailPageSize))
      setDetailPage((page) => Math.min(page, maxPage))
      return next
    })
    if (row.id) {
      setSavedById((prev) => {
        const next = { ...prev }
        delete next[row.id!]
        return next
      })
    }
    invalidatePriceCheck()
  }

  const addRow = async () => {
    const seq = items.length + 1
    if (listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/lists/${listId}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: emptyItem(seq) }),
      })
      const data = await readJson<{ item?: EcontractItem; detail?: unknown }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      const saved = normalizeItem(data.item, seq)
      setItems((prev) => [...prev, saved])
      setDetailPage(Math.ceil((items.length + 1) / detailPageSize))
      if (saved.id) {
        setSavedById((prev) => ({ ...prev, [saved.id!]: comparableRow(saved) }))
      }
      invalidatePriceCheck()
      return
    }
    setItems((prev) => [...prev, emptyItem(seq)])
    setDetailPage(Math.ceil((items.length + 1) / detailPageSize))
    invalidatePriceCheck()
  }

  const resetPage = () => {
    setListId(null)
    setItems([])
    setSavedById({})
    setSourceFileName('')
    setFactoryOrderNo('')
    setCustomer('')
    setLinkedByOrder({})
    setDeferredByOrder({})
    setLinkingOrderNo(null)
    setContractHits([])
    setFileList([])
    setDetailPage(1)
    invalidatePriceCheck()
  }

  const deleteSaved = async () => {
    if (!listId) {
      resetPage()
      return
    }
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/lists/${listId}`), { method: 'DELETE' })
    const data = await readJson<{ detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    resetPage()
    notifyWorkbenchUnreadChanged()
    message.success('电子合同已删除')
  }

  const doGenerate = async (confirmWarnings = false) => {
    if (!listId) {
      message.warning('请先保存电子合同')
      return
    }
    if (!savedPriceChecked) {
      message.warning('请先【核对单价】并保存整单后再生成订单明细')
      return
    }
    setGenerating(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/lists/${listId}/generate-orders`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_warnings: confirmWarnings }),
      })
      const data = await readJson<{
        count?: number
        order_nos?: string[]
        pending_docs_count?: number
        detail?: unknown
      }>(res)
      if (!res.ok) {
        const warnings = extractWarnings(data)
        if (warnings.length && !confirmWarnings) {
          Modal.confirm({
            title: '生成前请确认',
            content: warnings.join('\n'),
            okText: '仍要生成',
            cancelText: '取消',
            onOk: () => doGenerate(true),
          })
          return
        }
        message.error(parseApiDetail(data))
        return
      }
      message.success(
        `已生成订单 ${data.order_nos?.join('、') || ''}，共 ${data.count || 0} 行${
          data.pending_docs_count ? `（待补资料 ${data.pending_docs_count} 行）` : ''
        }`,
      )
    } finally {
      setGenerating(false)
    }
  }

  const onDrawingChange = async (row: EcontractItem, drawingNo: string) => {
    const normalized = normalizeDrawingInput(drawingNo)
    updateItem(row.key, { drawing_no: normalized, drawing_confirmed: 1 })
    if (row.id && listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/dalian/items/${row.id}/apply-drawing`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing_no: normalized }),
      })
      const data = await readJson<{ item?: EcontractItem; detail?: unknown }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      const saved = normalizeItem({ ...data.item, key: row.key })
      setItems((prev) => prev.map((it) => (it.key === row.key ? saved : it)))
      if (saved.id) {
        setSavedById((prev) => ({ ...prev, [saved.id!]: comparableRow(saved) }))
      }
      invalidatePriceCheck()
      return
    }
    await enrichRow({ ...row, drawing_no: normalized }, normalized)
  }

  const openPriceCheck = () => {
    if (!allOrdersReady) {
      message.warning('请先为每个订单号分别关联合同，或打开【合同后补】')
      return
    }
    if (!items.length) {
      message.warning('请先上传或录入明细')
      return
    }
    setCheckOpen(true)
  }

  const confirmPriceCheck = () => {
    setPriceChecked(true)
    setCheckOpen(false)
    message.success(mismatchRows.length ? '已确认核对结果。请保存整单。' : '单价一致，已确认。请保存整单。')
  }

  const rejectPriceCheck = () => {
    invalidatePriceCheck()
    setCheckOpen(false)
    message.warning('单价不一致，请核对后再次上传或改价')
  }

  const columns: ColumnsType<EcontractItem> = [
    {
      title: '操作',
      key: 'op',
      width: 150,
      fixed: 'left',
      render: (_, row) => (
        <Space>
          <Button size="small" type="primary" disabled={!row.id || !isRowDirty(row, savedById)} onClick={() => saveRow(row)}>
            保存
          </Button>
          <Button size="small" danger onClick={() => deleteRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
    { title: '序号', dataIndex: 'seq', width: 70, render: (_, row) => <InputNumber size="small" value={row.seq} onChange={(v) => updateItem(row.key, { seq: Number(v || 0) })} /> },
    { title: '料号', dataIndex: 'part_no', width: 130, render: (_, row) => <Input size="small" value={row.part_no} onChange={(e) => updateItem(row.key, { part_no: e.target.value })} onBlur={() => row.material_no && enrichRow(row)} /> },
    { title: '物料号', dataIndex: 'material_no', width: 150, render: (_, row) => <Input size="small" value={row.material_no} onChange={(e) => updateItem(row.key, { material_no: e.target.value })} onBlur={() => row.material_no && enrichRow(row)} /> },
    { title: 'DN', dataIndex: 'dn', width: 80, render: (_, row) => <Input size="small" value={row.dn} onChange={(e) => updateItem(row.key, { dn: e.target.value })} onBlur={() => row.material_no && enrichRow(row)} /> },
    { title: '订单号', dataIndex: 'order_no', width: 140, render: (_, row) => <Input size="small" value={row.order_no} onChange={(e) => updateItem(row.key, { order_no: e.target.value })} /> },
    { title: 'Excel单价', dataIndex: 'excel_unit_price', width: 110, render: (_, row) => <InputNumber size="small" step={0.01} value={row.excel_unit_price} onChange={(v) => updateItem(row.key, { excel_unit_price: Number(v || 0) })} onBlur={() => row.material_no && enrichRow(row)} /> },
    { title: '拆分单价', dataIndex: 'split_unit_price', width: 100, render: (v: number) => money(v) },
    { title: '物料协议价', dataIndex: 'material_unit_price', width: 110, render: (v: number) => money(v) },
    { title: '数量', dataIndex: 'quantity', width: 80, render: (_, row) => <InputNumber size="small" value={row.quantity} onChange={(v) => updateItem(row.key, { quantity: Number(v || 0) })} /> },
    {
      title: '图纸号',
      dataIndex: 'drawing_no',
      width: 180,
      render: (_, row) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={row.drawing_no || undefined}
          placeholder="选择图纸"
          allowClear
          options={(row.drawing_candidates || []).map((v) => ({ value: v, label: v }))}
          onChange={(v) => onDrawingChange(row, v || '')}
        />
      ),
    },
    { title: '规格型号', dataIndex: 'spec_model', width: 180, ellipsis: true },
    { title: '规格', dataIndex: 'spec', width: 90 },
    { title: '单重', dataIndex: 'unit_weight', width: 80, render: (v: number) => money(v) },
    { title: '总重', dataIndex: 'total_weight', width: 80, render: (v: number) => money(v) },
    { title: '备注', dataIndex: 'remark1', width: 160, render: (_, row) => <Input size="small" value={row.remark1} onChange={(e) => updateItem(row.key, { remark1: e.target.value })} /> },
    {
      title: '提示',
      dataIndex: 'match_warning',
      width: 240,
      render: (v: string, row) => (
        <span className={row.price_mismatch ? 'warningCell' : undefined}>
          {v || (row.price_mismatch ? '单价不一致' : '')}
        </span>
      ),
    },
  ]

  const linkContract = (orderNo: string, row: ContractHit) => {
    if (!orderNo) {
      message.warning('请先选择要关联的订单号')
      return
    }
    const usedBy = Object.entries(linkedByOrder).find(([no, hit]) => no !== orderNo && hit.id === row.id)
    if (usedBy) {
      message.warning(`该合同已关联订单号 ${usedBy[0]}，每个订单号须对应不同合同文件`)
      return
    }
    const prev = linkedByOrder[orderNo]
    if (prev && prev.id !== row.id) invalidatePriceCheck()
    setLinkedByOrder((current) => ({ ...current, [orderNo]: row }))
    setDeferredByOrder((current) => {
      if (!current[orderNo]) return current
      const next = { ...current }
      delete next[orderNo]
      return next
    })
    setCustomer((current) => current.trim() || row.customer_name || '')
    message.success(`订单号 ${orderNo} 已关联合同 ${row.file_name} ${row.version}`)
  }

  const setOrderDeferred = (orderNo: string, deferred: boolean) => {
    if (!orderNo) return
    if (deferred) {
      setLinkedByOrder((prev) => {
        if (!prev[orderNo]) return prev
        const next = { ...prev }
        delete next[orderNo]
        return next
      })
      setDeferredByOrder((prev) => ({ ...prev, [orderNo]: true }))
      return
    }
    setDeferredByOrder((prev) => {
      if (!prev[orderNo]) return prev
      const next = { ...prev }
      delete next[orderNo]
      return next
    })
  }

  const contractColumns: ColumnsType<ContractHit> = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '客户名', dataIndex: 'customer_name', width: 180 },
    { title: '文件名', dataIndex: 'file_name', ellipsis: true },
    { title: '版本号', dataIndex: 'version', width: 90 },
    { title: '业务负责人', dataIndex: 'owner_name', width: 120 },
    {
      title: '操作',
      key: 'op',
      width: 120,
      render: (_, row) => (
        <Button
          size="small"
          type="primary"
          disabled={!row.can_link || !linkingOrderNo}
          onClick={() => linkContract(linkingOrderNo || '', row)}
        >
          确认关联
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" title="查询已保存电子合同">
        <Form form={listForm} layout="inline">
          <Form.Item name="order_no" label="订单号">
            <Input allowClear placeholder="4 开头" />
          </Form.Item>
          <Form.Item name="contract_file_name" label="合同文件名">
            <Input allowClear />
          </Form.Item>
          <Button type="primary" onClick={() => void searchSaved()}>查询</Button>
        </Form>
        {savedLists.length > 0 && (
          <Table
            style={{ marginTop: 12 }}
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={savedLists}
            columns={[
              { title: 'ID', dataIndex: 'id', width: 70 },
              { title: '合同文件', dataIndex: 'contract_file_name' },
              { title: '版本', dataIndex: 'contract_version', width: 90 },
              { title: '来源文件', dataIndex: 'source_file_name' },
              { title: '本厂单号', dataIndex: 'factory_order_no', width: 140 },
              { title: '客户', dataIndex: 'customer', width: 140 },
              {
                title: '操作',
                key: 'op',
                width: 90,
                render: (_, row) => (
                  <Button size="small" type="primary" onClick={() => void loadSaved(row.id)}>
                    打开
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card size="small" title="上传大连电子合同（只读取，不归档原件）">
        <Space wrap>
          <span>
            本厂单号
            <Input
              style={{ width: 200, marginLeft: 8 }}
              value={factoryOrderNo}
              onChange={(e) => setFactoryOrderNo(e.target.value)}
              placeholder="必填"
              allowClear
            />
          </span>
          <span>
            客户
            <AutoComplete
              style={{ width: 240, marginLeft: 8 }}
              options={customerOptions}
              value={customer}
              onChange={setCustomer}
              onSearch={(q) => void loadCustomers(q)}
              placeholder="必填，可输入或选择"
              allowClear
              filterOption={false}
            />
          </span>
          <Upload
            accept=".xlsx,.xls"
            maxCount={1}
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList([{ uid: file.uid, name: file.name, status: 'done' }])
              void parseFile(file as File)
              return false
            }}
            onRemove={() => setFileList([])}
          >
            <Button type="primary" loading={parsing}>选择 Excel</Button>
          </Upload>
          {sourceFileName ? <Tag>{sourceFileName}</Tag> : null}
          {listId ? <Tag color="green">已保存 #{listId}</Tag> : <Tag>未保存预览</Tag>}
          {priceChecked ? <Tag color="success">已核对单价</Tag> : <Tag>未核对单价</Tag>}
        </Space>
      </Card>

      {items.length > 0 ? (
        <Card size="small" title="按订单号关联客户合同（每个订单号各关联一份，仅可关联本人负责的合同）">
          <Table
            size="small"
            rowKey={(row) => row.order_no || '__empty'}
            pagination={false}
            dataSource={orderSummaries}
            rowClassName={(row) => (row.order_no && row.order_no === linkingOrderNo ? 'multiDrawingRow' : '')}
            columns={[
              {
                title: '操作',
                key: 'pick',
                width: 230,
                fixed: 'left',
                render: (_, row) => (
                  <Space size={8} wrap>
                    <Button
                      size="small"
                      type={row.order_no && linkedByOrder[row.order_no] && row.order_no !== linkingOrderNo ? 'default' : 'primary'}
                      disabled={!row.order_no}
                      onClick={() => setLinkingOrderNo(row.order_no)}
                    >
                      {row.order_no && linkedByOrder[row.order_no] ? '更换合同' : '选择合同'}
                    </Button>
                    <span>
                      合同后补
                      <Switch
                        size="small"
                        style={{ marginLeft: 6 }}
                        disabled={!row.order_no}
                        checked={Boolean(row.order_no && deferredByOrder[row.order_no] && !linkedByOrder[row.order_no])}
                        onChange={(checked) => setOrderDeferred(row.order_no, checked)}
                      />
                    </span>
                  </Space>
                ),
              },
              {
                title: '订单号',
                dataIndex: 'order_no',
                width: 180,
                render: (v: string) => v || '（未填订单号）',
              },
              { title: '行数', dataIndex: 'rowCount', width: 80 },
              {
                title: 'Excel金额小计',
                dataIndex: 'amountSum',
                width: 130,
                render: (v: number) => money(v),
              },
              {
                title: '已关联合同',
                key: 'linked',
                render: (_, row) => {
                  const hit = row.order_no ? linkedByOrder[row.order_no] : undefined
                  if (hit) {
                    return (
                      <>
                        <Tag color="blue">#{hit.id}</Tag>
                        {contractLabel(hit).replace(`#${hit.id} `, '')}
                      </>
                    )
                  }
                  if (row.order_no && deferredByOrder[row.order_no]) {
                    return <Tag color="orange">待后补合同</Tag>
                  }
                  return <Tag>未关联</Tag>
                },
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} />
                <Table.Summary.Cell index={1}>整单合计</Table.Summary.Cell>
                <Table.Summary.Cell index={2}>{items.length}</Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  {money(orderSummaries.reduce((sum, row) => sum + row.amountSum, 0))}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  {allOrdersLinked
                    ? `已关联 ${orderNos.length} 个订单号，各对应一份合同`
                    : deferredCount > 0
                      ? `已关联 ${orderNos.filter((no) => linkedByOrder[no]).length}/${orderNos.length} 个订单号，合同后补 ${deferredCount} 个`
                      : `已关联 ${orderNos.filter((no) => linkedByOrder[no]).length}/${orderNos.length} 个订单号`}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          <div style={{ marginTop: 16 }}>
            {linkingOrderNo
              ? `正在为订单号 ${linkingOrderNo} 选择合同（查询后点【确认关联】）。也可打开【合同后补】暂不关联。`
              : '请先在上表点【选择合同】再查询确认，或打开【合同后补】后再核对单价'}
          </div>
          <Form form={contractForm} layout="inline" style={{ marginTop: 8 }}>
            <Form.Item name="customer_name" label="客户名">
              <Input allowClear />
            </Form.Item>
            <Form.Item name="file_name" label="文件名">
              <Input allowClear />
            </Form.Item>
            <Form.Item name="version" label="版本号">
              <Input allowClear />
            </Form.Item>
            <Form.Item name="owner_name" label="业务负责人">
              <Input allowClear />
            </Form.Item>
            <Button type="primary" onClick={() => void searchContracts()}>查询合同</Button>
          </Form>
          <Table
            style={{ marginTop: 12 }}
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={contractHits}
            columns={contractColumns}
          />
        </Card>
      ) : null}

      <Card
        size="small"
        title="电子合同明细"
        extra={
          <Space wrap>
            <Button type="primary" onClick={() => void addRow()}>新增行</Button>
            <Button
              style={{ background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 600 }}
              disabled={!allOrdersReady || items.length === 0}
              onClick={openPriceCheck}
            >
              核对单价
            </Button>
            <Button type="primary" loading={saving} disabled={!allOrdersReady || !priceChecked} onClick={() => void saveAll()}>
              保存整单
            </Button>
            <Button danger onClick={() => void deleteSaved()}>
              删除本单
            </Button>
            <Button
              type="primary"
              loading={generating}
              disabled={!listId || !savedPriceChecked}
              onClick={() => void doGenerate(false)}
            >
              生成订单明细
            </Button>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="key"
          pagination={{
            current: detailPage,
            pageSize: detailPageSize,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page) => setDetailPage(page),
          }}
          scroll={{ x: 2300 }}
          dataSource={items}
          columns={columns}
          rowClassName={(row) => (row.multi_drawing || row.price_mismatch ? 'multiDrawingRow' : '')}
        />
        <Modal
          title="核对单价"
          open={checkOpen}
          onCancel={() => setCheckOpen(false)}
          footer={[
            <Button key="mismatch" danger onClick={rejectPriceCheck}>
              不一致
            </Button>,
            <Button key="ok" type="primary" onClick={confirmPriceCheck}>
              确认
            </Button>,
          ]}
        >
          <p>
            共 {items.length} 行，其中单价不一致 <strong>{mismatchRows.length}</strong> 行。
          </p>
          <p>对比：Excel 单价 vs 价格拆分表净价 vs 物料建档大连协议价。</p>
          {mismatchRows.length === 0 ? (
            <p>未发现单价差异。</p>
          ) : (
            <div>
              <p>以下行不一致，请确认是否仍要保存：</p>
              {mismatchRows.slice(0, 12).map((row) => (
                <p key={row.key}>
                  第{row.seq}行 {row.order_no} / {row.material_no}：Excel {money(row.excel_unit_price)}，拆分{' '}
                  {money(row.split_unit_price)}，物料 {money(row.material_unit_price)}
                </p>
              ))}
              {mismatchRows.length > 12 ? <p>其余 {mismatchRows.length - 12} 行见明细「提示」列。</p> : null}
            </div>
          )}
        </Modal>
      </Card>
    </Space>
  )
}
