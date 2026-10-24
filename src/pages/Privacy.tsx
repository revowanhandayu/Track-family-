import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSharing } from '../hooks/useSharing'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useToast } from '../components/Toast'
import { listMembers, type Member } from '../lib/family'
import * as P from '../lib/privacy'
import type { Retention } from '../lib/privacy'
import Switch from '../components/Switch'
import PageHeader from '../components/PageHeader'
import ConfirmDialog from '../components/ConfirmDialog'

const RET: { v: Retention; l: string }[] = [{ v: '24h', l: '24 jam' }, { v: '7d', l: '7 hari' }, { v: '30d', l: '30 hari' }]

export default function Privacy() {
  const { user } = useAuth()
  const me = user!.id
  const toast = useToast()
  const { live, start, stop, geo } = useSharing()
  const { familyId } = useActiveFamily()
  const [enabled, setEnabled] = useState(false)
  const [ret, setRet] = useState<Retention>('24h')
  const [loaded, setLoaded] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [viewers, setViewers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [delOpen, setDelOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await P.getPrivacy(me)
      setEnabled(s.history_enabled); setRet(s.history_retention)
      setViewers(await P.listMyViewers(me))
    } finally { setLoaded(true) }
  }, [me])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (familyId) listMembers(familyId).then((ms) => setMembers(ms.filter((m) => m.status === 'active' && m.user_id !== me))).catch(() => {}) }, [familyId, me])

  async function save(nextEnabled: boolean, nextRet: Retention) {
    setBusy(true)
    try { await P.savePrivacy(nextEnabled, nextRet); setEnabled(nextEnabled); setRet(nextRet); toast('Pengaturan disimpan.', 'ok') }
    catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  async function toggleViewer(id: string, allow: boolean) {
    try { await P.setViewer(id, allow); setViewers((v) => (allow ? [...v, id] : v.filter((x) => x !== id))) }
    catch (e) { toast((e as Error).message, 'error') }
  }
  async function wipe() {
    setBusy(true)
    try { await P.deleteMyHistory(); toast('Semua riwayat lokasimu dihapus.', 'ok') } catch (e) { toast((e as Error).message, 'error') }
    setBusy(false); setDelOpen(false)
  }

  const sub = 'text-xs text-navy/60 dark:text-white/60'
  return (
    <div className="space-y-4">
      <PageHeader title="Pengaturan Privasi" />
      <section className="card flex items-center gap-3">
        <div className="flex-1">
          <p className="font-bold">Berbagi lokasi</p>
          <p className={sub}>Dibagikan terus 24 jam, hanya ke anggota aktif grupmu.</p>
        </div>
        <Switch label="Berbagi lokasi" checked={live} disabled={geo === 'starting'} onChange={(v) => (v ? start('24h') : stop())} />
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-bold">Simpan riwayat lokasi</p>
            <p className={sub}>Titik direkam hanya saat berbagi lokasi aktif. Tidak ada riwayat dari waktu sebelum kamu menyalakannya.</p>
          </div>
          <Switch label="Simpan riwayat" checked={enabled} disabled={!loaded || busy} onChange={(v) => save(v, ret)} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Hapus otomatis setelah</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Retensi riwayat">
            {RET.map((r) => (
              <button key={r.v} role="radio" aria-checked={ret === r.v} disabled={!loaded || busy} className={ret === r.v ? 'btn-primary' : 'btn-ghost'} onClick={() => save(enabled, r.v)}>{r.l}</button>
            ))}
          </div>
          <p className={`${sub} mt-2`}>Memperpendek masa simpan langsung menghapus titik yang lebih lama.</p>
        </div>
      </section>

      <section className="card">
        <p className="font-bold">Siapa boleh melihat riwayatku</p>
        <p className={`${sub} mb-1`}>Secara bawaan tidak ada. Anggota yang kamu izinkan hanya bisa melihat titik yang masih tersimpan.</p>
        {members.length === 0 ? <p className="py-2 text-sm">Belum ada anggota lain di grup.</p> : (
          <ul className="divide-y divide-navy/5 dark:divide-white/10">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 py-3">
                <span className="flex-1 truncate text-sm font-semibold">{m.profiles?.full_name ?? 'Anggota'}</span>
                <Switch label={`Izinkan ${m.profiles?.full_name}`} checked={viewers.includes(m.user_id)} onChange={(v) => toggleViewer(m.user_id, v)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2">
        <p className="font-bold">Data pribadi</p>
        <button className="btn-ghost w-full" onClick={() => P.downloadMyData(me).catch(() => toast('Gagal mengunduh data.', 'error'))}><Download size={16} /> Unduh data pribadi</button>
        <button className="btn-ghost w-full text-sos" onClick={() => setDelOpen(true)}><Trash2 size={16} /> Hapus semua riwayat lokasi</button>
        <p className={sub}>Untuk menghapus seluruh akun, buka <Link to="/profil" className="font-semibold underline">Profil</Link>.</p>
      </section>

      <ConfirmDialog open={delOpen} danger busy={busy} confirmLabel="Hapus riwayat" title="Hapus semua riwayat?" onCancel={() => setDelOpen(false)} onConfirm={wipe}>
        Semua titik lokasi yang tersimpan atas namamu dihapus permanen. Ini tidak bisa dibatalkan.
      </ConfirmDialog>
    </div>
  )
}
