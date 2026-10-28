export type PriceSplitRegion = 'france' | 'dalian'
export type PriceSplitGroup = 'A105' | 'SS'

export type PriceSplitRow = {
  key: string
  id?: number
  material_group: PriceSplitGroup
  drawing_no: string
  drawing_code: string
  drawing_rev: string
  material_no: string
  part_no: string
  ref_part_no: string
  ref_material_no: string
  description: string
  flange_type: string
  dn: number
  material: string
  scope: string
  award_yn: string
  sales_mode: string
  year_usage: number
  has_m16: string
  has_through_hole: string
  has_ptfe_hole: string
  steel_price: number
  blanking_weight: number
  ht_blanking_weight: number
  forged_weight: number
  ht_loss: number
  gas_loss: number
  heat_loss: number
  net_weight: number
  recover_weight: number
  scrap_price: number
  blanking_cost: number
  forging_cost: number
  heat_treatment_cost: number
  ht_freight_cost: number
  machining_cost: number
  ht_machining_extra: number
  ring_rolling_cost: number
  drilling_cost: number
  grounding_hole_cost: number
  hoisting_hole_cost: number
  through_hole_cost: number
  ptfe_hole_cost: number
  m6_hole_cost: number
  packing_cost: number
  other_cost: number
  transport_cost: number
  port_surcharge: number
  profit_rate: number
  material_cost: number
  total_process_cost: number
  net_price: number
  excel_net_price: number | null
  vat_rate: number | null
  tax_inclusive_price: number
  price_version: string
  price_change_remark: string
  replaces_id: number | null
  is_valid: number
  source_file: string
  source_sheet: string
  source_row: number | null
  created_by: string
  created_by_user_id: number | null
  created_at: string
  updated_by: string
  updated_by_user_id: number | null
  updated_at: string
}

const num = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export const PRICE_SPLIT_DERIVED_FIELDS: (keyof PriceSplitRow)[] = [
  'ht_loss',
  'ht_blanking_weight',
  'forged_weight',
  'recover_weight',
  'material_cost',
  'total_process_cost',
  'net_price',
  'tax_inclusive_price',
]

export function emptyPriceSplitRow(group: PriceSplitGroup, index: number): PriceSplitRow {
  return {
    key: `new-${Date.now()}-${index}`,
    material_group: group,
    drawing_no: '',
    drawing_code: '',
    drawing_rev: '',
    material_no: '',
    part_no: '',
    ref_part_no: '',
    ref_material_no: '',
    description: '',
    flange_type: '',
    dn: 0,
    material: group === 'A105' ? 'A105' : '',
    scope: '',
    award_yn: '',
    sales_mode: '',
    year_usage: 0,
    has_m16: '',
    has_through_hole: '',
    has_ptfe_hole: '',
    steel_price: 0,
    blanking_weight: 0,
    ht_blanking_weight: 0,
    forged_weight: 0,
    ht_loss: 0,
    gas_loss: 0,
    heat_loss: 0,
    net_weight: 0,
    recover_weight: 0,
    scrap_price: 0,
    blanking_cost: 0,
    forging_cost: 0,
    heat_treatment_cost: 0,
    ht_freight_cost: 0,
    machining_cost: 0,
    ht_machining_extra: 0,
    ring_rolling_cost: 0,
    drilling_cost: 0,
    grounding_hole_cost: 0,
    hoisting_hole_cost: 0,
    through_hole_cost: 0,
    ptfe_hole_cost: 0,
    m6_hole_cost: 0,
    packing_cost: 0,
    other_cost: 0,
    transport_cost: 0,
    port_surcharge: 0,
    profit_rate: 1.07,
    material_cost: 0,
    total_process_cost: 0,
    net_price: 0,
    excel_net_price: null,
    vat_rate: null,
    tax_inclusive_price: 0,
    price_version: '',
    price_change_remark: '',
    replaces_id: null,
    is_valid: 1,
    source_file: '',
    source_sheet: '',
    source_row: null,
    created_by: '',
    created_by_user_id: null,
    created_at: '',
    updated_by: '',
    updated_by_user_id: null,
    updated_at: '',
  }
}

