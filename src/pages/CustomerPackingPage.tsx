import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import { message } from '../utils/feedback'
import { usePageTitle } from '../layout/usePageTitle'
import { normalizeDrawingInput } from '../utils/specParser'
import DalianCustomerPackingPanel from './DalianCustomerPackingPanel'
import DalianEcontractPanel from './DalianEcontractPanel'
import styles from './WorkflowPages.module.css'
import './CustomerPackingPage.css'

type ContractHit = {
  id: number
  customer_name: string
  file_name: string
  version: string
  owner_user_id?: number | null
  owner_name?: string | null
  progress_status?: string | null
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
    if (!orderNo) continue
    out[orderNo] = toContractHit(row)
  }
  return out
}

function contractLabel(hit: ContractHit | undefined) {
  if (!hit) return ''
  return `#${hit.id} ${hit.customer_name ? `${hit.customer_name} / ` : ''}${hit.file_name} / ${hit.version}`
}

type PackingItem = {
  key: string
  id?: number
  seq: number
  material_no: string
  dn: string
  units_per_pallet: number
  quantity: number
  nb_of_pallets: number
  unit_weight: number
  total_weight: number
  po: string
  pos?: number | null
  drawing_no: string
  spec_model: string
  spec: string
  model: string
  material: string
  product_unit_price: number
  agreement_price: number
  tax_unit_price: number
  tax_total_amount: number
  drawing_candidates: string[]
  multi_drawing: number
  drawing_confirmed: number
  excel_total_weight?: number | null
  weight_mismatch?: number
  match_warning: string
  material_matched: number
  price_matched: number
}

