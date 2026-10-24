import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Crown, Hourglass, LogOut, Share2, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { inputCls } from '../components/AuthLayout'
import * as api from '../lib/family'
import type { Family, Member } from '../lib/family'

type Pending = { kind: 'remove' | 'leave' | 'transfer'; member?: Member } | null

export default function FamilyPage() {
  const { user } = useAuth()
  const toast = useToast()
  const me = user!.id
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [fid, setFid] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [myPending, setMyPending] = useState(0)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Pending>(null)
  const [ttl, setTtl] = useState(48)
  const [singleUse, setSingleUse] = useState(true)
  const [link, setLink] = useState('')

  const family = families?.find((f) => f.id === fid) ?? null
  const isOwner = family?.owner_id === me

  const loadFamilies = useCallback(async () => {
    try {
      const [fs, p] = await Promise.all([api.listFamilies(), api.countMyPending(me)])
      setFamilies(fs); setMyPending(p)
      setFid((cur) => (cur && fs.some((f) => f.id === cur) ? cur : fs[0]?.id ?? null))
    } catch (e) { toast((e as Error).message, 'error'); setFamilies([]) }
  }, [me, toast])

  const loadMembers = useCallback(async () => {
    if (!fid) return setMembers([])
    try { setMembers(await api.listMembers(fid)) } catch (e) { toast((e as Error).message, 'error') }
  }, [fid, toast])

  useEffect(() => { loadFamilies() }, [loadFamilies])
  useEffect(() => { setLink(''); loadMembers() }, [loadMembers])

  async function run(fn: () => Promise<unknown>, okMsg: string, after?: () => Promise<void>) {
    setBusy(true)
    try { await fn(); toast(okMsg, 'ok'); await (after ?? loadMembers)() }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false); setConfirm(null) }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    await run(async () => { const id = await api.createFamily(name); setName(''); setFid(id) }, 'Grup dibuat.', loadFamilies)
  }

  async function onJoinWithCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api.acceptInvitation(code.trim().replace(/^.*\/gabung\//, ''))
      if (r.ok) { toast(r.status === 'pending' ? 'Permintaan terkirim. Menunggu persetujuan pemilik.' : 'Kamu sudah bergabung.', 'ok'); setCode(''); await loadFamilies() }
      else toast(api.acceptErrorText(r), 'error')
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  async function onInvite() {
    if (!fid) return
    setBusy(true)
    try { setLink(api.inviteLink(await api.createInvitation(fid, ttl, singleUse))) }
    catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  const copy = async () => { await navigator.clipboard.writeText(link); toast('Tautan disalin.', 'ok') }
  const share = () => navigator.share?.({ title: 'Undangan Family Tracker', text: `Gabung ke ${family?.name} di Family Tracker`, url: link })

  if (!families) return <div className="space-y-3"><div className="skeleton h-8 w-40" /><div className="skeleton h-40" /></div>

  const joinForm = (
    <form onSubmit={onJoinWithCode} className="card space-y-2">
      <h2 className="font-bold">Punya tautan undangan?</h2>
      <input className={inputCls} placeholder="Tempel tautan atau kode di sini" value={code} onChange={(e) => setCode(e.target.value)} required />
      <button className="btn-ghost w-full" disabled={busy}>Gabung</button>
    </form>
  )

  const pendingCard = myPending > 0 && (
    <div className="card flex items-center gap-3 bg-sun-soft dark:bg-sun/10">
      <Hourglass className="shrink-0" aria-hidden />
      <p className="text-sm">{myPending} permintaan bergabung menunggu persetujuan pemilik grup.</p>
    </div>
  )

  if (!family) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">Keluarga</h1>
        {pendingCard}
        <EmptyState icon={Users} title="Belum ada grup keluarga" hint="Buat grup baru untuk mengundang keluargamu, atau gabung dengan tautan undangan." />
        <form onSubmit={onCreate} className="card space-y-2">
          <h2 className="font-bold">Buat grup baru</h2>
          <input className={inputCls} placeholder="Mis. Keluarga Santoso" minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn-primary w-full" disabled={busy}>Buat grup</button>
        </form>
        {joinForm}
      </div>
    )
  }

  const active = members.filter((m) => m.status === 'active')
  const waiting = members.filter((m) => m.status === 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{family.name}</h1>
          <p className="text-sm text-navy/60 dark:text-white/60">{active.length} anggota{isOwner ? ' · kamu pemilik grup' : ''}</p>
        </div>
        {families.length > 1 && (
          <select className={`${inputCls} w-auto`} value={fid ?? ''} onChange={(e) => setFid(e.target.value)} aria-label="Pilih grup">
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
      {pendingCard}

      {isOwner && waiting.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-bold">Menunggu persetujuan</h2>
          {waiting.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <Avatar name={m.profiles?.full_name ?? '?'} url={m.profiles?.avatar_url} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.profiles?.full_name ?? 'Pengguna'}</p>
              <button className="btn-primary px-3" disabled={busy} aria-label={`Setujui ${m.profiles?.full_name}`} onClick={() => run(() => api.decideMember(m.id, true), 'Anggota disetujui.')}><Check size={16} /></button>
              <button className="btn-ghost px-3" disabled={busy} aria-label={`Tolak ${m.profiles?.full_name}`} onClick={() => run(() => api.decideMember(m.id, false), 'Permintaan ditolak.')}><X size={16} /></button>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-bold">Anggota</h2>
        {active.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <Avatar name={m.profiles?.full_name ?? '?'} url={m.profiles?.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{m.profiles?.full_name ?? 'Pengguna'}{m.user_id === me && ' (kamu)'}</p>
              {m.role === 'owner' && <p className="flex items-center gap-1 text-xs text-navy/60 dark:text-white/60"><Crown size={12} aria-hidden /> Pemilik</p>}
            </div>
            {isOwner && m.user_id !== me && (
              <>
                <button className="btn-ghost px-3 text-xs" disabled={busy} onClick={() => setConfirm({ kind: 'transfer', member: m })}>Jadikan pemilik</button>
                <button className="btn-ghost px-3" disabled={busy} aria-label={`Keluarkan ${m.profiles?.full_name}`} onClick={() => setConfirm({ kind: 'remove', member: m })}><UserMinus size={16} /></button>
              </>
            )}
          </div>
        ))}
      </section>

      {isOwner && (
        <section className="card space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><UserPlus size={18} aria-hidden /> Undang anggota</h2>
          <div className="flex gap-2">
            <select className={inputCls} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} aria-label="Masa berlaku">
              <option value={1}>Berlaku 1 jam</option>
              <option value={24}>Berlaku 24 jam</option>
              <option value={48}>Berlaku 2 hari</option>
              <option value={168}>Berlaku 7 hari</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} /> Hanya bisa dipakai sekali
          </label>
          <button className="btn-primary w-full" disabled={busy} onClick={onInvite}>Buat tautan undangan</button>
          {link && (
            <div className="space-y-2 rounded-xl bg-mist p-3 dark:bg-navy">
              <p className="break-all text-xs">{link}</p>
              <p className="text-xs text-navy/60 dark:text-white/60">Tautan ini hanya ditampilkan sekarang. Bagikan lewat saluran yang kamu percaya.</p>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={copy}><Copy size={16} /> Salin</button>
                {'share' in navigator && <button className="btn-ghost flex-1" onClick={share}><Share2 size={16} /> Bagikan</button>}
              </div>
            </div>
          )}
        </section>
      )}

      {!isOwner && (
        <button className="btn-ghost w-full text-sos" onClick={() => setConfirm({ kind: 'leave' })}><LogOut size={16} /> Keluar dari grup</button>
      )}
      {joinForm}

      <ConfirmDialog
        open={confirm?.kind === 'remove'} busy={busy} danger confirmLabel="Keluarkan" title="Keluarkan anggota?"
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => api.removeMember(confirm!.member!.id), 'Anggota dikeluarkan.')}
      >
        {confirm?.member?.profiles?.full_name} tidak akan lagi melihat atau membagikan lokasi di grup ini. Berbagi lokasinya di grup ini ikut dihentikan.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'leave'} busy={busy} danger confirmLabel="Keluar" title={`Keluar dari ${family.name}?`}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => api.leaveFamily(family.id), 'Kamu keluar dari grup.', loadFamilies)}
      >
        Berbagi lokasimu di grup ini dihentikan. Untuk bergabung lagi, kamu perlu undangan baru.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'transfer'} busy={busy} confirmLabel="Transfer" title="Transfer kepemilikan?"
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => api.transferOwnership(family.id, confirm!.member!.user_id), 'Kepemilikan dipindahkan.', loadFamilies)}
      >
        {confirm?.member?.profiles?.full_name} menjadi pemilik grup dan kamu menjadi anggota biasa. Kamu tidak bisa membatalkannya sendiri.
      </ConfirmDialog>
    </div>
  )
}
