import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DriverLayout } from '../../components/DriverLayout'
import { ROUTE_STATUS, STOP_STATUS } from '../../constants/status'
import { api } from '../../services/api/client'

interface DriverRoute {
  MaLoTrinh: number
  BienSo: string
  ThoiGianBatDau: string
  ThoiGianKetThuc: string | null
  LoTrinhDuKien: string | null
  TrangThaiLoTrinh: string
  SoCho?: number
}

interface DriverStop {
  MaChiTiet: number
  ThuTuDonTra: number
  DiemDon: string
  DiemTra: string
  ThoiGianDonDuKien: string | null
  TrangThaiKhach: string | null
  MaVe: number
  SoLuongGhe: number
  TenKhachHang: string
}

interface RouteDetail {
  route: DriverRoute
  stops: DriverStop[]
  sync?: RouteSyncPayload
}

interface RouteSyncEvent {
  id: number
  eventType: string
  message?: string | null
  payload?: {
    notifyDriver?: boolean
    driverSync?: unknown
    changedFields?: Record<string, unknown>
  } | null
}

interface RouteSyncPayload {
  available: boolean
  state: {
    latestEventId?: number | null
    events: RouteSyncEvent[]
  }
}

interface RouteSyncResponse {
  routeId: number
  sync: RouteSyncPayload
}

const STOP_OPTIONS = [
  { value: STOP_STATUS.ARRIVED_PICKUP, label: 'Đã đến' },
  { value: STOP_STATUS.PICKED_UP, label: 'Đã đón' },
  { value: STOP_STATUS.DROPPED_OFF, label: 'Đã trả khách' },
  { value: STOP_STATUS.CUSTOMER_CANCELLED, label: 'Hủy chuyến' }
]

function isDoneStatus(status?: string | null) {
  return ([STOP_STATUS.DROPPED_OFF, STOP_STATUS.CUSTOMER_CANCELLED] as string[]).includes(String(status || ''))
}

function getStopBadge(status?: string | null) {
  switch (status) {
    case STOP_STATUS.ARRIVED_PICKUP:
      return { label: 'Đã đến điểm đón', bg: '#DBEAFE', color: '#1D4ED8' }
    case STOP_STATUS.PICKED_UP:
      return { label: 'Đã đón khách', bg: '#EDE9FE', color: '#6D28D9' }
    case STOP_STATUS.DROPPED_OFF:
      return { label: 'Đã trả khách', bg: '#DCFCE7', color: '#166534' }
    case STOP_STATUS.CUSTOMER_CANCELLED:
      return { label: 'Khách hủy', bg: '#FEE2E2', color: '#B91C1C' }
    default:
      return { label: 'Đang chờ', bg: '#F3F4F6', color: '#4B5563' }
  }
}

function getRouteBadge(status: string) {
  if (status === ROUTE_STATUS.PENDING) return { label: 'Chưa bắt đầu', bg: '#FEF9C3', color: '#A16207' }
  if (status === ROUTE_STATUS.IN_PROGRESS) return { label: status, bg: '#DBEAFE', color: '#1D4ED8' }
  if (status === ROUTE_STATUS.INCIDENT) return { label: status, bg: '#FEE2E2', color: '#B91C1C' }
  if (status === ROUTE_STATUS.COMPLETED) return { label: status, bg: '#DCFCE7', color: '#166534' }
  if (status === ROUTE_STATUS.CANCELLED) return { label: status, bg: '#E5E7EB', color: '#374151' }
  return { label: status || 'Không xác định', bg: '#F3F4F6', color: '#374151' }
}

