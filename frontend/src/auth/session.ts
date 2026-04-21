export interface AuthUser {
  MaTaiKhoan: number
  TenDangNhap: string
  VaiTro: string
  TrangThaiTaiKhoan?: boolean
  YeuCauDoiMatKhau?: boolean
  SoDienThoai?: string
  HoTen?: string
  MaTaiXe?: number | null
  MaNhanVien?: number | null
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  storage: Storage
}

const USER_KEY = 'user'
const ACCESS_TOKEN_KEY = 'accessToken'
const PENDING_PASSWORD_CHANGE_KEY = 'pendingPasswordChange'

export interface PendingPasswordChangeSession {
  user: AuthUser
  passwordChangeToken: string
  remember: boolean
  redirectPath?: string | null
}

function readSessionFrom(storage: Storage): AuthSession | null {
  const rawUser = storage.getItem(USER_KEY)
  const accessToken = storage.getItem(ACCESS_TOKEN_KEY)
  if (!rawUser || !accessToken) {
    return null
  }

  try {
    const user = JSON.parse(rawUser) as AuthUser
    if (!user || typeof user !== 'object' || !user.VaiTro || !user.TenDangNhap) {
      storage.removeItem(USER_KEY)
      storage.removeItem(ACCESS_TOKEN_KEY)
      return null
    }

    return { user, accessToken, storage }
  } catch {
    storage.removeItem(USER_KEY)
    storage.removeItem(ACCESS_TOKEN_KEY)
    return null
  }
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  return readSessionFrom(localStorage) || readSessionFrom(sessionStorage)
}

export function getStoredUser(): AuthUser | null {
  return getStoredSession()?.user ?? null
}

export function getStoredAccessToken(): string | null {
  return getStoredSession()?.accessToken ?? null
}

export function saveAuthSession(user: AuthUser, accessToken: string, remember: boolean) {
  const primaryStorage = remember ? localStorage : sessionStorage
  const secondaryStorage = remember ? sessionStorage : localStorage

  primaryStorage.setItem(USER_KEY, JSON.stringify(user))
  primaryStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  secondaryStorage.removeItem(USER_KEY)
  secondaryStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY)
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY)
}

export function savePendingPasswordChange(session: PendingPasswordChangeSession) {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.setItem(PENDING_PASSWORD_CHANGE_KEY, JSON.stringify(session))
}

export function getPendingPasswordChange(): PendingPasswordChangeSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = sessionStorage.getItem(PENDING_PASSWORD_CHANGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as PendingPasswordChangeSession
    if (!parsed?.passwordChangeToken || !parsed?.user?.TenDangNhap) {
      sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY)
      return null
    }

    return parsed
  } catch {
    sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY)
    return null
  }
}

export function clearPendingPasswordChange() {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.removeItem(PENDING_PASSWORD_CHANGE_KEY)
}

export function isDriverRole(role?: string | null) {
  return role === 'Tài xế'
}

export function isDispatcherRole(role?: string | null) {
  return role === 'Nhân viên điều phối'
}

export function getDefaultRouteByRole(role?: string | null) {
  return isDriverRole(role) ? '/driver/trips/assigned' : '/dispatch/overview'
}
