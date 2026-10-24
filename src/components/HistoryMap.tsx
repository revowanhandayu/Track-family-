import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { HistoryPoint } from '../lib/privacy'

export default function HistoryMap({ segments, height = 280 }: { segments: HistoryPoint[][]; height?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    const m = L.map(box.current!).setView([-2.5, 118], 4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    map.current = m; layer.current = L.layerGroup().addTo(m)
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(box.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const g = layer.current, m = map.current; if (!g || !m) return
    g.clearLayers()
    const all = segments.flat()
    if (all.length === 0) return
    for (const seg of segments) {
      const ll = seg.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)
      if (ll.length > 1) L.polyline(ll, { color: '#2563EB', weight: 4, opacity: 0.85 }).addTo(g)
      for (const p of ll) L.circleMarker(p, { radius: 4, color: '#101828', weight: 1, fillColor: '#FFC928', fillOpacity: 1 }).addTo(g)
    }
    const a = all[0], z = all[all.length - 1]
    L.circleMarker([a.latitude, a.longitude], { radius: 9, color: '#fff', weight: 2, fillColor: '#16A34A', fillOpacity: 1 }).bindTooltip('Awal').addTo(g)
    L.circleMarker([z.latitude, z.longitude], { radius: 9, color: '#fff', weight: 2, fillColor: '#E5352B', fillOpacity: 1 }).bindTooltip('Akhir').addTo(g)
    m.fitBounds(L.latLngBounds(all.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)).pad(0.2), { maxZoom: 17 })
  }, [segments])

  return <div ref={box} style={{ height }} className="w-full overflow-hidden rounded-card" />
}
