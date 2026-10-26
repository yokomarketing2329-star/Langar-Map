import type { Bounds, LatLng } from './types'

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function googleMapsNavUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

/** Pad bounds so small pans don't trigger refetches. */
export function padBounds(b: Bounds, factor = 0.25): Bounds {
  const dLat = (b.maxLat - b.minLat) * factor
  const dLng = (b.maxLng - b.minLng) * factor
  return { minLat: b.minLat - dLat, maxLat: b.maxLat + dLat, minLng: b.minLng - dLng, maxLng: b.maxLng + dLng }
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return outer.minLat <= inner.minLat && outer.maxLat >= inner.maxLat && outer.minLng <= inner.minLng && outer.maxLng >= inner.maxLng
}

export interface GeoResult { lat: number; lng: number; label: string }

/** Free OpenStreetMap search (Nominatim). Light personal use only; we debounce & only search on demand. */
export async function searchPlace(q: string, lang: string): Promise<GeoResult[]> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}&accept-language=${lang}`,
  )
  if (!r.ok) throw new Error('search_failed')
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  return j.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }))
}

export async function reverseGeocode(p: LatLng, lang: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&accept-language=${lang}`,
    )
    if (!r.ok) return null
    const j = (await r.json()) as { display_name?: string }
    return j.display_name?.slice(0, 290) ?? null
  } catch {
    return null
  }
}

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('gps_unsupported'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('gps_denied')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  })
}
