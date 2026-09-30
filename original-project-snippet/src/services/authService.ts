import { apiClient } from './apiClient'
import type {
  CaptchaCreateResponse,
  LoginCredentials,
  MeResponse,
  TokenPairResponse,
} from '../types/auth'

export async function login(credentials: LoginCredentials): Promise<TokenPairResponse> {
  const response = await apiClient.post<TokenPairResponse>('/auth/login', credentials)
  return response.data
}

export async function refreshSession(refreshToken: string): Promise<TokenPairResponse> {
  const response = await apiClient.post<TokenPairResponse>('/auth/refresh', { refreshToken })
  return response.data
}

/** Fire-and-forget on the caller side — logging out locally never waits on it. */
export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken })
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await apiClient.get<MeResponse>('/auth/me')
  return response.data
}

// Align the path with the existing captcha controller if it differs.
export async function createCaptcha(
  previousCaptchaId?: string | null,
): Promise<CaptchaCreateResponse> {
  const response = await apiClient.post<CaptchaCreateResponse>('/captcha/create', {
    previousCaptchaId: previousCaptchaId ?? null,
  })
  return response.data
}
