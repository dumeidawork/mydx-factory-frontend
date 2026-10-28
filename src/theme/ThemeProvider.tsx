import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ThemeConfig } from 'antd'
import { getStoredUser } from '../utils/auth'
import {
  buildAntdTheme,
  getTheme,
  normalizeColorTheme,
} from './themes'
import type { AppTheme, ColorThemeId } from './types'
import './theme.css'

type ColorThemeContextValue = {
  themeId: ColorThemeId
  theme: AppTheme
  antdTheme: ThemeConfig
  setThemeId: (id: ColorThemeId) => void
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null)

function applyDocumentTheme(id: ColorThemeId) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = id
}

function readStoredThemeId(): ColorThemeId {
  const id = normalizeColorTheme(getStoredUser()?.color_theme)
  applyDocumentTheme(id)
  return id
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ColorThemeId>(readStoredThemeId)

  const setThemeId = useCallback((id: ColorThemeId) => {
    const next = normalizeColorTheme(id)
    applyDocumentTheme(next)
    setThemeIdState(next)
  }, [])

  const theme = useMemo(() => getTheme(themeId), [themeId])
  const antdTheme = useMemo(() => buildAntdTheme(theme), [theme])

  const value = useMemo(
    () => ({ themeId, theme, antdTheme, setThemeId }),
    [themeId, theme, antdTheme, setThemeId],
  )

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>
}

export function useColorTheme(): ColorThemeContextValue {
  const ctx = useContext(ColorThemeContext)
  if (!ctx) {
    throw new Error('useColorTheme must be used within ColorThemeProvider')
  }
  return ctx
}