type SavedList = {
  id: number
  contract_archive_id: number
  contract_file_name: string
  contract_version: string
  departure_date?: string | null
  arrival_date?: string | null
  source_file_name?: string
  factory_order_no?: string
  customer?: string
  amount_checked?: number
  amount_checked_at?: string | null
  packing_tax_sum?: number | null
  contract_total_amount?: number | null
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

type SavedListDetail = SavedList & {
  items: PackingItem[]
  customer_name?: string
  owner_name?: string
  contract_total_amount_live?: number | null
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

function round4(value: number) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

const SPLIT_PRICE_MISSING = '价格拆分表无此图纸的有效报价，当前价格为 0'
const MANUAL_PRICE_WARNING = '价格拆分表无有效报价，当前为手工填写'

function missingSplitPrice(row: PackingItem) {
  return String(row.match_warning || '').includes(SPLIT_PRICE_MISSING)
}

function rewritePriceWarning(row: PackingItem): string {
  let warning = String(row.match_warning || '')
  const filled = Number(row.product_unit_price || 0) > 0 && Number(row.agreement_price || 0) > 0
  if (filled && warning.includes(SPLIT_PRICE_MISSING)) {
    warning = warning.replace(SPLIT_PRICE_MISSING, MANUAL_PRICE_WARNING)
  }
  if (!filled && warning.includes(MANUAL_PRICE_WARNING)) {
    warning = warning.replace(MANUAL_PRICE_WARNING, SPLIT_PRICE_MISSING)
  }
  return warning
}

function inferMaterialMatched(raw: Partial<PackingItem>): number {
  if (raw.material_matched === 0 || raw.material_matched === 1) return raw.material_matched
  const warning = String(raw.match_warning || '')
  if (/未找到物料|未找到所选图纸号|规格为空|规格不匹配|物料号为空/.test(warning)) return 0
  return String(raw.drawing_no || '').trim() ? 1 : 0
}

function inferPriceMatched(raw: Partial<PackingItem>): number {
  if (raw.price_matched === 0 || raw.price_matched === 1) return raw.price_matched
  const warning = String(raw.match_warning || '')
  if (warning.includes('价格拆分表无')) return 0
  return Number(raw.product_unit_price || 0) > 0 && Number(raw.agreement_price || 0) > 0 ? 1 : 0
}

function withTax(row: PackingItem): PackingItem {
  const tax_unit_price = round2(row.product_unit_price)
  return {
    ...row,
    tax_unit_price,
    tax_total_amount: round2(tax_unit_price * Number(row.quantity || 0)),
  }
}

type ComparableRow = {
  seq: number
  material_no: string
  dn: string
  units_per_pallet: number
  quantity: number
  nb_of_pallets: number
  unit_weight: number
  po: string
  pos: number | null
  drawing_no: string
  spec_model: string
  spec: string
  model: string
  material: string
  product_unit_price: number
  agreement_price: number
}

function comparableRow(row: PackingItem): ComparableRow {
  return {
    seq: Number(row.seq || 0),
    material_no: String(row.material_no || '').trim(),
    dn: String(row.dn || '').trim(),
    units_per_pallet: round4(Number(row.units_per_pallet || 0)),
    quantity: Number(row.quantity || 0),
    nb_of_pallets: round4(Number(row.nb_of_pallets || 0)),
    unit_weight: round2(Number(row.unit_weight || 0)),
    po: String(row.po || '').trim(),
    pos: row.pos == null || String(row.pos) === '' ? null : Number(row.pos),
    drawing_no: String(row.drawing_no || '').trim(),
    spec_model: String(row.spec_model || '').trim(),
    spec: String(row.spec || '').trim(),
    model: String(row.model || '').trim(),
    material: String(row.material || '').trim(),
    product_unit_price: round2(Number(row.product_unit_price || 0)),
    agreement_price: round2(Number(row.agreement_price || 0)),
  }
}

function snapshotById(rows: PackingItem[]): Record<number, ComparableRow> {
  const out: Record<number, ComparableRow> = {}
  for (const row of rows) {
    if (row.id) out[row.id] = comparableRow(row)
  }
  return out
}

function isRowDirty(row: PackingItem, saved: Record<number, ComparableRow>) {
  if (!row.id) return false
  const baseline = saved[row.id]
  if (!baseline) return true
  return JSON.stringify(comparableRow(row)) !== JSON.stringify(baseline)
}

function normalizeItem(raw: Partial<PackingItem>, fallbackSeq = 1): PackingItem {
  const item = withTax({
    key: raw.key || (raw.id ? `id-${raw.id}` : nextKey()),
    id: raw.id,
    seq: Number(raw.seq || fallbackSeq),
    material_no: String(raw.material_no || ''),
    dn: String(raw.dn || ''),
    units_per_pallet: Number(raw.units_per_pallet || 0),
    quantity: Number(raw.quantity || 0),
    nb_of_pallets: Number(raw.nb_of_pallets || 0),
    unit_weight: Number(raw.unit_weight || 0),
    total_weight: Number(raw.total_weight || 0),
    po: String(raw.po || ''),
    pos: raw.pos == null || String(raw.pos) === '' ? null : Number(raw.pos),
    drawing_no: String(raw.drawing_no || ''),
    spec_model: String(raw.spec_model || ''),
    spec: String(raw.spec || ''),
    model: String(raw.model || ''),
    material: String(raw.material || ''),
    product_unit_price: Number(raw.product_unit_price || 0),
    agreement_price: Number(raw.agreement_price || 0),
    tax_unit_price: Number(raw.tax_unit_price || 0),
    tax_total_amount: Number(raw.tax_total_amount || 0),
    drawing_candidates: Array.isArray(raw.drawing_candidates) ? raw.drawing_candidates : [],
    multi_drawing: Number(raw.multi_drawing || 0),
    drawing_confirmed: Number(raw.drawing_confirmed || 0),
    excel_total_weight: raw.excel_total_weight == null ? null : Number(raw.excel_total_weight),
    weight_mismatch: Number(raw.weight_mismatch || 0),
    match_warning: String(raw.match_warning || ''),
    material_matched: inferMaterialMatched(raw),
    price_matched: inferPriceMatched(raw),
  })
  item.match_warning = rewritePriceWarning(item)
  return item
}

function emptyItem(seq: number): PackingItem {
  return normalizeItem({ seq, material_no: '', dn: '', po: '' }, seq)
}

function FrancePackingPanel() {
  const [contractForm] = Form.useForm()
  const [listForm] = Form.useForm()
  const [contractHits, setContractHits] = useState<ContractHit[]>([])
  const [linkedByOrder, setLinkedByOrder] = useState<Record<string, ContractHit>>({})
  const [linkingOrderNo, setLinkingOrderNo] = useState<string | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sourceFileName, setSourceFileName] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [items, setItems] = useState<PackingItem[]>([])
  const [savedById, setSavedById] = useState<Record<number, ComparableRow>>({})
  const [savedLists, setSavedLists] = useState<SavedList[]>([])
  const [listId, setListId] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [amountChecked, setAmountChecked] = useState(false)
  const [savedAmountChecked, setSavedAmountChecked] = useState(false)
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
      /* ignore suggest errors */
    }
  }, [])

  useEffect(() => {
    void loadCustomers('')
  }, [loadCustomers])

  const packingTaxSum = round2(items.reduce((sum, row) => sum + Number(row.tax_total_amount || 0), 0))
  const poSummaries = useMemo(() => {
    const map = new Map<string, { po: string; rowCount: number; taxSum: number }>()
    for (const row of items) {
      const po = String(row.po || '').trim()
      const cur = map.get(po) || { po, rowCount: 0, taxSum: 0 }
      cur.rowCount += 1
      cur.taxSum = round2(cur.taxSum + Number(row.tax_total_amount || 0))
      map.set(po, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.po.localeCompare(b.po, 'zh-CN'))
  }, [items])
  const orderNos = useMemo(() => poSummaries.map((row) => row.po).filter(Boolean), [poSummaries])
  const allOrdersLinked = orderNos.length > 0 && orderNos.every((po) => linkedByOrder[po])
  const poAmountRows = useMemo(
    () =>
      poSummaries
        .filter((row) => row.po)
        .map((row) => {
          const contract = linkedByOrder[row.po]
          const contractTotal = contract?.total_amount == null ? null : round2(Number(contract.total_amount))
          const matched = contractTotal != null && row.taxSum === contractTotal
          return {
            ...row,
            contract,
            contractTotal,
            matched,
            diff: contractTotal == null ? null : round2(row.taxSum - contractTotal),
          }
        }),
    [poSummaries, linkedByOrder],
  )
  const amountMatched = poAmountRows.length > 0 && poAmountRows.every((row) => row.matched)
  const missingSplitPriceItems = items.filter(missingSplitPrice)

  const invalidateAmountCheck = () => {
    setAmountChecked(false)
    setSavedAmountChecked(false)
  }

  const updateItem = (key: string, patch: Partial<PackingItem>) => {
    invalidateAmountCheck()
    setItems((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        if ('quantity' in patch || 'unit_weight' in patch) {
          next.total_weight = round2(Number(next.quantity || 0) * Number(next.unit_weight || 0))
        }
        next.match_warning = rewritePriceWarning(next)
        return withTax(next)
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
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/contracts?${qs.toString()}`))
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
    if (values.po) qs.set('po', values.po)
    if (values.contract_file_name) qs.set('contract_file_name', values.contract_file_name)
    if (values.departure_date) qs.set('departure_date', values.departure_date)
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/lists?${qs.toString()}`))
    const data = await readJson<{ items?: SavedList[]; detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setSavedLists(data.items || [])
  }

  const loadSaved = async (id: number) => {
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/lists/${id}`))
    const data = await readJson<{ list?: SavedListDetail; detail?: unknown }>(res)
    if (!res.ok || !data.list) {
      message.error(parseApiDetail(data))
      return
    }
    const header = data.list
    setListId(header.id)
    setSourceFileName(header.source_file_name || '')
    setDepartureDate(header.departure_date || '')
    setArrivalDate(header.arrival_date || '')
    setFactoryOrderNo(header.factory_order_no || '')
    setCustomer(header.customer || '')
    const loadedMaps = contractsToMap(header.order_contracts)
    setLinkedByOrder(loadedMaps)
    setLinkingOrderNo(Object.keys(loadedMaps)[0] || null)
    const loaded = (header.items || []).map((row, idx) => normalizeItem(row, idx + 1))
    setItems(loaded)
    setDetailPage(1)
    setSavedById(snapshotById(loaded))
    const checked = Number(header.amount_checked || 0) === 1
    setAmountChecked(checked)
    setSavedAmountChecked(checked)
    message.success('已加载箱单')
  }

  const parseFile = async (file: File) => {
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await authFetch(apiUrl('/api/v1/customer-packing/france/parse'), { method: 'POST', body: fd })
      const data = await readJson<{
        items?: Partial<PackingItem>[]
        departure_date?: string
        arrival_date?: string
        source_file_name?: string
        detail?: unknown
      }>(res)
      if (!res.ok) {
        message.error(parseApiDetail(data))
        return
      }
      setSourceFileName(data.source_file_name || file.name)
      setDepartureDate(data.departure_date || '')
      setArrivalDate(data.arrival_date || '')
      const loaded = (data.items || []).map((row, idx) => normalizeItem(row, idx + 1))
      const keepPos = new Set(loaded.map((row) => String(row.po || '').trim()).filter(Boolean))
      setItems(loaded)
      setLinkedByOrder((prev) => {
        const next: Record<string, ContractHit> = {}
        for (const [po, hit] of Object.entries(prev)) {
          if (keepPos.has(po)) next[po] = hit
        }
        return next
      })
      setDetailPage(1)
      setSavedById({})
      setListId(null)
      invalidateAmountCheck()
      message.success(`已解析 ${data.items?.length || 0} 行，请在下方按订单号分别关联合同后保存`)
    } finally {
      setParsing(false)
    }
  }

  const enrichRow = async (row: PackingItem, drawingNo = row.drawing_no) => {
    const nextDrawing = normalizeDrawingInput(drawingNo)
    const drawingChanged = nextDrawing !== normalizeDrawingInput(row.drawing_no)
    const res = await authFetch(apiUrl('/api/v1/customer-packing/france/enrich'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_no: row.material_no,
        dn: row.dn,
        drawing_no: nextDrawing,
        quantity: row.quantity,
        unit_weight: row.unit_weight,
      }),
    })
    const data = await readJson<Partial<PackingItem> & { detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    const materialMatched = Number(data.material_matched || 0) === 1
    const priceMatched = Number(data.price_matched || 0) === 1
    const replaceManual = materialMatched || drawingChanged
    const replacePrice = priceMatched || drawingChanged
    updateItem(row.key, {
      drawing_no: String(data.drawing_no || (replaceManual ? '' : row.drawing_no)),
      spec_model: replaceManual ? data.spec_model || '' : row.spec_model,
      spec: replaceManual ? data.spec || '' : row.spec,
      model: replaceManual ? data.model || '' : row.model,
      material: replaceManual ? data.material || '' : row.material,
      product_unit_price: replacePrice ? Number(data.product_unit_price || 0) : row.product_unit_price,
      agreement_price: replacePrice ? Number(data.agreement_price || 0) : row.agreement_price,
      tax_unit_price: Number(data.tax_unit_price || 0),
      tax_total_amount: Number(data.tax_total_amount || 0),
      drawing_candidates: data.drawing_candidates || [],
      multi_drawing: Number(data.multi_drawing || 0),
      drawing_confirmed: Number(data.drawing_confirmed || 0),
      match_warning: data.match_warning || '',
      material_matched: materialMatched ? 1 : 0,
      price_matched: priceMatched ? 1 : 0,
      total_weight: Number(data.total_weight || row.total_weight),
    })
  }

  const saveAll = async () => {
    if (!allOrdersLinked) {
      message.warning('请为每个订单号分别确认关联本人负责的合同')
      return
    }
    if (!items.length) {
      message.warning('没有可保存的明细')
      return
    }
    if (!amountChecked) {
      message.warning('请先【核对总单价】并确认后再保存整单')
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
      const res = await authFetch(apiUrl('/api/v1/customer-packing/france/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_archive_id: linkedByOrder[orderNos[0]]?.id,
          departure_date: departureDate,
          arrival_date: arrivalDate,
          source_file_name: sourceFileName,
          factory_order_no: factoryOrderNoText,
          customer: customerText,
          amount_checked: true,
          packing_tax_sum: packingTaxSum,
          order_contracts: orderNos.map((po) => ({
            order_no: po,
            contract_archive_id: linkedByOrder[po].id,
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
      const savedItems = (data.list.items || []).map((row, idx) => normalizeItem(row, idx + 1))
      setItems(savedItems)
      setSavedById(snapshotById(savedItems))
      setAmountChecked(true)
      setSavedAmountChecked(true)
      const missingCount = savedItems.filter(missingSplitPrice).length
      const savedText = data.overwritten ? '已覆盖同一 PO + 离港日的旧箱单并保存' : '箱单已保存'
      message.success(
        missingCount ? `${savedText}。其中 ${missingCount} 行价格拆分表无有效报价，价格为 0` : savedText,
      )
    } finally {
      setSaving(false)
    }
  }

  const saveRow = async (row: PackingItem) => {
    if (!listId || !row.id) {
      message.warning('请先保存整单后再逐行保存')
      return
    }
    if (!isRowDirty(row, savedById)) {
      message.warning('该行未修改，无需保存')
      return
    }
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/items/${row.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patch: {
          seq: row.seq,
          material_no: row.material_no,
          dn: row.dn,
          units_per_pallet: row.units_per_pallet,
          quantity: row.quantity,
          nb_of_pallets: row.nb_of_pallets,
          unit_weight: row.unit_weight,
          po: row.po,
          pos: row.pos,
          drawing_no: row.drawing_no,
          spec_model: row.spec_model,
          spec: row.spec,
          model: row.model,
          material: row.material,
          product_unit_price: row.product_unit_price,
          agreement_price: row.agreement_price,
        },
      }),
    })
    const data = await readJson<{ item?: PackingItem; detail?: unknown }>(res)
    if (!res.ok || !data.item) {
      message.error(parseApiDetail(data))
      return
    }
    const saved = normalizeItem({ ...data.item, key: row.key })
    setItems((prev) => prev.map((it) => (it.key === row.key ? saved : it)))
    if (saved.id) {
      setSavedById((prev) => ({ ...prev, [saved.id!]: comparableRow(saved) }))
    }
    invalidateAmountCheck()
    message.success('该行已保存')
  }

  const deleteRow = async (row: PackingItem) => {
    if (row.id && listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/items/${row.id}`), { method: 'DELETE' })
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
    invalidateAmountCheck()
  }

  const addRow = async () => {
    const seq = items.length + 1
    if (listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/lists/${listId}/items`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: emptyItem(seq) }),
      })
      const data = await readJson<{ item?: PackingItem; detail?: unknown }>(res)
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
      invalidateAmountCheck()
      return
    }
    setItems((prev) => [...prev, emptyItem(seq)])
    setDetailPage(Math.ceil((items.length + 1) / detailPageSize))
    invalidateAmountCheck()
  }

  const deleteSaved = async () => {
    if (!listId) {
      setItems([])
      setSavedById({})
      setSourceFileName('')
      setDepartureDate('')
      setArrivalDate('')
      setFactoryOrderNo('')
      setCustomer('')
      setLinkedByOrder({})
      setLinkingOrderNo(null)
      setContractHits([])
      setFileList([])
      setDetailPage(1)
      invalidateAmountCheck()
      return
    }
    const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/lists/${listId}`), { method: 'DELETE' })
    const data = await readJson<{ detail?: unknown }>(res)
    if (!res.ok) {
      message.error(parseApiDetail(data))
      return
    }
    setListId(null)
    setItems([])
    setSavedById({})
    setSourceFileName('')
    setDepartureDate('')
    setArrivalDate('')
    setFactoryOrderNo('')
    setCustomer('')
    setLinkedByOrder({})
    setLinkingOrderNo(null)
    setContractHits([])
    setFileList([])
    setDetailPage(1)
    invalidateAmountCheck()
    message.success('箱单已删除')
  }

  const doGenerate = async (confirmWarnings = false) => {
    if (!listId) {
      message.warning('请先保存箱单')
      return
    }
    if (!savedAmountChecked) {
      message.warning('请先【核对总单价】并保存整单后再生成订单明细')
      return
    }
    setGenerating(true)
    try {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/lists/${listId}/generate-orders`), {
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

  const onDrawingChange = async (row: PackingItem, drawingNo: string) => {
    const normalized = normalizeDrawingInput(drawingNo)
    if (normalized === normalizeDrawingInput(row.drawing_no)) return
    updateItem(row.key, { drawing_no: normalized, drawing_confirmed: normalized ? 1 : 0 })
    if (row.id && listId) {
      const res = await authFetch(apiUrl(`/api/v1/customer-packing/france/items/${row.id}/apply-drawing`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing_no: normalized }),
      })
      const data = await readJson<{ item?: PackingItem; detail?: unknown }>(res)
      if (!res.ok || !data.item) {
        message.error(parseApiDetail(data))
        return
      }
      const saved = normalizeItem({ ...data.item, key: row.key })
      setItems((prev) => prev.map((it) => (it.key === row.key ? saved : it)))
      if (saved.id) {
        setSavedById((prev) => ({ ...prev, [saved.id!]: comparableRow(saved) }))
      }
      invalidateAmountCheck()
      return
    }
    await enrichRow(row, normalized)
  }

  const openAmountCheck = () => {
    if (!allOrdersLinked) {
      message.warning('请先为每个订单号分别关联合同')
      return
    }
    if (!items.length) {
      message.warning('请先上传或录入明细')
      return
    }
    setCheckOpen(true)
  }

  const confirmAmountCheck = () => {
    setAmountChecked(true)
    setCheckOpen(false)
    message.success(amountMatched ? '金额一致，已确认。请保存整单。' : '已确认核对结果。请保存整单。')
  }

  const rejectAmountCheck = () => {
    invalidateAmountCheck()
    setCheckOpen(false)
    message.warning('金额不一致，请核对后再次上传')
  }

  const columns: ColumnsType<PackingItem> = [
      {
        title: '操作',
        key: 'op',
        width: 150,
        fixed: 'left',
        render: (_, row) => (
          <Space>
            <Button
              size="small"
              type="primary"
              disabled={!row.id || !isRowDirty(row, savedById)}
              onClick={() => saveRow(row)}
            >
              保存
            </Button>
            <Button size="small" danger onClick={() => deleteRow(row)}>
              删除
            </Button>
          </Space>
        ),
      },
      { title: '序号', dataIndex: 'seq', width: 70, render: (_, row) => <InputNumber size="small" value={row.seq} onChange={(v) => updateItem(row.key, { seq: Number(v || 0) })} /> },
      { title: 'Item 物料号', dataIndex: 'material_no', width: 150, render: (_, row) => <Input size="small" value={row.material_no} onChange={(e) => updateItem(row.key, { material_no: e.target.value })} onBlur={() => row.material_no && enrichRow(row)} /> },
      { title: 'DN', dataIndex: 'dn', width: 80, render: (_, row) => <Input size="small" value={row.dn} onChange={(e) => updateItem(row.key, { dn: e.target.value })} onBlur={() => row.material_no && enrichRow(row)} /> },
      { title: '数量/托', dataIndex: 'units_per_pallet', width: 90, render: (_, row) => <InputNumber size="small" value={row.units_per_pallet} onChange={(v) => updateItem(row.key, { units_per_pallet: Number(v || 0) })} /> },
      { title: '订单数量', dataIndex: 'quantity', width: 90, render: (_, row) => <InputNumber size="small" value={row.quantity} onChange={(v) => updateItem(row.key, { quantity: Number(v || 0) })} /> },
      { title: '托盘数量', dataIndex: 'nb_of_pallets', width: 90, render: (_, row) => <InputNumber size="small" value={row.nb_of_pallets} onChange={(v) => updateItem(row.key, { nb_of_pallets: Number(v || 0) })} /> },
      { title: '单重', dataIndex: 'unit_weight', width: 90, render: (_, row) => <InputNumber size="small" step={0.01} value={row.unit_weight} onChange={(v) => updateItem(row.key, { unit_weight: Number(v || 0) })} /> },
      { title: '总重', dataIndex: 'total_weight', width: 90 },
      { title: 'PO', dataIndex: 'po', width: 120, render: (_, row) => <Input size="small" value={row.po} onChange={(e) => updateItem(row.key, { po: e.target.value })} /> },
      { title: 'Pos 条目', dataIndex: 'pos', width: 90, render: (_, row) => <InputNumber size="small" value={row.pos ?? undefined} onChange={(v) => updateItem(row.key, { pos: v == null ? null : Number(v) })} /> },
      {
        title: '图纸号',
        dataIndex: 'drawing_no',
        width: 220,
        render: (_, row) => (
          <AutoComplete
            key={`${row.key}|${row.drawing_no}|${row.drawing_confirmed}`}
            size="small"
            style={{ width: '100%' }}
            defaultValue={row.drawing_no}
            placeholder="选择或填写图纸"
            options={(row.drawing_candidates || []).map((v) => ({ value: v, label: v }))}
            onSelect={(value) => onDrawingChange(row, String(value || ''))}
            onBlur={(event) => onDrawingChange(row, (event.target as HTMLInputElement).value || '')}
          />
        ),
      },
      {
        title: '规格型号',
        dataIndex: 'spec_model',
        width: 220,
        ellipsis: true,
        render: (_, row) =>
          row.material_matched ? (
            row.spec_model
          ) : (
            <Input size="small" value={row.spec_model} onChange={(e) => updateItem(row.key, { spec_model: e.target.value })} />
          ),
      },
      {
        title: '规格',
        dataIndex: 'spec',
        width: 90,
        render: (_, row) =>
          row.material_matched ? (
            row.spec
          ) : (
            <Input size="small" value={row.spec} onChange={(e) => updateItem(row.key, { spec: e.target.value })} />
          ),
      },
      {
        title: '型号',
        dataIndex: 'model',
        width: 90,
        render: (_, row) =>
          row.material_matched ? (
            row.model
          ) : (
            <Input size="small" value={row.model} onChange={(e) => updateItem(row.key, { model: e.target.value })} />
          ),
      },
      {
        title: '材质',
        dataIndex: 'material',
        width: 80,
        render: (_, row) =>
          row.material_matched ? (
            row.material
          ) : (
            <Input size="small" value={row.material} onChange={(e) => updateItem(row.key, { material: e.target.value })} />
          ),
      },
      {
        title: '产品单价',
        dataIndex: 'product_unit_price',
        width: 110,
        render: (v: number, row) =>
          row.price_matched ? (
            money(v)
          ) : (
            <InputNumber
              size="small"
              min={0}
              step={0.01}
              value={row.product_unit_price}
              onChange={(value) => updateItem(row.key, { product_unit_price: Number(value || 0) })}
            />
          ),
      },
      {
        title: '协议价',
        dataIndex: 'agreement_price',
        width: 110,
        render: (v: number, row) =>
          row.price_matched ? (
            money(v)
          ) : (
            <InputNumber
              size="small"
              min={0}
              step={0.01}
              value={row.agreement_price}
              onChange={(value) => updateItem(row.key, { agreement_price: Number(value || 0) })}
            />
          ),
      },
      { title: '含税单价', dataIndex: 'tax_unit_price', width: 100, render: (v: number) => money(v) },
      { title: '含税总价', dataIndex: 'tax_total_amount', width: 110, render: (v: number) => money(v) },
      {
        title: '提示',
        dataIndex: 'match_warning',
        width: 220,
        render: (v: string, row) => (
          <span className="warningCell">
            {v || ''}
            {row.weight_mismatch ? ' 总重与 Excel 不一致已按单重×数量计算' : ''}
          </span>
        ),
      },
    ]

  const linkContract = (orderNo: string, row: ContractHit) => {
    if (!orderNo) {
      message.warning('请先选择要关联的订单号')
      return
    }
    const usedBy = Object.entries(linkedByOrder).find(([po, hit]) => po !== orderNo && hit.id === row.id)
    if (usedBy) {
      message.warning(`该合同已关联订单号 ${usedBy[0]}，每个订单号须对应不同合同文件`)
      return
    }
    if (linkedByOrder[orderNo]?.id !== row.id) invalidateAmountCheck()
    setLinkedByOrder((prev) => ({ ...prev, [orderNo]: row }))
    setCustomer((prev) => prev.trim() || row.customer_name || '')
    message.success(`订单号 ${orderNo} 已关联合同 ${row.file_name} ${row.version}`)
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
      <Card size="small" title="查询已保存箱单">
        <Form form={listForm} layout="inline">
          <Form.Item name="po" label="PO">
            <Input allowClear placeholder="订单号" />
          </Form.Item>
          <Form.Item name="contract_file_name" label="合同文件名">
            <Input allowClear />
          </Form.Item>
          <Form.Item name="departure_date" label="离港日">
            <Input allowClear placeholder="YYYY-MM-DD" />
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
              { title: '离港日', dataIndex: 'departure_date', width: 120 },
              { title: '到港日', dataIndex: 'arrival_date', width: 120 },
              { title: '合同文件', dataIndex: 'contract_file_name' },
              { title: '版本', dataIndex: 'contract_version', width: 90 },
              { title: '来源文件', dataIndex: 'source_file_name' },
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

      <Card size="small" title="上传法国客户箱单（只读取，不归档原件）">
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
          {departureDate ? <Tag color="geekblue">离港 {departureDate}</Tag> : null}
          {arrivalDate ? <Tag color="geekblue">到港 {arrivalDate}</Tag> : null}
          {listId ? <Tag color="green">已保存 #{listId}</Tag> : <Tag>未保存预览</Tag>}
          {amountChecked ? <Tag color="success">已核对总单价</Tag> : <Tag>未核对总单价</Tag>}
        </Space>
      </Card>

      {items.length > 0 ? (
        <Card
          size="small"
          title="按 PO 关联客户合同（每个订单号各关联一份，仅可关联本人负责的合同）"
        >
          <Table
            size="small"
            rowKey={(row) => row.po || '__empty'}
            pagination={false}
            dataSource={poSummaries}
            rowClassName={(row) => (row.po && row.po === linkingOrderNo ? 'multiDrawingRow' : '')}
            columns={[
              {
                title: '操作',
                key: 'pick',
                width: 110,
                fixed: 'left',
                render: (_, row) => (
                  <Button
                    size="small"
                    type={row.po && linkedByOrder[row.po] && row.po !== linkingOrderNo ? 'default' : 'primary'}
                    disabled={!row.po}
                    onClick={() => setLinkingOrderNo(row.po)}
                  >
                    {row.po && linkedByOrder[row.po] ? '更换合同' : '选择合同'}
                  </Button>
                ),
              },
              {
                title: '订单号(PO)',
                dataIndex: 'po',
                width: 180,
                render: (po: string) => po || '（未填 PO）',
              },
              { title: '行数', dataIndex: 'rowCount', width: 80 },
              {
                title: '含税合计',
                dataIndex: 'taxSum',
                width: 120,
                render: (v: number) => money(v),
              },
              {
                title: '已关联合同',
                key: 'linked',
                render: (_, row) => {
                  const hit = row.po ? linkedByOrder[row.po] : undefined
                  return hit ? (
                    <>
                      <Tag color="blue">#{hit.id}</Tag>
                      {contractLabel(hit).replace(`#${hit.id} `, '')}
                      {hit.total_amount != null ? ` / 合同总金额 ${money(hit.total_amount)}` : ''}
                    </>
                  ) : (
                    <Tag>未关联</Tag>
                  )
                },
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} />
                <Table.Summary.Cell index={1}>整单合计</Table.Summary.Cell>
                <Table.Summary.Cell index={2}>{items.length}</Table.Summary.Cell>
                <Table.Summary.Cell index={3}>{money(packingTaxSum)}</Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  {allOrdersLinked
                    ? `已关联 ${orderNos.length} 个订单号，各对应一份合同`
                    : `已关联 ${orderNos.filter((po) => linkedByOrder[po]).length}/${orderNos.length} 个订单号`}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          <div style={{ marginTop: 16 }}>
            {linkingOrderNo
              ? `正在为订单号 ${linkingOrderNo} 选择合同（查询后点【确认关联】）`
              : '请先在上表点【选择合同】，再查询并确认关联'}
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
        title="箱单明细"
        extra={
          <Space wrap>
            <Button type="primary" onClick={() => void addRow()}>新增行</Button>
            <Button
              style={{ background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 600 }}
              disabled={!allOrdersLinked || items.length === 0}
              onClick={openAmountCheck}
            >
              核对总单价
            </Button>
            <Button type="primary" loading={saving} disabled={!allOrdersLinked || !amountChecked} onClick={() => void saveAll()}>
              保存整单
            </Button>
            <Button danger onClick={() => void deleteSaved()}>
              删除本单
            </Button>
            <Button
              type="primary"
              loading={generating}
              disabled={!listId || !savedAmountChecked}
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
          scroll={{ x: 2700 }}
          dataSource={items}
          columns={columns}
          rowClassName={(row) => (row.multi_drawing ? 'multiDrawingRow' : '')}
        />
        <Modal
          title="核对总单价"
          open={checkOpen}
          onCancel={() => setCheckOpen(false)}
          footer={[
            <Button key="mismatch" danger onClick={rejectAmountCheck}>
              不一致
            </Button>,
            <Button key="ok" type="primary" onClick={confirmAmountCheck}>
              确认
            </Button>,
          ]}
        >
          <p>
            按订单号核对：箱单含税小计 vs 该订单号关联合同的总金额。共 {poAmountRows.length} 个订单号。
          </p>
          {amountMatched ? <p>各订单号金额均一致。</p> : <p>存在不一致，请确认是否在误差范围内。</p>}
          {missingSplitPriceItems.length > 0 && (
            <>
              <p>
                以下 {missingSplitPriceItems.length} 行价格拆分表无有效报价，当前价格为 0。合计可能因此与合同不一致，仍可点【确认】。
              </p>
              {missingSplitPriceItems.map((row) => (
                <p key={row.key}>
                  第 {row.seq} 行 {row.material_no}
                  {row.drawing_no ? ` / ${row.drawing_no}` : ''}
                </p>
              ))}
            </>
          )}
          {poAmountRows.map((row) => (
            <p key={row.po}>
              {row.po}：箱单 {money(row.taxSum)} vs 合同{' '}
              {row.contractTotal == null ? '未填写' : money(row.contractTotal)}
              {row.diff == null ? '' : `，差额 ${money(row.diff)}`}
              {row.matched ? '（一致）' : '（不一致）'}
              {row.contract ? ` / ${row.contract.file_name} ${row.contract.version}` : ''}
            </p>
          ))}
        </Modal>
      </Card>
    </Space>
  )
}

