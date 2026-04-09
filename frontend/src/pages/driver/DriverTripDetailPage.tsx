import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DriverLayout } from '../../components/DriverLayout';
import { api } from '../../services/api/client';

interface DriverRoute {
  MaLoTrinh: number;
  MaXe: number;
  BienSo: string;
  ThoiGianBatDau: string;
  ThoiGianKetThuc: string | null;
  LoTrinhDuKien: string | null;
  TrangThaiLoTrinh: string;
  LoaiXe?: string;
  SoCho?: number;
}

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
  KhungGioTrungChuyen: string | null;
  TrangThaiVe: string;
  TenKhachHang: string;
  SoDienThoai: string;
}

interface RouteDetail {
  route: DriverRoute;
  stops: DriverStop[];
}

export const DriverTripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentLoc, setIncidentLoc] = useState('');
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const navigate = useNavigate();

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
          'Lỗi tải thông tin, xin vui lòng thử lại sau.'
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [routeId]);

  const updateTripStatus = async (newStatus: string) => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.put(`/routes/${routeId}`, { TrangThaiLoTrinh: newStatus });
      setDetail((prev) => (prev ? { ...prev, route: res.data } : prev));
      setMessage('Đã cập nhật trạng thái chuyến.');
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Không thể cập nhật trạng thái chuyến.');
    } finally {
      setSaving(false);
    }
  };

  const updateStopStatus = async (stopId: number, newStatus: string) => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.patch(`/routes/${routeId}/stops/${stopId}/status`, { status: newStatus });
      setDetail((prev) =>
        prev
          ? {
            ...prev,
            stops: prev.stops.map((s) =>
              s.MaChiTiet === stopId ? { ...s, TrangThaiKhach: newStatus } : s
            ),
            route: res.data?.routeAutoCompleted ? { ...prev.route, TrangThaiLoTrinh: 'Hoàn thành' } : prev.route
          }
          : prev
      );
      setMessage(res.data?.routeAutoCompleted ? 'Đã cập nhật. Chuyến đã hoàn thành.' : 'Đã cập nhật trạng thái khách.');
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Cập nhật trạng thái không thành công, vui lòng thử lại');
    } finally {
      setSaving(false);
    }
  };

  const currentStatusRaw: string = detail?.route?.TrangThaiLoTrinh || 'Chưa thực hiện';
  const currentStatus: string = useMemo(() => {
    if (currentStatusRaw === 'Chưa thực hiện') return 'Chưa bắt đầu';
    return currentStatusRaw;
  }, [currentStatusRaw]);

  const canUpdateStops = useMemo(() => {
    return ['Đang thực hiện', 'Đang gặp sự cố'].includes(currentStatusRaw);
  }, [currentStatusRaw]);

  const totalSeatsBooked = useMemo(() => {
    return (detail?.stops || []).reduce((sum, stop) => sum + Number(stop.SoLuongGhe || 0), 0);
  }, [detail?.stops]);

  const currentMapLocation = useMemo(() => {
    if (!detail?.stops?.length) {
      return detail?.route.LoTrinhDuKien || 'Việt Nam';
    }

    const activeStop = detail.stops.find((stop) => !['Đã trả khách', 'Khách hủy'].includes(stop.TrangThaiKhach || ''));
    return activeStop?.DiemDon || detail.stops[0].DiemDon || detail.route.LoTrinhDuKien || 'Việt Nam';
  }, [detail]);

  const startPointLabel = useMemo(() => {
    if (!detail) return '--';
    return detail.route.LoTrinhDuKien?.split(' -> ')[0] || detail.stops[0]?.DiemDon || '--';
  }, [detail]);

  const routeSummaryLabel = useMemo(() => {
    if (!detail) return '--';
    return detail.route.LoTrinhDuKien || `${startPointLabel} -> ${detail.stops[detail.stops.length - 1]?.DiemTra || '--'}`;
  }, [detail, startPointLabel]);

  const reportIncident = async () => {
    if (!detail) return;
    if (incidentDesc.trim().length < 3) {
      setIncidentError('Vui lòng nhập nội dung sự cố.');
      return;
    }
    setIncidentSaving(true);
    setIncidentError(null);
    setMessage(null);
    try {
      await api.post(`/routes/${routeId}/incident`, {
        description: incidentDesc.trim(),
        location: incidentLoc.trim() ? incidentLoc.trim() : undefined
      });
      setShowIncidentModal(false);
      setIncidentDesc('');
      setIncidentLoc('');
      // reload detail
      const res = await api.get<RouteDetail>(`/routes/${routeId}`);
      setDetail(res.data);
      setMessage('Đã báo cáo sự cố.');
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      setIncidentError(err?.response?.data?.message ?? 'Không thể báo cáo sự cố, vui lòng thử lại.');
    } finally {
      setIncidentSaving(false);
    }
  };

  return (
    <DriverLayout>
      {loading ? (
        <div>Đang tải chi tiết...</div>
      ) : error ? (
        <div style={{ color: '#B91C1C' }}>{error}</div>
      ) : !detail ? (
        <div>Không tìm thấy lộ trình.</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E3A8A', marginBottom: 12 }}>
                Xem lộ trình trung chuyển {routeId ? `CX${routeId.toString().padStart(8, '0')}` : ''}
              </h2>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 14, color: '#4B5563' }}>
                <span style={{
                  padding: '6px 16px', borderRadius: 999, fontWeight: 600,
                  background: currentStatus === 'Chưa bắt đầu' ? '#FEF9C3' : currentStatus === 'Đang thực hiện' ? '#DBEAFE' : '#DCFCE7',
                  color: currentStatus === 'Chưa bắt đầu' ? '#CA8A04' : currentStatus === 'Đang thực hiện' ? '#1D4ED8' : '#166534'
                }}>
                  {currentStatus}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  <span>{detail.route.ThoiGianBatDau ? new Date(detail.route.ThoiGianBatDau).toLocaleDateString('vi-VN') : '--'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <span>
                    {detail.route.ThoiGianBatDau ? new Date(detail.route.ThoiGianBatDau).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                    {' - '}
                    {detail.route.ThoiGianKetThuc ? new Date(detail.route.ThoiGianKetThuc).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setIncidentError(null); setIncidentDesc(''); setIncidentLoc(''); setShowIncidentModal(true);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#E5E7EB', color: '#374151', fontWeight: 600, cursor: 'pointer'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                Báo cáo sự cố
              </button>
              <button
                onClick={() => navigate(`/driver/trips/${routeId}/customers`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#DBEAFE', color: '#1E3A8A', fontWeight: 600, cursor: 'pointer'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Danh sách khách hàng
              </button>
              {currentStatusRaw !== 'Hoàn thành' && (
                <button
                  disabled={saving}
                  onClick={() => updateTripStatus(currentStatusRaw === 'Chưa thực hiện' ? 'Đang thực hiện' : 'Hoàn thành')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: '#059669', color: '#FFF', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
                  {currentStatusRaw === 'Chưa thực hiện' ? 'Bắt đầu chuyến' : 'Hoàn thành'}
                </button>
              )}
            </div>
          </div>

          {message && (
            <div style={{ background: '#DCFCE7', borderRadius: 8, padding: '10px 16px', color: '#166534', marginBottom: 16 }}>
              {message}
            </div>
          )}

          {/* Blue vehicle info bar */}
          <div style={{ background: '#EFF6FF', padding: '12px 32px', display: 'flex', gap: 32, alignItems: 'center', fontSize: 14, color: '#1E3A8A', borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE', margin: '0 -32px 24px -32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Xe: <strong>{detail.route.BienSo}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Khách: <strong>{totalSeatsBooked}/{detail.route.SoCho || 0}</strong> chỗ</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>Lộ trình: <strong>{routeSummaryLabel}</strong></span>
              </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 0, border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#FFF', minHeight: 600 }}>
            {/* Map Placeholder */}
            <div style={{ position: 'relative', background: '#E2E8F0' }}>
                 <iframe
                      title="Map Area"
                      width="100%"
                      height="100%"
                      style={{ border: 0, position: 'absolute', inset: 0 }}
                      loading="lazy"
                      allowFullScreen
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(currentMapLocation)}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                 ></iframe>
                 <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20, background: 'rgba(255,255,255,0.94)', borderRadius: 12, padding: '12px 16px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)' }}>
                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Vị trí bản đồ theo địa chỉ hiện tại</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{currentMapLocation}</div>
                 </div>
            </div>

            {/* Expected Route */}
            <div style={{ padding: 24, paddingRight: 32, overflowY: 'auto', maxHeight: 650 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 24 }}>LỘ TRÌNH DỰ KIẾN</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 30, bottom: 30, left: 24, width: 1, borderLeft: '1px dashed #D1D5DB', zIndex: 0 }} />
                
                {/* Lộ Trình Bắt Đầu */}
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', position: 'relative', zIndex: 1 }}>
                   <div style={{ width: 48, height: 48, borderRadius: 8, background: currentStatusRaw !== 'Chưa thực hiện' ? '#16A34A' : '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                     {currentStatusRaw !== 'Chưa thực hiện' ? (
                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
                     ) : (
                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="3"><path d="M5 12l5 5L20 7"/></svg>
                     )}
                   </div>
                   <div style={{ flex: 1, border: currentStatusRaw !== 'Chưa thực hiện' ? '1px solid #16A34A' : '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', background: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827', fontSize: 15, marginBottom: 4 }}>Điểm bắt đầu</div>
                        <div style={{ fontSize: 13, color: '#4B5563' }}>{startPointLabel}</div>
                      </div>
                      <div>
                        <div style={{ background: '#F3F4F6', color: '#374151', padding: '6px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {currentStatusRaw !== 'Chưa thực hiện' ? 'Đã xuất phát' : 'Đang chờ'}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                      </div>
                   </div>
                </div>

                {/* Các điểm khách hàng (Flat List) */}
                {detail.stops.map((s, index) => {
                  const pState = s.TrangThaiKhach || '';
                  const isFinished = pState === 'Đã đón khách' || pState === 'Đã trả khách' || pState === 'Khách hủy';
                  const isTripActive = currentStatusRaw === 'Đang thực hiện';

                  // Default styles (Pending / Not Started Trip)
                  let boxBg = '#FFFFFF';
                  let boxBorder = '1px solid #E5E7EB';
                  let numBg = '#E5E7EB';
                  let numColor = '#374151';

                  if (isTripActive) {
                    if (isFinished) {
                      boxBg = '#F0FDF4';
                      boxBorder = '1px solid #86EFAC';
                      numBg = '#16A34A';
                      numColor = '#FFFFFF';
                    } else if (index === detail.stops.findIndex(st => !['Đã đón khách', 'Đã trả khách', 'Khách hủy'].includes(st.TrangThaiKhach || ''))) {
                      // Active point
                      boxBg = '#EFF6FF';
                      boxBorder = '1px solid #93C5FD';
                      numBg = '#1E3A8A';
                      numColor = '#FFFFFF';
                    } else {
                      // Upcoming point
                      boxBg = '#FEFCE8';
                      boxBorder = '1px solid #FDE047';
                      numBg = '#F59E0B';
                      numColor = '#FFFFFF';
                    }
                  }

                  return (
                    <div key={s.MaChiTiet} style={{ display: 'flex', gap: 20, alignItems: 'center', position: 'relative', zIndex: 1 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: numBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: numColor, fontWeight: 600, fontSize: 18 }}>
                        {index + 1}
                      </div>
                      <div style={{ flex: 1, border: boxBorder, borderRadius: 8, padding: '12px 16px', background: boxBg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15, marginBottom: 4 }}>{s.TenKhachHang}</div>
                          <div style={{ fontSize: 13, color: '#4B5563' }}>
                            {s.DiemDon}
                            <div style={{ color: '#9CA3AF', marginTop: 2 }}>{s.SoLuongGhe} ghế đã đặt</div>
                          </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <select
                            value={pState}
                            onChange={(e) => updateStopStatus(s.MaChiTiet, e.target.value || 'Đang chờ')}
                            disabled={!canUpdateStops || saving}
                            style={{
                              appearance: 'none',
                              background: isFinished ? '#FFFFFF' : '#F3F4F6',
                              color: '#374151',
                              padding: '6px 32px 6px 16px',
                              borderRadius: 6,
                              border: isFinished ? '1px solid #D1D5DB' : 'none',
                              fontSize: 13,
                              fontWeight: 500,
                              cursor: canUpdateStops && !saving ? 'pointer' : 'not-allowed',
                              outline: 'none',
                              boxShadow: isFinished ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                            }}
                          >
                            <option value="">Đang chờ</option>
                            <option value="Đã đến điểm đón">Đã đến</option>
                            <option value="Đã đón khách">Đã đón</option>
                            <option value="Khách hủy">Hủy chuyến</option>
                          </select>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', right: 10, top: 8, pointerEvents: 'none', color: '#6B7280' }}><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Popup báo cáo sự cố */}
          {showIncidentModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
              <div style={{ width: 400, background: '#FFFFFF', borderRadius: 16, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                 <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: '#1D4ED8' }}>!</span>
                 </div>
                 <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 24 }}>Báo cáo sự cố lộ trình</h3>
                 <textarea
                    value={incidentDesc}
                    onChange={e => setIncidentDesc(e.target.value)}
                    placeholder="Nhập mô tả sự cố"
                    style={{ width: '100%', minHeight: 120, borderRadius: 8, border: '1px solid #D1D5DB', padding: 16, fontSize: 14, outline: 'none', resize: 'none', marginBottom: 12, boxSizing: 'border-box' }}
                 />
                 <input
                    value={incidentLoc}
                    onChange={e => setIncidentLoc(e.target.value)}
                    placeholder="Vị trí sự cố (nếu có)"
                    style={{ width: '100%', height: 44, borderRadius: 8, border: '1px solid #D1D5DB', padding: '0 14px', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
                 />
                 {incidentError && <div style={{ color: '#B91C1C', marginBottom: 16 }}>{incidentError}</div>}
                 <div style={{ display: 'flex', gap: 16 }}>
                   <button disabled={incidentSaving} onClick={() => setShowIncidentModal(false)} style={{ flex: 1, padding: '12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFF', color: '#111827', fontWeight: 600, cursor: 'pointer', opacity: incidentSaving ? 0.7 : 1 }}>Hủy</button>
                   <button disabled={incidentSaving} onClick={reportIncident} style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none', background: '#0a3b73', color: '#FFF', fontWeight: 600, cursor: 'pointer', opacity: incidentSaving ? 0.7 : 1 }}>Gửi</button>
                 </div>
              </div>
            </div>
          )}
        </>
      )}
    </DriverLayout>
  );
};
