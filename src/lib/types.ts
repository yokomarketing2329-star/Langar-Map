export type ServerStatus = 'active' | 'inactive' | 'expired'

/** Shape returned by the public RPCs (never contains who created it). */
export interface Bhandara {
  id: string
  short_id: string
  name: string | null
  latitude: number
  longitude: number
  address: string | null
  food_menu: string
  notes: string | null
  photo_url: string
  status: ServerStatus
  needs_evening_confirmation: boolean
  created_at: string
  last_verified_at: string
  expires_at: string
  updated_at: string
  server_now: string
}

export interface LatLng { lat: number; lng: number }
export interface Bounds { minLat: number; maxLat: number; minLng: number; maxLng: number }
export type FilterKey = 'active' | 'all' | 'nearby' | 'recent'
