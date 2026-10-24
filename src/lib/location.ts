import { supabase } from './supabase'

export type Duration = '15m' | '1h' | '8h' | 'manual'
export interface Share {
  id: string; user_id: string; family_id: string; is_active: boolean
  duration: Duration; started_at: string; expires_at: string | null
}
export interface Loc { user_id: string; latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string }
export type LocStatus = 'live' | 'stale' | 'waiting' | 'off'

export const STALE_MINUTES = Number(import.meta.env.VITE_LOCATION_STALE_MINUTES) || 5

export const STATUS_LABEL: Record<LocStatus, string> = {
  live: 'Aktif', stale: 'Kedaluwarsa', waiting: 'Menunggu lokasi', off: 'Tidak berbagi',
}
export const DURATION_LABEL: Record<Duration, string> = {
  '15m': '15 menit', '1h': '1 jam', '8h': '8 jam', manual: 'Sampai dihentikan',
}

export const shareIsLive = (s?: Share | null, now = Date.now()) =>
  !!s && s.is_active && (!s.expires_at || new Date(s.expires_at).getTime() > now)

export function statusOf(sharing: boolean, loc: Loc | undefined, now = Date.now()): LocStatus {
  if (!sharing) return 'off'
  if (!loc) return 'waiting'
  return now - new Date(loc.recorded_at).getTime() <= STALE_MINUTES * 60_000 ? 'live' : 'stale'
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'baru saja'
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} menit lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  return `${Math.floor(s / 86400)} hari lalu`
}

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const startSharing = (d: Duration) => rpc<{ ok: boolean }>('start_sharing', { p_duration: d })
export const stopSharing = () => rpc('stop_sharing')
export const pushLocation = (lat: number, lng: number, acc: number) =>
  rpc<{ ok: boolean; reason?: string }>('update_location', { p_lat: lat, p_lng: lng, p_acc: acc })

export async function fetchMyShare(uid: string): Promise<Share | null> {
  const { data, error } = await supabase.from('location_shares')
    .select('id,user_id,family_id,is_active,duration,started_at,expires_at')
    .eq('user_id', uid).eq('is_active', true).order('started_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Share[]).find((s) => shareIsLive(s)) ?? ((data ?? [])[0] as Share | undefined) ?? null
}
