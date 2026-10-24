import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { useToast } from '../components/Toast'
import * as api from '../lib/location'
import type { Duration, Share } from '../lib/location'

type Geo = 'idle' | 'starting' | 'watching' | 'denied' | 'unsupported'
interface Fix { lat: number; lng: number; acc: number; at: number }
interface Ctx {
  share: Share | null; live: boolean; geo: Geo; fix: Fix | null; message: string; needsResume: boolean
  start: (d: Duration) => Promise<void>; stop: () => Promise<void>; resume: () => Promise<void>
}

const DENIED = 'Izin lokasi ditolak. Buka pengaturan situs di browser (ikon gembok di kolom alamat), izinkan Lokasi, lalu coba lagi.'
const Sharing = createContext<Ctx | null>(null)

const getOnce = () =>
  new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }))

export function SharingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [share, setShare] = useState<Share | null>(null)
  const [geo, setGeo] = useState<Geo>('idle')
  const [fix, setFix] = useState<Fix | null>(null)
  const [message, setMessage] = useState('')
  const [needsResume, setNeedsResume] = useState(false)
  const [now, setNow] = useState(Date.now())
  const watchId = useRef<number | null>(null)
  const lastPush = useRef(0)
  const live = api.shareIsLive(share, now)

  const clearWatch = useCallback(() => {
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
  }, [])

  const onPos = useCallback(async (p: GeolocationPosition) => {
    const f = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }
    setFix(f); setMessage(''); setGeo('watching')
    if (Date.now() - lastPush.current < 15000) return
    lastPush.current = Date.now()
    try {
      const r = await api.pushLocation(f.lat, f.lng, f.acc)
      if (!r.ok && r.reason === 'not_sharing') {
        clearWatch(); setShare(null); setGeo('idle'); setFix(null)
        toast('Berbagi lokasi telah berakhir.', 'info')
      }
    } catch { setMessage('Gagal mengirim lokasi. Mencoba lagi…'); lastPush.current = 0 }
  }, [clearWatch, toast])

  const onErr = useCallback((e: GeolocationPositionError) => {
    if (e.code === e.PERMISSION_DENIED) {
      clearWatch(); setGeo('denied'); setMessage(DENIED); setShare(null); setFix(null)
      api.stopSharing().catch(() => {}) // izin dicabut: hentikan berbagi agar lokasi lama tidak tampil
    } else if (e.code === e.POSITION_UNAVAILABLE) setMessage('Sinyal GPS tidak tersedia. Coba pindah ke tempat terbuka.')
    else setMessage('GPS lambat merespons. Masih mencoba…')
  }, [clearWatch])

  const beginWatch = useCallback(() => {
    if (watchId.current !== null) return
    lastPush.current = 0
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
  }, [onPos, onErr])

  const start = useCallback(async (d: Duration) => {
    if (!('geolocation' in navigator)) { setGeo('unsupported'); setMessage('Perangkat ini tidak mendukung GPS.'); return }
    setGeo('starting'); setMessage('')
    try { await getOnce() } catch (e) {
      const err = e as GeolocationPositionError
      setGeo(err.code === 1 ? 'denied' : 'idle')
      setMessage(err.code === 1 ? DENIED : 'Tidak bisa membaca lokasi. Pastikan GPS aktif lalu coba lagi.')
      return
    }
    try {
      await api.startSharing(d)
      setShare(await api.fetchMyShare(user!.id)); setNeedsResume(false)
      beginWatch(); toast('Berbagi lokasi aktif.', 'ok')
    } catch (e) { setGeo('idle'); setMessage((e as Error).message) }
  }, [beginWatch, toast, user])

  const stop = useCallback(async () => {
    clearWatch(); setGeo('idle'); setFix(null)
    try { await api.stopSharing(); setShare(null); setNeedsResume(false); toast('Berbagi lokasi dihentikan.', 'ok') }
    catch { toast('Gagal menghentikan. Coba lagi.', 'error'); setShare(await api.fetchMyShare(user!.id).catch(() => null)) }
  }, [clearWatch, toast, user])

  const resume = useCallback(async () => {
    try { await getOnce(); beginWatch(); setNeedsResume(false) } catch { setGeo('denied'); setMessage(DENIED) }
  }, [beginWatch])

  // Muat status berbagi saat login; lanjutkan otomatis hanya bila izin sudah diberikan sebelumnya.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const s = await api.fetchMyShare(user.id)
        if (cancelled) return
        setShare(s)
        if (api.shareIsLive(s)) {
          const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }).catch(() => undefined)
          if (perm?.state === 'granted') { setGeo('starting'); beginWatch() } else setNeedsResume(true)
        }
      } catch { /* abaikan; UI tetap bisa dipakai */ }
    })()
    return () => { cancelled = true; clearWatch() }
  }, [user, beginWatch, clearWatch])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t) }, [])

  // Berbagi berdasarkan waktu berakhir: hentikan GPS dan bersihkan lokasi di server.
  useEffect(() => {
    if (share && !live) {
      clearWatch(); setGeo('idle'); setFix(null); setShare(null)
      api.stopSharing().catch(() => {})
      toast('Berbagi lokasi berakhir.', 'info')
    }
  }, [share, live, clearWatch, toast])

  // Saat tab kembali terlihat, sambungkan lagi GPS bila izin masih ada.
  useEffect(() => {
    const h = async () => {
      if (document.visibilityState !== 'visible' || !live || watchId.current !== null) return
      const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }).catch(() => undefined)
      if (perm?.state === 'granted') beginWatch()
    }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [live, beginWatch])

  return (
    <Sharing.Provider value={{ share, live, geo, fix, message, needsResume, start, stop, resume }}>
      {children}
    </Sharing.Provider>
  )
}

export function useSharing() {
  const v = useContext(Sharing)
  if (!v) throw new Error('useSharing harus di dalam SharingProvider')
  return v
}
