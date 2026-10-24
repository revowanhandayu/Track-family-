import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Phone, RotateCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useToast } from '../components/Toast'
import { listMembers, type Member } from '../lib/family'
import * as A from '../lib/alerts'
import type { AlertStatus, Pos, SendResult } from '../lib/alerts'
import ConfirmDialog from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'

type Step = 'idle' | 'sending' | 'done' | 'failed'

export default function SosPage() {
  const { user } = useAuth()
  const toast = useToast()
  const { familyId } = useActiveFamily()
  const [members, setMembers] = useState<Member[]>([])
  const [step, setStep] = useState<Step>('idle')
  const [confirm, setConfirm] = useState<'sos' | 'safe' | null>(null)
  const [pick, setPick] = useState<string[]>([])
  const [res, setRes] = useState<SendResult | null>(null)
  const [status, setStatus] = useState<AlertStatus | null>(null)
  const [error, setError] = useState('')
  const [usedPos, setUsedPos] = useState<Pos | null>(null)
  const req = useRef<string>('')
  const posRef = useRef<Pos | null>(null)

  const others = members.filter((m) => m.status === 'active' && m.user_id !== user!.id)
  useEffect(() => { if (familyId) listMembers(familyId).then((ms) => { setMembers(ms); setPick(ms.filter((m) => m.status === 'active' && m.user_id !== user!.id).map((m) => m.user_id)) }).catch(() => {}) }, [familyId, user])

  // Setelah terkirim, pantau siapa yang sudah membuka notifikasi (data nyata dari server)
  useEffect(() => {
    if (step !== 'done' || !res) return
    let n = 0
    const load = () => A.alertStatus(res.alert_ids).then(setStatus).catch(() => {})
    load()
    const t = setInterval(() => { if (++n > 60) clearInterval(t); else load() }, 5000)
    return () => clearInterval(t)
  }, [step, res])

  async function sendSos(retry = false) {
    setConfirm(null); setStep('sending'); setError('')
    if (!retry) { req.current = crypto.randomUUID(); posRef.current = await A.getPosition() }
    setUsedPos(posRef.current)
    try { setRes(await A.sendSos(posRef.current, req.current)); setStep('done') }
    catch (e) { setError((e as Error).message); setStep('failed') }
  }

  async function sendSafe() {
    setConfirm(null)
    const pos = await A.getPosition(5000)
    try {
      const r = await A.sendSafe(pos, crypto.randomUUID(), pick)
      toast(r.recipients > 0 ? `Status aman terkirim ke ${r.recipients} anggota.` : 'Tersimpan, tapi belum ada anggota lain yang menerima.', r.recipients > 0 ? 'ok' : 'info')
    } catch (e) { toast(`Gagal mengirim status aman: ${(e as Error).message}`, 'error') }
  }

  async function endSos() {
    if (!res) return
    try { await A.resolveSos(res.alert_ids[0]); toast('SOS diakhiri. Anggota diberi tahu.', 'ok'); setStep('idle'); setRes(null); setStatus(null) }
    catch (e) { toast((e as Error).message, 'error') }
  }

  if (step === 'done' && res) {
    return (
      <div className="space-y-4">
        <PageHeader title="SOS" />
        <div className="card space-y-3">
          <div className="flex items-center gap-3"><CheckCircle2 className="text-live" /><p className="font-extrabold">SOS tersimpan dan dikirim</p></div>
          <p className="text-sm">
            {res.recipients > 0 ? `Dikirim ke ${res.recipients} anggota keluarga` : 'Belum ada anggota lain di grupmu, jadi belum ada yang menerima'} pukul{' '}
            {new Date(res.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.
          </p>
          <p className="text-sm text-navy/70 dark:text-white/70">
            {usedPos ? `Lokasi yang dikirim: ${usedPos.lat.toFixed(5)}, ${usedPos.lng.toFixed(5)} (±${Math.round(usedPos.acc)} m).` : 'Lokasi tidak ikut terkirim karena izin lokasi tidak diberikan atau GPS tidak merespons.'}
          </p>
          {status && status.total > 0 && (
            <div className="rounded-xl bg-mist p-3 text-sm dark:bg-navy">
              <p className="mb-1 font-semibold">{status.read} dari {status.total} sudah membuka</p>
              <ul className="space-y-0.5">{status.recipients.map((r, i) => <li key={i}>{r.read ? '✓' : '○'} {r.name}</li>)}</ul>
            </div>
          )}
          <p className="flex gap-2 rounded-xl bg-sun-soft p-3 text-xs dark:bg-sun/10"><TriangleAlert size={16} className="shrink-0" />
            Aplikasi ini hanya memberi tahu keluargamu. Layanan darurat (polisi, ambulans) TIDAK dihubungi otomatis. Jika perlu, telepon 112 sendiri.</p>
          <a href="tel:112" className="btn-danger w-full"><Phone size={16} /> Telepon 112</a>
          <button className="btn-ghost w-full" onClick={endSos}>Saya sudah aman, akhiri SOS</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="SOS" />
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-lg font-extrabold">Dalam keadaan darurat?</p>
        <p className="max-w-xs text-sm text-navy/60 dark:text-white/60">Tekan tombol SOS untuk mengirim notifikasi dan lokasimu ke anggota keluarga.</p>
        <button onClick={() => setConfirm('sos')} disabled={step === 'sending'} aria-label="Kirim SOS"
          className="mt-4 grid h-44 w-44 place-items-center rounded-full bg-sos text-4xl font-black text-white shadow-[0_0_0_14px_rgba(229,53,43,0.15),0_0_0_28px_rgba(229,53,43,0.08)] active:scale-95 disabled:opacity-60">
          {step === 'sending' ? '…' : 'SOS'}
        </button>
        {step === 'sending' && <p role="status" className="text-sm">Mengambil lokasi dan mengirim…</p>}
        {step === 'failed' && (
          <div role="alert" className="card w-full space-y-2 text-left ring-2 ring-sos/40">
            <p className="font-bold text-sos">SOS belum terkirim</p>
            <p className="text-sm">{error || 'Periksa koneksi internet.'}</p>
            <button className="btn-danger w-full" onClick={() => sendSos(true)}><RotateCw size={16} /> Coba lagi</button>
            <a href="tel:112" className="btn-ghost w-full"><Phone size={16} /> Telepon 112 sekarang</a>
          </div>
        )}
      </div>
      <button className="btn w-full border-2 border-navy/15 py-3.5 dark:border-white/20" onClick={() => setConfirm('safe')}><ShieldCheck size={18} /> Saya Aman</button>
      <p className="text-center text-xs text-navy/60 dark:text-white/60">Saya Aman memberi tahu anggota pilihanmu bahwa kamu baik-baik saja.</p>

      <ConfirmDialog open={confirm === 'sos'} danger confirmLabel="Kirim SOS" title="Kirim SOS sekarang?" onCancel={() => setConfirm(null)} onConfirm={() => sendSos()}>
        Notifikasi darurat dan lokasimu saat ini dikirim ke {others.length} anggota keluarga. Layanan darurat tidak dihubungi otomatis.
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'safe'} confirmLabel="Kirim" disabled={pick.length === 0} title="Kirim status aman" onCancel={() => setConfirm(null)} onConfirm={sendSafe}>
        <p className="mb-2">Pilih anggota yang diberi tahu:</p>
        {others.length === 0 ? <p>Belum ada anggota lain di grupmu.</p> : (
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.user_id}><label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pick.includes(m.user_id)} onChange={(e) => setPick((p) => (e.target.checked ? [...p, m.user_id] : p.filter((x) => x !== m.user_id)))} />
                {m.profiles?.full_name ?? 'Anggota'}
              </label></li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
      <Link to="/notifikasi" className="block text-center text-sm font-semibold underline">Lihat notifikasi</Link>
    </div>
  )
}
