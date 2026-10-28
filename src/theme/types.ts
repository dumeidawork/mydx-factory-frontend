export const COLOR_THEME_IDS = [
  'classic-blue',
  'morandi-fog',
  'morandi-rose',
  'morandi-sage',
  'macaron-mint',
  'macaron-peach',
  'macaron-lilac',
  'guohua-landscape',
  'guohua-cinnabar',
  'guohua-ink',
  'oil-autumn',
  'oil-venetian',
  'oil-umber',
] as const

export type ColorThemeId = (typeof COLOR_THEME_IDS)[number]

export type ThemeCategory = 'classic' | 'morandi' | 'macaron' | 'guohua' | 'oil'

export const THEME_CATEGORIES: ThemeCategory[] = [
  'classic',
  'morandi',
  'macaron',
  'guohua',
  'oil',
]

export const DEFAULT_COLOR_THEME: ColorThemeId = 'classic-blue'

export type NavTheme = 'dark' | 'light'

export type AppTheme = {
  id: ColorThemeId
  category: ThemeCategory
  navTheme: NavTheme
  colorPrimary: string
  colorPrimaryHover: string
  colorPrimaryDark: string
  colorPrimaryBg: string
  navBg: string
  brandText: string
  navText: string
  navTextMuted: string
  navBorder: string
  navFooterBg: string
  contentBg: string
  contentGradient: string
  heroGradient: string
}
