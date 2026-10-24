import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { useToast } from '../components/Toast'
import * as api from '../lib/location'
import { listPlaces, reportPlaceEvent, type Place } from '../lib/places'
import { meters } from '../lib/privacy'
import type { Duration, Share } from '../lib/location'

type Geo = 'idle' | 'starting' | 'watching' | 'denied' | 'unsupported'
interface Fix { lat: number; lng: number; acc: number; at: number; speed: number | null }
interface Ctx {
  share: Share | null; live: boolean; geo: Geo; fix: Fix | null; message: string; needsResume: boolean; native: boolean
  start: (d?: Duration) => Promise<void>; stop: () => Promise<void>; resume: () => Promise<void>
}

const DENIED = 'Izin lokasi ditolak. Buka pengaturan situs di browser (ikon gembok di kolom alamat), izinkan Lokasi, lalu coba lagi.'
const Sharing = createContext<Ctx | null>(null)

/* eslint-disable @typescript-eslint/no-explicit-any */
const cap = (): any => (window as any).Capacitor
export const isNative = () => cap()?.isNativePlatform?.() === true
let bgPlugin: any
const BG = () => (bgPlugin ??= cap().registerPlugin('BackgroundGeolocation'))

type Handle = { kind: 'web'; id: number } | { kind: 'native'; id: Promise<string> }

const getOnce = () =>
  new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }))

async function battery(): Promise<{ pct: number; charging: boolean } | null> {
  try {
    const b = await (navigator as any).getBattery?.()
    return b ? { pct: Math.round(b.level * 100), charging: !!b.charging } : null
  } catch { return null }
}

