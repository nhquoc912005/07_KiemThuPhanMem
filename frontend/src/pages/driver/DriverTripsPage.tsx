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

  const handleView = (id: number) => {
    navigate(`/driver/trips/${id}`);
  };

  const renderStatusBadge = (status: string) => {
    const label = status === 'Chưa thực hiện' ? 'Chưa bắt đầu' : status;
    let bg = '#E5E7EB';
    let color = '#111827';
    if (status.includes('Hoàn thành')) {
      bg = '#DBFFE3';
      color = '#246928';
    } else if (status.includes('Đang')) {
      bg = '#D2EAFF';
      color = '#0C476F';
    } else if (status.includes('sự cố')) {
      bg = '#E9D5FF';
      color = '#6B21A8';
    } else if (status.includes('Chưa')) {
      bg = 'rgba(248,255,205,0.83)';
      color = '#7E6704';
    } else if (status.includes('Hủy')) {
      bg = '#BCBCBC';
      color = '#E6E6E6';
    }
    return (
      <span
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 14,
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
      {/* Thẻ thống kê tổng quan */}
      <div className="stats-grid">
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            flex: '1 1 280px',
            minWidth: 220,
            padding: '17px 34px 26px',
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #BCBCBC',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ color: '#545454', fontSize: 20 }}>Tổng chuyến được giao</div>
          <div style={{ color: '#1E5FA8', fontSize: 30, fontWeight: 700 }}>
            {totalAssigned.toString().padStart(2, '0')}
          </div>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 360,
            flex: '1 1 280px',
            minWidth: 220,
            padding: '17px 34px 26px',
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #BCBCBC',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ color: '#545454', fontSize: 20 }}>Đã hoàn thành</div>
          <div style={{ color: '#008000', fontSize: 30, fontWeight: 700 }}>
            {totalCompleted.toString().padStart(2, '0')}
          </div>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 360,
            flex: '1 1 280px',
            minWidth: 220,
            padding: '17px 34px 26px',
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #BCBCBC',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <div style={{ color: '#545454', fontSize: 20 }}>Đã từ chối</div>
          <div style={{ color: '#FF4D4F', fontSize: 30, fontWeight: 700 }}>
            {totalCancelled.toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      <div className="table-responsive-wrapper">
        {loading ? (
          <div>Đang tải...</div>
        ) : error ? (
          <div style={{ color: '#B91C1C' }}>{error}</div>
        ) : trips.length === 0 ? (
          <div>
            {statusFilter == null
              ? 'Chưa có chuyến nào được phân công'
              : 'Không có chuyến nào.'}
          </div>
        ) : (
          <div className="table-responsive-container">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
              <tr style={{ background: '#EFF6FF' }}>
                <th style={{ padding: 8, textAlign: 'left' }}>STT</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Mã chuyến</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Biển số</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Thời gian bắt đầu</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Thời gian kết thúc</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Trạng thái</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t, index) => (
                <tr key={t.MaLoTrinh} style={{ borderTop: '1px solid #E5E7EB' }}>
                  <td style={{ padding: 8 }}>{index + 1}</td>
                  <td style={{ padding: 8 }}>
                    {`CX${t.MaLoTrinh.toString().padStart(8, '0')}`}
                  </td>
                  <td style={{ padding: 8 }}>{t.BienSo || '--'}</td>
                  <td style={{ padding: 8 }}>
                    {new Date(t.ThoiGianBatDau).toLocaleString('vi-VN')}
                  </td>
                  <td style={{ padding: 8 }}>
                    {t.ThoiGianKetThuc
                      ? new Date(t.ThoiGianKetThuc).toLocaleString('vi-VN')
                      : '--'}
                  </td>
                  <td style={{ padding: 8 }}>{renderStatusBadge(t.TrangThaiLoTrinh)}</td>
                  <td style={{ padding: 8, position: 'relative' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <button
                        onClick={() => handleView(t.MaLoTrinh)}
                        style={{
                          flex: 1,
                          padding: '10px 8px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#008000',
                          boxShadow: '0px 3px 4px rgba(0,0,0,0.25)',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Xem lộ trình
                      </button>
                      <div
                        style={{
                          width: 4,
                          height: 18,
                          background: '#000000'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => openMenu(t.MaLoTrinh)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid #333333',
                          background: '#FFFFFF',
                          boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1 }}>⋮</span>
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
                <span style={{ color: '#0A3B73', fontSize: 28, fontWeight: 700 }}>!</span>
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

