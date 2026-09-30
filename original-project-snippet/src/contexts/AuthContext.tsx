import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AUTH_UNAUTHORIZED_EVENT,
  setAccessToken,
  setRefreshHandler,
} from '../services/apiClient'
import * as authService from '../services/authService'
import type {
  AuthContextValue,
  LoginCredentials,
  SessionUser,
  TokenPairResponse,
} from '../types/auth'

// Only the refresh token is persisted; the access token lives in memory and
// is re-derived on every page load via /refresh (which also re-reads roles
// and pages from the DB — that is the mechanism that keeps them fresh).
const REFRESH_TOKEN_STORAGE_KEY = 'lr.refreshToken'

// Renew the day pass one minute before it expires.
const REFRESH_MARGIN_MS = 60_000
const FALLBACK_REFRESH_MS = 10 * 60_000

function accessTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshTokenRef = useRef<string | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  // Single-flight: concurrent 401s and the proactive timer share one refresh.
  const inflightRefreshRef = useRef<Promise<string | null> | null>(null)

  const clearSession = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    refreshTokenRef.current = null
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    setAccessToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback((): Promise<string | null> => {
    if (inflightRefreshRef.current) {
      return inflightRefreshRef.current
    }

    const stored = refreshTokenRef.current
    if (!stored) {
      return Promise.resolve(null)
    }

    const attempt = authService
      .refreshSession(stored)
      .then((pair) => {
        applySession(pair)
        return pair.accessToken
      })
      .catch(() => {
        // Expired, rotated by another tab, or revoked: the session is over.
        clearSession()
        return null
      })
      .finally(() => {
        inflightRefreshRef.current = null
      })

    inflightRefreshRef.current = attempt
    return attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession])

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }

      const expiry = accessTokenExpiryMs(accessToken)
      const delay = expiry
        ? Math.max(expiry - Date.now() - REFRESH_MARGIN_MS, 10_000)
        : FALLBACK_REFRESH_MS

      refreshTimerRef.current = window.setTimeout(() => {
        void refresh()
      }, delay)
    },
    [refresh],
  )

  function applySession(pair: TokenPairResponse) {
    setAccessToken(pair.accessToken)
    refreshTokenRef.current = pair.refreshToken
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, pair.refreshToken)
    setUser(pair.user)
    scheduleRefresh(pair.accessToken)
  }

  const login = useCallback(async (credentials: LoginCredentials) => {
    const pair = await authService.login(credentials)
    applySession(pair)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = useCallback(() => {
    const token = refreshTokenRef.current
    clearSession()
    if (token) {
      // Best effort: local logout must not depend on the server answering.
      authService.logout(token).catch(() => undefined)
    }
  }, [clearSession])

  // Boot: a stored refresh token is exchanged for a fresh session.
  useEffect(() => {
    setRefreshHandler(() => refresh())

    const onUnauthorized = () => clearSession()
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized)

    const stored = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
    if (stored) {
      refreshTokenRef.current = stored
      void refresh().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }

    return () => {
      setRefreshHandler(null)
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized)
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      hasRole: (role) => user?.roles.includes(role) ?? false,
      hasAnyRole: (roles) => roles.some(role => user?.roles.includes(role)),
      canSeePage: (page) => user?.pages.includes(page) ?? false,
    }),
    [user, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }

  return context
}
