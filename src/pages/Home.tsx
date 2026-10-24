import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Map as MapIcon, UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useFamilyLocations } from '../hooks/useFamilyLocations'
import FamilyMap from '../components/FamilyMap'
import MemberList from '../components/MemberList'
import ShareControl from '../components/ShareControl'
import EmptyState from '../components/EmptyState'

function greeting() {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}

export default function Home() {
  const { user } = useAuth()
  const { familyId, loading, family } = useActiveFamily()
  const { rows } = useFamilyLocations(familyId)
  const [name, setName] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('full_name').eq('id', user!.id).single().then(({ data }) => setName(data?.full_name?.split(' ')[0] ?? ''))
  }, [user])

  const stat = 'card flex-1 text-center'
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-navy/60 dark:text-white/60">{greeting()}{name && `, ${name}`}</p>
        <h1 className="text-2xl font-extrabold">Family Tracker</h1>
      </div>

      {loading ? <div className="skeleton h-40" /> : !family ? (
        <>
          <EmptyState icon={Users} title="Mulai dengan grup keluarga" hint="Buat grup, lalu undang anggota keluarga lewat tautan. Setelah mereka bergabung dan berbagi lokasi, posisinya muncul di sini." />
          <Link to="/keluarga" className="btn-primary w-full">Buat atau gabung grup</Link>
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <div className={stat}><p className="text-2xl font-extrabold">{rows.length}</p><p className="text-xs text-navy/60 dark:text-white/60">Anggota</p></div>
            <div className={stat}><p className="text-2xl font-extrabold text-live">{rows.filter((r) => r.sharing).length}</p><p className="text-xs text-navy/60 dark:text-white/60">Sedang berbagi</p></div>
          </div>
          <ShareControl />
          <FamilyMap rows={rows} meId={user!.id} height={220} />
          <section className="card">
            <h2 className="mb-1 font-bold">{family.name}</h2>
            <MemberList rows={rows} meId={user!.id} />
          </section>
          <div className="flex gap-2">
            <Link to="/peta" className="btn-primary flex-1"><MapIcon size={16} /> Buka peta</Link>
            <Link to="/keluarga" className="btn-ghost flex-1"><UserPlus size={16} /> Undang anggota</Link>
          </div>
        </>
      )}
    </div>
  )
}
