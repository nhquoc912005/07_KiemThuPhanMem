import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api/client';
import { getDefaultRouteByRole, getStoredSession, isDriverRole, saveAuthSession } from '../auth/session';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user && session.accessToken) {
      navigate(getDefaultRouteByRole(session.user.VaiTro), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (error) setError(null);
  }, [username, password, error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      const user = res.data.user;
      const accessToken = res.data.accessToken;
      saveAuthSession(user, accessToken, remember);

      const fromPath = (location.state as { from?: string } | null)?.from;
      const fallbackPath = getDefaultRouteByRole(user?.VaiTro);
      const canUseRequestedPath =
        !!fromPath &&
        ((fromPath.startsWith('/driver') && isDriverRole(user?.VaiTro)) ||
          (fromPath.startsWith('/dispatch') && !isDriverRole(user?.VaiTro)) ||
          fromPath === '/profile');

      navigate(canUseRequestedPath ? fromPath : fallbackPath, { replace: true });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: 'linear-gradient(153deg, #1E5FA8 0%, #DBEAFE 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
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
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#D2EAFF'
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
              alignItems: 'center'
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
              lineHeight: '1.3'
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
              fontSize: 17
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
            position: 'relative'
          }}
        >
          <h1
            style={{
              textAlign: 'center',
              fontSize: 35,
              fontWeight: 700,
              marginBottom: 8
            }}
          >
            ĐĂNG NHẬP
          </h1>
          <p
            style={{
              textAlign: 'center',
              opacity: 0.8,
              marginBottom: 32
            }}
          >
            Vui lòng nhập thông tin để tiếp tục
          </p>

          <form onSubmit={handleSubmit} style={{ maxWidth: 416, margin: '0 auto' }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>Tên đăng nhập</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 20,
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '12px 16px',
                  fontSize: 16,
                  borderRadius: 8
                }}
                type="text"
                placeholder="Nhập tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>Mật khẩu</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 16,
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '12px 40px 12px 16px',
                  fontSize: 16,
                  borderRadius: 8
                }}
                type={showPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
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
                  justifyContent: 'center'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  {showPassword ? (
                    <>
                      <path d="M12 5C7 5 3.27 8.11 2 12C3.27 15.89 7 19 12 19C17 19 20.73 15.89 22 12C20.73 8.11 17 5 12 5Z" stroke="#1E5FA8" strokeWidth="1.8" />
                      <path d="M12 9C9.79 9 8 10.79 8 13C8 15.21 9.79 17 12 17C14.21 17 16 15.21 16 13C16 10.79 14.21 9 12 9Z" stroke="#1E5FA8" strokeWidth="1.8" />
                    </>
                  ) : (
                    <>
                      <path d="M3 4L21 20" stroke="#1E5FA8" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M10.58 5.08C11.04 5.02 11.51 5 12 5C17 5 20.73 8.11 22 12C21.64 13.15 21.01 14.23 20.18 15.18" stroke="#1E5FA8" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M6.2 6.2C4.47 7.37 3.18 9.04 2.5 11C3.77 14.89 7.5 18 12.5 18C13.78 18 15 17.78 16.12 17.38" stroke="#1E5FA8" strokeWidth="1.8" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
                fontSize: 16
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Ghi nhớ đăng nhập
              </label>

              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
                onClick={() => navigate('/forgot-password')}
              >
                Quên mật khẩu?
              </button>
            </div>

            <div
              style={{
                maxHeight: error ? '100px' : '0',
                opacity: error ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 0.3s ease-in-out',
                marginBottom: error ? 12 : 0
              }}
            >
              <div
                style={{
                  background: 'rgba(248,113,113,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#FEE2E2'
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
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Đang xử lý...' : 'ĐĂNG NHẬP'}
            </button>

            <div
              style={{
                marginTop: 14,
                textAlign: 'center',
                fontSize: 14
              }}
            >
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FBBF24',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Đăng ký
              </button>
            </div>
          </form>

          <div
            style={{
              position: 'absolute',
              bottom: 32,
              left: 48,
              right: 48,
              borderTop: '1px solid rgba(255,255,255,0.2)',
              paddingTop: 8,
              textAlign: 'center',
              fontSize: 12.8,
              opacity: 0.8
            }}
          >
            © 2026 Hệ Thống Quản Lý Xe Trung Chuyển
          </div>
        </div>
      </div>
    </div>
  );
};
