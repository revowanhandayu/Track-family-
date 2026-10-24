import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import AuthLayout, { Field, inputCls } from '../components/AuthLayout'

function errText(m: string) {
  if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.'
  if (/not confirmed/i.test(m)) return 'Email belum diverifikasi. Cek kotak masukmu.'
  return 'Gagal masuk. Periksa koneksi lalu coba lagi.'
}

export default function Login() {
  const { session } = useAuth()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errText(error.message))
    else nav(from, { replace: true })
  }

  return (
    <AuthLayout title="Masuk" subtitle="Lihat kabar keluargamu.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Kata sandi"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm font-medium text-sos">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
      </form>
      <div className="flex justify-between text-sm">
        <Link to="/lupa-sandi" className="font-semibold underline">Lupa kata sandi?</Link>
        <Link to="/daftar" state={{ from: { pathname: from } }} className="font-semibold underline">Buat akun</Link>
      </div>
    </AuthLayout>
  )
}