function FranceGuide() {
  return (
    <div className={styles.opGuideBody}>
      <div className={styles.opGuideBlock}>
        <div className={styles.opGuideLabel}>操作步骤</div>
        <ol className={styles.opGuideList}>
          <li>法国 / 大连分 Tab。本期【法国客户箱单/电子合同】与【大连电子合同】可用；【大连客户箱单】仍为占位。</li>
          <li>先在「上传法国客户箱单」填写本厂单号和客户，再点【选择 Excel】上传客户 SEA 装箱单（.xlsx / .xls）。系统只读取解析，不归档原件。有效行从第 4 行起，跳过空行、#N/A 和合计行。</li>
          <li>上传后先出现「按 PO 关联客户合同」（在箱单明细上方），按订单号汇总行数和含税小计。每个订单号各关联一份合同：先在该行点【选择合同】，再查询后点【确认关联】。只能关联业务负责人为当前登录者的合同；同一份合同不能挂到两个订单号。保存前每个订单号都必须已关联。</li>
          <li>再往下是「箱单明细」。离港日取 C1、到港日取 C2；物料号、DN、数量/托、订单数量、托盘数量、单重、PO、条目从文件读取。总重按「单重 × 订单数量」四舍五入到 2 位。明细每页 10 条，可翻页。</li>
          <li>系统按物料号 + DN 从物料建档回填图纸号、规格型号、规格、型号、材质。产品单价和协议价按已选定图纸从法国价格拆分表有效行读取：协议价取最终报价，产品单价取含税单价。物料表或拆分表没有对应资料时，这些字段可手工填写。多个图纸版本时该行浅蓝，默认选 Rev 数字最大者，也可直接输入图纸号；改图纸后相关字段会整行重取。可在表格中增删改行。</li>
          <li>保存前请点橙色【核对总单价】：按订单号对比该 PO 含税小计与其关联合同的总金额，确认后才能【保存整单】。同一 PO + 离港日再次保存会覆盖旧明细并记日志。已保存后，行内【保存】仅在该行相对库内数据有改动时可点（不强制核对）。</li>
          <li>保存且已核对后点【生成订单明细】，按 PO 写入法国订单。本厂单号和客户写入订单明细。生成前请复核多版本图纸与价格。</li>
        </ol>
      </div>
      <div className={styles.opGuideBlock}>
        <div className={styles.opGuideLabel}>注意事项</div>
        <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
          <li>未上传或明细为空时不显示「按 PO 关联客户合同」。该块在上传区与箱单明细之间。未给每个订单号关联本人负责的合同时不能保存。未分配或他人负责的合同无法【确认关联】。三个订单号须对应三份合同文件。</li>
          <li>未填写本厂单号或客户时不能【保存整单】。未完成【核对总单价】确认时不能【保存整单】或【生成订单明细】。</li>
          <li>含税单价取价格拆分表含税单价（保留 2 位），含税总价 = 含税单价 × 数量。核对时按订单号对比该 PO 含税小计与其合同总金额，并列出价格拆分表无有效报价的行。两位小数相同可点【确认】；不同或存在缺价行时请确认是否在误差范围内，也可点【确认】。点【不一致】后须核对并再次上传，才能保存或生成。</li>
          <li>解析换文件、改数量或价格、增删行、换任一订单号的合同、点【不一致】会清零核对状态，需重新核对。重新解析 Excel 会保留本厂单号、客户，以及仍存在的订单号已关联合同，但变为未保存预览。打开已保存且已核对、未改明细的箱单可直接生成订单。</li>
          <li>价格取自法国价格拆分表有效行（物料号 + 图纸号），不是物料建档上的产品单价和法国协议价。物料表或价格拆分表没有该物料时，图纸号、规格型号、规格、型号、材质、产品单价、协议价可直接填写；含税单价、含税总价和总重仍按填写值自动计算。拆分表没有有效报价且价格仍为 0 时，在「提示」列说明，不阻断【核对总单价】、【保存整单】和【生成订单明细】；手填了非 0 的产品单价和协议价后不再当作缺价。未建档或规格不匹配同样只警告。生成时若价格仍为 0 会再次提醒，确认后仍可继续。</li>
          <li>Excel 总重若与「单重 × 数量」相差超过 0.05，以计算结果为准，并在提示中说明。</li>
          <li>托盘相关列只保存在客户箱单表，不会写入订单明细或生产装箱单。</li>
          <li>若该 PO 在订单明细中已存在，【生成订单明细】会拒绝覆盖，请到【订单查询】处理，以免冲掉生产中数据。</li>
          <li>【生成订单明细】把上传区填写的本厂单号和客户写入订单明细；资料状态按图纸建档 + 物料建档自动计算。</li>
          <li>录入、修改、上传解析、覆盖、删除、生成订单会记录操作人、时间和变更内容。</li>
          <li>【删除本单】删除已保存箱单不可恢复；未保存预览仅清空当前页面（含本厂单号、客户、已关联合同）。</li>
        </ul>
      </div>
    </div>
  )
}

