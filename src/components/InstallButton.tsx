import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import Sheet from './Sheet'
import { useI18n } from '../lib/i18n'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export default function InstallButton() {
  const { t } = useI18n()
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [iosOpen, setIosOpen] = useState(false)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent) }
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed) return null
  // Android/desktop Chrome/Edge: real install prompt. iOS: instructions only (iOS has no install prompt).
  if (!evt && !isIOS()) return null

  return (
    <>
      <button
        onClick={async () => { if (evt) { await evt.prompt(); setEvt(null) } else setIosOpen(true) }}
        className="inline-flex items-center gap-1.5 rounded-full bg-seva px-3 py-2 text-sm font-bold text-white shadow"
      >
        <Download size={16} /> {t('install_app')}
      </button>
      {iosOpen && (
        <Sheet title={t('ios_title')} onClose={() => setIosOpen(false)}>
          <ol className="list-decimal space-y-3 pl-5 text-base">
            <li>{t('ios_step1')}</li>
            <li>{t('ios_step2')}</li>
            <li>{t('ios_step3')}</li>
          </ol>
          <p className="mt-4 text-sm text-gray-500">{t('ios_note')}</p>
        </Sheet>
      )}
    </>
  )
}
