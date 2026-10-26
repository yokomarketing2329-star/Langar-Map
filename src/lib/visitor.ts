// Anonymous visitor id: a random token kept on this device only. It is used for rate limits and
// abuse blocking. The database stores only a salted hash of it. It contains no personal data.
const KEY = 'bm_visitor'

export function getVisitorId(): string {
  try {
    let v = localStorage.getItem(KEY)
    if (!v || v.length < 16) {
      v = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)) + '-' +
        Math.random().toString(36).slice(2, 10)
      localStorage.setItem(KEY, v)
    }
    return v
  } catch {
    return 'session-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}