export function applyPriceSplitDerived(row: PriceSplitRow, region: PriceSplitRegion): PriceSplitRow {
  const next = { ...row }
  if (next.material_group === 'SS') {
    const blanking = num(next.blanking_weight)
    const heatLoss = num(next.heat_loss)
    const netWeight = num(next.net_weight)
    const forged = blanking * (1 - heatLoss)
    const recover = forged - netWeight
    const materialCost = (num(next.steel_price) * blanking - recover * num(next.scrap_price)) / 1000
    const machining = num(next.machining_cost)
    const processSum =
      num(next.blanking_cost) +
      num(next.forging_cost) +
      num(next.ring_rolling_cost) +
      machining +
      machining +
      num(next.drilling_cost) +
      num(next.ptfe_hole_cost) +
      num(next.m6_hole_cost) +
      num(next.packing_cost) +
      num(next.other_cost) +
      num(next.hoisting_hole_cost) +
      num(next.through_hole_cost)
    const totalProcess = (processSum * 2 * netWeight) / 1000
    const freight = region === 'france' ? num(next.transport_cost) + num(next.port_surcharge) : num(next.transport_cost)
    next.heat_loss = heatLoss
    next.forged_weight = forged
    next.recover_weight = recover
    next.material_cost = materialCost
    next.total_process_cost = totalProcess
    next.net_price = (materialCost + totalProcess) * num(next.profit_rate, 1.07) + (freight * netWeight) / 1000
    next.ht_loss = 0
    next.ht_blanking_weight = 0
    next.gas_loss = 0
    next.tax_inclusive_price = region === 'france' ? next.net_price * (1 + num(next.vat_rate) / 100) : 0
    return next
  }

  const blanking = num(next.blanking_weight)
  const gasLoss = num(next.gas_loss)
  const netWeight = num(next.net_weight)
  const htLoss = gasLoss * 2
  const denom = 1 - htLoss
  const htBlanking = Math.abs(denom) > 1e-12 ? blanking / denom : 0
  const forged = htBlanking * (1 - gasLoss - htLoss)
  const recover = forged - netWeight
  const materialCost = (num(next.steel_price) * htBlanking - recover * num(next.scrap_price)) / 1000
  const processSum =
    num(next.blanking_cost) +
    num(next.forging_cost) +
    num(next.ring_rolling_cost) +
    num(next.machining_cost) +
    num(next.drilling_cost) +
    num(next.grounding_hole_cost) +
    num(next.hoisting_hole_cost) +
    num(next.packing_cost) +
    num(next.other_cost) +
    num(next.ptfe_hole_cost) +
    num(next.m6_hole_cost) +
    num(next.ht_machining_extra)
  const htPart = ((num(next.heat_treatment_cost) + num(next.ht_freight_cost)) * htBlanking * (1 - gasLoss)) / 1000
  const totalProcess = (processSum * netWeight) / 1000 + htPart
  const freight = region === 'france' ? num(next.transport_cost) + num(next.port_surcharge) : num(next.transport_cost)
  next.ht_loss = htLoss
  next.ht_blanking_weight = htBlanking
  next.forged_weight = forged
  next.recover_weight = recover
  next.material_cost = materialCost
  next.total_process_cost = totalProcess
  next.net_price = (materialCost + totalProcess) * num(next.profit_rate, 1.07) + (freight * netWeight) / 1000
  next.heat_loss = 0
  next.tax_inclusive_price = region === 'france' ? next.net_price * (1 + num(next.vat_rate) / 100) : 0
  return next
}

export const PRICE_SPLIT_COMPARE_FIELDS: (keyof PriceSplitRow)[] = [
  'steel_price',
  'blanking_weight',
  'ht_blanking_weight',
  'forged_weight',
  'ht_loss',
  'gas_loss',
  'heat_loss',
  'net_weight',
  'recover_weight',
  'scrap_price',
  'blanking_cost',
  'forging_cost',
  'heat_treatment_cost',
  'ht_freight_cost',
  'ring_rolling_cost',
  'machining_cost',
  'ht_machining_extra',
  'drilling_cost',
  'grounding_hole_cost',
  'hoisting_hole_cost',
  'through_hole_cost',
  'ptfe_hole_cost',
  'm6_hole_cost',
  'packing_cost',
  'other_cost',
  'transport_cost',
  'port_surcharge',
  'profit_rate',
  'material_cost',
  'total_process_cost',
  'net_price',
  'vat_rate',
  'tax_inclusive_price',
]

export function priceSplitPriceChanged(before: PriceSplitRow, after: PriceSplitRow) {
  return PRICE_SPLIT_COMPARE_FIELDS.some((key) => Math.abs(num(before[key]) - num(after[key])) > 1e-6)
}

export function priceSplitRowFromApi(row: Omit<PriceSplitRow, 'key'> & { id: number; material_group?: string }): PriceSplitRow {
  const group: PriceSplitGroup = String(row.material_group || '').toUpperCase() === 'SS' ? 'SS' : 'A105'
  const base = emptyPriceSplitRow(group, row.id)
  return {
    ...base,
    ...row,
    key: String(row.id),
    material_group: group,
    dn: num(row.dn),
    year_usage: num(row.year_usage),
    excel_net_price: row.excel_net_price == null ? null : num(row.excel_net_price),
    vat_rate: row.vat_rate == null || row.vat_rate === ('' as unknown as number) ? null : num(row.vat_rate),
  }
}
