import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from '../lib/places'

export interface Pick { lat: number; lng: number }

export default function PlacesMap({ places, pick, radius, onPick, fly, height = 300 }: {
  places: Place[]; pick: Pick | null; radius: number; onPick: (p: Pick) => void; fly?: { lat: number; lng: number; n: number } | null; height?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const fitted = useRef(false)

  useEffect(() => {
    const m = L.map(box.current!).setView([-2.5, 118], 4)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize()); ro.observe(box.current!)
    return () => { ro.disconnect(); m.remove(); map.current = null; fitted.current = false }
  }, [])

  useEffect(() => {
    const g = layer.current, m = map.current; if (!g || !m) return
    g.clearLayers()
    for (const p of places) {
      L.circle([p.latitude, p.longitude], { radius: p.radius_m, color: '#2563EB', weight: 2, fillOpacity: 0.12 })
        .bindTooltip(p.name, { permanent: true, direction: 'center', className: 'place-label' }).addTo(g)
    }
    if (pick) L.circle([pick.lat, pick.lng], { radius, color: '#FFC928', weight: 3, fillColor: '#FFC928', fillOpacity: 0.25 }).addTo(g)
    if (!fitted.current && places.length) {
      m.fitBounds(L.featureGroup(places.map((p) => L.circle([p.latitude, p.longitude], { radius: p.radius_m }))).getBounds().pad(0.4), { maxZoom: 16 })
      fitted.current = true
    }
  }, [places, pick, radius])

  useEffect(() => { if (fly && map.current) map.current.flyTo([fly.lat, fly.lng], 16) }, [fly])

  return <div ref={box} style={{ height }} className="w-full overflow-hidden rounded-card" />
}
