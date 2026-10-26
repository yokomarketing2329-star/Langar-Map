import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, Locate, Map as MapIcon, Plus, ShieldCheck, WifiOff } from 'lucide-react'
import MapView, { type Focus } from './components/MapView'
import ListView from './components/ListView'
import DetailsSheet from './components/DetailsSheet'
import AddFlow from './components/AddFlow'
import InstallButton from './components/InstallButton'
import Sheet from './components/Sheet'
import { LANGS, useI18n, type Lang } from './lib/i18n'
import { supabase, isConfigured } from './lib/supabase'
import { getBhandara, listBhandaras } from './lib/api'
import { boundsContain, distanceMeters, getCurrentPosition, padBounds } from './lib/geo'
import { msUntilNextChange } from './lib/status'
import { toUi, type Ui } from './lib/view'
import type { Bhandara, Bounds, FilterKey, LatLng } from './lib/types'

const DEFAULT_CENTER: LatLng = { lat: 30.9, lng: 75.85 }
const NEARBY_M = 5000
const RECENT_MS = 3 * 60 * 60 * 1000
const POLL_MS = 60_000

function shortIdFromPath(): string | null {
  const m = location.pathname.match(/^\/bhandara\/([A-Za-z0-9]+)\/?$/)
  return m ? m[1] : null
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const [items, setItems] = useState<Record<string, Bhandara>>({})
  const [filter, setFilter] = useState<FilterKey>('active')
  const [view, setView] = useState<'map' | 'list'>('map')
  const [selectedId, setSelectedId] = useState<string | null>(shortIdFromPath())
  const [adding, setAdding] = useState(false)
  const [userPos, setUserPos] = useState<LatLng | null>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [now, setNow] = useState(Date.now())
  const [skew, setSkew] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [privacy, setPrivacy] = useState(false)
  const [gpsMsg, setGpsMsg] = useState('')

  const viewBounds = useRef<Bounds | null>(null)
  const fetchedBounds = useRef<Bounds | null>(null)
  const debounce = useRef<number>()
  const focusToken = useRef(0)

  const toast = useCallback((m: string) => {
    setToastMsg(m)
    window.setTimeout(() => setToastMsg(''), 2800)
  }, [])

  const upsert = useCallback((list: Bhandara[], replace: boolean) => {
    setItems((prev) => {
      const next: Record<string, Bhandara> = replace ? {} : { ...prev }
      if (replace && selectedRef.current && prev[selectedRef.current]) next[selectedRef.current] = prev[selectedRef.current]
      for (const b of list) next[b.short_id] = b
      return next
    })
    if (list[0]) setSkew(Date.parse(list[0].server_now) - Date.now())
  }, [])

  const selectedRef = useRef<string | null>(selectedId)
  selectedRef.current = selectedId

  const refresh = useCallback(async (force = false) => {
    if (!isConfigured) { setLoaded(true); return }
    const vb = viewBounds.current
    if (!vb) return
    if (!force && fetchedBounds.current && boundsContain(fetchedBounds.current, vb)) return
    const pb = padBounds(vb, 0.5)
    try {
      const list = await listBhandaras(pb)
      fetchedBounds.current = pb
      upsert(list, true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
    setLoaded(true)
  }, [upsert])

  const onBounds = useCallback((b: Bounds) => {
    viewBounds.current = b
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => refresh(false), 350)
  }, [refresh])

  // Shared link: load that Bhandara and focus the map on it.
  useEffect(() => {
    const id = shortIdFromPath()
    if (!id || !isConfigured) return
    getBhandara(id).then((b) => {
      if (!b) { setSelectedId(null); history.replaceState(null, '', '/'); toast(t('err_not_found')); return }
      upsert([b], false)
      setFocus({ lat: b.latitude, lng: b.longitude, zoom: 16, token: ++focusToken.current })
    }).catch(() => setFailed(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Browser back/forward.
  useEffect(() => {
    const onPop = () => setSelectedId(shortIdFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Real-time updates + polling fallback.
  useEffect(() => {
    if (!isConfigured) return
    let timer: number | undefined
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => refresh(true), 1200) }
    const channel = supabase.channel('bhandaras-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bhandaras' }, soon)
      .subscribe()
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(true) }, POLL_MS)
    const vis = () => { if (document.visibilityState === 'visible') refresh(true) }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', vis)
    return () => {
      window.clearTimeout(timer); window.clearInterval(poll)
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis)
      supabase.removeChannel(channel)
    }
  }, [refresh])

  // Exact client-side scheduling: re-evaluate when the next 6 PM flip or expiry happens,
  // so markers change/disappear on screen with no refresh.
  useEffect(() => {
    const t0 = Date.now() + skew
    let next = 60_000
    for (const b of Object.values(items)) {
      const d = msUntilNextChange(
        { status: b.status === 'active' ? 'active' : 'inactive', last_verified_at: b.last_verified_at, expires_at: b.expires_at }, t0)
      if (d > 0) next = Math.min(next, d + 250)
    }
    const id = window.setTimeout(() => setNow(Date.now() + skew), Math.max(1000, next))
    return () => window.clearTimeout(id)
  }, [items, now, skew])

  const locate = useCallback(async (flyTo = true) => {
    setGpsMsg('')
    try {
      const p = await getCurrentPosition()
      setUserPos(p)
      if (flyTo) setFocus({ lat: p.lat, lng: p.lng, zoom: 15, token: ++focusToken.current })
    } catch (e) {
      setGpsMsg(t((e as Error).message === 'gps_unsupported' ? 'gps_unsupported' : 'gps_denied'))
      window.setTimeout(() => setGpsMsg(''), 4000)
    }
  }, [t])

  // Ask for location once on open (the browser shows its own permission prompt).
  useEffect(() => { locate(true) }, [locate])

  const all: Ui[] = useMemo(
    () => Object.values(items).map((b) => toUi(b, now, userPos ? distanceMeters(userPos, { lat: b.latitude, lng: b.longitude }) : null))
      .filter((u) => u.status !== 'expired'),
    [items, now, userPos],
  )

  const visible: Ui[] = useMemo(() => {
    let r = all
    if (filter === 'active') r = r.filter((u) => u.status === 'active')
    if (filter === 'nearby' && userPos) r = r.filter((u) => u.distance != null && u.distance <= NEARBY_M)
    if (filter === 'recent') r = r.filter((u) => now - Date.parse(u.b.last_verified_at) <= RECENT_MS || now - Date.parse(u.b.updated_at) <= RECENT_MS)
    const rank = (u: Ui) => (u.status === 'active' ? 0 : 1)
    return [...r].sort((a, b) =>
      filter === 'recent'
        ? Date.parse(b.b.last_verified_at) - Date.parse(a.b.last_verified_at)
        : rank(a) - rank(b) || (a.distance ?? 0) - (b.distance ?? 0))
  }, [all, filter, userPos, now])

  const selected = selectedId ? all.find((u) => u.b.short_id === selectedId) ?? null : null

  // Close the sheet if the open place expires while someone is looking at it.
  useEffect(() => {
    if (selectedId && items[selectedId] && !selected) select(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items, selectedId])

  function select(id: string | null) {
    setSelectedId(id)
    history.pushState(null, '', id ? `/bhandara/${id}` : '/')
    if (id && items[id]) setFocus({ lat: items[id].latitude, lng: items[id].longitude, zoom: 16, token: ++focusToken.current })
  }

  const filters: { k: FilterKey; label: string }[] = [
    { k: 'active', label: t('filter_active') },
    { k: 'all', label: t('filter_all') },
    { k: 'nearby', label: t('filter_nearby') },
    { k: 'recent', label: t('filter_recent') },
  ]

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-cream">
      <MapView items={visible} selectedId={selectedId} userPos={userPos} focus={focus} onSelect={select} onBounds={onBounds} />

      {view === 'list' && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-cream pt-[7.5rem]">
          {!loaded ? <div className="p-8 text-center text-gray-500">{t('loading')}</div> : <ListView items={visible} now={now} onSelect={select} />}
        </div>
      )}

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-20 space-y-2 bg-gradient-to-b from-cream via-cream/95 to-transparent px-3 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="" className="h-10 w-10 rounded-xl shadow" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-lg font-extrabold text-saffron-dark">{t('app_name')}</div>
            <div className="truncate text-xs font-semibold text-seva">{t('tagline')}</div>
          </div>
          <InstallButton />
          <button onClick={() => setPrivacy(true)} aria-label={t('privacy')} className="rounded-full bg-white p-2 shadow ring-1 ring-black/10"><ShieldCheck size={18} /></button>
          <select value={lang} aria-label={t('language')} onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded-full bg-white px-2 py-2 text-sm font-semibold shadow ring-1 ring-black/10">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold shadow-sm ring-1 ${
                filter === f.k ? 'bg-saffron text-white ring-saffron' : 'bg-white text-gray-700 ring-black/10'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {!isConfigured && (
        <div className="absolute inset-x-3 top-32 z-20 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{t('not_configured')}</div>
      )}
      {isConfigured && failed && (
        <div className="absolute inset-x-3 top-32 z-20 flex items-center gap-3 rounded-2xl bg-white p-3 shadow ring-1 ring-black/10">
          <WifiOff className="flex-none text-saffron-dark" />
          <div className="min-w-0 flex-1"><div className="font-bold">{t('offline_title')}</div><div className="text-sm text-gray-600">{t('offline_msg')}</div></div>
          <button className="rounded-full bg-saffron px-3 py-2 text-sm font-bold text-white" onClick={() => refresh(true)}>{t('retry')}</button>
        </div>
      )}
      {gpsMsg && <div className="absolute inset-x-3 top-32 z-20 rounded-2xl bg-white p-3 text-sm shadow ring-1 ring-black/10">{gpsMsg}</div>}
      {view === 'map' && loaded && !failed && visible.length === 0 && isConfigured && (
        <div className="pointer-events-none absolute inset-x-6 top-1/3 z-10 rounded-2xl bg-white/90 p-4 text-center text-sm font-semibold text-gray-600 shadow">{t('no_results')}</div>
      )}

      {/* Bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 space-y-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between">
          <button onClick={() => setView(view === 'map' ? 'list' : 'map')}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 font-bold shadow-lg ring-1 ring-black/10">
            {view === 'map' ? <List size={20} /> : <MapIcon size={20} />}{view === 'map' ? t('view_list') : t('view_map')}
          </button>
          <button onClick={() => locate(true)} aria-label={t('locate_me')}
            className="pointer-events-auto rounded-full bg-white p-3 text-[#1a73e8] shadow-lg ring-1 ring-black/10"><Locate size={24} /></button>
        </div>
        <button onClick={() => setAdding(true)} disabled={!isConfigured}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-3xl bg-saffron px-6 py-4 text-xl font-extrabold text-white shadow-xl active:bg-saffron-dark">
          <Plus size={26} strokeWidth={3} />{t('add_bhandara')}
        </button>
      </div>

      {selected && (
        <DetailsSheet key={selected.b.id} u={selected} now={now} onClose={() => select(null)}
          onChanged={(b) => upsert([b], false)} toast={toast} />
      )}
      {adding && (
        <AddFlow
          initial={userPos ?? (viewBounds.current
            ? { lat: (viewBounds.current.minLat + viewBounds.current.maxLat) / 2, lng: (viewBounds.current.minLng + viewBounds.current.maxLng) / 2 }
            : DEFAULT_CENTER)}
          onClose={() => setAdding(false)}
          onCreated={(b) => { upsert([b], false); setFilter('all'); setFocus({ lat: b.latitude, lng: b.longitude, zoom: 16, token: ++focusToken.current }) }}
          onOpenExisting={(id) => { setAdding(false); select(id) }}
          toast={toast}
        />
      )}
      {privacy && <Sheet title={t('privacy')} onClose={() => setPrivacy(false)}><p className="leading-relaxed">{t('privacy_text')}</p></Sheet>}

      {toastMsg && (
        <div className="pointer-events-none absolute inset-x-0 top-28 z-[1100] flex justify-center px-4">
          <div className="rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">{toastMsg}</div>
        </div>
      )}
    </div>
  )
}
