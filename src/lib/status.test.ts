import { describe, it, expect } from 'vitest'
import {
  last6pmIST, next6pmIST, effectiveStatus, needsEveningConfirmation, photoRequiredToConfirm,
  expiryFor, msUntilNextChange, HOUR_MS,
} from './status'

// Helper: build an instant from an IST wall-clock time.
const ist = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min) - 5.5 * HOUR_MS)

const mk = (verified: Date, status: 'active' | 'inactive' = 'active') => ({
  status, last_verified_at: verified, expires_at: expiryFor(verified),
})

describe('6 PM IST boundary', () => {
  it('before 6 PM IST uses yesterday 6 PM', () => {
    expect(last6pmIST(ist(2026, 10, 27, 17, 59)).getTime()).toBe(ist(2026, 10, 26, 18, 0).getTime())
  })
  it('exactly 6:00 PM IST uses today', () => {
    expect(last6pmIST(ist(2026, 10, 27, 18, 0)).getTime()).toBe(ist(2026, 10, 27, 18, 0).getTime())
  })
  it('just after midnight IST uses yesterday 6 PM', () => {
    expect(last6pmIST(ist(2026, 10, 27, 0, 1)).getTime()).toBe(ist(2026, 10, 26, 18, 0).getTime())
  })
  it('is independent of the device timezone (same instant, same answer)', () => {
    const t = new Date('2026-10-27T12:29:59Z') // 17:59:59 IST
    expect(last6pmIST(t).toISOString()).toBe('2026-10-26T12:30:00.000Z')
    expect(last6pmIST(new Date(t.getTime() + 1000)).toISOString()).toBe('2026-10-27T12:30:00.000Z')
  })
  it('works across a month/year boundary', () => {
    expect(last6pmIST(ist(2027, 1, 1, 1, 0)).getTime()).toBe(ist(2026, 12, 31, 18, 0).getTime())
    expect(next6pmIST(ist(2026, 12, 31, 19, 0)).getTime()).toBe(ist(2027, 1, 1, 18, 0).getTime())
  })
})

describe('Rule A — daily 6 PM reset', () => {
  it('active before 6 PM, inactive at 6 PM', () => {
    const b = mk(ist(2026, 10, 27, 9, 0))
    expect(effectiveStatus(b, ist(2026, 10, 27, 17, 59))).toBe('active')
    expect(effectiveStatus(b, ist(2026, 10, 27, 18, 0))).toBe('inactive')
    expect(needsEveningConfirmation(b, ist(2026, 10, 27, 18, 0))).toBe(true)
  })
  it('does not delete: still visible (not expired) after the reset', () => {
    const b = mk(ist(2026, 10, 27, 15, 0))
    expect(effectiveStatus(b, ist(2026, 10, 27, 20, 0))).toBe('inactive')
  })
  it('a place confirmed at exactly 6:00 PM is not reset', () => {
    const b = mk(ist(2026, 10, 27, 18, 0))
    expect(effectiveStatus(b, ist(2026, 10, 27, 18, 0))).toBe('active')
  })
})

describe('Rule B — evening reactivation', () => {
  it('requires a fresh photo after the reset, not before', () => {
    const b = mk(ist(2026, 10, 27, 9, 0))
    expect(photoRequiredToConfirm(b, ist(2026, 10, 27, 12, 0))).toBe(false)
    expect(photoRequiredToConfirm(b, ist(2026, 10, 27, 18, 30))).toBe(true)
  })
  it('is not deactivated again by the same day 6 PM reset', () => {
    const reactivated = mk(ist(2026, 10, 27, 20, 0))
    expect(effectiveStatus(reactivated, ist(2026, 10, 27, 20, 0))).toBe('active')
    expect(effectiveStatus(reactivated, ist(2026, 10, 27, 23, 59))).toBe('active')
    expect(effectiveStatus(reactivated, ist(2026, 10, 28, 7, 59))).toBe('active')
  })
  it('a stored-inactive place needs a photo to reactivate', () => {
    const b = mk(ist(2026, 10, 27, 9, 0), 'inactive')
    expect(photoRequiredToConfirm(b, ist(2026, 10, 27, 10, 0))).toBe(true)
  })
})

describe('Rule C — 12 hour expiry', () => {
  it('added 9:00 AM expires 9:00 PM', () => {
    const b = mk(ist(2026, 10, 27, 9, 0))
    expect(effectiveStatus(b, ist(2026, 10, 27, 20, 59))).toBe('inactive') // after 6 PM reset, still visible
    expect(effectiveStatus(b, ist(2026, 10, 27, 21, 0))).toBe('expired')
  })
  it('added 3:00 PM: inactive at 6 PM, gone at 3:00 AM', () => {
    const b = mk(ist(2026, 10, 27, 15, 0))
    expect(effectiveStatus(b, ist(2026, 10, 27, 17, 59))).toBe('active')
    expect(effectiveStatus(b, ist(2026, 10, 27, 18, 0))).toBe('inactive')
    expect(effectiveStatus(b, ist(2026, 10, 28, 2, 59))).toBe('inactive')
    expect(effectiveStatus(b, ist(2026, 10, 28, 3, 0))).toBe('expired')
  })
  it('reactivated 8:00 PM expires 8:00 AM next morning', () => {
    const b = mk(ist(2026, 10, 27, 20, 0))
    expect(effectiveStatus(b, ist(2026, 10, 28, 7, 59))).toBe('active')
    expect(effectiveStatus(b, ist(2026, 10, 28, 8, 0))).toBe('expired')
  })
  it('a new confirmation restarts the countdown', () => {
    const first = mk(ist(2026, 10, 27, 9, 0))
    const again = mk(ist(2026, 10, 27, 20, 30)) // reconfirmed at 8:30 PM
    expect(effectiveStatus(first, ist(2026, 10, 28, 8, 0))).toBe('expired')
    expect(effectiveStatus(again, ist(2026, 10, 28, 8, 0))).toBe('active')
    expect(effectiveStatus(again, ist(2026, 10, 28, 8, 30))).toBe('expired')
  })
  it('expiry is exactly 12 hours', () => {
    expect(expiryFor(ist(2026, 10, 27, 9, 0)).getTime()).toBe(ist(2026, 10, 27, 21, 0).getTime())
  })
})

describe('client refresh scheduling', () => {
  it('schedules the next flip at 6 PM for an active place', () => {
    const b = mk(ist(2026, 10, 27, 10, 0))
    expect(msUntilNextChange(b, ist(2026, 10, 27, 17, 0))).toBe(HOUR_MS)
  })
  it('schedules expiry when it comes before 6 PM', () => {
    const b = mk(ist(2026, 10, 27, 1, 0)) // expires 1 PM
    expect(msUntilNextChange(b, ist(2026, 10, 27, 12, 0))).toBe(HOUR_MS)
  })
  it('inactive places only change at expiry', () => {
    const b = mk(ist(2026, 10, 27, 10, 0), 'inactive')
    expect(msUntilNextChange(b, ist(2026, 10, 27, 11, 0))).toBe(11 * HOUR_MS)
  })
})
