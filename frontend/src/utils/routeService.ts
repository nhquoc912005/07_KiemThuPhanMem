import type { LatLngExpression } from 'leaflet'

interface OsrmRouteResponse {
  code: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: {
      coordinates?: [number, number][]
    }
  }>
}

export interface ShortestRouteResult {
  positions: LatLngExpression[]
  distanceKm: number
  durationMin: number
}

const OSRM_ROUTE_NOT_FOUND_MESSAGE = 'Không tìm thấy tuyến đường phù hợp'
const OSRM_ROUTE_FETCH_FAILED_MESSAGE = 'Không thể tính tuyến đường'

export async function fetchShortestRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  signal?: AbortSignal
): Promise<ShortestRouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}` +
    `?overview=full&geometries=geojson&steps=true`

  const response = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(OSRM_ROUTE_FETCH_FAILED_MESSAGE)
  }

  const data = (await response.json()) as OsrmRouteResponse

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(OSRM_ROUTE_NOT_FOUND_MESSAGE)
  }

  const route = data.routes[0]
  const coordinates = route.geometry?.coordinates

  if (!coordinates?.length) {
    throw new Error(OSRM_ROUTE_NOT_FOUND_MESSAGE)
  }

  return {
    positions: coordinates.map(([lng, lat]) => [lat, lng] as LatLngExpression),
    distanceKm: Number(route.distance || 0) / 1000,
    durationMin: Number(route.duration || 0) / 60
  }
}

export { OSRM_ROUTE_FETCH_FAILED_MESSAGE, OSRM_ROUTE_NOT_FOUND_MESSAGE }
