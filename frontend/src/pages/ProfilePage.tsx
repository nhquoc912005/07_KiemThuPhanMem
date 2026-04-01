import React from 'react';
import { DispatcherLayout } from '../components/DispatcherLayout';
import { DriverLayout } from '../components/DriverLayout';
import { getStoredUser, isDriverRole } from '../auth/session';

export const ProfilePage: React.FC = () => {
  const user = getStoredUser();
  const isDriver = isDriverRole(user?.VaiTro);
  const Layout = isDriver ? DriverLayout : DispatcherLayout;
  const accountStatusLabel = user?.TrangThaiTaiKhoan === false ? 'Đã khóa' : 'Đang hoạt động';
  const accountStatusColor = user?.TrangThaiTaiKhoan === false ? '#991B1B' : '#166534';

  if (!user) {
    return (
      <Layout>
        <div style={{ padding: 60, textAlign: 'center', color: '#64748B', fontSize: 18, fontWeight: 500 }}>
          Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', minHeight: '80vh' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: '#FFFFFF',
            borderRadius: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            border: '1px solid rgba(229, 231, 235, 0.8)',
            position: 'relative'
          }}
        >
          <div style={{ height: 160, background: 'linear-gradient(135deg, #1E5FA8 0%, #0C476F 100%)', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                bottom: -45,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 90,
                height: 90,
                background: '#FFFFFF',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                border: '4px solid #FFFFFF'
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1E5FA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
          </div>

          <div style={{ padding: '64px 32px 32px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {user.TenDangNhap}
            </h2>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <span style={{ background: isDriver ? '#DCFCE7' : '#DBEAFE', color: isDriver ? '#166534' : '#1E3A8A', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {user.VaiTro || 'Không xác định'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', padding: '16px 20px', borderRadius: 16, border: '1px solid #F1F5F9', gap: 16, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#64748B', fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Số điện thoại liên lạc</div>
                  <div style={{ color: '#0F172A', fontSize: 16, fontWeight: 700 }}>{user.SoDienThoai || 'Chưa cập nhật'}</div>
                </div>
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', padding: '16px 20px', borderRadius: 16, border: '1px solid #F1F5F9', gap: 16, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ color: '#64748B', fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Trạng thái tài khoản</div>
                  <div style={{ color: accountStatusColor, fontSize: 16, fontWeight: 700 }}>{accountStatusLabel}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32, padding: '16px', background: '#FEF2F2', borderRadius: 12, border: '1px solid #FEE2E2', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div style={{ textAlign: 'left', color: '#991B1B', fontSize: 13, lineHeight: '1.5' }}>
                Thông tin tài khoản được cố định trên hệ thống web chính của nhà xe bến xe trung tâm Đà Nẵng.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
