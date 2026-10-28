export const DIM_FIELDS = [
  'od_d',
  'id_c',
  'thk_t',
  'thk_f',
  'mouth_m',
  'mouth_n',
  'center_k',
  'seat_a',
  'seat_h_f',
  'id_small_d',
  'id_large_e',
  'r_val',
  'r1_val',
  'r2_val',
  'e_val',
  's_neck',
  'hole_h',
  'hole_n',
  'hole_h2',
  'hole_n2',
  'pcd2',
  'thru_c',
  'side_hole',
  'side_hole_depth',
  'side_a',
  'side_a_depth',
  'side_b',
  'side_b_depth',
  'bottom_hole',
  'weld_theta',
  'v1_deg',
  'v2_deg',
  'g_val',
  'f_depth',
  'unit_weight',
] as const

export type DimFieldKey = (typeof DIM_FIELDS)[number]

export const DIM_LABELS: Record<string, string> = {
  spec_model: '规格型号',
  od_d: '外径',
  id_c: '内径',
  thk_t: '厚度',
  thk_f: '总厚度',
  mouth_m: '上口',
  mouth_n: '下口',
  center_k: '中心距',
  seat_a: '台径',
  seat_h_f: '台高',
  id_small_d: '小内径',
  id_large_e: '大内径',
  r_val: 'R',
  r1_val: 'R1',
  r2_val: 'R2',
  e_val: 'E',
  s_neck: '嘴部厚度',
  hole_h: '孔径',
  hole_n: '孔数',
  hole_h2: 'H2孔径',
  hole_n2: 'N2孔数',
  pcd2: 'PCD2中心距',
  thru_c: '通孔C',
  side_hole: '侧孔',
  side_hole_depth: '侧孔深度',
  side_a: '侧孔A',
  side_a_depth: '侧孔A深度',
  side_b: '侧孔B',
  side_b_depth: '侧孔B深度',
  bottom_hole: '底孔',
  weld_theta: '焊口θ',
  v1_deg: 'V1°',
  v2_deg: 'V2°',
  g_val: 'G',
  f_depth: 'F深度',
  unit_weight: '单重',
}

export const CORE_LIST_DIM_KEYS = ['spec_model', 'od_d', 'id_c', 'thk_t', 'unit_weight'] as const

const SKIP = new Set(['件数', '数量', '数量件', '数量(件)', '序号', '名称', '备注'].map(normalizeHeader))

export function normalizeHeader(raw: string): string {
  let text = String(raw || '').replace(/\u00a0/g, ' ')
  const inners: string[] = []
  text = text.replace(/[（(]([^）)]*)[）)]/g, (_m, inner: string) => {
    inners.push(inner)
    return ''
  })
  text = `${text}${inners.join('')}`
  return text
    .replace(/\s+/g, '')
    .replace(/\*+/g, '')
    .replace(/[±+\-－—]\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?$/g, '')
    .replace(/[≧≥°]/g, '')
    .toLowerCase()
}

const RAW_ALIASES: Record<string, string[]> = {
  spec_model: ['规格型号', '规格'],
  od_d: ['D外径', 'A外径', '外径'],
  id_c: ['C内径', 'B内径', '内径'],
  thk_t: ['T厚度', 'B厚度', 'C厚度', '盘厚', '厚度'],
  thk_f: ['F总厚度', '总厚度', '总厚'],
  mouth_m: ['M上口', 'F上口', '上口'],
  mouth_n: ['N下口', '下口'],
  center_k: ['K中心距', 'S11中心距', 'S11', '中心距'],
  seat_a: ['A台径', 'RF台径', '台径'],
  seat_h_f: ['f台高', 'F台高', 'f1台高', '台高'],
  id_small_d: ['D小内径', '小内径'],
  id_large_e: ['E大内径', '大内径'],
  r_val: ['R值'],
  r1_val: ['R1'],
  r2_val: ['R2'],
  e_val: ['E≧', 'E≥'],
  s_neck: ['嘴部厚度', 'S嘴部厚度'],
  hole_h: ['H1孔径', 'H孔径', 'S9孔径', 'S9', '孔径'],
  hole_n: ['N1孔数', 'N孔数', 'S10孔数', 'S10', '孔数'],
  hole_h2: ['H2孔径', 'H2'],
  hole_n2: ['N2孔数', 'N2'],
  pcd2: ['PCD2中心距', 'PCD2'],
  thru_c: ['通孔C', '通孔'],
  side_hole_depth: ['侧孔深度最小', '侧孔深度'],
  side_hole: ['侧孔'],
  side_a_depth: ['侧孔A深度最小', '侧孔A深度'],
  side_a: ['侧孔A'],
  side_b_depth: ['侧孔B深度'],
  side_b: ['侧孔B'],
  bottom_hole: ['底孔深度', '底孔'],
  weld_theta: ['焊口θ', '焊口'],
  v1_deg: ['V1°', 'V1'],
  v2_deg: ['V2°', 'V2'],
  g_val: [],
  f_depth: ['F深度'],
  unit_weight: ['单重'],
}

const exact = new Map<string, string>()
const pairs: Array<[string, string]> = []
for (const [key, aliases] of Object.entries(RAW_ALIASES)) {
  const label = DIM_LABELS[key] || key
  for (const alias of [label, key, ...aliases]) {
    const n = normalizeHeader(alias)
    if (!n) continue
    if (!exact.has(n)) exact.set(n, key)
    pairs.push([n, key])
  }
}
pairs.sort((a, b) => b[0].length - a[0].length)

const WEAK_LETTER: Record<string, string> = {
  [normalizeHeader('D')]: 'od_d',
  [normalizeHeader('B')]: 'id_c',
  [normalizeHeader('C')]: 'thk_t',
  [normalizeHeader('H')]: 'thk_f',
  [normalizeHeader('A')]: 'mouth_m',
  [normalizeHeader('N')]: 'mouth_n',
  [normalizeHeader('K')]: 'center_k',
  [normalizeHeader('d')]: 'seat_a',
  [normalizeHeader('f1')]: 'seat_h_f',
  [normalizeHeader('t')]: 'seat_h_f',
  [normalizeHeader('L')]: 'hole_h',
  [normalizeHeader('h')]: 'hole_h',
  [normalizeHeader('n')]: 'hole_n',
  [normalizeHeader('E')]: 'e_val',
  [normalizeHeader('S')]: 's_neck',
  [normalizeHeader('G')]: 'g_val',
  [normalizeHeader('R')]: 'r_val',
}

export function matchHeader(raw: string): string | null {
  const n = normalizeHeader(raw)
  if (!n || SKIP.has(n)) return null
  const hit = exact.get(n)
  if (hit) return hit
  let bestKey: string | null = null
  let bestLen = 0
  for (const [alias, key] of pairs) {
    if (alias && n.includes(alias) && alias.length > bestLen) {
      bestKey = key
      bestLen = alias.length
    }
  }
  return bestKey || WEAK_LETTER[n] || null
}

export const SOURCE_FIELD_KEYS = ['spec_model', ...DIM_FIELDS] as const

export type SourceFieldKey = (typeof SOURCE_FIELD_KEYS)[number]
