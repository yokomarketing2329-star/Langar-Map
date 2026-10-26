import { useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import Sheet from './Sheet'
import LocationPicker from './LocationPicker'
import PhotoPicker from './PhotoPicker'
import { useI18n } from '../lib/i18n'
import { ApiError, createBhandara, findDuplicates, uploadPhoto } from '../lib/api'
import { reverseGeocode } from '../lib/geo'
import { shareLink } from '../lib/view'
import type { Bhandara, LatLng } from '../lib/types'

interface Props {
  initial: LatLng
  onClose: () => void
  onCreated: (b: Bhandara) => void
  onOpenExisting: (shortId: string) => void
  toast: (m: string) => void
}

type Step = 'loc' | 'dup' | 'details' | 'done'

export default function AddFlow({ initial, onClose, onCreated, onOpenExisting, toast }: Props) {
  const { t, lang, err } = useI18n()
  const [step, setStep] = useState<Step>('loc')
  const [pos, setPos] = useState<LatLng>(initial)
  const [dups, setDups] = useState<Bhandara[]>([])
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [menu, setMenu] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Bhandara | null>(null)

  async function confirmLocation() {
    setBusy(true); setError('')
    try {
      const [d, a] = await Promise.all([findDuplicates(pos), reverseGeocode(pos, lang)])
      setAddress(a ?? '')
      setDups(d)
      setStep(d.length ? 'dup' : 'details')
    } catch (e) {
      // Duplicate check failing should not block someone from adding; but surface rate/other errors.
      setError(e instanceof ApiError ? err(e.code) : t('err_generic'))
      setStep('details')
    }
    setBusy(false)
  }

  async function submit() {
    setError('')
    if (menu.trim().length < 2) return setError(t('need_menu'))
    if (!photo) return setError(t('need_photo'))
    setBusy(true)
    try {
      const url = await uploadPhoto(photo)
      const b = await createBhandara({
        name: name.trim(), lat: pos.lat, lng: pos.lng, address, food_menu: menu.trim(),
        photo_url: url, status, notes: notes.trim(),
      })
      setCreated(b)
      onCreated(b)
      setStep('done')
    } catch (e) {
      if (e instanceof ApiError) setError(err(e.code))
      else if (e instanceof Error && (e.message === 'not_image' || e.message === 'too_big')) setError(t('photo_bad'))
      else setError(t('err_generic'))
    }
    setBusy(false)
  }

  const input = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base'
  const primary = 'flex w-full items-center justify-center gap-2 rounded-2xl bg-saffron px-4 py-4 text-lg font-bold text-white shadow active:bg-saffron-dark disabled:opacity-60'

  return (
    <Sheet
      onClose={onClose} tall={step === 'loc'}
      title={step === 'details' ? t('step_details') : step === 'done' ? t('success_title') : step === 'dup' ? t('dup_title') : t('step_location')}
    >
      {step === 'loc' && (
        <div className="space-y-3">
          <LocationPicker initial={initial} onChange={setPos} height="h-[46dvh]" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className={primary} onClick={confirmLocation} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {t('confirm_location')}
          </button>
        </div>
      )}

      {step === 'dup' && (
        <div className="space-y-4">
          <p>{t('dup_msg')}</p>
          {dups.map((d) => (
            <div key={d.id} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-black/5">
              <img src={d.photo_url} alt="" className="h-20 w-20 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0">
                <div className="font-semibold">{d.name || t('unnamed')}</div>
                <div className="text-sm text-gray-600">{d.food_menu}</div>
                <button className="mt-2 rounded-full bg-seva px-4 py-2 text-sm font-bold text-white" onClick={() => onOpenExisting(d.short_id)}>
                  {t('update_existing')}
                </button>
              </div>
            </div>
          ))}
          <button className="w-full rounded-2xl border-2 border-saffron px-4 py-3 font-bold text-saffron-dark" onClick={() => setStep('details')}>
            {t('add_separate')}
          </button>
        </div>
      )}

      {step === 'details' && (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t('name_optional')}</span>
            <input className={input} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t('menu_required')}</span>
            <input className={input} value={menu} maxLength={300} placeholder={t('menu_placeholder')} onChange={(e) => setMenu(e.target.value)} />
            <span className="mt-1 block text-xs text-gray-500">{t('menu_examples')}</span>
          </label>
          <div>
            <span className="mb-1 block text-sm font-semibold">{t('photo_required')}</span>
            <PhotoPicker file={photo} onChange={setPhoto} />
          </div>
          <div>
            <span className="mb-1 block text-sm font-semibold">{t('status_label')}</span>
            <div className="grid grid-cols-2 gap-2">
              {(['active', 'inactive'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`rounded-xl px-3 py-3 font-bold ${status === s ? (s === 'active' ? 'bg-seva text-white' : 'bg-gray-600 text-white') : 'bg-white ring-1 ring-black/10'}`}>
                  {s === 'active' ? t('filter_active') : t('mark_inactive')}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t('address')}</span>
            <input className={input} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{t('notes_optional')}</span>
            <textarea className={input} rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="rounded-2xl bg-white px-5 py-4 font-bold ring-1 ring-black/10" onClick={() => setStep('loc')} disabled={busy}>{t('back')}</button>
            <button className={primary} onClick={submit} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {busy ? t('submitting') : t('submit')}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && created && (
        <div className="space-y-4 text-center">
          <div className="text-5xl">🙏</div>
          <p>{t('success_msg')}</p>
          <button className={primary} onClick={async () => { if ((await shareLink(created.short_id, created.name, t)) === 'copied') toast(t('link_copied')) }}>
            <Share2 /> {t('share_location')}
          </button>
          <button className="w-full rounded-2xl bg-white px-4 py-3 font-bold ring-1 ring-black/10" onClick={onClose}>{t('close')}</button>
        </div>
      )}
    </Sheet>
  )
}
