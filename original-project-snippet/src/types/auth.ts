// Roles are dynamic now — admins create them at runtime — so RoleCode is an
// open string. Only ADMIN is referenced by name in the frontend.
export type RoleCode = string
export type PageCode = string

export const ADMIN_ROLE = 'ADMIN'

/**
 * The identity the UI gates on: returned by /login and /refresh, always
 * consistent with the access token issued next to it. `pages` is what the
 * sidebar/routes check; ADMIN users already have every page in the list
 * (the backend computes that), so the UI needs no ADMIN special-casing
 * except for the admin page itself.
 */
export interface SessionUser {
  username: string
  fullName: string
  email: string | null
  organization: string | null
  employeeId: string
  roles: RoleCode[]
  pages: PageCode[]
}

export interface TokenPairResponse {
  accessToken: string
  refreshToken: string
  user: SessionUser
}

/** GET /api/auth/me — live truth from the DB (the token is a snapshot). */
export interface MeResponse extends SessionUser {
  lastLoggedIn: string | null
}

export interface LoginCredentials {
  username: string
  password: string
  captchaId?: string
  answer?: string
}

export interface AuthContextValue {
  user: SessionUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  hasRole: (role: RoleCode) => boolean
  hasAnyRole: (roles: RoleCode[]) => boolean
  canSeePage: (page: PageCode) => boolean
}

export interface CaptchaCreateRequest {
  previousCaptchaId?: string | null
}

export interface CaptchaCreateResponse {
  captchaId: string
  expiresAtEpochMs: number
  imageBase64: string
}

export interface CaptchaVerifyRequest {
  captchaId: string
  answer: string
}

export interface CaptchaVerifyResponse {
  success: boolean
  message: string
}
