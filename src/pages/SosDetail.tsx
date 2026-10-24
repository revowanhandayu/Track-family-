import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Phone, Navigation } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import { getAlert, resolveSos, type AlertRow } from '../lib/alerts'
import { listFamilies } from '../lib/family'
import { ago } from '../lib/location'
import FamilyMap from '../components/FamilyMap'
import PageHeader from '../components/PageHeader'
import type { MemberLoc } from '../hooks/useFamilyLocations'

export default function SosDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [a, setA] = useState<AlertRow | null | undefined>(undefined)
  const [name, setName] = useState('Anggota')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    getAlert(id!).then(async (x) => {
      setA(x)
      if (!x) return
      const [{ data }, fams] = await Promise.all([supabase.from('profiles').select('full_name').eq('id', x.user_id).maybeSingle(), listFamilies()])
      setName(data?.full_name ?? 'Anggota'); setIsOwner(fams.some((f) => f.id === x.family_id && f.owner_id === user!.id))
    })
  }, [id, user])

  if (a === undefined) return <div className="skeleton h-64" />
  if (!a) return <><PageHeader title="Peringatan" /><p className="text-sm">Peringatan tidak ditemukan atau kamu tidak punya akses.</p></>

  const isSos = a.type === 'sos'
  const hasLoc = a.latitude != null && a.longitude != null
  const row: MemberLoc | null = hasLoc ? {
    id: a.user_id, name, avatar: null, role: 'member', sharing: true, status: 'live',
    loc: { user_id: a.user_id, latitude: a.latitude!, longitude: a.longitude!, accuracy_m: a.accuracy_m, recorded_at: a.created_at },
  } : null

  async function end() {
    try { await resolveSos(a!.id); setA({ ...a!, status: 'resolved' }); toast('SOS diakhiri.', 'ok') } catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={isSos ? 'Peringatan SOS' : 'Status Aman'} />
      <div className={`card space-y-1 ${isSos && a.status === 'active' ? 'ring-2 ring-sos/50' : ''}`}>
        <p className="text-lg font-extrabold">{name}{isSos ? (a.status === 'active' ? ' butuh bantuan' : ' (SOS selesai)') : ' dalam keadaan aman'}</p>
        <p className="text-sm text-navy/60 dark:text-white/60">{ago(a.created_at)} · {new Date(a.created_at).toLocaleString('id-ID')}</p>
        {a.message && <p className="text-sm">{a.message}</p>}
      </div>
      {row ? (
        <>
          <FamilyMap rows={[row]} meId={user!.id} height={240} />
          <p className="text-xs text-navy/60 dark:text-white/60">Titik ini adalah lokasi saat tombol ditekan, bukan lokasi terkini.{a.accuracy_m != null && ` Akurasi ±${Math.round(a.accuracy_m)} m.`}</p>
        </>
      ) : <p className="card text-sm">Lokasi tidak ikut terkirim pada peringatan ini.</p>}
      <div className="flex gap-2">
        {hasLoc && <button className="btn-primary flex-1" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}`, '_blank', 'noopener')}><Navigation size={16} /> Navigasi</button>}
        {isSos && <a href="tel:112" className="btn-danger flex-1"><Phone size={16} /> 112</a>}
      </div>
      {isSos && a.status === 'active' && (a.user_id === user!.id || isOwner) && <button className="btn-ghost w-full" onClick={end}>Tandai sudah aman</button>}
    </div>
  )
}
