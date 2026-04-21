import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../services/api/client';

function normalizePhoneNumber(value: string) {
  const compactValue = String(value || '')
    .trim()
    .replace(/[\s.-]/g, '');

  if (/^\+84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(3)}`;
  }

  if (/^84\d{9}$/.test(compactValue)) {
    return `0${compactValue.slice(2)}`;
  }

  return compactValue;
}

export const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const phoneFromState = (location.state as { phoneNumber?: string, expiresInSeconds?: number })?.phoneNumber as string | undefined;
  const expiresFromState = (location.state as { phoneNumber?: string, expiresInSeconds?: number })?.expiresInSeconds as number | undefined;
  const initialCountdown = phoneFromState ? expiresFromState || 60 : 0;

  const [phone, setPhone] = useState(phoneFromState || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState<number>(initialCountdown);

  const handleBack = () => navigate('/login');

  useEffect(() => {
    setCountdown(initialCountdown);
  }, [initialCountdown]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [countdown]);

  useEffect(() => {
    if (error) setError(null);
    if (message) setMessage(null);
  }, [phone, otp, password, confirmPassword]);

  const isStrongPassword = useMemo(() => {
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return password.length >= 8 && hasLetter && hasNumber && hasSpecial;
  }, [password]);
  const canResendOtp = countdown <= 0 && !resendLoading;

  const validate = () => {
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setError('Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)');
      return false;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Mã OTP không hợp lệ (6 chữ số)');
      return false;
    }
    if (!password || !confirmPassword) {
      setError('Vui lòng nhập đầy đủ mật khẩu và xác nhận');
      return false;
    }
    if (!isStrongPassword) {
      setError('Mật khẩu phải có ít nhất 8 ký tự (gồm chữ, số và ký tự đặc biệt)');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!validate()) return;
    const normalizedPhone = normalizePhoneNumber(phone);

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        phoneNumber: normalizedPhone,
        otp,
        newPassword: password
      });
      setMessage(res.data?.message || 'Đặt lại mật khẩu thành công');
      setTimeout(() => navigate('/login'), 1000);
    } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
      setError(err?.response?.data?.message ?? 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!canResendOtp) {
      return;
    }

    setError(null);
    setMessage(null);
    const normalizedPhone = normalizePhoneNumber(phone);

    if (!/^0\d{9}$/.test(normalizedPhone)) {
      setError('Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)');
      return;
    }
    setResendLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { phoneNumber: normalizedPhone });
      setMessage(res.data?.message || 'Đã gửi mã OTP');
      setCountdown(res.data?.expiresInSeconds ?? 60);
    } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
      setError(err?.response?.data?.message ?? 'Không thể gửi lại OTP');
    } finally {
      setResendLoading(false);
    }
  };

  const renderEye = (visible: boolean) => (
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
          height: 617,
          display: 'flex',
          background: '#fff',
          boxShadow: '0px 25px 50px -12px rgba(0,0,0,0.25)',
          borderRadius: 16,
          overflow: 'hidden'
        }}
      >
        {/* Panel trái giống login */}
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

        {/* Panel phải: đặt mật khẩu mới */}
        <div
          style={{
            flex: 1,
            background: '#1E5FA8',
            color: '#fff',
            padding: '40px 32px',
            position: 'relative'
          }}
        >
          <button
            type="button"
            onClick={handleBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              marginBottom: 24
            }}
          >
            <span style={{ fontSize: 18 }}>{'←'}</span>
            <span style={{ fontSize: 18, fontWeight: 500 }}>Quay lại đăng nhập</span>
          </button>

          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              marginBottom: 4
            }}
          >
            QUÊN MẬT KHẨU
          </h1>
          <p
            style={{
              fontSize: 18,
              color: '#D1D5DC',
              marginBottom: 24
            }}
          >
            Nhập OTP và mật khẩu mới
          </p>

          <form onSubmit={handleSubmit} style={{ maxWidth: 463 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>
              Số điện thoại
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                marginBottom: 16
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '14px 16px',
                  fontSize: 16,
                  color: '#000'
                }}
                type="tel"
                placeholder="Nhập số điện thoại"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>Mã OTP</label>
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                marginBottom: 12
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '14px 16px',
                  fontSize: 16,
                  color: '#000'
                }}
                inputMode="numeric"
                placeholder="Nhập OTP (6 chữ số)"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#D1D5DC' }}>
                {countdown > 0 ? `OTP còn hiệu lực: ${countdown}s` : 'OTP đã hết hạn'}
              </div>
              <button
                type="button"
                onClick={resendOtp}
                disabled={!canResendOtp}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#F39C12',
                  cursor: canResendOtp ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  opacity: canResendOtp ? 1 : 0.6
                }}
              >
                {resendLoading ? 'Đang gửi...' : 'Gửi lại OTP'}
              </button>
            </div>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>
              Mật khẩu mới
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                marginBottom: 16,
                position: 'relative'
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '14px 40px 14px 16px',
                  fontSize: 16,
                  color: '#000',
                  borderRadius: 10
                }}
                type={showPassword ? 'text' : 'password'}
                placeholder="Nhập mật khẩu mới"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
              >
                {renderEye(showPassword)}
              </button>
            </div>

            <label style={{ display: 'block', marginBottom: 8, fontSize: 18 }}>
              Xác nhận mật khẩu mới
            </label>
            <div
              style={{
                background: '#fff',
                borderRadius: 10,
                marginBottom: 12,
                position: 'relative'
              }}
            >
              <input
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  padding: '14px 40px 14px 16px',
                  fontSize: 16,
                  color: '#000',
                  borderRadius: 10
                }}
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
              >
                {renderEye(showConfirmPassword)}
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
                  color: '#FEE2E2',
                }}
              >
                {error}
              </div>
            </div>

            <div
              style={{
                maxHeight: message ? '100px' : '0',
                opacity: message ? 1 : 0,
                overflow: 'hidden',
                transition: 'all 0.3s ease-in-out',
                marginBottom: message ? 12 : 0
              }}
            >
              <div
                style={{
                  background: 'rgba(34,197,94,0.2)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#DCFCE7',
                }}
              >
                {message}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 56,
                borderRadius: 10,
                border: 'none',
                background: '#F39C12',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Đang lưu...' : 'LƯU'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

