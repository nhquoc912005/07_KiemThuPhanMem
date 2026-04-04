import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DispatcherLayout } from '../../components/DispatcherLayout';

interface RouteSummary {
  MaLoTrinh: number;
  ThoiGianBatDau: string;
  TrangThaiLoTrinh: string;
  BienSo: string;
  TenTaiXe: string;
  SoKhach: number;
  TongGhe: number;
}

interface RouteStop {
  MaChiTiet: number;
  MaVe: number;
  TenKhachHang: string;
  DiemDon: string;
  DiemTra: string;
  TrangThaiKhach: string | null;
  ThoiGianDonDuKien: string | null;
}

interface RouteDetail {
  route: RouteSummary & {
    LoTrinhDuKien: string | null;
    SoCho: number;
  };
  stops: RouteStop[];
}

function renderStatusBadge(status: string) {
  let bg = '#E5E7EB';
  let color = '#111827';

  if (status.includes('Đang thực hiện')) {
    bg = '#DBEAFE';
    color = '#1D4ED8';
  } else if (status.includes('Chưa thực hiện')) {
    bg = '#FEF9C3';
    color = '#854D0E';
  } else if (status.includes('Hoàn thành')) {
    bg = '#DCFCE7';
    color = '#166534';
  } else if (status.includes('Đã hủy')) {
    bg = '#F3F4F6';
    color = '#4B5563';
  } else if (status.includes('sự cố')) {
    bg = '#FEE2E2';
    color = '#B91C1C';
  }

  return (
    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, background: bg, color }}>
      {status}
    </span>
  );
}

export const TrackStatusPage: React.FC = () => {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const fetchRoutes = async () => {
      setLoadingList(true);
      try {
        const res = await api.get<RouteSummary[]>('/routes');
        setRoutes(res.data);
        if (res.data.length > 0) {
          setSelectedId(res.data[0].MaLoTrinh);
        }
      } finally {
        setLoadingList(false);
      }
    };

    void fetchRoutes();
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const res = await api.get<RouteDetail>(`/routes/${selectedId}`);
        setDetail(res.data);
      } catch {
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    };

    void fetchDetail();
  }, [selectedId]);

  const currentLocation = useMemo(() => {
    if (!detail?.stops.length) return detail?.route?.LoTrinhDuKien || 'Việt Nam';
    const activeStop = detail.stops.find((stop) => !['Đã trả khách', 'Khách hủy'].includes(stop.TrangThaiKhach || ''));
    return activeStop?.DiemDon || detail.stops[0].DiemDon || detail.route.LoTrinhDuKien || 'Việt Nam';
  }, [detail]);

  return (
    <DispatcherLayout activeSubTab="track">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Theo dõi trạng thái trung chuyển</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: 16, minHeight: 400, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: '#111827' }}>Danh sách lộ trình</div>
          {loadingList ? (
            <div style={{ color: '#6B7280', fontSize: 14 }}>Đang tải...</div>
          ) : routes.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: 14 }}>Chưa có lộ trình nào.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {routes.map((route) => (
                <button
                  key={route.MaLoTrinh}
                  onClick={() => setSelectedId(route.MaLoTrinh)}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 12,
                    border: selectedId === route.MaLoTrinh ? '2px solid #2563EB' : '1px solid #E5E7EB',
                    background: selectedId === route.MaLoTrinh ? '#EFF6FF' : '#FFFFFF',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                      LT{String(route.MaLoTrinh).padStart(3, '0')}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>{renderStatusBadge(route.TrangThaiLoTrinh)}</div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Xe: {route.BienSo}</div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>Tài xế: {route.TenTaiXe}</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    Ghế đang phục vụ: {route.TongGhe || route.SoKhach || 0}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#111827' }}>
                Chi tiết lộ trình: {selectedId ? `LT${String(selectedId).padStart(3, '0')}` : '--'}
              </h3>
              {detail?.route?.TrangThaiLoTrinh ? renderStatusBadge(detail.route.TrangThaiLoTrinh) : null}
            </div>

            {loadingDetail ? (
              <div style={{ color: '#6B7280', fontSize: 14 }}>Đang tải chi tiết...</div>
            ) : !detail ? (
              <div style={{ color: '#6B7280', fontSize: 14 }}>Không có chi tiết lộ trình.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                  <InfoCard title="Xe trung chuyển" value={detail.route.BienSo} />
                  <InfoCard title="Tài xế" value={detail.route.TenTaiXe} />
                  <InfoCard title="Thời gian bắt đầu" value={new Date(detail.route.ThoiGianBatDau).toLocaleString('vi-VN')} />
                  <InfoCard title="Tổng ghế" value={`${detail.route.TongGhe || detail.route.SoKhach || 0}/${detail.route.SoCho || 0}`} />
                </div>

                <div style={{ fontWeight: 600, marginBottom: 12, color: '#111827', fontSize: 15 }}>Theo dõi vị trí (GPS)</div>
                <div style={{ borderRadius: 12, background: '#F1F5F9', height: 350, position: 'relative', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                  <iframe
                    title="Theo dõi vị trí"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(currentLocation)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                  />
                  <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.95)', padding: '8px 16px', borderRadius: 999, fontWeight: 600, color: '#2563EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB' }} />
                    {currentLocation}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: '#111827' }}>Tiến độ đón/trả khách</div>

            {!detail || detail.stops.length === 0 ? (
              <div style={{ color: '#6B7280' }}>Chưa có điểm đón/trả nào trong lộ trình.</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                <div style={{ position: 'absolute', left: 8, top: 12, bottom: 12, width: 2, background: '#E5E7EB' }} />

                {detail.stops.map((stop, index) => {
                  const done = stop.TrangThaiKhach === 'Đã trả khách';
                  const cancelled = stop.TrangThaiKhach === 'Khách hủy';
                  const current = !done && !cancelled;

                  return (
                    <div key={stop.MaChiTiet} style={{ position: 'relative', marginBottom: index === detail.stops.length - 1 ? 0 : 24 }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: -24,
                          top: 4,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: done ? '#10B981' : cancelled ? '#EF4444' : '#3B82F6',
                          border: '3px solid #FFFFFF',
                          boxShadow: current ? '0 0 0 4px rgba(59,130,246,0.2)' : 'none'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                            {stop.TenKhachHang} - VE{String(stop.MaVe).padStart(3, '0')}
                          </div>
                          <div style={{ fontSize: 13, color: '#6B7280' }}>Đón: {stop.DiemDon}</div>
                          <div style={{ fontSize: 13, color: '#6B7280' }}>Trả: {stop.DiemTra}</div>
                          <div style={{ fontSize: 13, color: '#2563EB', marginTop: 4 }}>
                            {stop.TrangThaiKhach || 'Đang chờ'}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', background: '#F8FAFC', padding: '4px 8px', borderRadius: 4 }}>
                          {stop.ThoiGianDonDuKien ? new Date(stop.ThoiGianDonDuKien).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DispatcherLayout>
  );
};

const InfoCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E5E7EB' }}>
    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{value}</div>
  </div>
);
