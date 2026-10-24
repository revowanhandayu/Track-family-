import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useFamilyLocations } from '../hooks/useFamilyLocations'
import FamilyMap, { type MapFocus } from '../components/FamilyMap'
import MemberList from '../components/MemberList'
import ShareControl from '../components/ShareControl'
import EmptyState from '../components/EmptyState'
import { inputCls } from '../components/AuthLayout'

export default function MapPage() {
  const { user } = useAuth()
  const { families, familyId, setFamilyId, loading, family } = useActiveFamily()
  const { rows } = useFamilyLocations(familyId)
  const [focus, setFocus] = useState<MapFocus | null>(null)

  if (loading) return <div className="space-y-3"><div className="skeleton h-8 w-40" /><div className="skeleton h-80" /></div>
  if (!family) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-extrabold">Peta keluarga</h1>
        <EmptyState icon={Users} title="Belum ada grup keluarga" hint="Buat atau gabung ke grup dulu, lalu anggota yang berbagi lokasi akan muncul di peta." />
        <Link to="/keluarga" className="btn-primary mt-3 w-full">Ke halaman Keluarga</Link>
      </>
    )
  }

  const sharingNow = rows.filter((r) => r.loc).length
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Peta keluarga</h1>
          <p className="text-sm text-navy/60 dark:text-white/60">{family.name} · {sharingNow} lokasi tampil</p>
        </div>
        {families.length > 1 && (
          <select className={`${inputCls} w-auto`} value={familyId ?? ''} onChange={(e) => setFamilyId(e.target.value)} aria-label="Pilih grup">
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
      <FamilyMap rows={rows} meId={user!.id} height="min(52dvh, 480px)" focus={focus} />
      <ShareControl />
      <section className="card">
        <h2 className="mb-1 font-bold">Anggota</h2>
        <MemberList rows={rows} meId={user!.id} onSelect={(id) => setFocus({ id, n: Date.now() })} />
      </section>
    </div>
  )
}