function DalianEcontractGuide() {
  return (
    <div className={styles.opGuideBody}>
      <div className={styles.opGuideBlock}>
        <div className={styles.opGuideLabel}>操作步骤</div>
        <ol className={styles.opGuideList}>
          <li>本 Tab 用于大连电子合同：上传客户电子版合同 Excel，关联已归档合同，再生成订单明细。【大连客户箱单】仍为占位。现有「订单录入 → 物料」粘贴路径保留。</li>
          <li>先填写本厂单号和客户，再点【选择 Excel】。系统按表头名读取（料号、物料号、DN大小、订单号、单价、数量、备注），列顺序可变，不归档原件。</li>
          <li>解析后在明细上方出现「按订单号关联客户合同」，按订单号汇总行数和 Excel 金额小计（单价×数量）。每个订单号各关联一份合同：先点【选择合同】再查询确认。只能关联业务负责人为当前登录者的合同；同一份合同不能挂到两个订单号。归档合同尚未到时，可打开该订单号的【合同后补】，不选合同也能继续核对单价、保存整单、生成订单明细。</li>
          <li>明细每页 10 条。系统按物料号 + DN 从物料建档回填图纸、规格、单重；同时对照价格拆分表净价和物料大连协议价。多图纸版本时请下拉确认。</li>
          <li>保存前点橙色【核对单价】：对比 Excel 单价与拆分表/物料协议价。不一致会列出行号，仍可确认。确认后才能【保存整单】。同一订单号再次保存会覆盖旧明细。</li>
          <li>保存且已核对后点【生成订单明细】，按订单号写入大连订单。协议价和产品单价都写 Excel 单价；料号写入名称/料号。本厂单号和客户取上传区。若有订单号仍为合同后补，生成前会提示确认，确认后仍可生成。</li>
        </ol>
      </div>
      <div className={styles.opGuideBlock}>
        <div className={styles.opGuideLabel}>注意事项</div>
        <ul className={`${styles.opGuideList} ${styles.opGuideNotes}`}>
          <li>不核对合同总金额。核对的是电子合同单价与拆分表/物料大连协议价是否一致。</li>
          <li>未给每个订单号关联本人负责的合同（或打开【合同后补】）、未填本厂单号/客户、未完成【核对单价】时不能保存或生成。未打开后补时，三个订单号须对应三份合同文件。保存后若仍有后补订单号，工作台会出现待办，点击可回到本页补关联；后补改成正式关联时不必重新核对单价，也不覆盖已生成的订单明细。</li>
          <li>订单号建议 4 开头。不是 4 开头不阻断保存，生成时会二次确认。</li>
          <li>若订单号已在订单明细中存在，【生成订单明细】会拒绝覆盖，请到【订单查询】处理。</li>
          <li>电子合同原件不归档；正式合同 PDF 仍走【合同上传/下载】。删除合同时若已被本模块引用会拦截。</li>
          <li>解析换文件、改数量或单价、增删行、更换已关联合同、点【不一致】会清零核对状态。首次把【合同后补】改成确认关联不会清核对。重新解析保留本厂单号、客户，以及仍存在的订单号已关联合同和后补标记。</li>
          <li>条目不从 Excel 读取，生成订单时条目为空。图纸号由物料建档回填。</li>
          <li>【删除本单】不可恢复；未保存预览仅清空当前页面。</li>
        </ul>
      </div>
    </div>
  )
}

