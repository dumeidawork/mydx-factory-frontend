import type { ReactNode } from 'react'
import {
  DashboardOutlined,
  FileTextOutlined,
  DollarOutlined,
  SafetyOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  CarOutlined,
  InboxOutlined,
  TeamOutlined,
  BuildOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FireOutlined,
  ClusterOutlined,
} from '@ant-design/icons'

export const ADMIN_ROLE_CODES = new Set(['super_admin', 'general_manager'])

export type NavItem = {
  key: string
  icon?: ReactNode
  labelKey: string
  adminOnly?: boolean
  children?: { key: string; labelKey: string }[]
}

export const NAV_SUBMENU_KEYS = [
  'partners',
  'contracts',
  'manufacturing',
  'production',
  'warehouse',
  'finance',
  'qc',
  'shippingMarks',
  'packing',
] as const

export const navItems: NavItem[] = [
  { key: '/', icon: <DashboardOutlined />, labelKey: 'nav.dashboard' },
  {
    key: 'partners',
    icon: <ClusterOutlined />,
    labelKey: 'nav.partners',
    children: [{ key: '/partners/dalian-siemens', labelKey: 'nav.partnersDalianSiemens' }],
  },
  {
    key: 'contracts',
    icon: <FileTextOutlined />,
    labelKey: 'nav.contracts',
    children: [
      { key: '/contracts/upload', labelKey: 'nav.contractsUpload' },
      { key: '/contracts/customer-packing', labelKey: 'nav.customerPacking' },
      { key: '/contracts/manual', labelKey: 'nav.contractsEntry' },
      { key: '/contracts/query', labelKey: 'nav.contractsQuery' },
      { key: '/contracts/split', labelKey: 'nav.contractsSplit' },
    ],
  },
  {
    key: 'manufacturing',
    icon: <BuildOutlined />,
    labelKey: 'nav.manufacturing',
    children: [
      { key: '/manufacturing/plan', labelKey: 'nav.manufacturingPlan' },
      { key: '/manufacturing/drawing-download', labelKey: 'nav.manufacturingDrawingDownload' },
      { key: '/manufacturing/typing', labelKey: 'nav.manufacturingTyping' },
    ],
  },
  { key: '/qc/heat-treatment', icon: <FireOutlined />, labelKey: 'nav.heatTreatment' },
  {
    key: 'production',
    icon: <ExperimentOutlined />,
    labelKey: 'nav.production',
    children: [
      { key: '/production/experiment', labelKey: 'nav.productionExperiment' },
      { key: '/production/materials', labelKey: 'nav.productionMaterials' },
      { key: '/production/drawings', labelKey: 'nav.productionDrawings' },
      { key: '/production/drawing-flange-types', labelKey: 'nav.productionDrawingFlangeTypes' },
      { key: '/production/price-split', labelKey: 'nav.productionPriceSplit' },
      { key: '/production/pallets', labelKey: 'nav.productionPallets' },
    ],
  },
  {
    key: 'warehouse',
    icon: <DatabaseOutlined />,
    labelKey: 'nav.warehouse',
    children: [
      { key: '/warehouse/aux', labelKey: 'nav.warehouseAux' },
      { key: '/warehouse/finished', labelKey: 'nav.warehouseFinished' },
    ],
  },
  {
    key: 'finance',
    icon: <DollarOutlined />,
    labelKey: 'nav.finance',
    children: [
      { key: '/finance/test-fee', labelKey: 'nav.financeTestFee' },
      { key: '/finance/other', labelKey: 'nav.financeOther' },
    ],
  },
  {
    key: 'qc',
    icon: <SafetyOutlined />,
    labelKey: 'nav.qc',
    children: [
      { key: '/qc/france', labelKey: 'nav.qcFrance' },
      { key: '/qc/dalian', labelKey: 'nav.qcDalian' },
    ],
  },
  { key: '/license', icon: <FileProtectOutlined />, labelKey: 'nav.license' },
  {
    key: 'packing',
    icon: <InboxOutlined />,
    labelKey: 'nav.packing',
    children: [
      { key: '/packing/france', labelKey: 'nav.packingFranceManual' },
      { key: '/packing/france-auto', labelKey: 'nav.packingFranceAuto' },
      { key: '/packing/dalian-manual', labelKey: 'nav.packingDalianManual' },
      { key: '/packing/dalian-auto', labelKey: 'nav.packingDalianAuto' },
    ],
  },
  {
    key: 'shippingMarks',
    icon: <CarOutlined />,
    labelKey: 'nav.shippingMarks',
    children: [
      { key: '/shipping-marks/france', labelKey: 'nav.shippingMarksFrance' },
      { key: '/shipping-marks/dalian', labelKey: 'nav.shippingMarksDalian' },
    ],
  },
  { key: '/users', icon: <TeamOutlined />, labelKey: 'nav.users', adminOnly: true },
  { key: '/resource-fetch', icon: <FolderOpenOutlined />, labelKey: 'nav.resourceFetch' },
]

const NESTED_PATH_PREFIXES = [
  '/partners/',
  '/contracts/',
  '/manufacturing/',
  '/production/',
  '/warehouse/',
  '/finance/',
  '/shipping-marks/',
  '/packing/',
]

export function selectedNavKeyFromPath(pathname: string): string {
  if (!pathname) return '/'
  if (pathname === '/contracts/materials') return '/contracts/manual'
  if (pathname === '/qc/heat-treatment') return pathname
  if (pathname === '/qc/france' || pathname === '/qc/dalian') return pathname
  if (NESTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return pathname
  return pathname
}

export function visibleNavItems(isAdmin: boolean): NavItem[] {
  return navItems.filter((item) => !item.adminOnly || isAdmin)
}

/** 当前路径所属的一级模块 key（叶子模块即其自身 key） */
export function moduleKeyFromPath(pathname: string): string {
  const selected = selectedNavKeyFromPath(pathname)
  for (const item of navItems) {
    if (item.key === selected) return item.key
    if (item.children?.some((child) => child.key === selected)) return item.key
  }
  return '/'
}

export function firstNavigablePath(item: NavItem): string {
  if (item.children?.length) return item.children[0].key
  return item.key
}

export type NavLeafPage = {
  key: string
  labelKey: string
  parentLabelKey?: string
  moduleKey: string
}

export function flattenNavLeaves(items: NavItem[]): NavLeafPage[] {
  const leaves: NavLeafPage[] = []
  for (const item of items) {
    if (item.children?.length) {
      for (const child of item.children) {
        leaves.push({
          key: child.key,
          labelKey: child.labelKey,
          parentLabelKey: item.labelKey,
          moduleKey: item.key,
        })
      }
    } else {
      leaves.push({
        key: item.key,
        labelKey: item.labelKey,
        moduleKey: item.key,
      })
    }
  }
  return leaves
}

/** 页面顶栏：有子菜单时返回「模块 / 小模块」对应的 i18n key */
export function navTitleKeysFromPath(pathname: string): { parentKey?: string; labelKey: string } {
  const key = selectedNavKeyFromPath(pathname)
  for (const item of navItems) {
    if (item.key === key) return { labelKey: item.labelKey }
    const child = item.children?.find((c) => c.key === key)
    if (child) return { parentKey: item.labelKey, labelKey: child.labelKey }
  }
  return { labelKey: 'nav.dashboard' }
}
