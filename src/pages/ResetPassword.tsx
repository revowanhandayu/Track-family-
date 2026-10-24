import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import AuthLayout, { Field, inputCls } from '../components/AuthLayout'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setError('Kata sandi minimal 8 karakter.')
    if (pw !== pw2) return setError('Konfirmasi kata sandi tidak sama.')
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError('Gagal menyimpan. Minta tautan baru lalu coba lagi.')
    toast('Kata sandi diperbarui.', 'ok')
    nav('/', { replace: true })
  }

  if (!loading && !session) {
    return (
      <AuthLayout title="Tautan tidak berlaku">
        <p className="text-sm">Tautan sudah kedaluwarsa atau sudah dipakai.</p>
        <Link to="/lupa-sandi" className="btn-primary w-full">Minta tautan baru</Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Atur kata sandi baru">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Kata sandi baru"><input className={inputCls} type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Ulangi kata sandi"><input className={inputCls} type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm font-medium text-sos">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </form>
    </AuthLayout>
  )
}
