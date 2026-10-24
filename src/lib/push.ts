import { supabase } from './supabase'

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushConfigured = () => !!KEY
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return 'off'
  const { data } = await supabase.rpc('has_push_subscription', { p_endpoint: sub.endpoint })
  return data ? 'on' : 'off'
}

export async function enablePush() {
  if (!KEY) throw new Error('Kunci push belum dipasang di server aplikasi.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Izin notifikasi ditolak. Ubah di pengaturan situs browser, lalu coba lagi.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }))
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_ua: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

export async function getNotifySettings(uid: string) {
  const { data } = await supabase.from('user_settings').select('notify_sos,notify_members').eq('user_id', uid).maybeSingle()
  return { sos: data?.notify_sos ?? true, members: data?.notify_members ?? true }
}
export async function saveNotify(sos: boolean, members: boolean) {
  const { error } = await supabase.rpc('save_notify', { p_sos: sos, p_members: members })
  if (error) throw new Error(error.message)
}
