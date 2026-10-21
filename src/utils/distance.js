const EARTH_RADIUS_KM = 6371.0088

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * Validates and normalizes coordinate inputs.
 * Accepts { lat, lng } or { latitude, longitude } (numbers or valid non-empty numeric strings).
 * Returns { lat: number, lng: number } if valid and within Earth bounds (-90..90, -180..180),
 * or null if missing, non-finite, or invalid.
 */
export function parseCoordinate(coords) {
  if (!coords || typeof coords !== 'object') return null
  const rawLat = coords.lat !== undefined ? coords.lat : coords.latitude
  const rawLng = coords.lng !== undefined ? coords.lng : (coords.lon !== undefined ? coords.lon : coords.longitude)
  if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) return null
  if (typeof rawLat === 'string' && rawLat.trim() === '') return null
  if (typeof rawLng === 'string' && rawLng.trim() === '') return null
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/**
 * Great-circle ("straight-line") distance in km between two { lat, lng } points.
 * This is NOT walking or road distance and usually under-estimates the real route.
 * Anything shown to users from this must say "straight-line".
 */
export function straightLineKm(a, b) {
  const coordA = parseCoordinate(a) || a
  const coordB = parseCoordinate(b) || b
  const dLat = toRad(coordB.lat - coordA.lat)
  const dLng = toRad(coordB.lng - coordA.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coordA.lat)) * Math.cos(toRad(coordB.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const DISTANCE_METHOD = Object.freeze({
  ROUTE: 'route',
  STRAIGHT_LINE: 'straight_line',
})

export const DISTANCE_METHOD_LABEL = {
  [DISTANCE_METHOD.ROUTE]: 'route distance',
  [DISTANCE_METHOD.STRAIGHT_LINE]: 'straight-line distance',
}

/** Display only. Never pass a formatted/rounded value into fee calculation. */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(km < 10 ? 2 : 1)} km`
}

/** Formats distance in km to exactly two decimal places for UI display (e.g., "0.80"). */
export function formatDistanceKm(km) {
  if (typeof km !== 'number' || !Number.isFinite(km)) return '0.00'
  return km.toFixed(2)
}

