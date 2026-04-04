import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuthSession, getStoredUser } from '../auth/session';

interface DriverLayoutProps {
  children: React.ReactNode;
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

export const DriverLayout: React.FC<DriverLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const userInitials = getDisplayInitials();

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const isTabActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div
      className="driver-app-container layout-wrapper"
      style={{
        background: '#111827', // Nền cực tối cho phần dư ngoài 1440x1024
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* 
        Màn hình: fix với web browser (100% viewport)
        Outline: rgb(74, 74, 74)
        Font-chữ: Roboto
      */}
      <div className="driver-layout-container">
        <style>
          {`
            .driver-app-container, .driver-app-container * {
               font-family: 'Roboto', sans-serif;
            }
            .driver-tab {
              padding: 10px 24px;
              color: #FFFFFF; /* màu chữ: #FFFFFF */
              font-weight: 500;
              font-size: 15px;
              white-space: nowrap;
              transition: all 0.2s ease;
              opacity: 0.85;
              border-bottom: 2px solid transparent;
            }
            .driver-tab:hover {
              color: #F39C12 !important; /* hover: #F39C12 */
              opacity: 1 !important;
            }
            .driver-tab.active {
              color: #F39C12 !important; /* sáng màu #F39C12 khi active */
              font-weight: 700;
              opacity: 1 !important;
            }
          `}
        </style>

        {/* Nền background khôi phục */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: "url('/images/background.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header className="driver-layout-header">
            {/* Logo Section */}
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

            {/* User Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'}} onClick={() => navigate('/profile')}>
                <div
                  aria-label="Ảnh đại diện tài xế"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '2px solid #fff',
                    background: 'linear-gradient(135deg, #1E5FA8 0%, #0A3B73 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  {userInitials}
                </div>
              </div>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151', transition: 'color 0.2s' }}
                title="Đăng xuất"
                onMouseEnter={(e) => e.currentTarget.style.color = '#F39C12'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#374151'}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          </header>

          <nav className="driver-layout-nav">
            <Link to="/driver/trips/assigned" style={{ textDecoration: 'none' }}>
              <div className={`driver-tab ${isTabActive('/driver/trips/assigned') ? 'active' : ''}`}>Danh sách chuyến được phân công</div>
            </Link>
            <Link to="/driver/trips/completed" style={{ textDecoration: 'none' }}>
              <div className={`driver-tab ${isTabActive('/driver/trips/completed') ? 'active' : ''}`}>Danh sách chuyến đã hoàn thành</div>
            </Link>
            <Link to="/driver/trips/cancelled" style={{ textDecoration: 'none' }}>
              <div className={`driver-tab ${isTabActive('/driver/trips/cancelled') ? 'active' : ''}`}>Danh sách chuyến đã hủy</div>
            </Link>
          </nav>

          <main className="driver-layout-main">
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
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

