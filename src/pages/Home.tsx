import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Map as MapIcon, UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useFamilyLocations } from '../hooks/useFamilyLocations'
import Avatar from '../components/Avatar'
import FamilyMap from '../components/FamilyMap'
import MemberList from '../components/MemberList'
import ShareControl from '../components/ShareControl'
import EmptyState from '../components/EmptyState'

export default function Home() {
  const { user } = useAuth()
  const { familyId, loading, family } = useActiveFamily()
  const { rows } = useFamilyLocations(familyId)
  const [name, setName] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('full_name').eq('id', user!.id).single().then(({ data }) => setName(data?.full_name ?? ''))
  }, [user])

  const stat = 'card flex-1 !p-3 text-center'
  return (
    <div className="space-y-4">
      <div className="-mx-4 -mt-4 rounded-b-[28px] bg-navy px-5 pb-14 pt-8 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold">Halo, {name.split(' ')[0] || 'Keluarga'} <span aria-hidden>👋</span></p>
            <p className="text-sm text-white/70">Keluarga selalu di dekatmu</p>
          </div>
          <Link to="/profil" aria-label="Profil"><Avatar name={name || '?'} size={44} /></Link>
        </div>
      </div>

      {loading ? <div className="skeleton h-40" /> : !family ? (
        <div className="-mt-10 space-y-3">
          <EmptyState icon={Users} title="Mulai dengan grup keluarga" hint="Buat grup, lalu undang anggota keluarga lewat tautan. Setelah mereka bergabung dan berbagi lokasi, posisinya muncul di sini." />
          <Link to="/keluarga" className="btn-primary w-full">Buat atau gabung grup</Link>
        </div>
      ) : (
        <>
          <div className="-mt-12 flex gap-3">
            <div className={stat}><p className="text-2xl font-extrabold">{rows.length}</p><p className="text-xs text-navy/60 dark:text-white/60">Anggota</p></div>
            <div className={stat}><p className="text-2xl font-extrabold text-live">{rows.filter((r) => r.sharing).length}</p><p className="text-xs text-navy/60 dark:text-white/60">Aktif lokasi</p></div>
          </div>
          <ShareControl />
          <FamilyMap rows={rows} meId={user!.id} height={200} />
          <section className="card">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-bold">Anggota Keluarga</h2>
              <Link to="/keluarga" className="text-sm font-semibold text-blue-600 dark:text-sun">Lihat semua</Link>
            </div>
            <MemberList rows={rows} meId={user!.id} linkBase="/anggota" />
          </section>
          <Link to="/keluarga" className="btn-primary w-full py-3.5"><UserPlus size={18} /> Undang Anggota</Link>
          <Link to="/peta" className="btn-ghost w-full"><MapIcon size={16} /> Buka peta</Link>
        </>
      )}
    </div>
  )
}
