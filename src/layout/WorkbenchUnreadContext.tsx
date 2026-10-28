import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiUrl } from '../utils/api'
import { authFetch } from '../utils/auth'
import type { AmountConfirmItem, PendingTakeoverItem } from '../pages/contractTakeoverTypes'
import type { DrawingArchiveRow } from '../pages/drawingReviewTypes'
import type { MaterialGapItem } from '../pages/materialAlignTypes'

export const WORKBENCH_UNREAD_EVENT = 'workbench-unread-refresh'
const POLL_MS = 60_000
const MIN_REFRESH_GAP_MS = 10_000

export function notifyWorkbenchUnreadChanged() {
  window.dispatchEvent(new Event(WORKBENCH_UNREAD_EVENT))
}

export type TypingNoticeChangedRow = {
  order_detail_id: number
  order_no?: string
  item_no?: number | null
  material_no?: string
  drawing_no?: string
  quantity?: number | null
  heat_no?: string
  heat_treatment_batch_no?: string
}

export type TypingNoticeItem = {
  id: number
  order_no: string
  contract_archive_id?: number | null
  contract_file_name?: string
  owner_user_id?: number | null
  owner_name?: string
  trigger_user_id?: number | null
  trigger_user_name?: string
  changed_rows?: TypingNoticeChangedRow[]
  status?: string
  created_at?: string
}

export type QtyMapDnNoticeItem = {
  id: number
  owner_user_id?: number | null
  owner_name?: string
  material_nos?: string[]
  missing_count?: number
  hint?: string
  status?: string
  created_at?: string
  updated_at?: string
}

export type DalianShippingProgressRow = {
  id: number
  order_no?: string
  material_no?: string
  planned_qty?: number
  status?: string
}

export type DalianShippingProgressDate = {
  planned_arrival_date: string
  assignee_user_id?: number | null
  assignee_name?: string
  assigned_at?: string
  unread?: boolean
  has_changes?: boolean
  line_count?: number
  total_qty?: number
  rows?: DalianShippingProgressRow[]
}

export type DalianShippingProgress = {
  dates: DalianShippingProgressDate[]
  unread_count: number
}

export type DalianContractDeferItem = {
  id: number
  list_id: number
  factory_order_no?: string
  customer?: string
  source_file_name?: string
  order_nos?: string
  created_at?: string
  updated_at?: string
}

type WorkbenchUnreadValue = {
  count: number
  items: PendingTakeoverItem[]
  amountItems: AmountConfirmItem[]
  drawingReviewItems: DrawingArchiveRow[]
  drawingReviseItems: DrawingArchiveRow[]
  materialDrawingItems: MaterialGapItem[]
  materialPriceItems: MaterialGapItem[]
  typingNoticeItems: TypingNoticeItem[]
  dalianContractDeferItems: DalianContractDeferItem[]
  qtyMapDnItems: QtyMapDnNoticeItem[]
  dalianShippingProgress: DalianShippingProgress
  loading: boolean
  refresh: () => Promise<void>
}

type PendingPayload = {
  items?: PendingTakeoverItem[]
  amount_items?: AmountConfirmItem[]
  drawing_review_items?: DrawingArchiveRow[]
  drawing_revise_items?: DrawingArchiveRow[]
  material_drawing_items?: MaterialGapItem[]
  material_price_items?: MaterialGapItem[]
  typing_notice_items?: TypingNoticeItem[]
  dalian_contract_defer_items?: DalianContractDeferItem[]
  qty_map_dn_items?: QtyMapDnNoticeItem[]
  dalian_shipping_progress?: DalianShippingProgress
}

const WorkbenchUnreadContext = createContext<WorkbenchUnreadValue | null>(null)

async function fetchWorkbenchPending(): Promise<PendingPayload> {
  const res = await authFetch(apiUrl('/api/v1/workbench/pending'))
  if (!res.ok) return {}
  return (await res.json().catch(() => ({}))) as PendingPayload
}

const emptyFallback: WorkbenchUnreadValue = {
  count: 0,
  items: [],
  amountItems: [],
  drawingReviewItems: [],
  drawingReviseItems: [],
  materialDrawingItems: [],
  materialPriceItems: [],
  typingNoticeItems: [],
  dalianContractDeferItems: [],
  qtyMapDnItems: [],
  dalianShippingProgress: { dates: [], unread_count: 0 },
  loading: false,
  refresh: async () => undefined,
}

