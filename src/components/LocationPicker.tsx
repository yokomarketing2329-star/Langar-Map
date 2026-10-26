import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Search } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { getCurrentPosition, searchPlace, type GeoResult } from '../lib/geo'
import type { LatLng } from '../lib/types'

interface Props {
  initial: LatLng
  zoom?: number
  height?: string
  onChange: (p: LatLng) => void
}

/** Fixed pin in the middle; the user moves the MAP under it (works well on touch screens). */
export default function LocationPicker({ initial, zoom = 17, height = 'h-72', onChange }: Props) {
  const { t, lang } = useI18n()
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const cb = useRef(onChange)
  cb.current = onChange
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false }).setView([initial.lat, initial.lng], zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    m.on('moveend', () => { const c = m.getCenter(); cb.current({ lat: c.lat, lng: c.lng }) })
    map.current = m
    cb.current(initial)
    setTimeout(() => m.invalidateSize(), 150)
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = (p: LatLng) => map.current?.setView([p.lat, p.lng], 17)

  async function useGps() {
    setMsg('')
    try { goTo(await getCurrentPosition()) } catch (e) {
      setMsg(t((e as Error).message === 'gps_unsupported' ? 'gps_unsupported' : 'gps_denied'))
    }
  }

  async function doSearch() {
    if (q.trim().length < 3) return
    setBusy(true); setMsg('')
    try {
      const r = await searchPlace(q.trim(), lang)
      setResults(r)
      if (!r.length) setMsg(t('search_failed'))
    } catch { setMsg(t('search_failed')) }
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_place')}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3"
        />
        <button onClick={doSearch} disabled={busy} className="rounded-xl bg-gray-900 px-4 text-white" aria-label={t('search_btn')}>
          <Search size={20} />
        </button>
      </div>
      {results.length > 0 && (
        <ul className="max-h-40 overflow-auto rounded-xl bg-white ring-1 ring-black/10">
          {results.map((r, i) => (
            <li key={i}>
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => { goTo(r); setResults([]) }}
              >{r.label}</button>
            </li>
          ))}
        </ul>
      )}
      <div className={`relative ${height} overflow-hidden rounded-2xl ring-1 ring-black/10`}>
        <div ref={el} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
          <svg width="44" height="44" viewBox="0 0 24 24">
            <path d="M12 1.5C7.3 1.5 3.8 5 3.8 9.5c0 6 8.2 13 8.2 13s8.2-7 8.2-13C20.2 5 16.7 1.5 12 1.5z" fill="#FF8C00" stroke="#fff" strokeWidth="1.6" />
            <circle cx="12" cy="9.5" r="3.2" fill="#fff" />
          </svg>
        </div>
        <button
          onClick={useGps}
          className="absolute left-2 top-2 z-[500] inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold shadow ring-1 ring-black/10"
        >
          <Crosshair size={16} /> {t('use_my_location')}
        </button>
      </div>
      <p className="text-sm text-gray-600">{t('move_map_hint')}</p>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  )
}
