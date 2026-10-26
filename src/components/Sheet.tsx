import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface Props { title?: string; onClose: () => void; children: ReactNode; tall?: boolean }

/** Bottom sheet on phones, centred card on large screens. */
export default function Sheet({ title, onClose, children, tall }: Props) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-2xl sm:rounded-3xl ${
          tall ? 'h-[94dvh] sm:h-[90dvh]' : 'max-h-[92dvh]'
        } animate-[slideup_.25s_ease-out]`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label={t('close')} className="rounded-full p-2 hover:bg-black/5"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
