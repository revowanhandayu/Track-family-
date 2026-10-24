import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AuthLayout, { Field, inputCls } from '../components/AuthLayout'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/atur-ulang` })
    setBusy(false)
    setDone(true) // pesan sama apa pun hasilnya, agar email terdaftar tidak bisa ditebak
  }

  return (
    <AuthLayout title="Lupa kata sandi" subtitle="Masukkan email akunmu.">
      {done ? (
        <p className="text-sm">Jika email itu terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim tautan'}</button>
        </form>
      )}
      <Link to="/masuk" className="text-sm font-semibold underline">Kembali ke masuk</Link>
    </AuthLayout>
  )
}
