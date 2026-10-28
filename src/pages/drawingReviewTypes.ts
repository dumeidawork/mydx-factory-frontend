import { DIM_FIELDS, DIM_LABELS, type DimFieldKey } from '../utils/drawingSourceFields'

export type DrawingArchiveRow = {
  id: number
  customer_code: string
  drawing_no: string
  standard_no?: string
  drawing_rev_no?: string
  material: string
  spec_model: string
  spec?: string
  model?: string
  material_no?: string
  drawing_type: string
  drawing_name: string
  od_d?: string
  id_c?: string
  thk_t?: string
  thk_f?: string
  mouth_m?: string
  mouth_n?: string
  center_k?: string
  seat_a?: string
  seat_h_f?: string
  id_small_d?: string
  id_large_e?: string
  r_val?: string
  r1_val?: string
  r2_val?: string
  e_val?: string
  s_neck?: string
  hole_h?: string
  hole_n?: string
  hole_h2?: string
  hole_n2?: string
  pcd2?: string
  thru_c?: string
  side_hole?: string
  side_hole_depth?: string
  side_a?: string
  side_a_depth?: string
  side_b?: string
  side_b_depth?: string
  bottom_hole?: string
  weld_theta?: string
  v1_deg?: string
  v2_deg?: string
  g_val?: string
  f_depth?: string
  unit_weight?: string
  status?: string
  reviewer_user_id?: number | null
  reviewer_name?: string
  review_remark?: string | null
  reviewed_at?: string | null
  uploaded_at: string
  uploaded_by_user_id?: number | null
  uploaded_by_name: string
  updated_at?: string
  updated_by_user_id?: number | null
  updated_by_name?: string
  downloaded_after_submit?: boolean
}

const IDENTITY_REVIEW_FIELDS: { key: keyof DrawingArchiveRow; label: string }[] = [
  { key: 'customer_code', label: '客户代码' },
  { key: 'standard_no', label: '标准号' },
  { key: 'drawing_rev_no', label: '图纸号-版本号' },
  { key: 'material', label: '材质' },
  { key: 'spec_model', label: '规格型号' },
  { key: 'spec', label: '规格' },
  { key: 'model', label: '型号' },
  { key: 'material_no', label: '物料号' },
  { key: 'drawing_type', label: '类型' },
]

export function drawingReviewFieldsFor(item: DrawingArchiveRow): { key: keyof DrawingArchiveRow; label: string }[] {
  const dims = DIM_FIELDS.filter((key) => String(item[key as DimFieldKey] ?? '').trim()).map((key) => ({
    key: key as keyof DrawingArchiveRow,
    label: DIM_LABELS[key] || key,
  }))
  return [...IDENTITY_REVIEW_FIELDS, ...dims]
}

/** 全量核对项（审核弹窗按条过滤非空尺寸，此常量作兜底） */
export const DRAWING_REVIEW_FIELDS = [
  ...IDENTITY_REVIEW_FIELDS,
  ...DIM_FIELDS.map((key) => ({ key: key as keyof DrawingArchiveRow, label: DIM_LABELS[key] || key })),
]
