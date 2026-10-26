import { MapPin, Navigation } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { formatDistance } from '../lib/geo'
import { agoText, type Ui } from '../lib/view'
import StatusBadge from './StatusBadge'

interface Props { items: Ui[]; now: number; onSelect: (shortId: string) => void }

export default function ListView({ items, now, onSelect }: Props) {
  const { t, locale } = useI18n()
  if (!items.length) {
    return <div className="p-8 text-center text-gray-500">{t('no_results')}</div>
  }
  return (
    <ul className="space-y-3 p-4 pb-32">
      {items.map((u) => (
        <li key={u.b.id}>
          <button
            onClick={() => onSelect(u.b.short_id)}
            className="flex w-full gap-3 rounded-3xl bg-white p-3 text-left shadow-[0_2px_12px_rgba(60,30,0,0.08)] ring-1 ring-black/5 transition active:scale-[0.99]"
          >
            <img src={u.b.photo_url} alt="" loading="lazy" decoding="async"
              className="h-20 w-20 flex-none rounded-2xl bg-gray-100 object-cover" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate font-semibold">{u.b.name || t('unnamed')}</div>
              <div className="line-clamp-2 text-sm text-gray-600">{u.b.food_menu}</div>
              <StatusBadge u={u} />
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {u.distance != null && (
                  <span className="inline-flex items-center gap-1"><Navigation size={12} />{t('away', { d: formatDistance(u.distance) })}</span>
                )}
                <span className="inline-flex items-center gap-1"><MapPin size={12} />{agoText(u.b.last_verified_at, now, t, locale)}</span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
