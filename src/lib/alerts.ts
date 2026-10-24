import { supabase } from './supabase'

export interface Notif {
  id: string; sender_id: string | null; type: string; title: string; body: string | null
  payload: { alert_id?: string; family_id?: string; lat?: number | null; lng?: number | null; acc?: number | null }
  read_at: string | null; created_at: string
}
export interface AlertRow {
  id: string; user_id: string; family_id: string; type: 'sos' | 'safe' | 'arrival'; status: 'active' | 'resolved' | 'cancelled'
  latitude: number | null; longitude: number | null; accuracy_m: number | null; message: string | null
  created_at: string; resolved_at: string | null
}
export interface SendResult { ok: boolean; alert_ids: string[]; recipients: number; created_at: string; lat: number | null; lng: number | null; acc: number | null; duplicate?: boolean }
export interface AlertStatus { total: number; read: number; recipients: { name: string; read: boolean }[] }
export interface Pos { lat: number; lng: number; acc: number }

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const sendSos = (p: Pos | null, request: string, message: string | null = null) =>
  rpc<SendResult>('send_sos', { p_lat: p?.lat ?? null, p_lng: p?.lng ?? null, p_acc: p?.acc ?? null, p_message: message, p_request: request })
export const sendSafe = (p: Pos | null, request: string, recipients: string[] | null) =>
  rpc<SendResult>('send_safe', { p_lat: p?.lat ?? null, p_lng: p?.lng ?? null, p_acc: p?.acc ?? null, p_request: request, p_recipients: recipients })
export const alertStatus = (ids: string[]) => rpc<AlertStatus>('alert_status', { p_alerts: ids })
export const resolveSos = (id: string) => rpc('resolve_sos', { p_alert: id })

export async function listNotifications(): Promise<Notif[]> {
  const { data, error } = await supabase.from('notifications')
    .select('id,sender_id,type,title,body,payload,read_at,created_at').order('created_at', { ascending: false }).limit(60)
  if (error) throw new Error(error.message)
  return (data ?? []) as Notif[]
}
export async function markRead(ids: string[]) {
  if (!ids.length) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)
}
export async function listActiveSos(): Promise<AlertRow[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data } = await supabase.from('safety_alerts')
    .select('id,user_id,family_id,type,status,latitude,longitude,accuracy_m,message,created_at,resolved_at')
    .eq('type', 'sos').eq('status', 'active').gte('created_at', since).order('created_at', { ascending: false })
  return (data ?? []) as AlertRow[]
}
export async function getAlert(id: string): Promise<AlertRow | null> {
  const { data } = await supabase.from('safety_alerts')
    .select('id,user_id,family_id,type,status,latitude,longitude,accuracy_m,message,created_at,resolved_at').eq('id', id).maybeSingle()
  return (data as AlertRow | null) ?? null
}

// Posisi untuk disertakan pada peringatan. Null bila izin ditolak atau GPS tidak merespons.
export function getPosition(timeoutMs = 8000): Promise<Pos | null> {
  return new Promise((res) => {
    if (!('geolocation' in navigator)) return res(null)
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => res(null), { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 })
  })
}
