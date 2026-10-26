import { useCallback, useEffect, useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase'
import { formatIST } from '../lib/status'
import type { FormEvent } from 'react'

// Admin dashboard at /admin. Requires a Supabase Auth login AND a row in the "admins" table.
// Every admin action is enforced again inside the database (admin_* functions check is_admin()).

interface AdminRow { data: Record<string, any>; is_expired: boolean; report_count: number }
interface ReportRow {
  id: number; bhandara_id: string; short_id: string | null; bhandara_name: string | null; food_menu: string | null
  photo_url: string | null; reason: string; created_at: string; moderation_status: string; visitor_identifier: string
}
interface Stats {
  total_submitted: number; active_now: number; pending_reports: number; blocked_visitors: number
  daily: { day: string; submitted: number }[]; updates_daily: { day: string; updates: number }[]
}

type Tab = 'overview' | 'locations' | 'reports'

export default function Admin() {
  const [session, setSession] = useState<boolean | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [rows, setRows] = useState<AdminRow[]>([])
  const [filter, setFilter] = useState<'all' | 'live' | 'expired'>('all')
  const [reports, setReports] = useState<ReportRow[]>([])

  const checkAdmin = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(!!data.session)
    if (!data.session) { setIsAdmin(null); return }
    const { data: ok } = await supabase.rpc('is_admin')
    setIsAdmin(ok === true)
  }, [])

  useEffect(() => {
    checkAdmin()
    const { data } = supabase.auth.onAuthStateChange(() => checkAdmin())
    return () => data.subscription.unsubscribe()
  }, [checkAdmin])

  const load = useCallback(async () => {
    if (!isAdmin) return
    const [s, l, r] = await Promise.all([
      supabase.rpc('admin_stats'), supabase.rpc('admin_list', { p_filter: filter }), supabase.rpc('admin_reports'),
    ])
    if (s.data) setStats(s.data as Stats)
    if (l.data) setRows(l.data as AdminRow[])
    if (r.data) setReports(r.data as ReportRow[])
    if (s.error || l.error || r.error) setMsg((s.error || l.error || r.error)!.message)
  }, [isAdmin, filter])

  useEffect(() => { load() }, [load])

  async function login(e: FormEvent) {
    e.preventDefault(); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg(error.message)
  }

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    const { error } = await fn()
    setMsg(error ? error.message : '')
    load()
  }

  const card = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5'
  const btn = 'rounded-xl px-3 py-2 text-sm font-bold'

  if (!isConfigured) return <div className="p-6">Supabase is not configured. See DEPLOY.md.</div>

  if (!session) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-extrabold text-saffron-dark">Admin login</h1>
        <p className="mb-4 text-sm text-gray-600">Langar Sewa Map moderation</p>
        <form onSubmit={login} className="space-y-3">
          <input className="w-full rounded-xl border p-3" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          <input className="w-full rounded-xl border p-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <button className={`${btn} w-full bg-saffron py-3 text-white`}>Sign in</button>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
        </form>
      </div>
    )
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <p className="mb-4 font-semibold text-red-600">This account is not an administrator.</p>
        <button className={`${btn} bg-gray-900 text-white`} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }
  if (isAdmin === null) return <div className="p-6">Loading…</div>

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-saffron-dark">Langar Sewa Map · Admin</h1>
        <div className="flex gap-2">
          <a href="/" className={`${btn} bg-white ring-1 ring-black/10`}>View app</a>
          <button className={`${btn} bg-gray-900 text-white`} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
      <div className="flex gap-2">
        {(['overview', 'locations', 'reports'] as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`${btn} capitalize ${tab === k ? 'bg-saffron text-white' : 'bg-white ring-1 ring-black/10'}`}>
            {k}{k === 'reports' && stats?.pending_reports ? ` (${stats.pending_reports})` : ''}
          </button>
        ))}
        <button className={`${btn} ml-auto bg-white ring-1 ring-black/10`} onClick={load}>Refresh</button>
      </div>
      {msg && <p className="text-sm font-semibold text-red-600">{msg}</p>}

      {tab === 'overview' && stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Total submitted', stats.total_submitted], ['Active now', stats.active_now],
              ['Pending reports', stats.pending_reports], ['Blocked visitors', stats.blocked_visitors]].map(([l, v]) => (
              <div key={String(l)} className={card}><div className="text-3xl font-extrabold">{v}</div><div className="text-sm text-gray-600">{l}</div></div>
            ))}
          </div>
          <div className={card}>
            <h2 className="mb-2 font-bold">Daily contributions (last 14 days, IST)</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th>Day</th><th>New Bhandaras</th><th>Updates</th></tr></thead>
              <tbody>
                {stats.daily.map((d) => (
                  <tr key={d.day} className="border-t"><td>{d.day}</td><td>{d.submitted}</td>
                    <td>{stats.updates_daily.find((u) => u.day === d.day)?.updates ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'locations' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(['all', 'live', 'expired'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`${btn} capitalize ${filter === f ? 'bg-seva text-white' : 'bg-white ring-1 ring-black/10'}`}>{f}</button>
            ))}
          </div>
          {rows.map(({ data: b, is_expired, report_count }) => (
            <div key={b.id} className={`${card} flex gap-3`}>
              <img src={b.photo_url} alt="" className="h-20 w-20 rounded-xl object-cover" loading="lazy" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-bold">{b.name || 'Bhandara'} <span className="font-normal text-gray-500">· {b.short_id}</span></div>
                <div>{b.food_menu}</div>
                <div className="text-gray-500">
                  {is_expired ? 'EXPIRED' : b.status.toUpperCase()} · verified {formatIST(b.last_verified_at)} · {report_count} open reports
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className={`${btn} bg-white ring-1 ring-black/10`} href={`/bhandara/${b.short_id}`} target="_blank" rel="noreferrer">Open</a>
                  <button className={`${btn} bg-red-600 text-white`} onClick={() => act(() => supabase.rpc('admin_delete', { p_id: b.id }), 'Delete this Bhandara permanently?')}>Delete</button>
                  {b.created_by && (
                    <button className={`${btn} bg-gray-800 text-white`} onClick={() => act(() => supabase.rpc('admin_block_visitor', { p_hash: b.created_by, p_reason: 'abusive submission' }), 'Block the visitor who created this?')}>Block creator</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <p className="text-gray-500">Nothing here.</p>}
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className={card}>
              <div className="text-sm">
                <div className="font-bold">{r.bhandara_name || 'Bhandara'} <span className="font-normal text-gray-500">· {r.short_id ?? 'deleted'} · {r.moderation_status}</span></div>
                <div className="text-gray-700">“{r.reason}”</div>
                <div className="text-xs text-gray-500">{formatIST(r.created_at)}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.short_id && <a className={`${btn} bg-white ring-1 ring-black/10`} href={`/bhandara/${r.short_id}`} target="_blank" rel="noreferrer">Open</a>}
                {r.bhandara_id && <button className={`${btn} bg-red-600 text-white`} onClick={() => act(async () => {
                  const a = await supabase.rpc('admin_delete', { p_id: r.bhandara_id }); if (a.error) return a
                  return supabase.rpc('admin_resolve_report', { p_id: r.id, p_status: 'actioned' })
                }, 'Delete the reported Bhandara?')}>Delete Bhandara</button>}
                <button className={`${btn} bg-gray-800 text-white`} onClick={() => act(() => supabase.rpc('admin_block_visitor', { p_hash: r.visitor_identifier, p_reason: 'false report' }), 'Block the person who sent this report?')}>Block reporter</button>
                <button className={`${btn} bg-white ring-1 ring-black/10`} onClick={() => act(() => supabase.rpc('admin_resolve_report', { p_id: r.id, p_status: 'dismissed' }))}>Dismiss</button>
              </div>
            </div>
          ))}
          {!reports.length && <p className="text-gray-500">No reports.</p>}
        </div>
      )}
    </div>
  )
}