export const DriverTripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const routeId = Number(id)
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showIncidentModal, setShowIncidentModal] = useState(false)
  const [incidentDesc, setIncidentDesc] = useState('')
  const [incidentLoc, setIncidentLoc] = useState('')
  const [incidentSaving, setIncidentSaving] = useState(false)
  const [incidentError, setIncidentError] = useState<string | null>(null)
  const [lastSyncEventId, setLastSyncEventId] = useState<number | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  useEffect(() => {
    const fetchDetail = async () => {
      if (!routeId) return
      setLoading(true)
      setError(null)
      try {
        const res = await api.get<RouteDetail>(`/routes/${routeId}`)
        setDetail(res.data)
        setLastSyncEventId(res.data.sync?.state.latestEventId ?? null)
      } catch (e) {
        const err = e as { response?: { data?: { message?: string } } }
        setError(err?.response?.data?.message ?? 'Lỗi tải thông tin, vui lòng thử lại sau.')
      } finally {
        setLoading(false)
      }
    }
    void fetchDetail()
  }, [routeId])

  useEffect(() => {
    if (!routeId) return

    let cancelled = false
    const pollSyncEvents = async () => {
      try {
        const res = await api.get<RouteSyncResponse>(`/routes/${routeId}/sync-events`, {
          params: lastSyncEventId ? { sinceId: lastSyncEventId } : undefined
        })
        if (cancelled) return

        const syncState = res.data.sync?.state
        const events = syncState?.events || []
        const latestEvent = events[events.length - 1]

        if (syncState?.latestEventId) {
          setLastSyncEventId(syncState.latestEventId)
        }

        if (
          latestEvent &&
          (latestEvent.eventType === 'ROUTE_UPDATED' ||
            latestEvent.payload?.notifyDriver ||
            latestEvent.payload?.driverSync)
        ) {
          const detailRes = await api.get<RouteDetail>(`/routes/${routeId}`)
          if (cancelled) return

          setDetail(detailRes.data)
          setSyncNotice(latestEvent.message || 'Lộ trình vừa được điều phối cập nhật')
        }
      } catch {
        // Polling is best-effort; the main detail load still handles visible errors.
      }
    }

    const interval = window.setInterval(pollSyncEvents, 15000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [lastSyncEventId, routeId])

  const currentStatus = detail?.route.TrangThaiLoTrinh || ROUTE_STATUS.PENDING
  const routeBadge = getRouteBadge(currentStatus)
  const canUpdateStops = ([ROUTE_STATUS.IN_PROGRESS, ROUTE_STATUS.INCIDENT] as string[]).includes(currentStatus)
  const allStopsResolved = useMemo(() => {
    const stops = detail?.stops || []
    return stops.length > 0 && stops.every((stop) => isDoneStatus(stop.TrangThaiKhach))
  }, [detail?.stops])

  const stats = useMemo(() => {
    const source = detail?.stops || []
    return {
      waiting: source.filter((stop) => !stop.TrangThaiKhach).length,
      arrived: source.filter((stop) => stop.TrangThaiKhach === STOP_STATUS.ARRIVED_PICKUP).length,
      picked: source.filter((stop) => stop.TrangThaiKhach === STOP_STATUS.PICKED_UP).length,
      dropped: source.filter((stop) => stop.TrangThaiKhach === STOP_STATUS.DROPPED_OFF).length,
      cancelled: source.filter((stop) => stop.TrangThaiKhach === STOP_STATUS.CUSTOMER_CANCELLED).length
    }
  }, [detail?.stops])

  const currentMapLocation = useMemo(() => {
    if (!detail?.stops?.length) return detail?.route.LoTrinhDuKien || 'Việt Nam'
    const activeStop = detail.stops.find((stop) => !isDoneStatus(stop.TrangThaiKhach))
    return activeStop?.DiemDon || detail.stops[0].DiemDon || detail.route.LoTrinhDuKien || 'Việt Nam'
  }, [detail])

  const routeSummaryLabel = useMemo(() => {
    if (!detail) return '--'
    return detail.route.LoTrinhDuKien || `${detail.stops[0]?.DiemDon || '--'} -> ${detail.stops[detail.stops.length - 1]?.DiemTra || '--'}`
  }, [detail])

  const updateTripStatus = async (newStatus: string) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.put(`/routes/${routeId}`, { TrangThaiLoTrinh: newStatus })
      setDetail((prev) => (prev ? { ...prev, route: res.data } : prev))
      setMessage('Đã cập nhật trạng thái chuyến.')
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err?.response?.data?.message ?? 'Không thể cập nhật trạng thái chuyến.')
    } finally {
      setSaving(false)
    }
  }

  const updateStopStatus = async (stopId: number, status: string) => {
    if (!status) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.patch(`/routes/${routeId}/stops/${stopId}/status`, { status })
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              route: res.data?.routeAutoCompleted
                ? { ...prev.route, TrangThaiLoTrinh: ROUTE_STATUS.COMPLETED }
                : prev.route,
              stops: prev.stops.map((stop) =>
                stop.MaChiTiet === stopId ? { ...stop, TrangThaiKhach: status } : stop
              )
            }
          : prev
      )
      setMessage(res.data?.routeAutoCompleted ? 'Đã cập nhật khách. Chuyến đã hoàn thành.' : 'Đã cập nhật trạng thái khách.')
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err?.response?.data?.message ?? 'Cập nhật trạng thái không thành công.')
    } finally {
      setSaving(false)
    }
  }

  const reportIncident = async () => {
    if (incidentDesc.trim().length < 3) {
      setIncidentError('Vui lòng nhập nội dung sự cố.')
      return
    }
    setIncidentSaving(true)
    setIncidentError(null)
    try {
      await api.post(`/routes/${routeId}/incident`, {
        description: incidentDesc.trim(),
        location: incidentLoc.trim() || undefined
      })
      const res = await api.get<RouteDetail>(`/routes/${routeId}`)
      setDetail(res.data)
      setShowIncidentModal(false)
      setIncidentDesc('')
      setIncidentLoc('')
      setMessage('Đã báo cáo sự cố.')
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } }
      setIncidentError(err?.response?.data?.message ?? 'Không thể báo cáo sự cố.')
    } finally {
      setIncidentSaving(false)
    }
  }

  return (
    <DriverLayout>
      {loading ? <div>Đang tải chi tiết...</div> : error ? <div style={{ color: '#B91C1C' }}>{error}</div> : !detail ? <div>Không tìm thấy lộ trình.</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#1E3A8A', marginBottom: 12 }}>Xem lộ trình trung chuyển {`CX${routeId.toString().padStart(8, '0')}`}</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', color: '#4B5563' }}>
                <span style={{ padding: '6px 14px', borderRadius: 999, background: routeBadge.bg, color: routeBadge.color, fontWeight: 700 }}>{routeBadge.label}</span>
                <span>{new Date(detail.route.ThoiGianBatDau).toLocaleString('vi-VN')}</span>
                <span>{detail.route.BienSo}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setShowIncidentModal(true)} style={secondaryButtonStyle}>Báo cáo sự cố</button>
              <button onClick={() => navigate(`/driver/trips/${routeId}/customers`)} style={infoButtonStyle}>Danh sách khách hàng</button>
              {currentStatus === ROUTE_STATUS.PENDING && <button disabled={saving} onClick={() => updateTripStatus(ROUTE_STATUS.IN_PROGRESS)} style={primaryButtonStyle}>Bắt đầu chuyến</button>}
              {([ROUTE_STATUS.IN_PROGRESS, ROUTE_STATUS.INCIDENT] as string[]).includes(currentStatus) && (
                <button disabled={saving || !allStopsResolved} onClick={() => updateTripStatus(ROUTE_STATUS.COMPLETED)} style={{ ...primaryButtonStyle, background: allStopsResolved ? '#059669' : '#9CA3AF', cursor: allStopsResolved ? 'pointer' : 'not-allowed' }}>Hoàn thành</button>
              )}
            </div>
          </div>

          {!allStopsResolved && ([ROUTE_STATUS.IN_PROGRESS, ROUTE_STATUS.INCIDENT] as string[]).includes(currentStatus) && (
            <div style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
              Cần cập nhật toàn bộ khách sang “Đã trả khách” hoặc “Khách hủy” trước khi hoàn thành chuyến.
            </div>
          )}
          {message && <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>{message}</div>}
          {syncNotice && <div style={{ background: '#DBEAFE', color: '#1E3A8A', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>{syncNotice}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Đang chờ', value: stats.waiting, bg: '#F3F4F6', color: '#374151' },
              { label: 'Đã đến', value: stats.arrived, bg: '#DBEAFE', color: '#1D4ED8' },
              { label: 'Đã đón', value: stats.picked, bg: '#EDE9FE', color: '#6D28D9' },
              { label: 'Đã trả', value: stats.dropped, bg: '#DCFCE7', color: '#166534' },
              { label: 'Hủy', value: stats.cancelled, bg: '#FEE2E2', color: '#B91C1C' }
            ].map((item) => (
              <div key={item.label} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>{item.label}</div>
                <span style={{ padding: '6px 12px', borderRadius: 999, background: item.bg, color: item.color, fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#EFF6FF', padding: '12px 20px', borderRadius: 12, marginBottom: 16, color: '#1E3A8A', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span>Xe: <strong>{detail.route.BienSo}</strong></span>
            <span>Ghế: <strong>{(detail.stops || []).reduce((sum, stop) => sum + Number(stop.SoLuongGhe || 0), 0)}/{detail.route.SoCho || 0}</strong></span>
            <span>Lộ trình: <strong>{routeSummaryLabel}</strong></span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: 16 }}>
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', minHeight: 520, border: '1px solid #E5E7EB' }}>
              <iframe title="Bản đồ lộ trình" width="100%" height="100%" style={{ border: 0, minHeight: 520 }} loading="lazy" allowFullScreen src={`https://maps.google.com/maps?q=${encodeURIComponent(currentMapLocation)}&t=&z=13&ie=UTF8&iwloc=&output=embed`} />
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, background: 'rgba(255,255,255,0.92)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)' }}>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Vị trí ước tính theo điểm đón hiện tại</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{currentMapLocation}</div>
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20 }}>LỘ TRÌNH DỰ KIẾN</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {detail.stops.map((stop) => {
                  const badge = getStopBadge(stop.TrangThaiKhach)
                  return (
                    <div key={stop.MaChiTiet} style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: 14, background: isDoneStatus(stop.TrangThaiKhach) ? '#F0FDF4' : '#FFFFFF' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{stop.TenKhachHang}</div>
                          <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}>Đón: {stop.DiemDon}</div>
                          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>{stop.SoLuongGhe} ghế • VE{String(stop.MaVe).padStart(3, '0')}</div>
                          <span style={{ padding: '5px 10px', borderRadius: 999, background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 700 }}>{badge.label}</span>
                        </div>
                        <div style={{ minWidth: 170 }}>
                          <select value={stop.TrangThaiKhach || ''} onChange={(e) => updateStopStatus(stop.MaChiTiet, e.target.value)} disabled={!canUpdateStops || saving || isDoneStatus(stop.TrangThaiKhach)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontWeight: 600, cursor: !canUpdateStops || saving || isDoneStatus(stop.TrangThaiKhach) ? 'not-allowed' : 'pointer' }}>
                            <option value="" disabled>Đang chờ</option>
                            {STOP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {showIncidentModal && (
            <div style={modalOverlayStyle}>
              <div style={modalStyle}>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Báo cáo sự cố lộ trình</h3>
                <textarea value={incidentDesc} onChange={(e) => setIncidentDesc(e.target.value)} placeholder="Nhập mô tả sự cố" style={textareaStyle} />
                <input value={incidentLoc} onChange={(e) => setIncidentLoc(e.target.value)} placeholder="Vị trí sự cố (nếu có)" style={inputStyle} />
                {incidentError && <div style={{ color: '#B91C1C', marginBottom: 12 }}>{incidentError}</div>}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button disabled={incidentSaving} onClick={() => setShowIncidentModal(false)} style={secondaryButtonStyle}>Hủy</button>
                  <button disabled={incidentSaving} onClick={reportIncident} style={primaryButtonStyle}>Gửi</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DriverLayout>
  )
}

const primaryButtonStyle: React.CSSProperties = { padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0A3B73', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }
const secondaryButtonStyle: React.CSSProperties = { padding: '10px 18px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontWeight: 700, cursor: 'pointer' }
const infoButtonStyle: React.CSSProperties = { ...secondaryButtonStyle, background: '#DBEAFE', color: '#1E3A8A', border: 'none' }
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }
const modalStyle: React.CSSProperties = { width: 420, background: '#FFFFFF', borderRadius: 16, padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }
const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 120, borderRadius: 8, border: '1px solid #D1D5DB', padding: 14, fontSize: 14, outline: 'none', resize: 'none', marginBottom: 12, boxSizing: 'border-box' }
const inputStyle: React.CSSProperties = { width: '100%', height: 44, borderRadius: 8, border: '1px solid #D1D5DB', padding: '0 14px', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }
