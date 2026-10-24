import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, LogOut, ShieldCheck, Trash2, UserRound, Palette } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import ConfirmDialog from '../components/ConfirmDialog'
import { Field, inputCls } from '../components/AuthLayout'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { removeAvatar, uploadAvatar } from '../lib/avatar'

function MenuRow({ icon, label, to, onClick }: { icon: ReactNode; label: string; to?: string; onClick?: () => void }) {
  const cls = 'flex w-full items-center gap-3 py-3.5 text-left text-sm font-semibold'
  const inner = <>{icon}<span className="flex-1">{label}</span><ChevronRight size={18} className="text-navy/40 dark:text-white/40" /></>
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button className={cls} onClick={onClick}>{inner}</button>
}

export default function Profile() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [open, setOpen] = useState<'' | 'akun' | 'tema'>('')
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('full_name,avatar_url').eq('id', user!.id).single()
      .then(({ data }) => { setName(data?.full_name ?? ''); setAvatar(data?.avatar_url ?? null); setLoaded(true) })
  }, [user])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return toast('Nama minimal 2 karakter.', 'error')
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user!.id)
    setBusy(false)
    toast(error ? 'Gagal menyimpan nama.' : 'Profil disimpan.', error ? 'error' : 'ok')
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setPhotoBusy(true)
    try { setAvatar(await uploadAvatar(user!.id, f, avatar)); toast('Foto profil diperbarui.', 'ok') }
    catch (err) { toast((err as Error).message, 'error') }
    setPhotoBusy(false)
  }

  async function onRemovePhoto() {
    setPhotoBusy(true)
    try { await removeAvatar(user!.id, avatar); setAvatar(null); toast('Foto profil dihapus.', 'ok') }
    catch (err) { toast((err as Error).message, 'error') }
    setPhotoBusy(false)
  }

  async function deleteAccount() {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'HAPUS' } })
    if (error || data?.error) {
      let msg = data?.error as string | undefined
      if (!msg && error && 'context' in error) {
        try { msg = (await (error as { context: Response }).context.json()).error } catch { /* abaikan */ }
      }
      toast(msg ?? 'Gagal menghapus akun.', 'error')
      setBusy(false); setDelOpen(false)
      return
    }
    await signOut()
    nav('/masuk', { replace: true })
  }

  const ic = 'text-navy/70 dark:text-white/70'
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Profil</h1>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar name={name || user?.email || '?'} url={avatar} size={96} />
          <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Ganti foto profil"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-navy text-white shadow ring-2 ring-white disabled:opacity-60 dark:bg-sun dark:text-navy dark:ring-navy">
            <Camera size={16} />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} />
        </div>
        {photoBusy && <p className="mt-2 text-xs text-navy/60 dark:text-white/60">Memproses foto…</p>}
        {avatar && !photoBusy && <button className="mt-2 text-xs font-semibold text-sos underline" onClick={onRemovePhoto}>Hapus foto</button>}
        <p className="mt-3 text-lg font-extrabold">{name || '…'}</p>
        <p className="text-sm text-navy/60 dark:text-white/60">{user?.email}</p>
      </div>

      <div className="card divide-y divide-navy/5 !py-1 dark:divide-white/10">
        <MenuRow icon={<UserRound size={20} className={ic} />} label="Informasi Akun" onClick={() => setOpen(open === 'akun' ? '' : 'akun')} />
        {open === 'akun' && (
          <form onSubmit={save} className="space-y-3 py-3">
            <Field label="Nama lengkap">
              {loaded ? <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /> : <div className="skeleton h-11" />}
            </Field>
            <button className="btn-primary w-full" disabled={busy || !loaded}>Simpan</button>
          </form>
        )}
        <MenuRow icon={<ShieldCheck size={20} className={ic} />} label="Pengaturan Privasi" to="/privasi" />
        <MenuRow icon={<Palette size={20} className={ic} />} label="Tampilan" onClick={() => setOpen(open === 'tema' ? '' : 'tema')} />
        {open === 'tema' && (
          <div className="grid grid-cols-3 gap-2 py-3" role="radiogroup" aria-label="Tema">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'btn-primary' : 'btn-ghost'}
                onClick={() => { setTheme(t); applyTheme(t) }}>
                {t === 'light' ? 'Terang' : t === 'dark' ? 'Gelap' : 'Sistem'}
              </button>
            ))}
          </div>
        )}
        <MenuRow icon={<Trash2 size={20} className="text-sos" />} label="Hapus akun" onClick={() => setDelOpen(true)} />
      </div>

      <button className="btn w-full border border-sos py-3 text-sos" onClick={async () => { await signOut(); nav('/masuk') }}><LogOut size={16} /> Logout</button>

      <ConfirmDialog open={delOpen} danger busy={busy} disabled={delText !== 'HAPUS'} confirmLabel="Hapus akun permanen"
        title="Hapus akunmu?" onCancel={() => { setDelOpen(false); setDelText('') }} onConfirm={deleteAccount}>
        <p className="mb-2">Profil, riwayat, dan perangkatmu dihapus permanen. Jika kamu pemilik grup berisi anggota lain, transfer kepemilikan dulu.</p>
        <label className="block text-xs font-semibold">Ketik HAPUS untuk melanjutkan</label>
        <input className={`${inputCls} mt-1`} value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" />
      </ConfirmDialog>
    </div>
  )
}
