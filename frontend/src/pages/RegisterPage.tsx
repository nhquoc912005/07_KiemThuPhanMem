import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api/client';

type RoleKey = 'dispatcher' | 'driver';

export const RegisterPage: React.FC = () => {
  const [role, setRole] = useState<RoleKey>('dispatcher');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cccd, setCccd] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const navigate = useNavigate();

  const isStrongPassword = (value: string) => {
    return (
      value.length >= 8 &&
      /[A-Za-z]/.test(value) &&
      /\d/.test(value) &&
      /[^A-Za-z0-9]/.test(value)
    );
  };

  const validate = () => {
    const normalizedUsername = username.trim();

    if (!fullName || !normalizedUsername || !phoneNumber || !password || !confirmPassword) {
      setError('Vui lòng nhập đầy đủ thông tin bắt buộc');
      return false;
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(normalizedUsername)) {
      setError('Tên đăng nhập không đúng định dạng');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return false;
    }
    if (!isStrongPassword(password)) {
      setError('Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)');
      return false;
    }
    if (!/^0\d{9}$/.test(phoneNumber)) {
      setError('Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)');
      return false;
    }
    if (role === 'driver') {
      if (!cccd || !/^\d{12}$/.test(cccd)) {
        setError('CCCD không hợp lệ (12 chữ số)');
        return false;
      }
      if (!licenseType.trim()) {
        setError('Vui lòng chọn loại bằng lái');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;

    try {
      setLoading(true);
      await api.post('/auth/register', {
        role,
        fullName: fullName.trim(),
        username: username.trim(),
        phoneNumber,
        password,
        cccd: role === 'driver' ? cccd.trim() : undefined,
        licenseType: role === 'driver' ? licenseType.trim() : undefined
      });
      setSuccess('Đăng ký thành công. Vui lòng đăng nhập.');
      setTimeout(() => {
        navigate('/login');
      }, 1200);
    } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
      setError(err?.response?.data?.message ?? 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

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
          <path
            d="M3 4L21 20"
            stroke="#1E5FA8"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
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
  );

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
          height: 640,
          display: 'flex',
          background: '#fff',
          boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.25)',
          borderRadius: 16,
          overflow: 'hidden'
        }}
      >
        {/* Panel bên trái (giống login) */}
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
                '0px 4px 6px -4px rgba(0,0,0,0.10), 0px 10px 15px -3px rgba(0,0,0,0.10)'
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 272.5,
              transform: 'translateX(-50%)',
              width: 353,
              textAlign: 'center',
              color: '#054285',
              fontSize: 28,
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

        {/* Panel đăng ký */}
        <div
          style={{
            flex: 1,
            background: '#1E5FA8',
            color: '#fff',
            padding: '32px 48px 40px',
            position: 'relative'
          }}
        >
          <h1
            style={{
              textAlign: 'center',
              fontSize: 32,
              fontWeight: 700,
              marginBottom: 4
            }}
          >
            ĐĂNG KÝ TÀI KHOẢN
          </h1>
          <p
            style={{
              textAlign: 'center',
              opacity: 0.85,
              marginBottom: 20
            }}
          >
            Chọn vai trò và nhập thông tin để tạo tài khoản
          </p>

          {/* chọn vai trò */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 16,
              marginBottom: 16
            }}
          >
            <button
              type="button"
              onClick={() => setRole('dispatcher')}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: role === 'dispatcher' ? '#F39C12' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Nhân viên điều phối
            </button>
            <button
              type="button"
              onClick={() => setRole('driver')}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: role === 'driver' ? '#F39C12' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Tài xế
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ maxWidth: 420, margin: '0 auto' }}>
            {/* Họ tên */}
            <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>Họ và tên</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 12
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  fontSize: 15
                }}
                type="text"
                placeholder="Nhập họ tên"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {/* Username */}
            <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
              Tên đăng nhập
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 12
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  fontSize: 15
                }}
                type="text"
                placeholder="Nhập tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            {/* SĐT */}
            <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
              Số điện thoại
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 12
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  fontSize: 15
                }}
                type="tel"
                placeholder="Nhập số điện thoại"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            {/* Trường riêng cho tài xế */}
            {role === 'driver' && (
              <>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>CCCD</label>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    outline: '2px solid rgba(255,255,255,0.3)',
                    marginBottom: 12
                  }}
                >
                  <input
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 14px',
                      fontSize: 15
                    }}
                    type="text"
                    placeholder="Nhập số CCCD (12 số)"
                    value={cccd}
                    onChange={(e) => setCccd(e.target.value)}
                  />
                </div>

                <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
                  Loại bằng lái
                </label>
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                    outline: '2px solid rgba(255,255,255,0.3)',
                    marginBottom: 12
                  }}
                >
                  <input
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      padding: '10px 14px',
                      fontSize: 15
                    }}
                    type="text"
                    placeholder="Ví dụ: B2, C"
                    value={licenseType}
                    onChange={(e) => setLicenseType(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Mật khẩu */}
            <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>Mật khẩu</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  fontSize: 15,
                  borderTopLeftRadius: 8,
                  borderBottomLeftRadius: 8
                }}
                type={showPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  height: '100%',
                  padding: '0 12px',
                  border: 'none',
                  borderTopRightRadius: 8,
                  borderBottomRightRadius: 8,
                  background: 'transparent',
                  cursor: 'pointer',
                  borderLeft: '1px solid rgba(209,213,219,0.7)'
                }}
              >
                {renderEyeIcon(showPassword)}
              </button>
            </div>

            {/* Xác nhận mật khẩu */}
            <label style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
              Xác nhận mật khẩu
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 8,
                outline: '2px solid rgba(255,255,255,0.3)',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  padding: '10px 14px',
                  fontSize: 15,
                  borderTopLeftRadius: 8,
                  borderBottomLeftRadius: 8
                }}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Nhập lại mật khẩu"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  height: '100%',
                  padding: '0 12px',
                  border: 'none',
                  borderTopRightRadius: 8,
                  borderBottomRightRadius: 8,
                  background: 'transparent',
                  cursor: 'pointer',
                  borderLeft: '1px solid rgba(209,213,219,0.7)'
                }}
              >
                {renderEyeIcon(showConfirmPassword)}
              </button>
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(248,113,113,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#FEE2E2',
                  marginBottom: 8,
                  fontSize: 14
                }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                style={{
                  background: 'rgba(16,185,129,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#D1FAE5',
                  marginBottom: 8,
                  fontSize: 14
                }}
              >
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 8,
                border: 'none',
                background: '#F39C12',
                color: '#fff',
                fontSize: 17,
                fontWeight: 700,
                cursor: 'pointer',
                opacity: loading ? 0.7 : 1,
                marginTop: 4
              }}
            >
              {loading ? 'Đang xử lý...' : 'ĐĂNG KÝ'}
            </button>

            <div
              style={{
                marginTop: 10,
                textAlign: 'center',
                fontSize: 14
              }}
            >
              Đã có tài khoản?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FBBF24',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Đăng nhập
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

