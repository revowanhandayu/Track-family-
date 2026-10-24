import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LocateFixed, MapPin, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useSharing } from '../hooks/useSharing'
import { useToast } from '../components/Toast'
import { addPlace, deletePlace, listPlaces, type Place } from '../lib/places'
import { getPosition } from '../lib/alerts'
import PlacesMap, { type Pick } from '../components/PlacesMap'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { inputCls } from '../components/AuthLayout'

const PRESETS = ['Rumah', 'Sekolah', 'Kantor', 'Tempat les']
const RADII = [100, 150, 250, 500]

export default function PlacesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const { native } = useSharing()
  const { familyId, family, loading } = useActiveFamily()
  const [places, setPlaces] = useState<Place[]>([])
  const [name, setName] = useState('')
  const [radius, setRadius] = useState(150)
  const [pick, setPick] = useState<Pick | null>(null)
  const [fly, setFly] = useState<{ lat: number; lng: number; n: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<Place | null>(null)

  const load = useCallback(async () => { if (familyId) setPlaces(await listPlaces(familyId).catch(() => [])) }, [familyId])
  useEffect(() => { load() }, [load])

  async function useMyPos() {
    const p = await getPosition(10000)
    if (!p) return toast('Tidak bisa membaca lokasimu. Cek izin lokasi dan GPS.', 'error')
    setPick({ lat: p.lat, lng: p.lng }); setFly({ lat: p.lat, lng: p.lng, n: Date.now() })
  }
  async function save() {
    if (!familyId || !pick) return
    setBusy(true)
    try { await addPlace(familyId, name, pick.lat, pick.lng, radius); setName(''); setPick(null); toast('Tempat disimpan.', 'ok'); await load() }
    catch (e) { toast((e as Error).message, 'error') }
    setBusy(false)
  }
  async function remove() {
    if (!del) return
    setBusy(true)
    try { await deletePlace(del.id); toast('Tempat dihapus.', 'ok'); await load() } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false); setDel(null)
  }

  if (loading) return <div className="skeleton h-64" />
  if (!family) return <><PageHeader title="Tempat" /><EmptyState icon={MapPin} title="Belum ada grup" hint="Buat atau gabung grup keluarga dulu." /><Link to="/keluarga" className="btn-primary mt-3 w-full">Ke Keluarga</Link></>

  return (
    <div className="space-y-4">
      <PageHeader title="Tempat" />
      <p className="text-sm text-navy/60 dark:text-white/60">
        Anggota grup diberi tahu saat seseorang tiba atau pergi dari tempat ini. Peringatan hanya terdeteksi selama berbagi lokasi aktif
        {native ? '.' : ' dan aplikasi terbuka di layar.'}
      </p>
      <PlacesMap places={places} pick={pick} radius={radius} onPick={setPick} fly={fly} />
      <section className="card space-y-3">
        <h2 className="font-bold">Tambah tempat</h2>
        <p className="text-xs text-navy/60 dark:text-white/60">Ketuk peta untuk memilih titik, atau pakai lokasimu sekarang.</p>
        <button className="btn-ghost w-full" onClick={useMyPos}><LocateFixed size={16} /> Pakai lokasiku sekarang</button>
        <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p} className={name === p ? 'btn-primary px-3 py-1.5' : 'btn-ghost px-3 py-1.5'} onClick={() => setName(p)}>{p}</button>)}</div>
        <input className={inputCls} placeholder="Nama tempat" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nama tempat" />
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Radius">
          {RADII.map((r) => <button key={r} role="radio" aria-checked={radius === r} className={radius === r ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setRadius(r)}>{r} m</button>)}
        </div>
        <button className="btn-primary w-full" disabled={busy || !pick || !name.trim()} onClick={save}>Simpan tempat</button>
        {!pick && <p className="text-xs text-navy/60 dark:text-white/60">Belum ada titik dipilih.</p>}
      </section>
      <section className="card">
        <h2 className="mb-1 font-bold">Tempat grup ({places.length})</h2>
        {places.length === 0 ? <p className="py-2 text-sm text-navy/60 dark:text-white/60">Belum ada tempat.</p> : (
          <ul className="divide-y divide-navy/5 dark:divide-white/10">
            {places.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <MapPin size={18} className="shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-xs text-navy/60 dark:text-white/60">Radius {p.radius_m} m</p></div>
                {(p.created_by === user!.id || family.owner_id === user!.id) && (
                  <button className="btn-ghost px-3" aria-label={`Hapus ${p.name}`} onClick={() => setDel(p)}><Trash2 size={16} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog open={!!del} danger busy={busy} confirmLabel="Hapus" title={`Hapus ${del?.name}?`} onCancel={() => setDel(null)} onConfirm={remove}>
        Peringatan tiba dan pergi untuk tempat ini berhenti.
      </ConfirmDialog>
    </div>
  )
}
