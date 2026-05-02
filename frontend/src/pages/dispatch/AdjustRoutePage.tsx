import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { DispatcherLayout } from '../../components/DispatcherLayout';
import { SearchInput } from '../../components/SearchInput';
import { api } from '../../services/api/client';
import { matchesSearchQuery } from '../../utils/search';

interface RouteSummary {
  MaLoTrinh: number;
  LoTrinhDuKien: string | null;
  GhiChu: string | null;
  ThoiGianBatDau: string;
  TrangThaiLoTrinh: string;
  BienSo: string;
  LoaiXe: string;
  SoCho: number;
  TenTaiXe: string;
  SoDienThoaiTaiXe: string;
  SoKhach: number;
  TongGhe: number;
}

interface RouteStop {
  MaChiTiet: number;
  MaVe: number;
  TenKhachHang: string;
  SoDienThoai: string;
  DiemDon: string;
  DiemTra: string;
  SoLuongGhe: number;
  KhungGioTrungChuyen: string | null;
  TrangThaiKhach: string | null;
}

interface RouteDetailResponse {
  route: RouteSummary;
  stops: RouteStop[];
}

interface RouteFormValues {
  startTime: string;
  plannedRoute: string;
  note: string;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function buildRouteFormValues(route: RouteSummary): RouteFormValues {
  return {
    startTime: toDateTimeLocal(route.ThoiGianBatDau),
    plannedRoute: route.LoTrinhDuKien || '',
    note: route.GhiChu || ''
  };
}

function hasPastStartTimeChange(current: string, original: string) {
  if (!current || current === original) {
    return false;
  }

  const nextDate = new Date(current);
  return !Number.isNaN(nextDate.getTime()) && nextDate.getTime() < Date.now();
}

export const AdjustRoutePage: React.FC = () => {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RouteDetailResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [plannedRoute, setPlannedRoute] = useState('');
  const [note, setNote] = useState('');
  const [startTime, setStartTime] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const loadRoutes = useCallback(async () => {
    setLoadingList(true);
    setError(null);

    try {
      const res = await api.get<RouteSummary[]>('/routes');
      setRoutes(res.data);

      setSelectedId((currentSelectedId) => currentSelectedId || res.data[0]?.MaLoTrinh || null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Không tải được danh sách lộ trình');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadRouteDetail = useCallback(async (routeId: number) => {
    setLoadingDetail(true);
    setError(null);
    setMessage(null);
    setShowConfirmModal(false);

    try {
      const res = await api.get<RouteDetailResponse>(`/routes/${routeId}`);
      const nextFormValues = buildRouteFormValues(res.data.route);

      setDetail(res.data);
      setPlannedRoute(nextFormValues.plannedRoute);
      setNote(nextFormValues.note);
      setStartTime(nextFormValues.startTime);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setDetail(null);
      setError(err.response?.data?.message ?? 'Không tải được chi tiết lộ trình');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  useEffect(() => {
    if (!selectedId) return;
    void loadRouteDetail(selectedId);
  }, [loadRouteDetail, selectedId]);

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) =>
      matchesSearchQuery(
        searchQuery,
        `LT${String(route.MaLoTrinh).padStart(3, '0')}`,
        route.BienSo,
        route.TenTaiXe,
        route.TrangThaiLoTrinh,
        route.LoTrinhDuKien,
        route.GhiChu,
        route.ThoiGianBatDau,
        route.LoaiXe,
        route.SoCho
      )
    );
  }, [routes, searchQuery]);

  useEffect(() => {
    if (filteredRoutes.length === 0) return;
    if (selectedId && filteredRoutes.some((route) => route.MaLoTrinh === selectedId)) return;
    setSelectedId(filteredRoutes[0].MaLoTrinh);
  }, [filteredRoutes, selectedId]);

  const currentRoute = useMemo(
    () => routes.find((route) => route.MaLoTrinh === selectedId) || detail?.route || null,
    [detail?.route, routes, selectedId]
  );

  const originalFormValues = useMemo(
    () => (detail ? buildRouteFormValues(detail.route) : null),
    [detail]
  );

  const hasFormChanges = Boolean(
    originalFormValues &&
      (startTime !== originalFormValues.startTime ||
        plannedRoute.trim() !== originalFormValues.plannedRoute.trim() ||
        note.trim() !== originalFormValues.note.trim())
  );

  const requiresRunningRouteConfirmation =
    detail?.route.TrangThaiLoTrinh === 'Đang thực hiện' && hasFormChanges;

  const resetEditingForm = () => {
    if (!detail) return;

    const nextFormValues = buildRouteFormValues(detail.route);
    setPlannedRoute(nextFormValues.plannedRoute);
    setNote(nextFormValues.note);
    setStartTime(nextFormValues.startTime);
    setMessage(null);
    setError(null);
    setShowConfirmModal(false);
  };

  const submitRouteUpdate = async () => {
    if (!currentRoute) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await api.put<RouteSummary>(`/routes/${currentRoute.MaLoTrinh}`, {
        ThoiGianBatDau: startTime || undefined,
        LoTrinhDuKien: plannedRoute.trim(),
        GhiChu: note.trim(),
        TrangThaiLoTrinh: currentRoute.TrangThaiLoTrinh
      });

      setRoutes((prev) =>
        prev.map((route) => (route.MaLoTrinh === res.data.MaLoTrinh ? { ...route, ...res.data } : route))
      );
      setMessage('Đã lưu điều chỉnh lộ trình');
      await loadRouteDetail(currentRoute.MaLoTrinh);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Lỗi khi lưu điều chỉnh');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!currentRoute || !originalFormValues) return;

    setError(null);
    setMessage(null);

    if (!hasFormChanges) {
      setMessage('Không có thay đổi để cập nhật');
      return;
    }

    if (currentRoute.TrangThaiLoTrinh === 'Hoàn thành') {
      setError('Không thể chỉnh sửa lộ trình đã hoàn thành');
      return;
    }

    if (hasPastStartTimeChange(startTime, originalFormValues.startTime)) {
      setError('Thời gian không hợp lệ');
      return;
    }

    if (requiresRunningRouteConfirmation) {
      setShowConfirmModal(true);
      return;
    }

    await submitRouteUpdate();
  };

  return (
    <DispatcherLayout activeSubTab="adjust">
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Điều chỉnh lộ trình</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: 16,
          alignItems: 'flex-start'
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            padding: 16,
            minHeight: 420
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Danh sách lộ trình</div>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Tìm theo mã LT, biển số, tài xế..."
            style={{ maxWidth: '100%', marginBottom: 12 }}
          />
          {loadingList ? (
            <div>Đang tải...</div>
          ) : routes.length === 0 ? (
            <div>Chưa có lộ trình nào.</div>
          ) : (
            filteredRoutes.length === 0 ? (
              <div>Không tìm thấy lộ trình phù hợp.</div>
            ) : (
              filteredRoutes.map((route) => (
              <div
                key={route.MaLoTrinh}
                onClick={() => setSelectedId(route.MaLoTrinh)}
                style={{
                  borderRadius: 12,
                  border: selectedId === route.MaLoTrinh ? '2px solid #2563EB' : '1px solid #E5E7EB',
                  padding: 16,
                  marginBottom: 12,
                  cursor: 'pointer',
                  background: selectedId === route.MaLoTrinh ? '#EFF6FF' : '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>
                    LT{String(route.MaLoTrinh).padStart(3, '0')}
                  </div>
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: route.TrangThaiLoTrinh === 'Đang thực hiện' ? '#DBEAFE' : '#F3F4F6',
                      color: route.TrangThaiLoTrinh === 'Đang thực hiện' ? '#1E40AF' : '#4B5563',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                  >
                    {route.TrangThaiLoTrinh}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                  Xe: <span style={{ color: '#111827' }}>{route.BienSo}</span>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                  Tài xế: <span style={{ color: '#111827' }}>{route.TenTaiXe}</span>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>
                  Thời gian:{' '}
                  <span style={{ color: '#111827' }}>
                    {new Date(route.ThoiGianBatDau).toLocaleString('vi-VN')}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#475569' }}>
                  Tổng ghế: <span style={{ color: '#111827' }}>{route.TongGhe || 0}</span>
                </div>
              </div>
              ))
            )
          )}
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            padding: 16
          }}
        >
          {loadingDetail ? (
            <div>Đang tải chi tiết...</div>
          ) : !detail ? (
            <div>Hãy chọn một lộ trình bên trái để điều chỉnh.</div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: '1px solid #E5E7EB'
                }}
              >
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
                  Chi tiết lộ trình: LT{String(detail.route.MaLoTrinh).padStart(3, '0')}
                </h3>
                <span
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: detail.route.TrangThaiLoTrinh === 'Đang thực hiện' ? '#DBEAFE' : '#F3F4F6',
                    color: detail.route.TrangThaiLoTrinh === 'Đang thực hiện' ? '#1D4ED8' : '#475569',
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  {detail.route.TrangThaiLoTrinh}
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Xe trung chuyển</div>
                <input
                  value={`${detail.route.BienSo} (${detail.route.LoaiXe}, ${detail.route.SoCho} chỗ)`}
                  readOnly
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    padding: '0 12px',
                    fontSize: 14,
                    color: '#111827',
                    outline: 'none',
                    background: '#F8FAFC',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Tài xế</div>
                <input
                  value={`${detail.route.TenTaiXe} - ${detail.route.SoDienThoaiTaiXe || 'Chưa có số'} (${detail.route.TrangThaiLoTrinh})`}
                  readOnly
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    padding: '0 12px',
                    fontSize: 14,
                    color: '#111827',
                    outline: 'none',
                    background: '#F8FAFC',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Thời gian bắt đầu</div>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    height: 42,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: 14,
                    color: '#111827',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Lộ trình dự kiến</div>
                <input
                  value={plannedRoute}
                  onChange={(e) => setPlannedRoute(e.target.value)}
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    padding: '0 12px',
                    fontSize: 14,
                    color: '#111827',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Ghi chú điều phối</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    padding: '10px 12px',
                    fontSize: 14,
                    color: '#111827',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                  Danh sách hành khách ({detail.stops.length})
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                  {detail.stops.length === 0 ? (
                    <div style={{ padding: 16, color: '#64748b' }}>Chưa có hành khách nào trong lộ trình này.</div>
                  ) : (
                    detail.stops.map((stop) => (
                      <div
                        key={stop.MaChiTiet}
                        style={{
                          padding: '12px 14px',
                          borderTop: '1px solid #E5E7EB',
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr 1fr 90px 130px',
                          gap: 12,
                          alignItems: 'center',
                          fontSize: 13
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#111827' }}>VE{String(stop.MaVe).padStart(3, '0')}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{stop.TenKhachHang}</div>
                          <div style={{ color: '#64748b' }}>{stop.SoDienThoai}</div>
                        </div>
                        <div style={{ color: '#475569' }}>
                          <div>Đón: {stop.DiemDon}</div>
                          <div>Trả: {stop.DiemTra}</div>
                        </div>
                        <div style={{ color: '#111827', fontWeight: 600 }}>{stop.SoLuongGhe} ghế</div>
                        <div style={{ color: '#475569' }}>{stop.TrangThaiKhach || 'Đang chờ'}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {error && (
                <div
                  style={{
                    background: '#FEE2E2',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#B91C1C',
                    marginBottom: 16,
                    fontSize: 14
                  }}
                >
                  {error}
                </div>
              )}

              {message && (
                <div
                  style={{
                    background: '#D1FAE5',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#047857',
                    marginBottom: 16,
                    fontSize: 14
                  }}
                >
                  {message}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Đang cập nhật...' : 'Cập nhật lộ trình'}
                </button>
                <button
                  onClick={resetEditingForm}
                  disabled={saving}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#F1F5F9',
                    color: '#475569',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  Hủy
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div style={confirmModalOverlayStyle}>
          <div style={confirmModalCardStyle}>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 12px 0' }}>
              Xác nhận cập nhật lộ trình
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#475569', lineHeight: 1.6 }}>
              Lộ trình đang ở trạng thái "Đang thực hiện". Nếu tiếp tục cập nhật, hệ thống sẽ lưu thay đổi
              và gửi thông tin mới cho tài xế.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={confirmSecondaryButtonStyle}>
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  void submitRouteUpdate();
                }}
                style={confirmPrimaryButtonStyle}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </DispatcherLayout>
  );
};

const confirmModalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const confirmModalCardStyle: React.CSSProperties = {
  width: 480,
  maxWidth: 'calc(100vw - 32px)',
  background: '#FFFFFF',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)'
};

const confirmPrimaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#2563EB',
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer'
};

const confirmSecondaryButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid #CBD5E1',
  background: '#FFFFFF',
  color: '#334155',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer'
};