export function SharingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [share, setShare] = useState<Share | null>(null)
  const [geo, setGeo] = useState<Geo>('idle')
  const [fix, setFix] = useState<Fix | null>(null)
  const [message, setMessage] = useState('')
  const [needsResume, setNeedsResume] = useState(false)
  const [now, setNow] = useState(Date.now())
  const handle = useRef<Handle | null>(null)
  const lastPush = useRef(0)
  const places = useRef<Place[]>([])
  const inside = useRef(new Map<string, boolean>())
  const native = isNative()
  const live = api.shareIsLive(share, now)

  const clearWatch = useCallback(() => {
    const h = handle.current
    if (!h) return
    if (h.kind === 'web') navigator.geolocation.clearWatch(h.id)
    else h.id.then((id) => BG().removeWatcher({ id })).catch(() => {})
    handle.current = null
  }, [])

  // Geofence: kirim peristiwa tiba/pergi hanya saat status benar-benar berubah (server memverifikasi ulang)
  const evaluatePlaces = useCallback((f: Fix) => {
    for (const p of places.current) {
      const d = meters({ latitude: f.lat, longitude: f.lng }, p)
      const prev = inside.current.get(p.id)
      if (prev === undefined) { inside.current.set(p.id, d <= p.radius_m); continue } // keadaan awal: tanpa notifikasi
      let next = prev
      if (!prev && d <= p.radius_m && f.acc <= p.radius_m + 100) next = true
      else if (prev && d > p.radius_m + Math.max(f.acc, 30)) next = false
      if (next === prev) continue
      inside.current.set(p.id, next)
      reportPlaceEvent(p.id, next ? 'arrive' : 'leave', f.lat, f.lng, f.acc)
        .then((r) => { if (!r.ok) inside.current.set(p.id, prev) })
        .catch(() => inside.current.set(p.id, prev))
    }
  }, [])

  const onFix = useCallback(async (f: Fix) => {
    setFix(f); setMessage(''); setGeo('watching')
    evaluatePlaces(f)
    if (Date.now() - lastPush.current < 15000) return
    lastPush.current = Date.now()
    try {
      const b = await battery()
      const r = await api.pushLocation(f.lat, f.lng, f.acc, b?.pct ?? null, b?.charging ?? null, f.speed)
      if (!r.ok && r.reason === 'not_sharing') {
        clearWatch(); setShare(null); setGeo('idle'); setFix(null)
        toast('Berbagi lokasi telah berakhir.', 'info')
      }
    } catch { setMessage('Gagal mengirim lokasi. Mencoba lagi…'); lastPush.current = 0 }
  }, [clearWatch, evaluatePlaces, toast])

  const denied = useCallback(() => {
    clearWatch(); setGeo('denied'); setMessage(DENIED); setShare(null); setFix(null)
    api.stopSharing().catch(() => {}) // izin dicabut: hentikan berbagi agar lokasi lama tidak tampil
  }, [clearWatch])

  const beginWatch = useCallback(() => {
    if (handle.current) return
    lastPush.current = 0
    listPlaces().then((p) => { places.current = p }).catch(() => {})
    if (native) {
      const id = BG().addWatcher(
        { backgroundTitle: 'Berbagi lokasi aktif', backgroundMessage: 'Family Tracker membagikan lokasimu ke keluarga.', requestPermissions: true, stale: false, distanceFilter: 10 },
        (loc: any, err: any) => {
          if (err) { if (err.code === 'NOT_AUTHORIZED') denied(); else setMessage('Sinyal GPS bermasalah. Masih mencoba…'); return }
          if (loc) onFix({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy ?? 50, at: Date.now(), speed: Number.isFinite(loc.speed) && loc.speed >= 0 ? loc.speed : null })
        })
      handle.current = { kind: 'native', id }
    } else {
      handle.current = {
        kind: 'web',
        id: navigator.geolocation.watchPosition(
          (p) => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now(), speed: p.coords.speed != null && Number.isFinite(p.coords.speed) ? p.coords.speed : null }),
          (e) => {
            if (e.code === e.PERMISSION_DENIED) denied()
            else if (e.code === e.POSITION_UNAVAILABLE) setMessage('Sinyal GPS tidak tersedia. Coba pindah ke tempat terbuka.')
            else setMessage('GPS lambat merespons. Masih mencoba…')
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }),
      }
    }
  }, [native, onFix, denied])

  const start = useCallback(async (d: Duration = '24h') => {
    if (!native && !('geolocation' in navigator)) { setGeo('unsupported'); setMessage('Perangkat ini tidak mendukung GPS.'); return }
    setGeo('starting'); setMessage('')
    if (!native) {
      try { await getOnce() } catch (e) {
        const err = e as GeolocationPositionError
        setGeo(err.code === 1 ? 'denied' : 'idle')
        setMessage(err.code === 1 ? DENIED : 'Tidak bisa membaca lokasi. Pastikan GPS aktif lalu coba lagi.')
        return
      }
    }
    try {
      await api.startSharing(d)
      setShare(await api.fetchMyShare(user!.id)); setNeedsResume(false)
      inside.current.clear(); beginWatch(); toast('Berbagi lokasi aktif.', 'ok')
    } catch (e) { setGeo('idle'); setMessage((e as Error).message) }
  }, [beginWatch, native, toast, user])

  const stop = useCallback(async () => {
    clearWatch(); setGeo('idle'); setFix(null)
    try { await api.stopSharing(); setShare(null); setNeedsResume(false); toast('Berbagi lokasi dihentikan.', 'ok') }
    catch { toast('Gagal menghentikan. Coba lagi.', 'error'); setShare(await api.fetchMyShare(user!.id).catch(() => null)) }
  }, [clearWatch, toast, user])

  const resume = useCallback(async () => {
    try { if (!native) await getOnce(); beginWatch(); setNeedsResume(false) } catch { setGeo('denied'); setMessage(DENIED) }
  }, [beginWatch, native])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await api.fetchMyShare(user.id)
        if (cancelled) return
        setShare(s)
        if (api.shareIsLive(s)) {
          if (native) { setGeo('starting'); beginWatch(); return }
          const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }).catch(() => undefined)
          if (perm?.state === 'granted') { setGeo('starting'); beginWatch() } else setNeedsResume(true)
        }
      } catch { /* abaikan; UI tetap bisa dipakai */ }
    })()
    return () => { cancelled = true; clearWatch() }
  }, [user, native, beginWatch, clearWatch])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!live) return; const t = setInterval(() => listPlaces().then((p) => { places.current = p }).catch(() => {}), 300000); return () => clearInterval(t) }, [live])

  useEffect(() => {
    if (share && !live) {
      clearWatch(); setGeo('idle'); setFix(null); setShare(null)
      api.stopSharing().catch(() => {})
      toast('Berbagi lokasi berakhir.', 'info')
    }
  }, [share, live, clearWatch, toast])

  useEffect(() => {
    const h = async () => {
      if (document.visibilityState !== 'visible' || !live || handle.current) return
      if (native) return beginWatch()
      const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }).catch(() => undefined)
      if (perm?.state === 'granted') beginWatch()
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [live, native, beginWatch])

  return (
    <Sharing.Provider value={{ share, live, geo, fix, message, needsResume, native, start, stop, resume }}>
      {children}
    </Sharing.Provider>
  )
}

export function useSharing() {
  const v = useContext(Sharing)
  if (!v) throw new Error('useSharing harus di dalam SharingProvider')
  return v
}
