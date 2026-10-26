import { supabase } from './supabase'
import { getVisitorId } from './visitor'
import { compressPhoto } from './image'
import type { Bhandara, Bounds, LatLng } from './types'

/** Database errors carry a short code (e.g. "rate_limited"); the UI translates it. */
export class ApiError extends Error {
  code: string
  constructor(code: string) { super(code); this.code = code }
}

function wrap(error: { message?: string } | null): never {
  const msg = error?.message ?? ''
  const known = ['rate_limited', 'blocked', 'photo_required', 'invalid_photo', 'not_found', 'move_too_far',
    'invalid_menu', 'invalid_visitor', 'invalid_location', 'invalid_reason']
  const code = known.find((k) => msg.includes(k)) ?? 'generic'
  throw new ApiError(code)
}

export async function listBhandaras(b: Bounds): Promise<Bhandara[]> {
  const { data, error } = await supabase.rpc('list_bhandaras', {
    min_lat: b.minLat, max_lat: b.maxLat, min_lng: b.minLng, max_lng: b.maxLng,
  })
  if (error) wrap(error)
  return (data ?? []) as Bhandara[]
}

export async function getBhandara(shortId: string): Promise<Bhandara | null> {
  const { data, error } = await supabase.rpc('get_bhandara', { p_short_id: shortId })
  if (error) wrap(error)
  return (data as Bhandara | null) ?? null
}

export async function findDuplicates(p: LatLng): Promise<Bhandara[]> {
  const { data, error } = await supabase.rpc('find_duplicates', { p_lat: p.lat, p_lng: p.lng, p_radius_m: 100 })
  if (error) wrap(error)
  return (data ?? []) as Bhandara[]
}

/** Compress (strips EXIF) then upload to the public photo bucket. Returns its public URL. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await compressPhoto(file)
  const month = new Date().toISOString().slice(0, 7)
  const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now()
  const path = `uploads/${month}/${id}.jpg`
  const { error } = await supabase.storage.from('bhandara-photos').upload(path, blob, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  })
  if (error) throw new ApiError('generic')
  return supabase.storage.from('bhandara-photos').getPublicUrl(path).data.publicUrl
}

export interface NewBhandara {
  name: string; lat: number; lng: number; address: string; food_menu: string
  photo_url: string; status: 'active' | 'inactive'; notes: string
}

export async function createBhandara(n: NewBhandara): Promise<Bhandara> {
  const { data, error } = await supabase.rpc('create_bhandara', {
    p_visitor: getVisitorId(), p_name: n.name, p_lat: n.lat, p_lng: n.lng, p_address: n.address,
    p_food_menu: n.food_menu, p_photo_url: n.photo_url, p_status: n.status, p_notes: n.notes,
  })
  if (error) wrap(error)
  return data as Bhandara
}

export async function confirmActive(shortId: string, photoUrl?: string): Promise<Bhandara> {
  const { data, error } = await supabase.rpc('confirm_active', {
    p_visitor: getVisitorId(), p_short_id: shortId, p_photo_url: photoUrl ?? null,
  })
  if (error) wrap(error)
  return data as Bhandara
}

export async function markInactive(shortId: string): Promise<Bhandara> {
  const { data, error } = await supabase.rpc('mark_inactive', { p_visitor: getVisitorId(), p_short_id: shortId })
  if (error) wrap(error)
  return data as Bhandara
}

export async function updateDetails(shortId: string, d: {
  name: string; food_menu: string; notes: string; photo_url?: string | null; lat?: number; lng?: number; address?: string
}): Promise<Bhandara> {
  const { data, error } = await supabase.rpc('update_details', {
    p_visitor: getVisitorId(), p_short_id: shortId, p_name: d.name, p_food_menu: d.food_menu, p_notes: d.notes,
    p_photo_url: d.photo_url ?? null, p_lat: d.lat ?? null, p_lng: d.lng ?? null, p_address: d.address ?? null,
  })
  if (error) wrap(error)
  return data as Bhandara
}

export async function reportBhandara(shortId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('report_bhandara', {
    p_visitor: getVisitorId(), p_short_id: shortId, p_reason: reason,
  })
  if (error) wrap(error)
}
