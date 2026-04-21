import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  clearPendingPasswordChange,
  getDefaultRouteByRole,
  getPendingPasswordChange,
  getStoredSession,
  isDriverRole,
  saveAuthSession,
} from '../auth/session'
import { api } from '../services/api/client'

interface FieldErrors {
  newPassword?: string
  confirmPassword?: string
}

const STRONG_PASSWORD_MESSAGE =
  'Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)'

function getRedirectPath(requestedPath: string | null | undefined, role?: string | null) {
  const fallbackPath = getDefaultRouteByRole(role)
  const canUseRequestedPath =
    !!requestedPath &&
    ((requestedPath.startsWith('/driver') && isDriverRole(role)) ||
      (requestedPath.startsWith('/dispatch') && !isDriverRole(role)) ||
      requestedPath === '/profile')

  return canUseRequestedPath ? requestedPath : fallbackPath
}

function isStrongPassword(value: string) {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  )
}

export const FirstLoginPasswordChangePage: React.FC = () => {
  const navigate = useNavigate()
  const pendingSession = getPendingPasswordChange()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const session = getStoredSession()
    if (session?.user && session.accessToken) {
      navigate(getDefaultRouteByRole(session.user.VaiTro), { replace: true })
      return
    }

    if (!pendingSession) {
      navigate('/login', { replace: true })
    }
  }, [navigate, pendingSession])

  const clearFormError = () => {
    if (error) {
      setError(null)
    }
  }

  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value)
    setFieldErrors((prev) => ({ ...prev, newPassword: undefined }))
    clearFormError()
  }

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value)
    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
    clearFormError()
  }

  const validate = () => {
    const nextErrors: FieldErrors = {}

    if (!newPassword) {
      nextErrors.newPassword = 'Vui lòng nhập mật khẩu mới'
    } else if (!isStrongPassword(newPassword)) {
      nextErrors.newPassword = STRONG_PASSWORD_MESSAGE
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Vui lòng nhập lại mật khẩu'
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = 'Mật khẩu nhập lại không khớp'
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const renderEyeIcon = (visible: boolean) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {visible ? (
        <>
          <path
            d="M12 5C7 5 3.27 8.11 2 12C3.27 15.89 7 19 12 19C17 19 20.73 15.89 22 12C20.73 8.11 17 5 12 5Z"
            stroke="#1E5FA8"
            strokeWidth="1.8"
          />
          <path
            d="M12 9C9.79 9 8 10.79 8 13C8 15.21 9.79 17 12 17C14.21 17 16 15.21 16 13C16 10.79 14.21 9 12 9Z"
            stroke="#1E5FA8"
            strokeWidth="1.8"
          />
        </>
      ) : (
        <>
          <path d="M3 4L21 20" stroke="#1E5FA8" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M10.58 5.08C11.04 5.02 11.51 5 12 5C17 5 20.73 8.11 22 12C21.64 13.15 21.01 14.23 20.18 15.18"
            stroke="#1E5FA8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M6.2 6.2C4.47 7.37 3.18 9.04 2.5 11C3.77 14.89 7.5 18 12.5 18C13.78 18 15 17.78 16.12 17.38"
            stroke="#1E5FA8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!pendingSession) {
      navigate('/login', { replace: true })
      return
    }

    if (!validate()) {
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/change-password-first-login', {
        token: pendingSession.passwordChangeToken,
        newPassword,
        confirmPassword,
      })

      clearPendingPasswordChange()
      saveAuthSession(res.data.user, res.data.accessToken, pendingSession.remember)
      navigate(getRedirectPath(pendingSession.redirectPath, res.data.user?.VaiTro), {
        replace: true,
      })
    } catch (error: unknown) {
      const err = error as {
        response?: {
          data?: {
            message?: string
            data?: {
              fieldErrors?: FieldErrors
            }
          }
        }
      }

      const backendFieldErrors = err.response?.data?.data?.fieldErrors
      if (backendFieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...backendFieldErrors }))
      }

      setError(err.response?.data?.message ?? 'Không thể đổi mật khẩu lần đầu')
    } finally {
      setLoading(false)
    }
  }

  if (!pendingSession) {
    return null
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: 'linear-gradient(153deg, #1E5FA8 0%, #DBEAFE 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 1024,
          maxWidth: '95%',
          height: 617,
          display: 'flex',
          background: '#fff',
          boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.25)',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#D2EAFF',
          }}
        >
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: '50%',
              background: '#fff',
              border: '4px solid #1E5FA8',
              position: 'absolute',
              left: '50%',
              top: 112.5,
              transform: 'translateX(-50%)',
              boxShadow:
                '0px 4px 6px -4px rgba(0,0,0,0.10), 0px 10px 15px -3px rgba(0,0,0,0.10)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" fill="#1E5FA8" style={{ width: 72, height: 72 }}>
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.28 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01ZM6.85 7H17.14L18.22 10H5.78L6.85 7ZM6.5 16C5.67 16 5 15.33 5 14.5C5 13.67 5.67 13 6.5 13C7.33 13 8 13.67 8 14.5C8 15.33 7.33 16 6.5 16ZM17.5 16C16.67 16 16 15.33 16 14.5C16 13.67 16.67 13 17.5 13C18.33 13 19 13.67 19 14.5C19 15.33 18.33 16 17.5 16Z" />
            </svg>
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 272.5,
              transform: 'translateX(-50%)',
              width: 353,
              textAlign: 'center',
              color: '#054285',
              fontSize: 32,
              fontWeight: 700,
              lineHeight: '1.3',
            }}
          >
            HỆ THỐNG QUẢN LÝ
            <br />
            VÀ ĐIỀU PHỐI
            <br />
            LỘ TRÌNH XE
            <br />
            TRUNG CHUYỂN
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 40,
              transform: 'translateX(-50%)',
              width: 355,
              textAlign: 'center',
              color: '#4A4A4A',
              fontSize: 17,
            }}
          >
            Giải pháp tối ưu hóa vận chuyển thông minh
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: '#1E5FA8',
            color: '#fff',
            padding: '48px 48px 64px',
            position: 'relative',
          }}
        >
          <h1
            style={{
              textAlign: 'center',
              fontSize: 32,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            ĐỔI MẬT KHẨU LẦN ĐẦU
          </h1>
          <p
            style={{
              textAlign: 'center',
              opacity: 0.85,
              marginBottom: 32,
            }}
          >
            Tài khoản <strong>{pendingSession.user.TenDangNhap}</strong> cần đổi mật khẩu trước khi
            tiếp tục
          </p>

          <form onSubmit={handleSubmit} style={{ maxWidth: 416, margin: '0 auto' }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>Mật khẩu mới</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: fieldErrors.newPassword
                  ? '2px solid rgba(248,113,113,0.9)'
                  : '2px solid rgba(255,255,255,0.3)',
                marginBottom: 8,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '12px 40px 12px 16px',
                  fontSize: 16,
                  borderRadius: 8,
                }}
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChange={(e) => handleNewPasswordChange(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderEyeIcon(showNewPassword)}
              </button>
            </div>
            <div
              style={{
                minHeight: 20,
                marginBottom: 12,
                color: '#FEE2E2',
                fontSize: 14,
              }}
            >
              {fieldErrors.newPassword || ''}
            </div>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>
              Nhập lại mật khẩu mới
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: fieldErrors.confirmPassword
                  ? '2px solid rgba(248,113,113,0.9)'
                  : '2px solid rgba(255,255,255,0.3)',
                marginBottom: 8,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '12px 40px 12px 16px',
                  fontSize: 16,
                  borderRadius: 8,
                }}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderEyeIcon(showConfirmPassword)}
              </button>
            </div>
            <div
              style={{
                minHeight: 20,
                marginBottom: 12,
                color: '#FEE2E2',
                fontSize: 14,
              }}
            >
              {fieldErrors.confirmPassword || ''}
            </div>

            <div
              style={{
                maxHeight: error ? '100px' : '0',
                opacity: error ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 0.3s ease-in-out',
                marginBottom: error ? 12 : 0,
              }}
            >
              <div
                style={{
                  background: 'rgba(248,113,113,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#FEE2E2',
                }}
              >
                {error}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 8,
                border: 'none',
                background: '#F39C12',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Đang xử lý...' : 'ĐỔI MẬT KHẨU'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
