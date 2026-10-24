import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AuthLayout, { Field, inputCls } from '../components/AuthLayout'

export default function Register() {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) return setError('Nama minimal 2 karakter.')
    if (pw.length < 8) return setError('Kata sandi minimal 8 karakter.')
    if (pw !== pw2) return setError('Konfirmasi kata sandi tidak sama.')
    setBusy(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password: pw,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${location.origin}/masuk` },
    })
    setBusy(false)
    if (error) setError(/registered/i.test(error.message) ? 'Email ini sudah terdaftar.' : 'Pendaftaran gagal. Coba lagi.')
    else setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Cek emailmu">
        <div className="flex gap-3 text-sm">
          <MailCheck className="shrink-0 text-live" aria-hidden />
          <p>Kami mengirim tautan verifikasi ke <b>{email}</b>. Buka tautan itu, lalu masuk.</p>
        </div>
        <Link to="/masuk" className="btn-primary w-full">Ke halaman masuk</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Buat akun" subtitle="Gratis. Kamu yang memutuskan kapan lokasimu dibagikan.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama lengkap"><input className={inputCls} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Kata sandi"><input className={inputCls} type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Ulangi kata sandi"><input className={inputCls} type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm font-medium text-sos">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Mendaftar…' : 'Daftar'}</button>
      </form>
      <p className="text-sm">Sudah punya akun? <Link to="/masuk" className="font-semibold underline">Masuk</Link></p>
    </AuthLayout>
  )
}
