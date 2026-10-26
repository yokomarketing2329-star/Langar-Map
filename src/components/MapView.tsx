import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Ui } from '../lib/view'
import type { Bounds, LatLng } from '../lib/types'

const BOWL =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0z" fill="#fff" fill-opacity=".25"/>' +
  '<path d="M9 8.2c-.9-.9-.9-1.9 0-2.8M15 8.2c-.9-.9-.9-1.9 0-2.8"/></svg>'

const CLUSTER_CELL_PX = 64
const CLUSTER_MAX_ZOOM = 15

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c)
}

function pinIcon(active: boolean, selected: boolean, label: string | null) {
  const size = selected ? 52 : 42
  const cls = `bm-dot ${active ? 'bm-dot--active' : 'bm-dot--idle'} ${selected ? 'bm-dot--sel' : ''}`
  const tag = selected && label ? `<div class="bm-label">${esc(label)}</div>` : ''
  return L.divIcon({
    className: 'bm-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="${cls}" style="width:${size}px;height:${size}px">${BOWL}</div>${tag}`,
  })
}

function clusterIcon(count: number, hasActive: boolean) {
  const size = count > 9 ? 50 : 44
  return L.divIcon({
    className: 'bm-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="bm-cluster ${hasActive ? '' : 'bm-cluster--idle'}" style="width:${size}px;height:${size}px">${count}</div>`,
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

interface Spec {
  key: string
  lat: number
  lng: number
  sig: string
  icon: L.DivIcon
  z: number
  onClick: () => void
}

export default function MapView({ items, selectedId, userPos, focus, onSelect, onBounds }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<Map<string, { mk: L.Marker; sig: string }>>(new Map())
  const you = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onBounds })
  cb.current = { onSelect, onBounds }
  const data = useRef({ items, selectedId })
  data.current = { items, selectedId }
  const draw = useRef<() => void>(() => {})

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView([30.9, 75.85], 12)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(m)

    // Draw pins; nearby pins merge into a numbered cluster when zoomed out.
    draw.current = () => {
      const { items: list, selectedId: sel } = data.current
      const zoom = m.getZoom()
      const specs: Spec[] = []
      const cells = new Map<string, Ui[]>()
      for (const u of list) {
        if (u.status === 'expired') continue
        if (u.b.short_id === sel || zoom >= CLUSTER_MAX_ZOOM) { specs.push(single(u, u.b.short_id === sel)); continue }
        const p = m.project([u.b.latitude, u.b.longitude], zoom)
        const k = `${Math.floor(p.x / CLUSTER_CELL_PX)}:${Math.floor(p.y / CLUSTER_CELL_PX)}`
        const arr = cells.get(k)
        if (arr) arr.push(u); else cells.set(k, [u])
      }
      for (const [k, arr] of cells) {
        if (arr.length === 1) { specs.push(single(arr[0], false)); continue }
        const lat = arr.reduce((s, u) => s + u.b.latitude, 0) / arr.length
        const lng = arr.reduce((s, u) => s + u.b.longitude, 0) / arr.length
        const hasActive = arr.some((u) => u.status === 'active')
        specs.push({
          key: `c:${k}`, lat, lng, sig: `c|${arr.length}|${hasActive}|${arr.map((u) => u.b.short_id).join(',')}`,
          icon: clusterIcon(arr.length, hasActive), z: 300,
          onClick: () => m.fitBounds(L.latLngBounds(arr.map((u) => [u.b.latitude, u.b.longitude] as [number, number])), { padding: [60, 60], maxZoom: 17 }),
        })
      }
      const seen = new Set<string>()
      for (const s of specs) {
        seen.add(s.key)
        const have = markers.current.get(s.key)
        if (!have) {
          const mk = L.marker([s.lat, s.lng], { icon: s.icon, keyboard: false, zIndexOffset: s.z })
          mk.on('click', () => s.onClick())
          mk.addTo(m)
          markers.current.set(s.key, { mk, sig: s.sig })
        } else {
          have.mk.off('click').on('click', () => s.onClick())
          have.mk.setZIndexOffset(s.z)
          if (have.sig !== s.sig) { have.mk.setLatLng([s.lat, s.lng]).setIcon(s.icon); have.sig = s.sig }
        }
      }
      for (const [key, v] of markers.current) {
        if (!seen.has(key)) { v.mk.remove(); markers.current.delete(key) }
      }
    }

    function single(u: Ui, sel: boolean): Spec {
      const active = u.status === 'active'
      const label = u.b.name
      return {
        key: `p:${u.b.short_id}`, lat: u.b.latitude, lng: u.b.longitude,
        sig: `p|${active}|${sel}|${sel ? label : ''}|${u.b.latitude}|${u.b.longitude}`,
        icon: pinIcon(active, sel, label), z: sel ? 1000 : active ? 500 : 100,
        onClick: () => cb.current.onSelect(u.b.short_id),
      }
    }

    const report = () => {
      const b = m.getBounds()
      cb.current.onBounds({ minLat: b.getSouth(), maxLat: b.getNorth(), minLng: b.getWest(), maxLng: b.getEast() })
    }
    m.on('moveend', report)
    m.on('zoomend', () => draw.current())
    map.current = m
    report()
    draw.current()
    setTimeout(() => m.invalidateSize(), 100)
    return () => { m.remove(); map.current = null; markers.current.clear() }
  }, [])

  // Re-draw pins whenever the data or the selected place changes.
  useEffect(() => { draw.current() }, [items, selectedId])

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
