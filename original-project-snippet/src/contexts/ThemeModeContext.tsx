import { createContext, useContext, useMemo, useState } from 'react'
import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material'
import type { PaletteMode } from '@mui/material'
import { createBistTheme } from '../theme/bistTheme'

interface ThemeModeContextValue {
  mode: PaletteMode
  toggleTheme: () => void
  setMode: (mode: PaletteMode) => void
}

const STORAGE_KEY = 'lr.theme.mode'

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

function getInitialMode(): PaletteMode {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<PaletteMode>(getInitialMode)

  function setMode(nextMode: PaletteMode) {
    window.localStorage.setItem(STORAGE_KEY, nextMode)
    setModeState(nextMode)
  }

  function toggleTheme() {
    setMode(mode === 'light' ? 'dark' : 'light')
  }

  const theme = useMemo(() => createBistTheme(mode), [mode])
  const value = useMemo(() => ({ mode, toggleTheme, setMode }), [mode])

  return (
    <ThemeModeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext)
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeModeProvider')
  }
  return context
}
