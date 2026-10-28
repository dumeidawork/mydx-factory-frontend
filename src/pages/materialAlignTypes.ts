export type MaterialGapItem = {
  key: string
  source: 'drawing' | 'price_split'
  region?: string
  drawing_no: string
  material_no: string
  uploaded_by?: string
  updated_by?: string
  uploaded_at?: string
  updated_at?: string
  same_material_no?: boolean
  existing_drawing_no?: string
  hint: string
}

export type AlignConfirmResult = {
  status?: string
  aligned_count?: number
  missing_count?: number
  missing?: {
    drawing_no: string
    material_no: string
    hint: string
    same_material_no?: boolean
  }[]
}

export function formatAlignMessages(data: AlignConfirmResult) {
  const aligned = data.aligned_count || 0
  const missing = data.missing || []
  const missingLines = missing.map((item) => `${item.material_no} / ${item.drawing_no || '空'}：${item.hint}`)
  return { aligned, missing, missingLines }
}
