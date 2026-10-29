import { supabase, isConfigured } from './supabase'
import { getVisitorId } from './visitor'

// Anonymous install counter. Sends one tiny message per device per day:
// (random device code, platform label, "is it running as an installed app?"). No personal data.

const KEY = 'bm_dev'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

function platform(): 'android' | 'ios' | 'desktop' | 'other' {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

async function send(installed: boolean) {
  try {
    const { error } = await supabase.rpc('record_device', {
      p_visitor: getVisitorId(), p_platform: platform(), p_installed: installed,
    })
    if (!error) localStorage.setItem(KEY, JSON.stringify({ day: istDay(), installed }))
  } catch { /* counting must never break the app */ }
}

export function trackDevice() {
  if (!isConfigured) return
  try {
    let last: { day?: string; installed?: boolean } | null = null
    try { last = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { /* ignore */ }
    const installed = isStandalone()
    // Once a day, and immediately the first time it is seen running as an installed app.
    if (!last || last.day !== istDay() || (installed && !last.installed)) send(installed)
    // Android/desktop Chrome and Edge tell us the moment the app is installed.
    window.addEventListener('appinstalled', () => send(true))
  } catch { /* ignore */ }
}
