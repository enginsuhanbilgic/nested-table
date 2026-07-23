export type Role =
  'ROLE_STANDARD_USER' |
  'ROLE_ILETISIM_KANALLARI' |
  'ROLE_ADMIN'

export interface User {
  employeeId: string
  username: string
  fullName: string
  organization: string
  email: string
  memberOf: string[]
  roles: Role[]
}

export interface LoginCredentials {
  username: string
  password: string
  captchaId?: string
  answer?: string
}

/**
 * Backend login payload as described:
 * /login returns jwt + user identity fields.
 * employeeId is also read from employeeId defensively because the backend contract was described once as employeeId.
 */
export interface LoginResponseDto {
  jwt: string
}

export interface AuthSession {
  jwt: string
  user: User
}

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  hasAnyRole: (roles: Role[]) => boolean
  hasAllRoles: (roles: Role[]) => boolean
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