function DalianPackingGuide() {
  return (
    <div className={styles.opGuideBody}>
      <div className={styles.opGuideBlock}>
        <div className={styles.opGuideLabel}>操作步骤</div>
        <ol className={styles.opGuideList}>
          <li>选择预定到货日期，点【生成】。箱单只带出该日预定数量大于 0、且已经指定对接人的明细。数量为 0 和已删除的预定不会出现。</li>
          <li>本页不能改数量、备注，也不能删除。这些仍到【合作伙伴 / 大连西门子 / 发货预定】操作。生成时会从订单明细刷新条目、图纸号、单重，并按预定数量计算总重。炉号和热处理号直接显示订单明细当前值，改炉号后刷新本页即可看到，不必为此重新生成。</li>
          <li>点【导出 Excel】后勾选需要的列再确认，炉号和热处理号也可以勾选。导出是普通表格，不套客户模板。</li>
          <li>确认无误后点【开始自动装箱】。这一步只把该日有效预定改为「开始装箱」，并进入大连自动装箱页。分箱和写入大连发货明细在装箱页完成。</li>
          <li>开始装箱之后如果预定数量又改了，进度会回到「存在变更内容」。必须【重新生成】后才能再次开始自动装箱。【操作日志】与发货预定页是同一份记录。</li>
        </ol>
      </div>
    </div>
  )
}

