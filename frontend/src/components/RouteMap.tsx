import React, { useEffect, useMemo, useState } from 'react'
import L, { type LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import {
  fetchShortestRoute,
  OSRM_ROUTE_FETCH_FAILED_MESSAGE,
  OSRM_ROUTE_NOT_FOUND_MESSAGE
} from '../utils/routeService'

interface Coordinates {
  lat: number
  lng: number
}

type NavigationTripStatus =
  | 'ASSIGNED'
  | 'GOING_TO_PICKUP'
  | 'PICKED_UP'
  | 'GOING_TO_DROPOFF'
  | 'COMPLETED'

export interface NavigationTrip {
  tripId: number | null
  customerName: string | null
  pickupAddress: string | null
  pickupLat: number | null
  pickupLng: number | null
  dropoffAddress: string | null
  dropoffLat: number | null
  dropoffLng: number | null
  driverId: number | null
  tripStatus: NavigationTripStatus
  currentStageLabel?: string | null
  activeStopId?: number | null
  activeStopStatus?: string | null
  routeStatus?: string | null
}

interface RouteMapProps {
  trip: NavigationTrip | null
  minHeight?: number
}

interface RouteInfo {
  distanceKm: number
  durationMin: number
}

const DEFAULT_CENTER: Coordinates = { lat: 16.0544, lng: 108.2022 }
const DEFAULT_MIN_HEIGHT = 520
const DEFAULT_ZOOM = 13
const MAP_PADDING: L.PointExpression = [48, 48]
const ROUTE_COLOR = '#0A3B73'
const TRIP_COORDINATES_MISSING_MESSAGE = 'Thiếu tọa độ điểm đón hoặc điểm trả'

const pickupIcon = buildPinIcon('#F97316', 'Đ')
const dropoffIcon = buildPinIcon('#059669', 'T')

function buildPinIcon(color: string, label: string) {
  return L.divIcon({
    className: 'route-map-marker-icon',
    html: `
      <div style="position: relative; width: 34px; height: 46px;">
        <svg width="34" height="46" viewBox="0 0 34 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C8.16 0 1 7.11 1 15.88C1 27.35 17 46 17 46C17 46 33 27.35 33 15.88C33 7.11 25.84 0 17 0Z" fill="${color}"/>
          <circle cx="17" cy="16" r="9.5" fill="white"/>
        </svg>
        <span style="position: absolute; left: 50%; top: 16px; transform: translate(-50%, -50%); font-size: 10px; font-weight: 700; color: ${color}; line-height: 1;">
          ${label}
        </span>
      </div>
    `,
    iconSize: [34, 46],
    iconAnchor: [17, 46],
    popupAnchor: [0, -40]
  })
}

function toCoordinates(latValue: number | null | undefined, lngValue: number | null | undefined) {
  const lat = Number(latValue)
  const lng = Number(lngValue)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null
  }

  return { lat, lng }
}

function toLatLngTuple(position: LatLngExpression) {
  if (Array.isArray(position)) {
    const [lat, lng] = position
    return [Number(lat), Number(lng)] as L.LatLngTuple
  }

  if (typeof position === 'object' && position !== null && 'lat' in position && 'lng' in position) {
    return [Number(position.lat), Number(position.lng)] as L.LatLngTuple
  }

  return null
}

function formatDistance(distanceKm: number) {
  if (distanceKm >= 1) {
    return `${distanceKm.toFixed(1)} km`
  }

  return `${Math.round(distanceKm * 1000)} m`
}

function formatDuration(durationMin: number) {
  const roundedMinutes = Math.max(1, Math.round(durationMin))
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (!hours) {
    return `${roundedMinutes} phút`
  }

  if (!minutes) {
    return `${hours} giờ`
  }

  return `${hours} giờ ${minutes} phút`
}

function getStagePresentation(tripStatus: NavigationTripStatus, currentStageLabel?: string | null) {
  if (tripStatus === 'COMPLETED') {
    return {
      label: currentStageLabel || 'Hoàn thành',
      background: '#DCFCE7',
      color: '#166534'
    }
  }

  if (tripStatus === 'PICKED_UP') {
    return {
      label: currentStageLabel || 'Đã đón khách',
      background: '#EDE9FE',
      color: '#6D28D9'
    }
  }

  if (tripStatus === 'GOING_TO_DROPOFF') {
    return {
      label: currentStageLabel || 'Đang đến điểm trả',
      background: '#E0F2FE',
      color: '#0F4C81'
    }
  }

  return {
    label: currentStageLabel || 'Đang đến điểm đón',
    background: '#DBEAFE',
    color: '#1D4ED8'
  }
}

