import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Ui } from '../lib/view'
import type { Bounds, LatLng } from '../lib/types'

const GREEN = '#16803C'
const GRAY = '#8B8F98'

function pin(color: string, selected: boolean) {
  const s = selected ? 46 : 38
  return L.divIcon({
    className: 'bm-pin',
    iconSize: [s, s],
    iconAnchor: [s / 2, s],
    html: `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 1.5C7.3 1.5 3.8 5 3.8 9.5c0 6 8.2 13 8.2 13s8.2-7 8.2-13C20.2 5 16.7 1.5 12 1.5z" fill="${color}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="9.5" r="3.2" fill="#fff"/></svg>`,
  })
}

const youIcon = L.divIcon({
  className: 'bm-you',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div class="bm-you-dot"></div>',
})

export interface Focus { lat: number; lng: number; zoom?: number; token: number }

interface Props {
  items: Ui[]
  selectedId: string | null
  userPos: LatLng | null
  focus: Focus | null
  onSelect: (shortId: string) => void
  onBounds: (b: Bounds) => void
}

export default function MapView({ items, selectedId, userPos, focus, onSelect, onBounds }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<Map<string, L.Marker>>(new Map())
  const you = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onBounds })
  cb.current = { onSelect, onBounds }

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([30.9, 75.85], 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    const report = () => {
      const b = m.getBounds()
      cb.current.onBounds({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() })
    }
    m.on('moveend', report)
    map.current = m
    report()
    setTimeout(() => m.invalidateSize(), 100)
    return () => { m.remove(); map.current = null; markers.current.clear() }
  }, [])

  // Sync markers (add/update/remove) — only touches what changed.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    for (const u of items) {
      if (u.status === 'expired') continue
      const id = u.b.short_id
      seen.add(id)
      const color = u.status === 'active' ? GREEN : GRAY
      const sel = id === selectedId
      let mk = markers.current.get(id)
      if (!mk) {
        mk = L.marker([u.b.latitude, u.b.longitude], { icon: pin(color, sel), keyboard: false })
        mk.on('click', () => cb.current.onSelect(id))
        mk.addTo(m)
        markers.current.set(id, mk)
      } else {
        mk.setLatLng([u.b.latitude, u.b.longitude]).setIcon(pin(color, sel))
      }
      mk.setZIndexOffset(sel ? 1000 : u.status === 'active' ? 500 : 0)
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) { mk.remove(); markers.current.delete(id) }
    }
  }, [items, selectedId])

  // Blue dot for the user (kept only in this browser, never sent anywhere).
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!userPos) { you.current?.remove(); you.current = null; return }
    if (!you.current) you.current = L.marker([userPos.lat, userPos.lng], { icon: youIcon, interactive: false, zIndexOffset: 2000 }).addTo(m)
    else you.current.setLatLng([userPos.lat, userPos.lng])
  }, [userPos])

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], focus.zoom ?? 16, { duration: 0.8 })
  }, [focus])

  return <div ref={el} className="absolute inset-0 z-0" role="application" aria-label="Map" />
}
