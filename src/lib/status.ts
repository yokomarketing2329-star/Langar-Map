// Status & expiry rules (mirrors the SQL functions in supabase/migrations/001_init.sql).
// India has no daylight-saving time: IST is always UTC+05:30, so the maths is exact and
// independent of the device's own timezone.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
export const EXPIRY_MS = 12 * HOUR_MS
export const RESET_HOUR_IST = 18

export type EffectiveStatus = 'active' | 'inactive' | 'expired'

export interface StatusInput {
  status: 'active' | 'inactive'
  last_verified_at: string | number | Date
  expires_at: string | number | Date
}

const ms = (d: string | number | Date) => new Date(d).getTime()

/** The most recent 6:00 PM IST that is <= `now`. */
export function last6pmIST(now: Date | number): Date {
  const t = ms(now)
  const istDayStart = Math.floor((t + IST_OFFSET_MS) / DAY_MS) * DAY_MS // midnight IST, shifted frame
  let boundary = istDayStart + RESET_HOUR_IST * HOUR_MS - IST_OFFSET_MS
  if (boundary > t) boundary -= DAY_MS
  return new Date(boundary)
}

/** The next 6:00 PM IST strictly after `now`. */
export function next6pmIST(now: Date | number): Date {
  return new Date(last6pmIST(now).getTime() + DAY_MS)
}

/** Expiry moment for a confirmation made at `verifiedAt` (Rule C). */
export function expiryFor(verifiedAt: Date | number | string): Date {
  return new Date(ms(verifiedAt) + EXPIRY_MS)
}

/** Rules A + C: expired > stored-inactive > reset-by-6PM > active. */
export function effectiveStatus(b: StatusInput, now: Date | number = Date.now()): EffectiveStatus {
  const t = ms(now)
  if (t >= ms(b.expires_at)) return 'expired'
  if (b.status === 'inactive') return 'inactive'
  if (ms(b.last_verified_at) < last6pmIST(t).getTime()) return 'inactive'
  return 'active'
}

/** Active in storage, but the 6 PM reset has switched it off and it is still visible. */
export function needsEveningConfirmation(b: StatusInput, now: Date | number = Date.now()): boolean {
  const t = ms(now)
  return b.status === 'active' && t < ms(b.expires_at) && ms(b.last_verified_at) < last6pmIST(t).getTime()
}

/** Rule B: a fresh photo is required whenever a confirmation would REactivate a non-active place. */
export function photoRequiredToConfirm(b: StatusInput, now: Date | number = Date.now()): boolean {
  return effectiveStatus(b, now) !== 'active'
}

/** Milliseconds until anything about this place could change on its own (6 PM flip or expiry). */
export function msUntilNextChange(b: StatusInput, now: Date | number = Date.now()): number {
  const t = ms(now)
  const candidates = [ms(b.expires_at)]
  if (b.status === 'active') candidates.push(next6pmIST(t).getTime())
  return Math.max(0, Math.min(...candidates.filter((c) => c > t)) - t)
}

/** Format a time in IST regardless of the device timezone. */
export function formatIST(d: string | number | Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(d))
}
