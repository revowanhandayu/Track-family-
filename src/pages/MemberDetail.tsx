import { Link, useNavigate, useParams } from 'react-router-dom'
import { History, MapPin, Navigation } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useFamilyLocations } from '../hooks/useFamilyLocations'
import Avatar from '../components/Avatar'
import FamilyMap from '../components/FamilyMap'
import PageHeader from '../components/PageHeader'
import { STATUS_LABEL, ago } from '../lib/location'

export default function MemberDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const { familyId } = useActiveFamily()
  const { rows, loading } = useFamilyLocations(familyId)
  const r = rows.find((x) => x.id === id)

  if (loading) return <div className="skeleton h-64" />
  if (!r) return <><PageHeader title="Detail Anggota" /><p className="text-sm">Anggota tidak ditemukan di grup ini.</p></>

  const circle = 'grid h-14 w-14 place-items-center rounded-full bg-sun-soft text-navy dark:bg-sun/20 dark:text-sun'
  return (
    <div className="space-y-4">
      <PageHeader title="Detail Anggota" />
      <div className="flex flex-col items-center text-center">
        <Avatar name={r.name} url={r.avatar} size={96} />
        <p className="mt-3 text-xl font-extrabold">{r.name}{r.id === user!.id && ' (kamu)'}</p>
        <span className="mt-1 rounded-full bg-navy/10 px-3 py-1 text-xs font-semibold dark:bg-white/10">{r.role === 'owner' ? 'Pemilik grup' : 'Anggota keluarga'}</span>
      </div>
      <div className="flex justify-center gap-8 text-center text-xs font-semibold">
        <button onClick={() => nav('/peta', { state: { focus: r.id } })} disabled={!r.loc} className="space-y-1 disabled:opacity-40"><span className={circle}><MapPin /></span>Lokasi</button>
        <Link to={`/riwayat?u=${r.id}`} className="space-y-1"><span className={circle}><History /></span><span className="block">Riwayat</span></Link>
        <button disabled={!r.loc} className="space-y-1 disabled:opacity-40"
          onClick={() => r.loc && window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.loc.latitude},${r.loc.longitude}`, '_blank', 'noopener')}>
          <span className={circle}><Navigation /></span>Navigasi
        </button>
      </div>
      <section className="card space-y-2">
        <h2 className="font-bold">Informasi Lokasi</h2>
        {r.loc ? (
          <>
            <p className="text-sm">{STATUS_LABEL[r.status]} · diperbarui {ago(r.loc.recorded_at)}{r.loc.accuracy_m != null && ` · akurasi ±${Math.round(r.loc.accuracy_m)} m`}</p>
            <FamilyMap rows={[r]} meId={user!.id} height={180} />
          </>
        ) : (
          <p className="text-sm text-navy/60 dark:text-white/60">
            {r.sharing ? 'Menunggu pembaruan lokasi pertama.' : `${r.name} sedang tidak membagikan lokasi, jadi posisinya tidak ditampilkan.`}
          </p>
        )}
      </section>
    </div>
  )
}
