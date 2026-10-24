import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed, Maximize2 } from 'lucide-react'
import type { MemberLoc } from '../hooks/useFamilyLocations'
import { STATUS_LABEL, ago, type LocStatus } from '../lib/location'
import { useToast } from './Toast'

const COLOR: Record<LocStatus, string> = { live: '#16A34A', stale: '#F59E0B', waiting: '#F59E0B', off: '#98A2B3' }
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?'

// Semua teks pengguna dimasukkan lewat textContent (bukan HTML) agar aman dari XSS.
function pin(r: MemberLoc) {
  const el = document.createElement('div')
  el.style.cssText = `width:44px;height:44px;border-radius:50%;border:3px solid ${COLOR[r.status]};background:#FFC928;color:#101828;display:grid;place-items:center;font:700 15px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3);overflow:hidden`
  if (r.avatar && r.avatar.startsWith('https://')) {
    const img = document.createElement('img')
    img.src = r.avatar; img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover'
    el.appendChild(img)
  } else el.textContent = initials(r.name)
  return L.divIcon({ html: el, className: '', iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -24] })
}

function popup(r: MemberLoc, isMe: boolean) {
  const d = document.createElement('div')
  d.style.cssText = 'font:500 13px system-ui;min-width:170px;line-height:1.5'
  const add = (text: string, bold = false) => {
    const p = document.createElement(bold ? 'strong' : 'div'); p.textContent = text
    if (bold) p.style.display = 'block'
    d.appendChild(p)
  }
  add(r.name + (isMe ? ' (kamu)' : ''), true)
  add(STATUS_LABEL[r.status])
  if (r.loc) {
    if (r.loc.accuracy_m != null) add(`Akurasi ±${Math.round(r.loc.accuracy_m)} m`)
    add(`Diperbarui ${ago(r.loc.recorded_at)}`)
    if (r.status === 'stale') add('Lokasi ini sudah lama, mungkin tidak akurat.')
    const b = document.createElement('button')
    b.textContent = 'Navigasi di aplikasi peta'
    b.style.cssText = 'margin-top:8px;padding:6px 10px;border-radius:10px;background:#FFC928;color:#101828;font:600 12px system-ui;border:0;cursor:pointer'
    b.onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.loc!.latitude},${r.loc!.longitude}`, '_blank', 'noopener')
    d.appendChild(b)
  }
  return d
}

export interface MapFocus { id: string; n: number }

export default function FamilyMap({ rows, meId, height, focus }: { rows: MemberLoc[]; meId: string; height: number | string; focus?: MapFocus | null }) {
  const toast = useToast()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const circles = useRef(new Map<string, L.Circle>())
  const mine = useRef<L.Marker | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: true }).setView([-2.5, 118], 4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null; markers.current.clear(); circles.current.clear(); mine.current = null; fitted.current = false }
  }, [])

  useEffect(() => {
    const m = map.current; if (!m) return
    const visible = rows.filter((r) => r.loc)
    const keep = new Set(visible.map((r) => r.id))
    for (const [id, mk] of markers.current) if (!keep.has(id)) { mk.remove(); markers.current.delete(id); circles.current.get(id)?.remove(); circles.current.delete(id) }
    for (const r of visible) {
      const ll: L.LatLngExpression = [r.loc!.latitude, r.loc!.longitude]
      let mk = markers.current.get(r.id)
      if (!mk) { mk = L.marker(ll, { icon: pin(r) }).addTo(m); mk.bindPopup(popup(r, r.id === meId)); markers.current.set(r.id, mk) }
      else { mk.setLatLng(ll); mk.setIcon(pin(r)); mk.setPopupContent(popup(r, r.id === meId)) }
      const acc = r.loc!.accuracy_m
      const old = circles.current.get(r.id)
      if (acc != null && acc <= 500) {
        if (old) old.setLatLng(ll).setRadius(acc)
        else circles.current.set(r.id, L.circle(ll, { radius: acc, color: COLOR[r.status], weight: 1, fillOpacity: 0.1, interactive: false }).addTo(m))
      } else if (old) { old.remove(); circles.current.delete(r.id) }
    }
    if (!fitted.current && markers.current.size > 0) { fitAll(); fitted.current = true }
  }, [rows, meId])

  useEffect(() => {
    if (!focus) return
    const mk = markers.current.get(focus.id)
    if (mk && map.current) { map.current.flyTo(mk.getLatLng(), 17); mk.openPopup() }
    else toast('Anggota ini tidak sedang berbagi lokasi.', 'info')
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  function fitAll() {
    const m = map.current; if (!m || markers.current.size === 0) return toast('Belum ada lokasi untuk ditampilkan.', 'info')
    m.fitBounds(L.featureGroup([...markers.current.values()]).getBounds().pad(0.3), { maxZoom: 17 })
  }

  function locateMe() {
    const m = map.current; if (!m) return
    const own = markers.current.get(meId)
    if (own) { m.flyTo(own.getLatLng(), 17); own.openPopup(); return }
    if (!('geolocation' in navigator)) return toast('Perangkat ini tidak mendukung GPS.', 'error')
    navigator.geolocation.getCurrentPosition((p) => {
      const ll: L.LatLngExpression = [p.coords.latitude, p.coords.longitude]
      mine.current?.remove()
      mine.current = L.marker(ll).addTo(m).bindPopup('Posisimu saat ini. Tidak dibagikan ke siapa pun.')
      m.flyTo(ll, 17); mine.current.openPopup()
    }, () => toast('Tidak bisa membaca lokasimu. Cek izin lokasi dan GPS.', 'error'), { enableHighAccuracy: true, timeout: 15000 })
  }

  const btn = 'grid h-10 w-10 place-items-center rounded-xl bg-white text-navy shadow ring-1 ring-navy/10 active:scale-95'
  return (
    <div className="relative overflow-hidden rounded-card" style={{ height }}>
      <div ref={box} className="h-full w-full" />
      <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
        <button className={btn} onClick={locateMe} aria-label="Lokasi saya" title="Lokasi saya"><LocateFixed size={18} /></button>
        <button className={btn} onClick={fitAll} aria-label="Lihat semua anggota" title="Lihat semua anggota"><Maximize2 size={18} /></button>
      </div>
    </div>
  )
}
