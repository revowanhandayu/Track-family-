import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import ConfirmDialog from '../components/ConfirmDialog'
import { Field, inputCls } from '../components/AuthLayout'
import { applyTheme, getTheme, type Theme } from '../lib/theme'

export default function Profile() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('full_name').eq('id', user!.id).single()
      .then(({ data }) => { setName(data?.full_name ?? ''); setLoaded(true) })
  }, [user])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return toast('Nama minimal 2 karakter.', 'error')
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user!.id)
    setBusy(false)
    toast(error ? 'Gagal menyimpan nama.' : 'Profil disimpan.', error ? 'error' : 'ok')
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Profil</h1>
      <form onSubmit={save} className="card space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={name || user?.email || '?'} size={56} />
          <p className="min-w-0 truncate text-sm text-navy/60 dark:text-white/60">{user?.email}</p>
        </div>
        <Field label="Nama lengkap">
          {loaded ? <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /> : <div className="skeleton h-10" />}
        </Field>
        <button className="btn-primary w-full" disabled={busy || !loaded}>Simpan</button>
      </form>

      <div className="card space-y-2">
        <h2 className="font-bold">Tampilan</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t}
              className={theme === t ? 'btn-primary' : 'btn-ghost'}
              onClick={() => { setTheme(t); applyTheme(t) }}>
              {t === 'light' ? 'Terang' : t === 'dark' ? 'Gelap' : 'Ikuti sistem'}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-ghost w-full" onClick={async () => { await signOut(); nav('/masuk') }}><LogOut size={16} /> Keluar</button>
      <button className="btn-ghost w-full text-sos" onClick={() => setDelOpen(true)}><Trash2 size={16} /> Hapus akun</button>

      <ConfirmDialog open={delOpen} danger busy={busy} disabled={delText !== 'HAPUS'} confirmLabel="Hapus akun permanen"
        title="Hapus akunmu?" onCancel={() => { setDelOpen(false); setDelText('') }} onConfirm={deleteAccount}>
        <p className="mb-2">Profil, riwayat, dan perangkatmu dihapus permanen. Jika kamu pemilik grup berisi anggota lain, transfer kepemilikan dulu.</p>
        <label className="block text-xs font-semibold">Ketik HAPUS untuk melanjutkan</label>
        <input className={`${inputCls} mt-1`} value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" />
      </ConfirmDialog>
    </div>
  )
}
