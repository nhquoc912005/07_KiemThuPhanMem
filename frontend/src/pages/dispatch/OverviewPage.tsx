import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { api } from '../../api/client';

interface OverviewStats {
  pendingTickets: number;
  runningRoutes: number;
  availableVehicles: number;
  availableDrivers: number;
  todayTotal: number;
  todayPending: number;
  todayCompleted: number;
  todayCompletionRate: number;
}

interface LoTrinh {
  MaLoTrinh: number;
  LoTrinhDuKien: string | null;
  TrangThaiLoTrinh: string;
  ThoiGianBatDau: string;
  BienSo?: string | null;
  TenTaiXe?: string | null;
}

interface KhachHang {
  TenKhachHang: string;
  DiaChiDon: string;
  DiaChiTra: string;
  SoLuongGhe: number;
}

function isSameDay(value: string, date: Date) {
  const current = new Date(value);
  return (
    current.getFullYear() === date.getFullYear() &&
    current.getMonth() === date.getMonth() &&
    current.getDate() === date.getDate()
  );
}

export const OverviewPage: React.FC = () => {
  const [stats, setStats] = useState<OverviewStats>({
    pendingTickets: 0,
    runningRoutes: 0,
    availableVehicles: 0,
    availableDrivers: 0,
    todayTotal: 0,
    todayPending: 0,
    todayCompleted: 0,
    todayCompletionRate: 0,
  });
  const [runningRoutes, setRunningRoutes] = useState<LoTrinh[]>([]);
  const [pendingCustomers, setPendingCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [ticketsRes, routesRes, vehiclesRes, driversRes] = await Promise.all([
          api.get('/tickets', { params: { status: 'Cần trung chuyển' } }),
          api.get('/routes'),
          api.get('/vehicles'),
          api.get('/drivers')
        ]);

        const pendingTickets = ticketsRes.data || [];
        const routes: LoTrinh[] = routesRes.data || [];
        const vehicles = vehiclesRes.data || [];
        const drivers = driversRes.data || [];
        const today = new Date();
        const todayRoutes = routes.filter((route) => isSameDay(route.ThoiGianBatDau, today));
        const completed = todayRoutes.filter((route) => route.TrangThaiLoTrinh === 'Hoàn thành').length;
        const pending = todayRoutes.filter((route) => route.TrangThaiLoTrinh === 'Chưa thực hiện').length;
        const total = todayRoutes.length;

        setStats({
          pendingTickets: pendingTickets.length,
          runningRoutes: routes.filter((route) => route.TrangThaiLoTrinh === 'Đang thực hiện').length,
          availableVehicles: vehicles.filter((vehicle: { TrangThaiXe?: string }) => vehicle.TrangThaiXe === 'Rảnh').length,
          availableDrivers: drivers.filter((driver: { TrangThaiTaiXe?: string }) => driver.TrangThaiTaiXe === 'Rảnh').length,
          todayTotal: total,
          todayPending: pending,
          todayCompleted: completed,
          todayCompletionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        });

        setRunningRoutes(
          routes
            .filter((route) => route.TrangThaiLoTrinh === 'Đang thực hiện')
            .slice(0, 5)
        );

        setPendingCustomers(
          pendingTickets.slice(0, 5).map((ticket: {
            TenKhachHang?: string;
            KhachHang?: { TenKhachHang?: string; DiaChiDon?: string; DiaChiTra?: string };
            DiaChiDon?: string;
            DiaChiTra?: string;
            SoLuongGhe?: number;
          }) => ({
            TenKhachHang: ticket.TenKhachHang || ticket.KhachHang?.TenKhachHang || 'Chưa có tên khách hàng',
            DiaChiDon: ticket.DiaChiDon || ticket.KhachHang?.DiaChiDon || 'Chưa có điểm đón',
            DiaChiTra: ticket.DiaChiTra || ticket.KhachHang?.DiaChiTra || 'Chưa có điểm trả',
            SoLuongGhe: ticket.SoLuongGhe || 1
          }))
        );
      } catch (e: unknown) {
        console.error('Lỗi lấy dữ liệu Overview:', e);
        const err = e as { response?: { data?: { message?: string } } };
        setError(err.response?.data?.message || 'Không thể tải dữ liệu tổng quan');
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  return (
    <DispatcherLayout activeSubTab="overview">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 0', fontFamily: 'Roboto, sans-serif' }}>
        {error && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#FEE2E2', color: '#B91C1C' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard
            title="Cần trung chuyển"
            value={stats.pendingTickets}
            subtitle="khách hàng chờ"
            gradient="linear-gradient(135deg, #FF6900 0%, #F54900 100%)"
            iconColor="#FFEDD4"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>}
          />
          <StatCard
            title="Đang thực hiện"
            value={stats.runningRoutes}
            subtitle="lộ trình đang chạy"
            gradient="linear-gradient(135deg, #2B7FFF 0%, #155DFC 100%)"
            iconColor="#DBEAFE"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>}
          />
          <StatCard
            title="Xe sẵn sàng"
            value={stats.availableVehicles}
            subtitle="xe sẵn sàng"
            gradient="linear-gradient(135deg, #00C950 0%, #00A63E 100%)"
            iconColor="#B9F8CF"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>}
          />
          <StatCard
            title="Tài xế rảnh"
            value={stats.availableDrivers}
            subtitle="tài xế sẵn sàng"
            gradient="linear-gradient(135deg, #AD46FF 0%, #9810FA 100%)"
            iconColor="#F3E8FF"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 20, boxShadow: '0px 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#155DFC', fontWeight: 'bold' }}>⚡</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#101828', margin: 0 }}>Lộ trình đang diễn ra</h3>
                <span style={{ background: '#DBEAFE', color: '#1447E6', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{stats.runningRoutes}</span>
              </div>
              <Link to="/dispatch/track" style={{ fontSize: 14, color: '#155DFC', fontWeight: 600, textDecoration: 'none' }}>Xem tất cả →</Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {loading ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6A7282' }}>Đang tải lộ trình...</div>
              ) : runningRoutes.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6A7282' }}>Không có lộ trình nào đang chạy vào lúc này.</div>
              ) : runningRoutes.map((route) => (
                <div key={route.MaLoTrinh} style={{ background: '#F0FDF4', border: '1px solid #BEDBFF', borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#101828', fontSize: 16 }}>{route.LoTrinhDuKien?.split(' -> ')[0] || `Lộ trình LT${route.MaLoTrinh}`} (ID: {route.MaLoTrinh})</div>
                      <div style={{ fontSize: 12, color: '#6A7282', marginTop: 4 }}>Bắt đầu: {route.ThoiGianBatDau ? new Date(route.ThoiGianBatDau).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                    </div>
                    <div style={{ background: '#155DFC', color: '#FFF', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, height: 'fit-content' }}>Đang chạy</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div style={{ background: '#FFF', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: '#6A7282' }}>Xe</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', marginTop: 4 }}>{route.BienSo || 'Chưa gán xe'}</div>
                    </div>
                    <div style={{ background: '#FFF', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 12, color: '#6A7282' }}>Tài xế</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#101828', marginTop: 4 }}>{route.TenTaiXe || 'Chưa gán tài xế'}</div>
                    </div>
                  </div>

                  <div style={{ background: '#FFF', padding: '10px 14px', borderRadius: 6 }}>
                    <div style={{ fontSize: 12, color: '#6A7282', marginBottom: 4 }}>📍 Lộ trình thực tế</div>
                    <div style={{ fontSize: 14, color: '#101828' }}>{route.LoTrinhDuKien || 'Chưa có lộ trình dự kiến'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 20, boxShadow: '0px 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#101828', margin: 0 }}>👥 Chờ xử lý</h3>
                <span style={{ background: '#FFEDD4', color: '#CA3500', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{stats.pendingTickets}</span>
              </div>
              <Link to="/dispatch/plan" style={{ fontSize: 14, color: '#155DFC', fontWeight: 600, textDecoration: 'none' }}>Lập lộ trình →</Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {loading ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6A7282' }}>Đang tải danh sách...</div>
              ) : pendingCustomers.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6A7282' }}>Hệ thống trống, chưa có đơn chờ.</div>
              ) : pendingCustomers.map((customer, index) => (
                <div key={`${customer.TenKhachHang}-${index}`} style={{ background: '#F3F4F6', border: '1px solid #FFD6A7', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#101828' }}>{customer.TenKhachHang}</div>
                    <div style={{ background: '#FFD6A7', color: '#9F2D00', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{customer.SoLuongGhe} ghế</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A5565', gap: 12 }}>
                    <div style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.DiaChiDon}</div>
                    <div style={{ color: '#6A7282', maxWidth: '30%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.DiaChiTra}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 20, boxShadow: '0px 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#101828', margin: '0 0 20px 0' }}>Thống kê lộ trình hôm nay</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div style={{ background: '#FAF5FF', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#101828' }}>{stats.todayTotal}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#4A5565', marginTop: 6 }}>Tổng lộ trình</div>
            </div>
            <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#155DFC' }}>{stats.todayPending}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#4A5565', marginTop: 6 }}>Chưa thực hiện</div>
            </div>
            <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#00A63E' }}>{stats.todayCompleted}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#4A5565', marginTop: 6 }}>Hoàn thành</div>
            </div>
            <div style={{ background: '#FAF5FF', borderRadius: 10, padding: '24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#9810FA' }}>{stats.todayCompletionRate}%</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#4A5565', marginTop: 6 }}>Tỷ lệ hoàn thành</div>
            </div>
          </div>
        </div>
      </div>
    </DispatcherLayout>
  );
};

function StatCard({ title, value, subtitle, gradient, iconColor, icon }: { title: string; value: number; subtitle: string; gradient: string; iconColor: string; icon?: React.ReactNode }) {
  return (
    <div
      style={{
        background: gradient,
        borderRadius: 14,
        padding: 20,
        color: '#FFF',
        boxShadow: '0px 10px 15px -3px rgba(0,0,0,0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ fontSize: 14, color: iconColor }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 700, margin: '8px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: iconColor }}>{subtitle}</div>

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 48,
          height: 48,
          background: 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(4px)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon || <div style={{ width: 24, height: 24, border: '2px solid #FFF', borderRadius: '50%' }}></div>}
      </div>
    </div>
  );
}
