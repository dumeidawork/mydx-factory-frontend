/** 与 order_details.order_status 一致，供质检列表筛选 */
export const ORDER_STATUS_OPTIONS = [
  '开始',
  '分割',
  '加工',
  '入库',
  '质检',
  '再加工',
  '包装',
  '装箱',
  '打包',
  '发货',
  '完成',
] as const

export const CHEM_FIELDS = [
  { key: 'C', label: '碳 C' },
  { key: 'Mn', label: '锰 Mn' },
  { key: 'P', label: '磷 P' },
  { key: 'S', label: '硫 S' },
  { key: 'Si', label: '硅 Si' },
  { key: 'Cu', label: '铜 Cu' },
  { key: 'Ni', label: '镍 Ni' },
  { key: 'Cr', label: '铬 Cr' },
  { key: 'Mo', label: '钼 Mo' },
  { key: 'V', label: '钒 V' },
  { key: 'CEQ', label: '碳当量 CEQ' },
]

export const DALIAN_MECH_COLUMNS = [
  { title: '组别', dataIndex: 'group' },
  { title: '炉号', dataIndex: 'heat_no' },
  { title: '零件号', dataIndex: 'part_no' },
  { title: '规格', dataIndex: 'spec' },
  { title: '屈服强度', dataIndex: 'yield_strength' },
  { title: '抗拉强度', dataIndex: 'tensile_strength' },
  { title: '伸长率', dataIndex: 'elongation' },
  { title: '断面收缩率', dataIndex: 'reduction_area' },
  { title: '硬度', dataIndex: 'hardness' },
  { title: '冲击试验', dataIndex: 'impact_test' },
]
