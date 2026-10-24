import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { History as HistoryIcon, ShieldCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { listMembers, type Member } from '../lib/family'
import { getPrivacy, listGrantedOwners, listHistory, meters, splitSegments, type HistoryPoint } from '../lib/privacy'
import HistoryMap from '../components/HistoryMap'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { inputCls } from '../components/AuthLayout'

const today = () => new Date().toLocaleDateString('sv-SE')
const dayShift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE') }
const hm = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export default function HistoryPage() {
  const { user } = useAuth()
  const me = user!.id
  const [sp, setSp] = useSearchParams()
  const owner = sp.get('u') ?? me
  const { familyId } = useActiveFamily()
  const [members, setMembers] = useState<Member[]>([])
  const [granted, setGranted] = useState<string[]>([])
  const [myEnabled, setMyEnabled] = useState(true)
  const [date, setDate] = useState(today())
  const [from, setFrom] = useState('00:00')
  const [to, setTo] = useState('23:59')
  const [pts, setPts] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    listGrantedOwners(me).then(setGranted)
    getPrivacy(me).then((p) => setMyEnabled(p.history_enabled)).catch(() => {})
  }, [me])
  useEffect(() => { if (familyId) listMembers(familyId).then(setMembers).catch(() => {}) }, [familyId])

  useEffect(() => {
    setLoading(true); setErr('')
    const a = new Date(`${date}T${from}:00`).toISOString(), b = new Date(`${date}T${to}:59`).toISOString()
    listHistory(owner, a, b).then(setPts).catch((e) => setErr((e as Error).message)).finally(() => setLoading(false))
  }, [owner, date, from, to])

  const segments = useMemo(() => splitSegments(pts), [pts])
  const stats = useMemo(() => {
    let d = 0
    for (const s of segments) for (let i = 1; i < s.length; i++) d += meters(s[i - 1], s[i])
    const mins = pts.length > 1 ? Math.round((new Date(pts[pts.length - 1].recorded_at).getTime() - new Date(pts[0].recorded_at).getTime()) / 60000) : 0
    return { km: (d / 1000).toFixed(1), dur: mins >= 60 ? `${Math.floor(mins / 60)}j ${mins % 60}m` : `${mins}m` }
  }, [segments, pts])

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.profiles?.full_name ?? 'Anggota'
  const owners = [me, ...granted.filter((g) => g !== me)]
  const chip = (active: boolean) => (active ? 'btn-primary px-4 py-1.5' : 'btn-ghost px-4 py-1.5')

  return (
    <div className="space-y-4">
      <PageHeader title="Riwayat Lokasi" back={false} />
      {owners.length > 1 && (
        <select className={inputCls} value={owner} onChange={(e) => setSp(e.target.value === me ? {} : { u: e.target.value })} aria-label="Pilih orang">
          {owners.map((id) => <option key={id} value={id}>{id === me ? 'Riwayatku' : `Riwayat ${nameOf(id)}`}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <button className={chip(date === today())} onClick={() => setDate(today())}>Hari ini</button>
        <button className={chip(date === dayShift(-1))} onClick={() => setDate(dayShift(-1))}>Kemarin</button>
        <input type="date" className={`${inputCls} flex-1 !py-1.5`} value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Tanggal" />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span>Jam</span>
        <input type="time" className={`${inputCls} !py-1.5`} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dari jam" />
        <span>sampai</span>
        <input type="time" className={`${inputCls} !py-1.5`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sampai jam" />
      </div>

      {owner === me && !myEnabled && (
        <div className="card flex gap-3 bg-sun-soft dark:bg-sun/10">
          <ShieldCheck className="shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="mb-2">Penyimpanan riwayat belum aktif. Titik lokasi tidak direkam sampai kamu menyalakannya.</p>
            <Link to="/privasi" className="btn-primary">Atur di Privasi</Link>
          </div>
        </div>
      )}

      {loading ? <div className="skeleton h-72" /> : err ? <p role="alert" className="text-sm font-medium text-sos">{err}</p> : pts.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Tidak ada titik pada rentang ini" hint="Riwayat hanya terekam saat berbagi lokasi aktif dan penyimpanan riwayat dinyalakan. Rute tidak ditebak dari data yang tidak ada." />
      ) : (
        <>
          <HistoryMap segments={segments} height={280} />
          <div className="flex gap-3 text-center">
            {[[stats.km + ' km', 'Jarak'], [stats.dur, 'Durasi'], [String(pts.length), 'Titik']].map(([v, l]) => (
              <div key={l} className="card flex-1 !p-3"><p className="text-lg font-extrabold">{v}</p><p className="text-xs text-navy/60 dark:text-white/60">{l}</p></div>
            ))}
          </div>
          {segments.length > 1 && <p className="text-xs text-navy/60 dark:text-white/60">Garis terputus di tempat ada jeda lebih dari 15 menit tanpa data.</p>}
          <section className="card">
            <h2 className="mb-2 font-bold">Titik lokasi</h2>
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {pts.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="font-semibold">{hm(p.recorded_at)}</span>
                  <span className="text-navy/60 dark:text-white/60">{p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}{p.accuracy_m != null && ` · ±${Math.round(p.accuracy_m)} m`}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
