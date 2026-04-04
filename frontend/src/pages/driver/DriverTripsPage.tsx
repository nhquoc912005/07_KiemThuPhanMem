import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DriverLayout } from '../../components/DriverLayout';
import { api } from '../../api/client';
import { getStoredUser } from '../../auth/session';

interface DriverTrip {
  MaLoTrinh: number;
  ThoiGianBatDau: string;
  ThoiGianKetThuc: string | null;
  TrangThaiLoTrinh: string;
  BienSo?: string;
  LoaiXe?: string;
  SoCho?: number;
}

export const DriverTripsPage: React.FC = () => {
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [allTrips, setAllTrips] = useState<DriverTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuTripId, setMenuTripId] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTripId, setRejectTripId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  
  const [gpsStatus, setGpsStatus] = useState<string>('checking'); // checking, granted, denied
  
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname;
  let statusFilter: string | undefined;

  if (path.includes('/completed')) {
    statusFilter = 'Hoàn thành';
  } else if (path.includes('/cancelled')) {
    statusFilter = 'Đã hủy';
  } else {
    statusFilter = undefined; // tất cả cho tab được phân công
  }

  const loadTrips = async () => {
    setLoading(true);
    setError(null);

    try {
      const user = getStoredUser();
      const driverId = user?.MaTaiXe;

      if (!driverId) {
        setError('Không tìm thấy thông tin tài xế trong phiên đăng nhập.');
        setLoading(false);
        return;
      }

      const res = await api.get<DriverTrip[]>(`/routes/by-driver/${driverId}`);
      const data = res.data || [];
      setAllTrips(data);

      let filtered: DriverTrip[] = data;
      if (statusFilter != null) {
        filtered = data.filter((t) => t.TrangThaiLoTrinh === statusFilter);
      } else {
        // Tab "được phân công": không hiển thị chuyến đã hủy hoặc đã hoàn thành
        filtered = data.filter((t) => !['Đã hủy', 'Hoàn thành'].includes(t.TrangThaiLoTrinh));
      }
      setTrips(filtered);
    } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
      setError(err?.response?.data?.message ?? 'Không tải được danh sách chuyến.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, path]);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsStatus('granted'),
        () => setGpsStatus('denied'),
        { enableHighAccuracy: true }
      );
    } else {
      setGpsStatus('denied');
    }
  }, []);

  const handleView = (id: number) => {
    navigate(`/driver/trips/${id}`);
  };

  const renderStatusBadge = (status: string) => {
    const label = status === 'Chưa thực hiện' ? 'Chưa bắt đầu' : status;
    let bg = '#F3F4F6';
    let color = '#374151';
    
    if (status.includes('Hoàn thành')) {
      bg = '#DCFCE7';
      color = '#16A34A';
    } else if (status.includes('Đang')) {
      bg = '#DBEAFE';
      color = '#1E40AF';
    } else if (status.includes('sự cố')) {
      bg = '#F3E8FF';
      color = '#7E22CE';
    } else if (status.includes('Chưa')) {
      bg = '#FEF9C3';
      color = '#A16207';
    } else if (status.includes('Hủy')) {
      bg = '#F3F4F6';
      color = '#4B5563';
    }
    
    return (
      <span
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 500,
          background: bg,
          color
        }}
      >
        {label}
      </span>
    );
  };

  const totalAssigned = allTrips.length;
  const totalCompleted = allTrips.filter((t) => t.TrangThaiLoTrinh.includes('Hoàn thành')).length;
  const totalCancelled = allTrips.filter((t) => t.TrangThaiLoTrinh.includes('Hủy')).length;

  const openMenu = (tripId: number) => {
    setMenuTripId((current) => (current === tripId ? null : tripId));
  };

  const handleRejectClick = (tripId: number) => {
    setMenuTripId(null);
    setRejectTripId(tripId);
    setRejectReason('');
    setRejectError(null);
    setShowRejectModal(true);
  };

  const handleViewCustomers = (tripId: number) => {
    setMenuTripId(null);
    navigate(`/driver/trips/${tripId}`);
  };

  const handleSubmitReject = async () => {
    if (!rejectTripId) return;
    if (!rejectReason.trim()) {
      setRejectError('Vui lòng nhập lý do từ chối.');
      return;
    }

    setRejectSaving(true);
    setRejectError(null);
    try {
      await api.put(`/routes/${rejectTripId}`, {
        TrangThaiLoTrinh: 'Đã hủy',
        GhiChu: `Tài xế từ chối chuyến: ${rejectReason.trim()}`
      });
      setShowRejectModal(false);
      setRejectTripId(null);
      setRejectReason('');
      await loadTrips();
    } catch (error: unknown) { const err = error as { response?: { data?: { message?: string } }, message?: string };
      setRejectError(err?.response?.data?.message ?? 'Không thể từ chối chuyến, vui lòng thử lại.');
    } finally {
      setRejectSaving(false);
    }
  };

  return (
    <DriverLayout>
      {gpsStatus === 'denied' && (
        <div style={{ background: '#FEF2F2', border: '1px solid #F87171', color: '#B91C1C', padding: '12px 16px', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <strong>Cảnh báo:</strong> Ứng dụng chưa được cấp quyền truy cập Vị trí (GPS). Việc cập nhật lộ trình thực tế sẽ không hoạt động chính xác. Vui lòng cấp quyền trong cài đặt trình duyệt.
          </div>
        </div>
      )}

      {/* Thẻ thống kê tổng quan */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', 
          gap: 24, 
          marginBottom: 32,
          position: 'relative',
          zIndex: 10
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 8,
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            border: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ color: '#4B5563', fontSize: 16, fontWeight: 500 }}>Tổng chuyến được giao</div>
          <div style={{ color: '#1E5FA8', fontSize: 36, fontWeight: 700 }}>
            {totalAssigned.toString().padStart(2, '0')}
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 8,
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            border: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ color: '#4B5563', fontSize: 16, fontWeight: 500 }}>Đã hoàn thành</div>
          <div style={{ color: '#16A34A', fontSize: 36, fontWeight: 700 }}>
            {totalCompleted.toString().padStart(2, '0')}
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 8,
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            border: '1px solid #E5E7EB',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ color: '#4B5563', fontSize: 16, fontWeight: 500 }}>Đã từ chối</div>
          <div style={{ color: '#DC2626', fontSize: 36, fontWeight: 700 }}>
            {totalCancelled.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      <div 
        style={{ 
          background: '#FFFFFF', 
          borderRadius: 12, 
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)', 
          overflow: 'hidden',
          position: 'relative',
          zIndex: 10,
          border: '1px solid #E5E7EB'
        }}
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>Đang tải...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#B91C1C' }}>{error}</div>
        ) : trips.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
            {statusFilter == null
              ? 'Chưa có chuyến nào được phân công'
              : 'Không có chuyến nào.'}
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, textAlign: 'center' }}>
              <thead>
              <tr style={{ background: '#E0F2FE', color: '#111827' }}>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>STT</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Mã chuyến</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Biển số</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Thời gian bắt đầu</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Thời gian kết thúc</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Trạng thái</th>
                <th style={{ padding: '16px 24px', fontWeight: 600 }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t, index) => (
                <tr key={t.MaLoTrinh} style={{ borderTop: '1px solid #E5E7EB', height: 72 }}>
                  <td style={{ padding: 16, fontWeight: 600, color: '#111827' }}>{index + 1}</td>
                  <td style={{ padding: 16, color: '#374151' }}>
                    {`CX${t.MaLoTrinh.toString().padStart(8, '0')}`}
                  </td>
                  <td style={{ padding: 16, color: '#374151' }}>{t.BienSo || '--'}</td>
                  <td style={{ padding: 16, color: '#374151' }}>
                    {new Date(t.ThoiGianBatDau).toLocaleString('vi-VN', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'})}
                  </td>
                  <td style={{ padding: 16, color: '#374151' }}>
                    {t.ThoiGianKetThuc
                      ? new Date(t.ThoiGianKetThuc).toLocaleString('vi-VN', {hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'})
                      : '--'}
                  </td>
                  <td style={{ padding: 16 }}>{renderStatusBadge(t.TrangThaiLoTrinh)}</td>
                  <td style={{ padding: 16, position: 'relative' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      {t.TrangThaiLoTrinh === 'Đã hủy' ? (
                        <div
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            background: '#D1D5DB',
                            color: '#6B7280',
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Đã từ chối
                        </div>
                      ) : (
                        <button
                          onClick={() => handleView(t.MaLoTrinh)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#16A34A',
                            color: '#FFFFFF',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Xem lộ trình
                        </button>
                      )}
                      
                      <button
                        type="button"
                        onClick={() => openMenu(t.MaLoTrinh)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 6,
                          border: 'none',
                          background: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#4B5563'
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                    </div>

                    {menuTripId === t.MaLoTrinh && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 40,
                          right: 0,
                          width: 210,
                          background: '#FFFFFF',
                          borderRadius: 10,
                          boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
                          border: '1px solid #E6E6E6',
                          zIndex: 10,
                          overflow: 'hidden'
                        }}
                      >
                        {!['Hoàn thành', 'Đã hủy'].includes(t.TrangThaiLoTrinh) ? (
                          <button
                            type="button"
                            onClick={() => handleRejectClick(t.MaLoTrinh)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              border: 'none',
                              borderBottom: '1px solid #E5E7EB',
                              background: '#FFFFFF',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: 15
                            }}
                          >
                            Từ chối chuyến
                          </button>
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              borderBottom: '1px solid #E5E7EB',
                              color: '#9CA3AF',
                              fontSize: 15
                            }}
                          >
                            Từ chối chuyến
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleViewCustomers(t.MaLoTrinh)}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
                            border: 'none',
                            background: '#FFFFFF',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: 15
                          }}
                        >
                          Danh sách khách hàng
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Popup nhập lý do từ chối */}
      {showRejectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
          onClick={() => {
            if (!rejectSaving) {
              setShowRejectModal(false);
            }
          }}
        >
          <div
            style={{
              width: 517,
              maxWidth: '90%',
              background: '#FFFFFF',
              borderRadius: 10,
              padding: 30,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 15
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 64, height: 80, paddingBottom: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: '#D2EAFF',
                  borderRadius: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span style={{ color: '#0A3B73', fontSize: 28, fontWeight: 700 }}>?</span>
              </div>
            </div>
            <div style={{ paddingBottom: 8, alignSelf: 'stretch' }}>
              <div
                style={{
                  color: '#1E2939',
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: '28px'
                }}
              >
                Nhập lý do từ chối
              </div>
            </div>
            <div
              style={{
                width: 400,
                maxWidth: '100%',
                height: 120,
                background: '#FFFFFF',
                borderRadius: 10,
                outline: '1px solid #B3B3B3',
                padding: '12px 16px'
              }}
            >
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do vào đây"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: 16,
                  color: '#111827'
                }}
              />
            </div>
            {rejectError && (
              <div style={{ alignSelf: 'stretch', color: '#B91C1C', fontSize: 14 }}>
                {rejectError}
              </div>
            )}
            <div
              style={{
                alignSelf: 'stretch',
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
                marginTop: 4
              }}
            >
              <button
                type="button"
                disabled={rejectSaving}
                onClick={() => setShowRejectModal(false)}
                style={{
                  width: 195,
                  padding: '10px 24px',
                  borderRadius: 10,
                  border: '1px solid #D1D5DC',
                  background: '#FFFFFF',
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={rejectSaving}
                onClick={handleSubmitReject}
                style={{
                  width: 193,
                  padding: '11px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#0A3B73',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  opacity: rejectSaving ? 0.7 : 1
                }}
              >
                Gửi
              </button>
            </div>
          </div>
        </div>
      )}
    </DriverLayout>
  );
};

