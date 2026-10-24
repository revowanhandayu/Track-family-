import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { History, UserRound, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useFamilyLocations } from '../hooks/useFamilyLocations'
import FamilyMap, { type MapFocus } from '../components/FamilyMap'
import MemberList from '../components/MemberList'
import ShareControl from '../components/ShareControl'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { inputCls } from '../components/AuthLayout'
import { STATUS_LABEL, ago } from '../lib/location'

export default function MapPage() {
  const { user } = useAuth()
  const st = useLocation().state as { focus?: string } | null
  const { families, familyId, setFamilyId, loading, family } = useActiveFamily()
  const { rows } = useFamilyLocations(familyId)
  const [focus, setFocus] = useState<MapFocus | null>(st?.focus ? { id: st.focus, n: 1 } : null)

  if (loading) return <div className="space-y-3"><div className="skeleton h-8 w-40" /><div className="skeleton h-80" /></div>
  if (!family) {
    return (
      <>
        <PageHeader title="Peta Keluarga" back={false} />
        <EmptyState icon={Users} title="Belum ada grup keluarga" hint="Buat atau gabung ke grup dulu, lalu anggota yang berbagi lokasi akan muncul di peta." />
        <Link to="/keluarga" className="btn-primary mt-3 w-full">Ke halaman Keluarga</Link>
      </>
    )
  }

  const sel = rows.find((r) => r.id === focus?.id)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Peta Keluarga</h1>
        {families.length > 1 && (
          <select className={`${inputCls} w-auto`} value={familyId ?? ''} onChange={(e) => setFamilyId(e.target.value)} aria-label="Pilih grup">
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
      <FamilyMap rows={rows} meId={user!.id} height="min(56dvh, 520px)" focus={focus} />
      {sel && (
        <div className="card space-y-3">
          <div>
            <p className="font-bold">{sel.name}{sel.id === user!.id && ' (kamu)'}</p>
            <p className="text-sm text-navy/60 dark:text-white/60">{STATUS_LABEL[sel.status]}{sel.loc && ` · ${ago(sel.loc.recorded_at)}`}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/anggota/${sel.id}`} className="btn-ghost flex-1"><UserRound size={16} /> Detail</Link>
            <Link to={`/riwayat?u=${sel.id}`} className="btn-ghost flex-1"><History size={16} /> Riwayat</Link>
          </div>
        </div>
      )}
      <ShareControl />
      <section className="card">
        <h2 className="mb-1 font-bold">Anggota</h2>
        <MemberList rows={rows} meId={user!.id} onSelect={(id) => setFocus({ id, n: Date.now() })} />
      </section>
      <Link to="/keluarga" className="btn-primary w-full py-3.5">Undang Anggota</Link>
    </div>
  )
}
