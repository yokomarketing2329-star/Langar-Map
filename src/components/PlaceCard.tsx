import { ChevronUp, Navigation, X } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { formatDistance, googleMapsNavUrl } from '../lib/geo'
import { agoText, type Ui } from '../lib/view'
import StatusBadge from './StatusBadge'

interface Props { u: Ui; now: number; onOpen: () => void; onClose: () => void }

/** Compact card shown when a pin is tapped. Tap the card for the full details sheet. */
export default function PlaceCard({ u, now, onOpen, onClose }: Props) {
  const { t, locale } = useI18n()
  const b = u.b
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-lg animate-[slideup_.22s_ease-out] rounded-3xl bg-white p-3 shadow-[0_10px_40px_rgba(60,30,0,0.22)] ring-1 ring-black/5">
        <div className="flex gap-3">
          <button onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left" aria-label={b.name || t('unnamed')}>
            <img src={b.photo_url} alt="" decoding="async" className="h-20 w-20 flex-none rounded-2xl bg-gray-100 object-cover" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate text-base font-bold text-gray-900">{b.name || t('unnamed')}</div>
              <div className="line-clamp-1 text-sm text-gray-600">{b.food_menu}</div>
              <StatusBadge u={u} />
              <div className="text-xs text-gray-500">
                {u.distance != null && <>{t('away', { d: formatDistance(u.distance) })} · </>}
                {agoText(b.last_verified_at, now, t, locale)}
              </div>
            </div>
          </button>
          <div className="flex flex-none flex-col items-center justify-between">
            <button onClick={onClose} aria-label={t('close')} className="rounded-full p-1.5 text-gray-500 hover:bg-black/5"><X size={20} /></button>
            <button onClick={onOpen} aria-label={t('menu')} className="rounded-full p-1.5 text-gray-500 hover:bg-black/5"><ChevronUp size={22} /></button>
          </div>
        </div>
        <a href={googleMapsNavUrl(b.latitude, b.longitude)} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-saffron px-4 py-3 font-bold text-white active:bg-saffron-dark">
          <Navigation size={18} />{t('navigate')}
        </a>
      </div>
    </div>
  )
}
