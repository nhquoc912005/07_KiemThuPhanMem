import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api/client';
import { getStoredUser } from '../../auth/session';
import { DispatcherLayout } from '../../components/DispatcherLayout';
import { DRIVER_STATUS, TICKET_STATUS, VEHICLE_STATUS } from '../../constants/status';

interface TicketRow {
  MaVe: number;
  KhungGioTrungChuyen: string | null;
  SoLuongGhe: number;
  TrangThaiVe: string;
  TenKhachHang: string;
  SoDienThoai: string;
  DiaChiDon: string;
  DiaChiTra: string;
}

interface VehicleData {
  MaXe: number;
  BienSo: string;
  LoaiXe: string;
  SoCho: number;
  TrangThaiXe: string;
}

interface DriverData {
  MaTaiXe: number;
  HoTen: string;
  SoDienThoai: string;
  TrangThaiTaiXe: string;
}

interface CreatedRouteResponse {
  route: {
    MaLoTrinh: number;
    BienSo: string;
    TenTaiXe: string;
  };
}

function getDefaultStartTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  now.setSeconds(0, 0);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function isPastStartTime(value: string) {
  const selectedDate = new Date(value);
  return !Number.isNaN(selectedDate.getTime()) && selectedDate.getTime() < Date.now();
}

function buildRoutePreview(tickets: TicketRow[]) {
  const pickupPoints = [...new Set(tickets.map((ticket) => ticket.DiaChiDon).filter(Boolean))];
  const dropPoints = [...new Set(tickets.map((ticket) => ticket.DiaChiTra).filter(Boolean))];
  return [...pickupPoints, ...dropPoints].join(' -> ');
}