function FitBoundsController({
  pickupLocation,
  dropoffLocation,
  routePositions
}: {
  pickupLocation: Coordinates | null
  dropoffLocation: Coordinates | null
  routePositions: LatLngExpression[]
}) {
  const map = useMap()

  useEffect(() => {
    const bounds = L.latLngBounds([])

    routePositions.forEach((position) => {
      const point = toLatLngTuple(position)
      if (point) {
        bounds.extend(point)
      }
    })

    if (pickupLocation) {
      bounds.extend([pickupLocation.lat, pickupLocation.lng])
    }

    if (dropoffLocation) {
      bounds.extend([dropoffLocation.lat, dropoffLocation.lng])
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: MAP_PADDING })
      return
    }

    if (pickupLocation) {
      map.setView([pickupLocation.lat, pickupLocation.lng], DEFAULT_ZOOM)
      return
    }

    if (dropoffLocation) {
      map.setView([dropoffLocation.lat, dropoffLocation.lng], DEFAULT_ZOOM)
      return
    }

    map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_ZOOM)
  }, [dropoffLocation, map, pickupLocation, routePositions])

  return null
}

export const RouteMap: React.FC<RouteMapProps> = ({ trip, minHeight = DEFAULT_MIN_HEIGHT }) => {
  const pickupLocation = useMemo(
    () => toCoordinates(trip?.pickupLat ?? null, trip?.pickupLng ?? null),
    [trip?.pickupLat, trip?.pickupLng]
  )
  const dropoffLocation = useMemo(
    () => toCoordinates(trip?.dropoffLat ?? null, trip?.dropoffLng ?? null),
    [trip?.dropoffLat, trip?.dropoffLng]
  )
  const stage = getStagePresentation(trip?.tripStatus || 'ASSIGNED', trip?.currentStageLabel)

  const [routePositions, setRoutePositions] = useState<LatLngExpression[]>([])
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [lastRouteUpdatedAt, setLastRouteUpdatedAt] = useState<number | null>(null)
  const pickupLat = pickupLocation?.lat ?? null
  const pickupLng = pickupLocation?.lng ?? null
  const dropoffLat = dropoffLocation?.lat ?? null
  const dropoffLng = dropoffLocation?.lng ?? null
  const hasTrip = Boolean(trip)
  const hasRouteCoordinates =
    pickupLat !== null && pickupLng !== null && dropoffLat !== null && dropoffLng !== null
  const visibleRoutePositions = hasRouteCoordinates ? routePositions : []
  const visibleRouteInfo = hasRouteCoordinates ? routeInfo : null
  const visibleRouteError = !hasTrip
    ? null
    : hasRouteCoordinates
      ? routeError
      : TRIP_COORDINATES_MISSING_MESSAGE
  const visibleLastRouteUpdatedAt = hasRouteCoordinates ? lastRouteUpdatedAt : null
  const visibleLoading = hasRouteCoordinates ? isLoadingRoute : false

  useEffect(() => {
    if (!hasTrip || !hasRouteCoordinates) {
      return
    }

    const controller = new AbortController()
    const loadRoute = async () => {
      setIsLoadingRoute(true)
      setRouteError(null)
      setRoutePositions([])
      setRouteInfo(null)

      try {
        const result = await fetchShortestRoute(
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
          controller.signal
        )

        if (controller.signal.aborted) {
          return
        }

        setRoutePositions(result.positions)
        setRouteInfo({
          distanceKm: result.distanceKm,
          durationMin: result.durationMin
        })
        setLastRouteUpdatedAt(Date.now())
      } catch (error: unknown) {
        if ((error as { name?: string }).name === 'AbortError') {
          return
        }

        console.error('OSRM shortest route error:', {
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
          error
        })

        setRoutePositions([])
        setRouteInfo(null)
        setLastRouteUpdatedAt(null)

        const message = error instanceof Error ? error.message : OSRM_ROUTE_FETCH_FAILED_MESSAGE
        setRouteError(
          message === OSRM_ROUTE_NOT_FOUND_MESSAGE
            ? OSRM_ROUTE_NOT_FOUND_MESSAGE
            : OSRM_ROUTE_FETCH_FAILED_MESSAGE
        )
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingRoute(false)
        }
      }
    }

    void loadRoute()

    return () => {
      controller.abort()
    }
  }, [dropoffLat, dropoffLng, hasRouteCoordinates, hasTrip, pickupLat, pickupLng])

  if (!trip) {
    return (
      <div style={{ ...mapShellStyle, minHeight, height: minHeight }}>
        <div style={emptyStateStyle}>Chưa có chuyến được phân công để hiển thị bản đồ.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {visibleRouteError && <div style={errorBannerStyle}>{visibleRouteError}</div>}

      <div style={destinationCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={destinationTitleStyle}>{trip.customerName || 'Khách hàng trung chuyển'}</div>
            <div style={destinationAddressStyle}>Tuyến ngắn nhất giữa điểm đón và điểm trả</div>
          </div>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: stage.background,
              color: stage.color,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}
          >
            {stage.label}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13, color: '#475569' }}>
          <div>
            <strong>Điểm đón:</strong> {trip.pickupAddress || '--'}
          </div>
          <div>
            <strong>Điểm trả:</strong> {trip.dropoffAddress || '--'}
          </div>
          <div style={{ color: '#0F4C81', fontWeight: 600 }}>
            OSRM đang tính tuyến xe chạy ngắn nhất theo đường thực tế giữa hai điểm.
          </div>
        </div>
      </div>

      <div style={{ ...mapShellStyle, minHeight, height: minHeight }}>
        <MapContainer
          center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBoundsController
            pickupLocation={pickupLocation}
            dropoffLocation={dropoffLocation}
            routePositions={visibleRoutePositions}
          />

          {pickupLocation && <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon} />}
          {dropoffLocation && <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={dropoffIcon} />}

          {visibleRoutePositions.length > 0 && (
            <Polyline
              positions={visibleRoutePositions}
              pathOptions={{
                color: ROUTE_COLOR,
                opacity: 0.92,
                weight: 6
              }}
            />
          )}
        </MapContainer>
      </div>

      <div style={estimatedLocationBoxStyle}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <div>
            <div style={infoLabelStyle}>Quãng đường ngắn nhất</div>
            <div style={infoValueStyle}>
              {visibleRouteInfo ? formatDistance(visibleRouteInfo.distanceKm) : '--'}
            </div>
          </div>

          <div>
            <div style={infoLabelStyle}>Thời gian dự kiến</div>
            <div style={infoValueStyle}>
              {visibleRouteInfo ? formatDuration(visibleRouteInfo.durationMin) : '--'}
            </div>
          </div>

          <div>
            <div style={infoLabelStyle}>Trạng thái hiện tại</div>
            <div style={infoValueStyle}>{stage.label}</div>
          </div>

          <div>
            <div style={infoLabelStyle}>Lần cập nhật gần nhất</div>
            <div style={infoValueStyle}>
              {visibleLastRouteUpdatedAt
                ? new Date(visibleLastRouteUpdatedAt).toLocaleTimeString('vi-VN')
                : '--'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: '#475569' }}>
          {visibleLoading
            ? 'Đang tính tuyến đường ngắn nhất giữa điểm đón và điểm trả...'
            : visibleRouteError || 'Tuyến đường được làm mới khi tọa độ điểm đón hoặc điểm trả thay đổi.'}
        </div>
      </div>
    </div>
  )
}

const mapShellStyle: React.CSSProperties = {
  position: 'relative',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid #E5E7EB',
  background: '#F8FAFC'
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: DEFAULT_MIN_HEIGHT,
  padding: '24px',
  color: '#475569',
  textAlign: 'center'
}

const errorBannerStyle: React.CSSProperties = {
  background: '#FFF7ED',
  border: '1px solid #FB923C',
  color: '#9A3412',
  borderRadius: 10,
  padding: '12px 16px',
  fontSize: 14,
  lineHeight: 1.5
}

const destinationCardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: '14px 16px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.08)'
}

const destinationTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#0F172A',
  marginBottom: 4
}

const destinationAddressStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: '#1E3A8A',
  fontWeight: 600
}

const estimatedLocationBoxStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  padding: '12px 14px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.08)'
}

const infoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#64748B',
  marginBottom: 4
}

const infoValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#0F172A'
}
