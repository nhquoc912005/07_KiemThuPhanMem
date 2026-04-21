import React, { useEffect, useMemo, useState } from 'react'
import { DispatcherLayout } from '../components/DispatcherLayout'
import { DriverLayout } from '../components/DriverLayout'
import { getStoredUser, isDriverRole } from '../auth/session'
import { api } from '../services/api/client'

interface ProfileUser {
  MaTaiKhoan: number
  TenDangNhap: string
  VaiTro: string
  TrangThaiTaiKhoan?: boolean
  SoDienThoai?: string
  HoTen?: string
  MaTaiXe?: number | null
  MaNhanVien?: number | null
}

export const ProfilePage: React.FC = () => {
  const sessionUser = getStoredUser()
  const isDriver = isDriverRole(sessionUser?.VaiTro)
  const Layout = isDriver ? DriverLayout : DispatcherLayout

  const [profile, setProfile] = useState<ProfileUser | null>(null)
  const [loading, setLoading] = useState(Boolean(sessionUser))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      if (!sessionUser) return

      setLoading(true)
      setError(null)

      try {
        const res = await api.get<ProfileUser>('/auth/me')
        setProfile(res.data)
      } catch (e) {
        const err = e as { response?: { data?: { message?: string } } }
        setError(err?.response?.data?.message ?? 'Không thể tải hồ sơ người dùng.')
        setProfile(sessionUser)
      } finally {
        setLoading(false)
      }
    }

    void fetchProfile()
  }, [sessionUser])

  const displayUser = useMemo(() => profile || sessionUser, [profile, sessionUser])
  const accountStatusLabel = displayUser?.TrangThaiTaiKhoan === false ? 'Đã khóa' : 'Đang hoạt động'
  const accountStatusColor = displayUser?.TrangThaiTaiKhoan === false ? '#991B1B' : '#166534'

  if (!sessionUser) {
    return (
      <Layout>
        <div style={{ padding: 60, textAlign: 'center', color: '#64748B', fontSize: 18, fontWeight: 500 }}>
          Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', minHeight: '80vh' }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#FFFFFF', borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid rgba(229, 231, 235, 0.8)' }}>
          <div style={{ height: 160, background: 'linear-gradient(135deg, #1E5FA8 0%, #0C476F 100%)', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: -45, left: '50%', transform: 'translateX(-50%)', width: 90, height: 90, background: '#FFFFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '4px solid #FFFFFF' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1E5FA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
          </div>

          <div style={{ padding: '64px 32px 32px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
              {displayUser?.HoTen || displayUser?.TenDangNhap || 'Người dùng'}
            </h2>
            <div style={{ color: '#64748B', marginBottom: 12 }}>{displayUser?.TenDangNhap}</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <span style={{ background: isDriver ? '#DCFCE7' : '#DBEAFE', color: isDriver ? '#166534' : '#1E3A8A', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {displayUser?.VaiTro || 'Không xác định'}
              </span>
            </div>

            {loading && <div style={{ marginBottom: 16, color: '#64748B' }}>Đang tải hồ sơ từ hệ thống...</div>}
            {error && <div style={{ marginBottom: 16, color: '#B91C1C' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <InfoCard title="Số điện thoại liên lạc" value={displayUser?.SoDienThoai || 'Chưa cập nhật'} />
              <InfoCard title="Trạng thái tài khoản" value={accountStatusLabel} valueColor={accountStatusColor} />
              <InfoCard title="Mã hồ sơ" value={isDriver ? `TX${String(displayUser?.MaTaiXe || '').padStart(3, '0')}` : `NV${String(displayUser?.MaNhanVien || '').padStart(3, '0')}`} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

const InfoCard: React.FC<{ title: string; value: string; valueColor?: string }> = ({ title, value, valueColor = '#0F172A' }) => (
  <div style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', padding: '16px 20px', borderRadius: 16, border: '1px solid #F1F5F9', gap: 16 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
    </div>
    <div style={{ textAlign: 'left' }}>
      <div style={{ color: '#64748B', fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{title}</div>
      <div style={{ color: valueColor, fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  </div>
)
