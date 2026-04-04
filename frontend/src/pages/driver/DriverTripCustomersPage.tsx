import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DriverLayout } from '../../components/DriverLayout';
import { api } from '../../api/client';

interface DriverStop {
  MaChiTiet: number;
  ThuTuDonTra: number;
  DiemDon: string;
  DiemTra: string;
  ThoiGianDonDuKien: string | null;
  TrangThaiKhach: string | null;
  MaLoTrinh: number;
  MaVe: number;
  SoLuongGhe: number;
  TenKhachHang: string;
  SoDienThoai: string;
}

interface RouteDetail {
  route: {
    MaLoTrinh: number;
  };
  stops: DriverStop[];
}

export const DriverTripCustomersPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeId = Number(id);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!routeId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<RouteDetail>(`/routes/${routeId}`);
        setDetail(res.data);
      } catch (e) {
        const err = e as { response?: { data?: { message?: string } } };
        setError(
          err?.response?.data?.message ??
            'Không thể tải danh sách khách hàng, vui lòng thử lại sau'
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [routeId]);

  // Removed stopsSequence since the design mockup shows a flat table of passengers

  const stats = useMemo(() => {
    const stops = detail?.stops ?? [];
    const total = stops.length;
    let done = 0;
    let canceled = 0;
    let waiting = 0;
    stops.forEach((s) => {
      const st = (s.TrangThaiKhach || '').trim();
      if (st === 'Khách hủy') canceled += 1;
      else if (st === 'Đã trả khách') done += 1;
      else waiting += 1;
    });
    return { total, done, waiting, canceled };
  }, [detail]);

  const statusBadge = (stRaw: string | null) => {
    const st = (stRaw || '').trim();
    let label = st;
    if (!label) label = 'Đang chờ';

    if (label === 'Đã đón khách') label = 'Đã đón';
    if (label === 'Đã trả khách') label = 'Đã trả';
    if (label === 'Khách hủy') label = 'Hủy chuyến';
    if (label === 'Chưa gọi' || label === 'Gọi không nghe máy') label = 'Đang chờ';

    let bg = '#E5E7EB';
    let color = '#374151';

    if (label === 'Đã đón') {
      bg = '#D3EAFC';
      color = '#10487A';
    } else if (label === 'Đã trả') {
      bg = '#D1F2D1'; 
      color = '#1D722C';
    } else if (label === 'Hủy chuyến') {
      bg = '#FDE0E0';
      color = '#BA1A1A';
    } else {
      bg = '#FAF9C8'; // Đang chờ
      color = '#8A7A00';
      label = 'Đang chờ';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '6px 16px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          background: bg,
          color,
          minWidth: 110,
          textAlign: 'center'
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <DriverLayout>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0A3B73', margin: 0 }}>
          Xem danh sách khách hàng
        </h2>
      </div>

      {loading ? (
        <div>Đang tải danh sách...</div>
      ) : error ? (
        <div style={{ color: '#B91C1C' }}>{error}</div>
      ) : !detail ? (
        <div>Không tìm thấy dữ liệu chuyến.</div>
      ) : (
        <>
          {/* Thống kê 5 cột */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 16,
              marginBottom: 16
            }}
          >
            <div style={{ background: '#FFF', borderRadius: 8, padding: '16px 20px', border: '1px solid #D1D5DB', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: '#6B7280' }}>Chuyến đi</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{detail.route.MaLoTrinh.toString().padStart(10, '0')}</div>
            </div>
            <div style={{ background: '#FFF', borderRadius: 8, padding: '16px 20px', border: '1px solid #D1D5DB', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: '#6B7280' }}>Tổng số khách hàng</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1D4ED8' }}>{stats.total.toString().padStart(2, '0')}</div>
            </div>
            <div style={{ background: '#FFF', borderRadius: 8, padding: '16px 20px', border: '1px solid #D1D5DB', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: '#6B7280' }}>Đã hoàn thành</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#16A34A' }}>{stats.done.toString().padStart(2, '0')}</div>
            </div>
            <div style={{ background: '#FFF', borderRadius: 8, padding: '16px 20px', border: '1px solid #D1D5DB', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: '#6B7280' }}>Đang chờ</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#D97706' }}>{stats.waiting.toString().padStart(2, '0')}</div>
            </div>
            <div style={{ background: '#FFF', borderRadius: 8, padding: '16px 20px', border: '1px solid #D1D5DB', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: '#6B7280' }}>Đã hủy</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#DC2626' }}>{stats.canceled.toString().padStart(2, '0')}</div>
            </div>
          </div>

          {/* Button right aligned */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => navigate(`/driver/trips/${routeId}`)}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#1A6B9B',
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              Xem bản đồ
            </button>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, textAlign: 'center' }}>
                <thead style={{ background: '#0A3B73', color: '#FFFFFF' }}>
                  <tr>
                    <th style={{ padding: '16px 20px', fontWeight: 600 }}>STT</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, textAlign: 'left' }}>Tên khách hàng</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600 }}>Số điện thoại</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, textAlign: 'left' }}>Điểm đón</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600, textAlign: 'left' }}>Điểm trả</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600 }}>Số lượng ghế</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600 }}>Thời gian đón dự kiến</th>
                    <th style={{ padding: '16px 20px', fontWeight: 600 }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.stops.map((s, idx) => (
                    <tr key={s.MaChiTiet} style={{ borderBottom: '1px solid #E5E7EB', background: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB' }}>
                      <td style={{ padding: '16px 20px', color: '#374151', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'left', color: '#111827', fontWeight: 600 }}>{s.TenKhachHang}</td>
                      <td style={{ padding: '16px 20px', color: '#2563EB', fontWeight: 500 }}>
                        <a href={`tel:${s.SoDienThoai}`} style={{ textDecoration: 'none', color: 'inherit' }}>{s.SoDienThoai}</a>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'left', color: '#4B5563' }}>{s.DiemDon}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'left', color: '#4B5563' }}>{s.DiemTra}</td>
                      <td style={{ padding: '16px 20px', color: '#374151', fontWeight: 600 }}>{s.SoLuongGhe}</td>
                      <td style={{ padding: '16px 20px', color: '#4B5563' }}>
                        {s.ThoiGianDonDuKien ? new Date(s.ThoiGianDonDuKien).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', hour12: false}) : '--:--'}
                      </td>
                      <td style={{ padding: '16px 20px' }}>{statusBadge(s.TrangThaiKhach)}</td>
                    </tr>
                  ))}
                  {detail.stops.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#6B7280' }}>
                        Không có khách hàng nào trong chuyến này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </DriverLayout>
  );
};

