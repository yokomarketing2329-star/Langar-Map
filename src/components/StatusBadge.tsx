import { useI18n } from '../lib/i18n'
import type { Ui } from '../lib/view'

export default function StatusBadge({ u, big = false }: { u: Ui; big?: boolean }) {
  const { t } = useI18n()
  const active = u.status === 'active'
  return (
    <div>
      <span
        className={`inline-flex items-center gap-2 rounded-full font-bold ${big ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs'} ${
          active ? 'bg-seva text-white' : 'bg-gray-200 text-gray-700'
        }`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-white' : 'bg-gray-500'}`} />
        {active ? t('status_active') : t('status_inactive')}
      </span>
      {u.evening && (
        <span className={`ml-2 inline-block rounded-full bg-saffron-light px-3 py-1 text-xs font-semibold text-saffron-dark`}>
          {t('status_evening')}
        </span>
      )}
    </div>
  )
}
