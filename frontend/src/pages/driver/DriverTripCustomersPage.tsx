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

  const stopsSequence = useMemo(() => {
    if (!detail) return [];
    const seq: { id: string; location: string; type: 'pickup' | 'dropoff'; passengers: DriverStop[] }[] = [];

    const pickups = new Map<string, DriverStop[]>();
    detail.stops.forEach((s) => {
      if (!pickups.has(s.DiemDon)) pickups.set(s.DiemDon, []);
      pickups.get(s.DiemDon)!.push(s);
    });
    pickups.forEach((passengers, loc) => {
      seq.push({ id: `pickup-${loc}`, location: loc, type: 'pickup', passengers });
    });

    const dropoffs = new Map<string, DriverStop[]>();
    detail.stops.forEach((s) => {
      if (!dropoffs.has(s.DiemTra)) dropoffs.set(s.DiemTra, []);
      dropoffs.get(s.DiemTra)!.push(s);
    });
    dropoffs.forEach((passengers, loc) => {
      seq.push({ id: `dropoff-${loc}`, location: loc, type: 'dropoff', passengers });
    });

    return seq;
  }, [detail]);

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

          {/* Danh sách hành khách theo điểm dừng */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {stopsSequence.map((group, gIndex) => {
               const isDropoff = group.type === 'dropoff';
               return (
                 <div key={group.id} style={{ background: '#FFFFFF', borderRadius: 12, overflow: 'hidden', border: '1px solid #D1D5DB' }}>
                   <div style={{ background: isDropoff ? '#FEE2E2' : '#E0F2FE', padding: '16px 24px', borderBottom: '1px solid #D1D5DB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>
                       <span style={{ color: isDropoff ? '#DC2626' : '#0284C7', fontWeight: 800, marginRight: 8 }}>
                         {isDropoff ? '[TRẢ]' : '[ĐÓN]'}
                       </span>
                       Trạm {gIndex + 1}: {group.location}
                     </h3>
                     <span style={{ fontSize: 14, fontWeight: 600, color: '#4B5563' }}>{group.passengers.length} khách</span>
                   </div>
                   <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, textAlign: 'center' }}>
                     <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                        <tr>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: 60 }}>STT</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', textAlign: 'left' }}>Khách hàng</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: 100 }}>Số ghế</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: 130 }}>Thời gian</th>
                          <th style={{ padding: '12px 16px', fontWeight: 600, color: '#374151', width: 160 }}>Trạng thái</th>
                        </tr>
                     </thead>
                     <tbody>
                        {group.passengers.map((s, idx) => (
                          <tr key={s.MaChiTiet} style={{ borderBottom: '1px solid #E5E7EB' }}>
                            <td style={{ padding: '16px' }}>{idx + 1}</td>
                            <td style={{ padding: '16px', textAlign: 'left' }}>
                              <div style={{ fontWeight: 600, color: '#111827' }}>{s.TenKhachHang}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                <a href={`tel:${s.SoDienThoai}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>{s.SoDienThoai}</a>
                              </div>
                            </td>
                            <td style={{ padding: '16px', fontWeight: 600, color: '#374151' }}>{s.SoLuongGhe}</td>
                            <td style={{ padding: '16px', color: '#4B5563' }}>
                              {s.ThoiGianDonDuKien ? new Date(s.ThoiGianDonDuKien).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', hour12: false}) : '--:--'}
                            </td>
                            <td style={{ padding: '16px' }}>{statusBadge(s.TrangThaiKhach)}</td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                 </div>
               );
            })}
            {stopsSequence.length === 0 && (
               <div style={{ padding: '40px 24px', textAlign: 'center', color: '#6B7280', border: '1px dashed #D1D5DB', borderRadius: 12 }}>
                 Không có khách hàng nào trong chuyến này.
               </div>
            )}
          </div>
        </>
      )}
    </DriverLayout>
  );
};

