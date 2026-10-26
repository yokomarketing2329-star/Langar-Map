import { useState } from 'react'
import { Check, Clock, Flag, Loader2, MapPin, Navigation, Pencil, Share2, XCircle } from 'lucide-react'
import Sheet from './Sheet'
import StatusBadge from './StatusBadge'
import PhotoPicker from './PhotoPicker'
import LocationPicker from './LocationPicker'
import { useI18n } from '../lib/i18n'
import { formatDistance, googleMapsNavUrl, reverseGeocode } from '../lib/geo'
import { agoText, shareLink, type Ui } from '../lib/view'
import { formatIST } from '../lib/status'
import { ApiError, confirmActive, markInactive, reportBhandara, updateDetails, uploadPhoto } from '../lib/api'
import type { Bhandara, LatLng } from '../lib/types'

interface Props {
  u: Ui
  now: number
  onClose: () => void
  onChanged: (b: Bhandara) => void
  toast: (m: string) => void
}

type Mode = 'view' | 'confirm' | 'edit' | 'report'

export default function DetailsSheet({ u, now, onClose, onChanged, toast }: Props) {
  const { t, err, locale, lang } = useI18n()
  const b = u.b
  const [mode, setMode] = useState<Mode>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [checked, setChecked] = useState(false)
  const [name, setName] = useState(b.name ?? '')
  const [menu, setMenu] = useState(b.food_menu)
  const [notes, setNotes] = useState(b.notes ?? '')
  const [moveLoc, setMoveLoc] = useState(false)
  const [newPos, setNewPos] = useState<LatLng | null>(null)
  const [reason, setReason] = useState('')

  const needsPhoto = u.status !== 'active'

  async function run(fn: () => Promise<Bhandara>, okMsg: string) {
    setBusy(true); setError('')
    try {
      const nb = await fn()
      onChanged(nb); toast(okMsg); setMode('view'); setPhoto(null); setChecked(false)
    } catch (e) {
      if (e instanceof ApiError) setError(err(e.code))
      else if (e instanceof Error && (e.message === 'not_image' || e.message === 'too_big')) setError(t('photo_bad'))
      else setError(t('err_generic'))
    }
    setBusy(false)
  }

  async function doConfirm() {
    if (needsPhoto && !photo) return setError(t('need_photo'))
    if (needsPhoto && !checked) return setError(t('confirm_checkbox'))
    await run(async () => confirmActive(b.short_id, photo ? await uploadPhoto(photo) : undefined), t('confirm_done'))
  }

  async function doSave() {
    if (menu.trim().length < 2) return setError(t('need_menu'))
    await run(async () => {
      const photoUrl = photo ? await uploadPhoto(photo) : null
      let address: string | undefined
      if (moveLoc && newPos) address = (await reverseGeocode(newPos, lang)) ?? ''
      return updateDetails(b.short_id, {
        name: name.trim(), food_menu: menu.trim(), notes: notes.trim(), photo_url: photoUrl,
        lat: moveLoc && newPos ? newPos.lat : undefined, lng: moveLoc && newPos ? newPos.lng : undefined, address,
      })
    }, t('saved'))
  }

  async function doReport() {
    setBusy(true); setError('')
    try { await reportBhandara(b.short_id, reason); toast(t('report_thanks')); setMode('view'); setReason('') }
    catch (e) { setError(e instanceof ApiError ? err(e.code) : t('err_generic')) }
    setBusy(false)
  }

  const btn = 'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-bold active:scale-[0.98]'
  const input = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base'
  const spin = busy && <Loader2 className="animate-spin" size={18} />

  const title =
    mode === 'confirm' ? t('confirm_photo_title') : mode === 'edit' ? t('edit_title') : mode === 'report' ? t('report_title') : (b.name || t('unnamed'))

  return (
    <Sheet title={title} onClose={onClose}>
      {mode === 'view' && (
        <div className="space-y-4">
          <img src={b.photo_url} alt={b.name || t('unnamed')} loading="lazy" decoding="async"
            className="h-52 w-full rounded-2xl bg-gray-100 object-cover" />
          <StatusBadge u={u} big />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('menu')}</div>
            <div className="text-lg font-semibold">{b.food_menu}</div>
          </div>
          {b.notes && <p className="text-gray-700">{b.notes}</p>}
          <div className="space-y-1 text-sm text-gray-600">
            {u.distance != null && <div className="flex items-center gap-2"><Navigation size={16} />{t('away', { d: formatDistance(u.distance) })}</div>}
            <div className="flex items-center gap-2"><Clock size={16} />{t('last_verified', { t: `${formatIST(b.last_verified_at, locale)} (${agoText(b.last_verified_at, now, t, locale)})` })}</div>
            {b.address && <div className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 flex-none" /><span>{b.address}</span></div>}
            <div className="text-xs text-gray-500">{t('shown_until', { t: formatIST(b.expires_at, locale) })}</div>
          </div>

          <a href={googleMapsNavUrl(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer"
            className={`${btn} bg-seva text-white`}><Navigation size={20} />{t('navigate')}</a>

          <div className="grid grid-cols-2 gap-2">
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={async () => { if ((await shareLink(b.short_id, b.name, t)) === 'copied') toast(t('link_copied')) }}>
              <Share2 size={18} />{t('share')}
            </button>
            <button className={`${btn} bg-saffron text-white`} onClick={() => { setError(''); if (needsPhoto) setMode('confirm'); else run(() => confirmActive(b.short_id), t('confirm_done')) }} disabled={busy}>
              {spin || <Check size={18} />}{t('still_active')}
            </button>
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => run(() => markInactive(b.short_id), t('inactive_done'))} disabled={busy || u.status === 'inactive'}>
              <XCircle size={18} />{t('mark_inactive')}
            </button>
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => { setError(''); setMode('edit') }}>
              <Pencil size={18} />{t('update_details')}
            </button>
          </div>
          <button className="mx-auto flex items-center gap-2 text-sm text-gray-500 underline" onClick={() => { setError(''); setMode('report') }}>
            <Flag size={14} />{t('report')}
          </button>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        </div>
      )}

      {mode === 'confirm' && (
        <div className="space-y-4">
          <p className="text-gray-700">{t('confirm_photo_msg')}</p>
          <PhotoPicker file={photo} onChange={setPhoto} />
          <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-black/10">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#16803C]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="font-semibold">{t('confirm_checkbox')}</span>
          </label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => { setMode('view'); setError('') }}>{t('back')}</button>
            <button className={`${btn} flex-1 bg-seva text-white`} onClick={doConfirm} disabled={busy}>{spin}{t('confirm_btn')}</button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-4">
          <label className="block"><span className="mb-1 block text-sm font-semibold">{t('name_optional')}</span>
            <input className={input} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">{t('menu_required')}</span>
            <input className={input} value={menu} maxLength={300} onChange={(e) => setMenu(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-sm font-semibold">{t('notes_optional')}</span>
            <textarea className={input} rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></label>
          <div><span className="mb-1 block text-sm font-semibold">{t('edit_new_photo')}</span>
            <PhotoPicker file={photo} onChange={setPhoto} /></div>
          <div>
            <button className="text-sm font-semibold text-saffron-dark underline" onClick={() => setMoveLoc((v) => !v)}>
              <MapPin size={14} className="mr-1 inline" />{t('confirm_location')}
            </button>
            {moveLoc && <div className="mt-2"><LocationPicker initial={{ lat: b.latitude, lng: b.longitude }} height="h-56" onChange={setNewPos} /></div>}
          </div>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => { setMode('view'); setError('') }}>{t('cancel')}</button>
            <button className={`${btn} flex-1 bg-saffron text-white`} onClick={doSave} disabled={busy}>{spin}{t('save')}</button>
          </div>
        </div>
      )}

      {mode === 'report' && (
        <div className="space-y-4">
          <textarea className={input} rows={3} value={reason} maxLength={300} placeholder={t('report_reason_ph')} onChange={(e) => setReason(e.target.value)} />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => { setMode('view'); setError('') }}>{t('cancel')}</button>
            <button className={`${btn} flex-1 bg-red-600 text-white`} onClick={doReport} disabled={busy}>{spin}{t('report_send')}</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
