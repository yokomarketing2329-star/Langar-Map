import { effectiveStatus, formatIST, type EffectiveStatus } from './status'
import type { Bhandara } from './types'
import type { TKey } from './i18n'

export interface Ui {
  b: Bhandara
  status: EffectiveStatus
  evening: boolean
  distance: number | null
}

/** Recompute status in the browser at time `now` (server-corrected), so the 6 PM flip and expiry
 *  happen on screen without a refresh. */
export function toUi(b: Bhandara, now: number, distance: number | null): Ui {
  const status = effectiveStatus(
    { status: b.status === 'active' ? 'active' : 'inactive', last_verified_at: b.last_verified_at, expires_at: b.expires_at },
    now,
  )
  const evening = status === 'inactive' && (b.needs_evening_confirmation || b.status === 'active')
  return { b, status, evening, distance }
}

type T = (k: TKey, v?: Record<string, string | number>) => string

export function agoText(iso: string, now: number, t: T, locale: string): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000)
  if (mins < 1) return t('just_now')
  if (mins < 60) return t('min_ago', { n: mins })
  if (mins < 24 * 60) return t('hr_ago', { n: Math.floor(mins / 60) })
  return formatIST(iso, locale)
}

export async function shareLink(shortId: string, name: string | null, t: T): Promise<'shared' | 'copied'> {
  const url = `${location.origin}/bhandara/${shortId}`
  const text = `${t('share_text')} ${name ?? ''}`.trim()
  if (navigator.share) {
    try { await navigator.share({ title: t('app_name'), text, url }); return 'shared' } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`) } catch { /* ignore */ }
  return 'copied'
}
