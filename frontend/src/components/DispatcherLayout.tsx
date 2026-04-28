import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuthSession, getStoredUser } from '../auth/session';
import { api } from '../services/api/client';

interface DispatcherLayoutProps {
  children: React.ReactNode;
  activeSubTab?: 'overview' | 'plan' | 'adjust' | 'track';
}

function getDisplayInitials() {
  const user = getStoredUser();
  if (!user) return 'U';

  const source = user.HoTen || user.TenDangNhap || 'User';
  return (
    source
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

export const DispatcherLayout: React.FC<DispatcherLayoutProps> = ({
  children,
  activeSubTab = 'overview'
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const userInitials = getDisplayInitials();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout transport errors because auth is stateless on the backend.
    } finally {
      clearAuthSession();
      navigate('/login');
    }
  };

  const getMainNavClass = (active: boolean) => `layout-nav-tab ${active ? 'active' : ''}`;
  const getSubNavClass = (key: DispatcherLayoutProps['activeSubTab']) => `layout-subnav-tab ${key === activeSubTab ? 'active' : ''}`;
  const pathname = location.pathname;


  return (
    <div className="layout-wrapper">
      {/* Background hình bến xe với độ hiển thị ~50% */}
      <div
        className="layout-bg"
        style={{ backgroundImage: "url('/images/bx-danang.png')" }}
      />

      <div className="layout-container">
        {/* Top header */}
        <header className="layout-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 41,
                height: 38,
                background: '#1E5FA8',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg viewBox="0 0 24 24" fill="#fff" style={{ width: 24, height: 24 }}>
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.28 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01ZM6.85 7H17.14L18.22 10H5.78L6.85 7ZM6.5 16C5.67 16 5 15.33 5 14.5C5 13.67 5.67 13 6.5 13C7.33 13 8 13.67 8 14.5C8 15.33 7.33 16 6.5 16ZM17.5 16C16.67 16 16 15.33 16 14.5C16 13.67 16.67 13 17.5 13C18.33 13 19 13.67 19 14.5C19 15.33 18.33 16 17.5 16Z" />
              </svg>
            </div>
            <div className="logo-text" style={{ fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: '#0A3B73' }}>ben</span>
              <span style={{ color: '#F39C12' }}>xedanang</span>
              <span>.</span>
              <span style={{ color: '#0A3B73' }}>vn</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              aria-label="Ảnh đại diện người dùng"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '2px solid rgba(30, 95, 168, 0.2)',
                background: 'linear-gradient(135deg, #1E5FA8 0%, #0A3B73 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14
              }}
            >
              {userInitials}
            </div>
            
            <button
              onClick={() => setShowLogoutConfirm(true)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
                color: '#1E293B',
                transition: 'color 0.2s',
              }}
              title="Đăng xuất"
              onMouseEnter={(e) => e.currentTarget.style.color = '#e11d48'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#1E293B'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        </header>
        {/* Main nav */}
        <nav className="layout-nav">
          <Link to="/dispatch/overview" style={{ textDecoration: 'none' }}>
            <div className={getMainNavClass(pathname.startsWith('/dispatch/overview') || pathname.startsWith('/dispatch/plan') || pathname.startsWith('/dispatch/adjust') || pathname.startsWith('/dispatch/track'))}>Điều phối lộ trình</div>
          </Link>
          <Link to="/dispatch/drivers" style={{ textDecoration: 'none' }}>
            <div className={getMainNavClass(pathname.startsWith('/dispatch/drivers'))}>Quản lý tài xế</div>
          </Link>
          <Link to="/dispatch/vehicles" style={{ textDecoration: 'none' }}>
            <div className={getMainNavClass(pathname.startsWith('/dispatch/vehicles'))}>Quản lý xe</div>
          </Link>
          <Link to="/dispatch/customers" style={{ textDecoration: 'none' }}>
            <div className={getMainNavClass(pathname.startsWith('/dispatch/customers'))}>Quản lý khách hàng</div>
          </Link>
          <Link to="/dispatch/reports" style={{ textDecoration: 'none' }}>
            <div className={getMainNavClass(pathname.startsWith('/dispatch/reports'))}>Báo cáo</div>
          </Link>
        </nav>

        {/* Sub tabs */}
        {pathname.match(/^\/dispatch\/(overview|plan|adjust|track)/) && (
          <div className="layout-subnav">
            <Link to="/dispatch/overview" style={{ textDecoration: 'none' }}>
              <div className={getSubNavClass('overview')}>Tổng quan</div>
            </Link>
            <Link to="/dispatch/plan" style={{ textDecoration: 'none' }}>
              <div className={getSubNavClass('plan')}>Lập kế hoạch lộ trình</div>
            </Link>
            <Link to="/dispatch/adjust" style={{ textDecoration: 'none' }}>
              <div className={getSubNavClass('adjust')}>Điều chỉnh lộ trình</div>
            </Link>
            <Link to="/dispatch/track" style={{ textDecoration: 'none' }}>
              <div className={getSubNavClass('track')}>Theo dõi trạng thái</div>
            </Link>
          </div>
        )}

        {/* Page body */}
        <main className="layout-main">
          {children}
        </main>

        {showLogoutConfirm && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#FFFFFF', padding: 24, borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s ease-out' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#111827', fontWeight: 600 }}>Xác nhận đăng xuất</h3>
              <p style={{ margin: '0 0 24px 0', color: '#4B5563', fontSize: 15 }}>Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowLogoutConfirm(false)} style={{ padding: '8px 16px', border: '1px solid #D1D5DB', background: '#FFFFFF', borderRadius: 6, cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Hủy</button>
                <button onClick={handleLogout} style={{ padding: '8px 16px', border: 'none', background: '#EF4444', color: '#FFFFFF', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Đăng xuất</button>
              </div>
            </div>
            <style>{`
              @keyframes fadeIn {
                  from { opacity: 0; transform: scale(0.95); }
                  to { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        )}

      </div>
    </div>
  );
};