export const PlanRoutePage: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getStoredUser();

  const [currentStep, setCurrentStep] = useState(1);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(getDefaultStartTime());
  const [dispatchNote, setDispatchNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRouteId, setCreatedRouteId] = useState<number | null>(null);

  const [khuVucDon, setKhuVucDon] = useState('');
  const [nhaXeDich, setNhaXeDich] = useState('');
  const [khungGio, setKhungGio] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [ticketsRes, vehiclesRes, driversRes] = await Promise.all([
        api.get<TicketRow[]>('/tickets', { params: { status: TICKET_STATUS.NEEDS_SHUTTLE } }),
        api.get<VehicleData[]>('/vehicles'),
        api.get<DriverData[]>('/drivers')
      ]);

      setTickets(ticketsRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Không tải được dữ liệu lập lộ trình');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const toggleTicket = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectedTickets = useMemo(
    () => tickets.filter((ticket) => selectedIds.includes(ticket.MaVe)),
    [selectedIds, tickets]
  );

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (khuVucDon && !ticket.DiaChiDon.includes(khuVucDon)) return false;
      if (nhaXeDich && ticket.DiaChiTra !== nhaXeDich) return false;
      if (khungGio && ticket.KhungGioTrungChuyen !== khungGio) return false;
      return true;
    });
  }, [khungGio, khuVucDon, nhaXeDich, tickets]);

  const totalSeatsNeeded = useMemo(
    () => selectedTickets.reduce((sum, ticket) => sum + Number(ticket.SoLuongGhe || 0), 0),
    [selectedTickets]
  );

  const routePreview = useMemo(() => buildRoutePreview(selectedTickets), [selectedTickets]);
  const dispatcherLabel = currentUser?.HoTen || currentUser?.TenDangNhap || 'Điều phối viên';

  const pickupOptions = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.DiaChiDon).filter(Boolean))],
    [tickets]
  );
  const destinationOptions = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.DiaChiTra).filter(Boolean))],
    [tickets]
  );
  const timeSlotOptions = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.KhungGioTrungChuyen).filter(Boolean))] as string[],
    [tickets]
  );

  const selectedVehicle = vehicles.find((vehicle) => vehicle.MaXe === selectedVehicleId) || null;
  const selectedDriver = drivers.find((driver) => driver.MaTaiXe === selectedDriverId) || null;

  const handleNextStep = () => {
    if (currentStep === 1 && selectedIds.length === 0) {
      setError('Vui lòng chọn ít nhất một vé để lập lộ trình');
      return;
    }

    if (currentStep === 2 && !selectedVehicleId) {
      setError('Vui lòng chọn xe phù hợp');
      return;
    }

    if (currentStep === 3 && !selectedDriverId) {
      setError('Vui lòng chọn tài xế');
      return;
    }

    setError(null);
    setCurrentStep((prev) => prev + 1);
  };

  const handlePrevStep = () => {
    setError(null);
    setCurrentStep((prev) => prev - 1);
  };

  const handleCreateRoute = async () => {
    if (!currentUser?.MaNhanVien) {
      setError('Phiên đăng nhập chưa có mã nhân viên điều phối. Vui lòng đăng nhập lại.');
      return;
    }

    if (!selectedVehicle || !selectedDriver) {
      setError('Thiếu xe hoặc tài xế được chọn');
      return;
    }

    if (!startTime) {
      setError('Vui lòng chọn thời gian bắt đầu');
      return;
    }

    if (isPastStartTime(startTime)) {
      setError('Thời gian bắt đầu không được ở quá khứ');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post<CreatedRouteResponse>('/route-plans', {
        MaXe: selectedVehicle.MaXe,
        MaTaiXe: selectedDriver.MaTaiXe,
        MaNhanVien: currentUser.MaNhanVien,
        ThoiGianBatDau: startTime,
        LoTrinhDuKien: routePreview,
        GhiChu: dispatchNote.trim() || undefined,
        ticketIds: selectedIds
      });

      setCreatedRouteId(res.data.route.MaLoTrinh);
      setCurrentStep(5);
      await fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Không thể tạo lộ trình');
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSelectedIds([]);
    setSelectedVehicleId(null);
    setSelectedDriverId(null);
    setStartTime(getDefaultStartTime());
    setDispatchNote('');
    setCreatedRouteId(null);
    setError(null);
  };

  return (
    <DispatcherLayout activeSubTab="plan">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 0', fontFamily: 'Roboto, sans-serif' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: '#002592' }}>
          Lập kế hoạch lộ trình trung chuyển
        </h2>
        <div style={{ fontSize: 13, color: '#6A7282', marginBottom: 20 }}>
          Nhân viên: {dispatcherLabel} | Thời gian: {new Date().toLocaleString('vi-VN')}
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #F3F4F6',
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          <div className="step-progress-wrapper">
            <StepChip step={1} label="Chọn vé" active={currentStep === 1} done={currentStep > 1} />
            <StepSeparator done={currentStep > 1} />
            <StepChip step={2} label="Chọn xe" active={currentStep === 2} done={currentStep > 2} />
            <StepSeparator done={currentStep > 2} />
            <StepChip step={3} label="Chọn tài xế" active={currentStep === 3} done={currentStep > 3} />
            <StepSeparator done={currentStep > 3} />
            <StepChip step={4} label="Xác nhận" active={currentStep === 4} done={currentStep > 4} />
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: 14 }}>
            {error}
          </div>
        )}

        {currentStep === 1 && (
          <>
            <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
                <FilterSelect label="Khu vực đón" placeholder="Tất cả điểm đón" value={khuVucDon} onChange={(e) => setKhuVucDon(e.target.value)} options={pickupOptions} />
                <FilterSelect label="Điểm trả" placeholder="Tất cả điểm trả" value={nhaXeDich} onChange={(e) => setNhaXeDich(e.target.value)} options={destinationOptions} />
                <FilterSelect label="Khung giờ trung chuyển" placeholder="Tất cả khung giờ" value={khungGio} onChange={(e) => setKhungGio(e.target.value)} options={timeSlotOptions} />
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#101828' }}>
                Danh sách vé cần trung chuyển ({filteredTickets.length})
              </div>

              <div className="table-responsive-wrapper">
                <div className="table-responsive-container">
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 90px 160px 1fr 1fr 140px 80px 140px', padding: '10px 16px', background: 'linear-gradient(90deg, #F9FAFB 0%, #F3F4F6 100%)', fontWeight: 600, fontSize: 12, color: '#364153', borderBottom: '1px solid #E5E7EB' }}>
                    <div />
                    <div>Mã vé</div>
                    <div>Tên khách hàng</div>
                    <div>Điểm đón</div>
                    <div>Điểm trả</div>
                    <div>Khung giờ</div>
                    <div>Ghế</div>
                    <div>Trạng thái</div>
                  </div>

                  {loading ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>Đang tải danh sách...</div>
                  ) : filteredTickets.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6B7280' }}>Không tìm thấy vé phù hợp.</div>
                  ) : (
                    filteredTickets.map((ticket) => (
                      <div key={ticket.MaVe} style={{ display: 'grid', gridTemplateColumns: '40px 90px 160px 1fr 1fr 140px 80px 140px', padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: 13, alignItems: 'center', background: selectedIds.includes(ticket.MaVe) ? '#EFF6FF' : '#FFFFFF' }}>
                        <div>
                          <input type="checkbox" checked={selectedIds.includes(ticket.MaVe)} onChange={() => toggleTicket(ticket.MaVe)} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0075FF' }} />
                        </div>
                        <div style={{ fontWeight: 500, color: '#0A0A0A' }}>VE{String(ticket.MaVe).padStart(3, '0')}</div>
                        <div>{ticket.TenKhachHang}</div>
                        <div>{ticket.DiaChiDon}</div>
                        <div>{ticket.DiaChiTra}</div>
                        <div>{ticket.KhungGioTrungChuyen || '--'}</div>
                        <div>{ticket.SoLuongGhe}</div>
                        <div>{ticket.TrangThaiVe}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div style={{ background: 'linear-gradient(135deg, #155DFC 0%, #432DD7 100%)', borderRadius: 14, padding: 16, color: '#FFFFFF', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700 }}>Nhóm vé đã chọn</h4>
                <div className="stats-grid" style={{ marginBottom: 16 }}>
                  <StatBox label="Mã vé" value={selectedTickets.map((ticket) => `VE${String(ticket.MaVe).padStart(3, '0')}`).join(', ')} />
                  <StatBox label="Tổng số ghế" value={String(totalSeatsNeeded)} />
                  <StatBox label="Điểm đón" value={String(new Set(selectedTickets.map((ticket) => ticket.DiaChiDon)).size)} />
                </div>
                <button onClick={handleNextStep} style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', background: '#FFFFFF', color: '#1447E6', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                  Tiếp theo: Chọn xe trung chuyển
                </button>
              </div>
            )}
          </>
        )}

        {currentStep === 2 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#101828' }}>Chọn xe trung chuyển</h3>
              <div style={{ fontSize: 14, color: '#475569' }}>Cần tối thiểu {totalSeatsNeeded} ghế</div>
            </div>

            <div style={selectionListScrollStyle}>
              <div className="cards-grid" style={{ marginBottom: 0 }}>
                {vehicles.map((vehicle) => {
                  const canFit = vehicle.SoCho >= totalSeatsNeeded && vehicle.TrangThaiXe === VEHICLE_STATUS.AVAILABLE;
                  const isSelected = selectedVehicleId === vehicle.MaXe;

                  return (
                    <div
                      key={vehicle.MaXe}
                      onClick={() => canFit && setSelectedVehicleId(vehicle.MaXe)}
                      style={{
                        border: `2px solid ${isSelected ? '#155DFC' : '#E5E7EB'}`,
                        borderRadius: 12,
                        padding: 20,
                        cursor: canFit ? 'pointer' : 'not-allowed',
                        opacity: canFit ? 1 : 0.6,
                        background: isSelected ? '#EFF6FF' : '#FFFFFF'
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#155DFC', marginBottom: 8 }}>{vehicle.BienSo}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>Loại xe: {vehicle.LoaiXe}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>Sức chứa: {vehicle.SoCho} ghế</div>
                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>Trạng thái: {vehicle.TrangThaiXe}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: canFit ? '#10B981' : '#EF4444' }}>
                        {canFit ? 'Đủ điều kiện phân công' : 'Không khả dụng cho nhóm vé này'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={handlePrevStep} style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#F3F4F6', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Quay lại
              </button>
              <button onClick={handleNextStep} disabled={!selectedVehicleId} style={{ flex: 1, padding: '12px 24px', borderRadius: 8, border: 'none', background: selectedVehicleId ? '#155DFC' : '#93C5FD', color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: selectedVehicleId ? 'pointer' : 'not-allowed' }}>
                Tiếp theo: Chọn tài xế
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#101828' }}>Chọn tài xế phù hợp</h3>

            <div style={selectionListScrollStyle}>
              <div className="cards-grid-drivers" style={{ marginBottom: 0 }}>
                {drivers.map((driver) => {
                  const isAvailable = driver.TrangThaiTaiXe === DRIVER_STATUS.AVAILABLE;
                  const isSelected = selectedDriverId === driver.MaTaiXe;
                  const statusBadge = buildStatusBadge(driver.TrangThaiTaiXe);

                  return (
                    <div
                      key={driver.MaTaiXe}
                      onClick={() => isAvailable && setSelectedDriverId(driver.MaTaiXe)}
                      style={{
                        border: `2px solid ${isSelected ? '#2B7FFF' : '#E5E7EB'}`,
                        borderRadius: 14,
                        padding: 20,
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        opacity: isAvailable ? 1 : 0.65,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: '999px',
                            background: isAvailable ? '#16A34A' : '#94A3B8',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 18,
                            flex: '0 0 auto'
                          }}
                        >
                          {String(driver.HoTen || 'T').trim().charAt(0).toUpperCase()}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#101828', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {driver.HoTen}
                          </div>
                          <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
                            Mã: TX{String(driver.MaTaiXe).padStart(3, '0')}
                          </div>
                        </div>
                      </div>

                      <div style={statusBadge}>{driver.TrangThaiTaiXe}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handlePrevStep} style={{ width: 120, padding: '12px 0', borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Quay lại
              </button>
              <button onClick={handleNextStep} disabled={!selectedDriverId} style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', background: selectedDriverId ? '#155DFC' : '#94A3B8', color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: selectedDriverId ? 'pointer' : 'not-allowed' }}>
                Tiếp theo: Xác nhận tạo lộ trình
              </button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #F3F4F6', borderRadius: 14, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#101828' }}>Xác nhận tạo lộ trình trung chuyển</h3>

            <div className="confirm-grid">
              <SummaryCard title="Xe trung chuyển" value={selectedVehicle?.BienSo || '--'} description={`${selectedVehicle?.LoaiXe || '--'} | ${selectedVehicle?.SoCho || 0} ghế`} color="#0F766E" background="#F0FDFA" border="#99F6E4" />
              <SummaryCard title="Tài xế" value={selectedDriver?.HoTen || '--'} description={selectedDriver?.SoDienThoai || '--'} color="#1D4ED8" background="#EFF6FF" border="#BFDBFE" />
            </div>

            <div style={{ background: '#FDF2F8', borderRadius: 8, padding: '16px 20px', border: '1px solid #FBCFE8', marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#6A7282', marginBottom: 4 }}>Lộ trình dự kiến</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#101828', marginBottom: 4 }}>
                {routePreview || 'Chưa đủ dữ liệu để tạo lộ trình'}
              </div>
              <div style={{ fontSize: 13, color: '#6A7282' }}>
                Số vé: {selectedTickets.length} | Tổng ghế: {totalSeatsNeeded}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#364153' }}>Thời gian bắt đầu *</div>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', color: '#111827', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#364153' }}>Ghi chú điều phối</div>
              <textarea
                value={dispatchNote}
                onChange={(e) => setDispatchNote(e.target.value)}
                rows={3}
                placeholder="Ví dụ: ưu tiên đón trước khách ở khu vực xa bến"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', color: '#111827', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handlePrevStep} style={{ width: 120, padding: '12px 0', borderRadius: 6, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Quay lại
              </button>
              <button onClick={handleCreateRoute} disabled={submitting} style={{ flex: 1, padding: '12px 0', borderRadius: 6, border: 'none', background: '#00C950', color: '#FFFFFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.75 : 1 }}>
                {submitting ? 'Đang tạo lộ trình...' : 'Xác nhận tạo lộ trình'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(2px)' }}>
            <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '40px 32px', width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 0 0 8px #F0FDF4' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 12px 0', textAlign: 'center' }}>
                Tạo lộ trình thành công
              </h2>
              <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 24px 0', textAlign: 'center', lineHeight: 1.5 }}>
                Lộ trình LT{String(createdRouteId || 0).padStart(3, '0')} đã được tạo và gán cho tài xế.
              </p>
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <button onClick={resetWizard} style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#111827', fontWeight: 600, cursor: 'pointer' }}>
                  Tạo lộ trình mới
                </button>
                <button onClick={() => navigate('/dispatch/adjust')} style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', background: '#155DFC', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer' }}>
                  Sang điều chỉnh
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DispatcherLayout>
  );
};

const selectionListScrollStyle: React.CSSProperties = {
  maxHeight: 'min(560px, 60vh)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollBehavior: 'smooth',
  paddingRight: 6,
  marginBottom: 32
};

function buildStatusBadge(status: string): React.CSSProperties {
  if (status === DRIVER_STATUS.AVAILABLE) {
    return { background: '#E0F2FE', color: '#0B63CE', border: '1px solid #BFDBFE', ...statusBadgeBase };
  }

  if (status === DRIVER_STATUS.IN_PROGRESS) {
    return { background: '#FEE2E2', color: '#B42318', border: '1px solid #FECDD3', ...statusBadgeBase };
  }

  if (status === DRIVER_STATUS.ASSIGNED) {
    return { background: '#FEF9C3', color: '#92400E', border: '1px solid #FDE68A', ...statusBadgeBase };
  }

  return { background: '#F3F4F6', color: '#475569', border: '1px solid #E5E7EB', ...statusBadgeBase };
}

const statusBadgeBase: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
  flex: '0 0 auto'
};

interface StepChipProps {
  step: number;
  label: string;
  active?: boolean;
  done?: boolean;
}

const StepChip: React.FC<StepChipProps> = ({ step, label, active, done }) => {
  const bg = done ? '#00C950' : active ? '#155DFC' : '#E5E7EB';
  const color = done || active ? '#FFFFFF' : '#6A7282';
  const labelColor = active ? '#101828' : '#99A1AF';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: labelColor, fontWeight: active ? 600 : 500, fontSize: 13, fontFamily: 'Roboto' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
        {done ? '✓' : step}
      </div>
      <span>{label}</span>
    </div>
  );
};

const StepSeparator: React.FC<{ done?: boolean }> = ({ done }) => (
  <div style={{ width: 148, height: 4, background: done ? '#00C950' : '#E5E7EB', margin: '0 8px' }} />
);

const FilterSelect: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}> = ({ label, placeholder, value, onChange, options }) => (
  <div>
    <div style={{ fontSize: 11, marginBottom: 6, fontWeight: 600, color: '#364153' }}>{label}</div>
    <select
      value={value}
      onChange={onChange}
      style={{
        width: '100%',
        height: 41,
        borderRadius: 10,
        border: '2px solid #E5E7EB',
        padding: '0 12px',
        fontSize: 12,
        background: '#FFFFFF',
        color: '#111827',
        outline: 'none',
        fontWeight: 500
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ background: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 10, backdropFilter: 'blur(4px)', minWidth: 160 }}>
    <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4, color: '#DBEAFE' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
  </div>
);

const SummaryCard: React.FC<{
  title: string;
  value: string;
  description: string;
  color: string;
  background: string;
  border: string;
}> = ({ title, value, description, color, background, border }) => (
  <div style={{ background, borderRadius: 6, padding: '16px 20px', border: `1px solid ${border}` }}>
    <div style={{ fontSize: 12, color: '#6A7282', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 13, color: '#6A7282' }}>{description}</div>
  </div>
);
