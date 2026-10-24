import { supabase } from './supabase'

export type Retention = '24h' | '7d' | '30d'
export interface PrivacySettings { history_enabled: boolean; history_retention: Retention }
export interface HistoryPoint { id: string; latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string }

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function getPrivacy(uid: string): Promise<PrivacySettings> {
  const { data, error } = await supabase.from('user_settings').select('history_enabled,history_retention').eq('user_id', uid).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as PrivacySettings | null) ?? { history_enabled: false, history_retention: '24h' }
}
export const savePrivacy = (enabled: boolean, retention: Retention) => rpc('save_privacy', { p_history: enabled, p_retention: retention })
export const deleteMyHistory = () => rpc('delete_my_history')
export const setViewer = (viewer: string, allow: boolean) => rpc('set_history_viewer', { p_viewer: viewer, p_allow: allow })

export async function listMyViewers(uid: string): Promise<string[]> {
  const { data } = await supabase.from('history_grants').select('viewer_id').eq('owner_id', uid)
  return (data ?? []).map((r: { viewer_id: string }) => r.viewer_id)
}
export async function listGrantedOwners(uid: string): Promise<string[]> {
  const { data } = await supabase.from('history_grants').select('owner_id').eq('viewer_id', uid)
  return (data ?? []).map((r: { owner_id: string }) => r.owner_id)
}

export async function listHistory(userId: string, fromISO: string, toISO: string): Promise<HistoryPoint[]> {
  const { data, error } = await supabase.from('location_history')
    .select('id,latitude,longitude,accuracy_m,recorded_at').eq('user_id', userId)
    .gte('recorded_at', fromISO).lte('recorded_at', toISO).order('recorded_at').limit(2000)
  if (error) throw new Error(error.message)
  return (data ?? []) as HistoryPoint[]
}

export function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Jeda lebih dari gapMin menit memutus garis: jalur tidak "dikarang" untuk data yang tidak ada.
export function splitSegments(pts: HistoryPoint[], gapMin = 15): HistoryPoint[][] {
  const out: HistoryPoint[][] = []
  for (const p of pts) {
    const cur = out[out.length - 1]
    const prev = cur?.[cur.length - 1]
    if (!cur || new Date(p.recorded_at).getTime() - new Date(prev.recorded_at).getTime() > gapMin * 60000) out.push([p])
    else cur.push(p)
  }
  return out
}

export async function downloadMyData(uid: string) {
  const [profile, settings, history, shares, memberships] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('user_settings').select('*').eq('user_id', uid).maybeSingle(),
    supabase.from('location_history').select('latitude,longitude,accuracy_m,recorded_at').eq('user_id', uid).order('recorded_at'),
    supabase.from('location_shares').select('family_id,duration,started_at,expires_at,stopped_at').eq('user_id', uid),
    supabase.from('family_members').select('family_id,role,status,joined_at').eq('user_id', uid),
  ])
  const blob = new Blob([JSON.stringify({
    exported_at: new Date().toISOString(), profile: profile.data, settings: settings.data,
    location_history: history.data, location_shares: shares.data, memberships: memberships.data,
  }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = 'family-tracker-data-saya.json'; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