export function WorkbenchUnreadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PendingTakeoverItem[]>([])
  const [amountItems, setAmountItems] = useState<AmountConfirmItem[]>([])
  const [drawingReviewItems, setDrawingReviewItems] = useState<DrawingArchiveRow[]>([])
  const [drawingReviseItems, setDrawingReviseItems] = useState<DrawingArchiveRow[]>([])
  const [materialDrawingItems, setMaterialDrawingItems] = useState<MaterialGapItem[]>([])
  const [materialPriceItems, setMaterialPriceItems] = useState<MaterialGapItem[]>([])
  const [typingNoticeItems, setTypingNoticeItems] = useState<TypingNoticeItem[]>([])
  const [dalianContractDeferItems, setDalianContractDeferItems] = useState<DalianContractDeferItem[]>([])
  const [qtyMapDnItems, setQtyMapDnItems] = useState<QtyMapDnNoticeItem[]>([])
  const [dalianShippingProgress, setDalianShippingProgress] = useState<DalianShippingProgress>({
    dates: [],
    unread_count: 0,
  })
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef(false)
  const lastAtRef = useRef(0)

  const refresh = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    if (!force && Date.now() - lastAtRef.current < MIN_REFRESH_GAP_MS) return
    inFlightRef.current = true
    setLoading(true)
    try {
      const data = await fetchWorkbenchPending()
      setItems(data.items || [])
      setAmountItems(data.amount_items || [])
      setDrawingReviewItems(data.drawing_review_items || [])
      setDrawingReviseItems(data.drawing_revise_items || [])
      setMaterialDrawingItems(data.material_drawing_items || [])
      setMaterialPriceItems(data.material_price_items || [])
      setTypingNoticeItems(data.typing_notice_items || [])
      setDalianContractDeferItems(data.dalian_contract_defer_items || [])
      setQtyMapDnItems(data.qty_map_dn_items || [])
      setDalianShippingProgress(data.dalian_shipping_progress || { dates: [], unread_count: 0 })
      lastAtRef.current = Date.now()
    } catch {
      setItems([])
      setAmountItems([])
      setDrawingReviewItems([])
      setDrawingReviseItems([])
      setMaterialDrawingItems([])
      setMaterialPriceItems([])
      setTypingNoticeItems([])
      setDalianContractDeferItems([])
      setQtyMapDnItems([])
      setDalianShippingProgress({ dates: [], unread_count: 0 })
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(true)
    const onChanged = () => {
      void refresh(true)
    }
    const onVisible = () => {
      if (!document.hidden) void refresh(false)
    }
    window.addEventListener(WORKBENCH_UNREAD_EVENT, onChanged)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(false)
    }, POLL_MS)
    return () => {
      window.removeEventListener(WORKBENCH_UNREAD_EVENT, onChanged)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      count:
        items.length +
        amountItems.length +
        drawingReviewItems.length +
        drawingReviseItems.length +
        materialDrawingItems.length +
        materialPriceItems.length +
        typingNoticeItems.length +
        dalianContractDeferItems.length +
        qtyMapDnItems.length,
      items,
      amountItems,
      drawingReviewItems,
      drawingReviseItems,
      materialDrawingItems,
      materialPriceItems,
      typingNoticeItems,
      dalianContractDeferItems,
      qtyMapDnItems,
      dalianShippingProgress,
      loading,
      refresh: () => refresh(true),
    }),
    [
      items,
      amountItems,
      drawingReviewItems,
      drawingReviseItems,
      materialDrawingItems,
      materialPriceItems,
      typingNoticeItems,
      dalianContractDeferItems,
      qtyMapDnItems,
      dalianShippingProgress,
      loading,
      refresh,
    ],
  )

  return <WorkbenchUnreadContext.Provider value={value}>{children}</WorkbenchUnreadContext.Provider>
}

export function useWorkbenchUnread(): WorkbenchUnreadValue {
  return useContext(WorkbenchUnreadContext) || emptyFallback
}