const PACKING_TAB_KEYS = new Set(['france', 'dalian-contract', 'dalian'])

export default function CustomerPackingPage() {
  const pageTitle = usePageTitle()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab') || ''
  const [tab, setTab] = useState(PACKING_TAB_KEYS.has(urlTab) ? urlTab : 'france')

  useEffect(() => {
    const nextTab = searchParams.get('tab') || ''
    const listId = searchParams.get('list_id')
    if (PACKING_TAB_KEYS.has(nextTab) && nextTab !== tab) {
      setTab(nextTab)
      return
    }
    if (listId && tab !== 'dalian-contract') setTab('dalian-contract')
  }, [searchParams, tab])

  const onTabChange = (key: string) => {
    setTab(key)
    const next = new URLSearchParams(searchParams)
    if (key === 'france') next.delete('tab')
    else next.set('tab', key)
    if (key !== 'dalian-contract') next.delete('list_id')
    setSearchParams(next, { replace: true })
  }

  const guide =
    tab === 'dalian-contract' ? <DalianEcontractGuide /> : tab === 'dalian' ? <DalianPackingGuide /> : <FranceGuide />

  return (
    <Card title={pageTitle} className={styles.pageCard}>
      <div className={styles.stack}>
      <Collapse
        className={styles.opGuide}
        defaultActiveKey={[]}
        items={[
          {
            key: 'guide',
            label: '操作说明',
            children: guide,
          },
        ]}
      />
      <Tabs
        activeKey={tab}
        onChange={onTabChange}
        items={[
          {
            key: 'france',
            label: t('nav.customerPackingFrance'),
            children: <FrancePackingPanel />,
          },
          {
            key: 'dalian-contract',
            label: t('nav.customerPackingDalianContract'),
            children: <DalianEcontractPanel />,
          },
          {
            key: 'dalian',
            label: t('nav.customerPackingDalian'),
            children: <DalianCustomerPackingPanel />,
          },
        ]}
      />
      </div>
    </Card>
  )
}
