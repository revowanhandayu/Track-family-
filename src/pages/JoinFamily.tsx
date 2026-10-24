import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UsersRound } from 'lucide-react'
import { acceptErrorText, acceptInvitation } from '../lib/family'
import { useToast } from '../components/Toast'

export default function JoinFamily() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function join() {
    setBusy(true); setError('')
    try {
      const r = await acceptInvitation(token)
      if (r.ok) {
        toast(r.status === 'pending' ? 'Permintaan terkirim. Menunggu persetujuan pemilik.' : 'Kamu sudah bergabung.', 'ok')
        nav('/keluarga', { replace: true })
      } else setError(acceptErrorText(r))
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="card mt-8 space-y-4 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun-soft dark:bg-sun/20"><UsersRound aria-hidden /></div>
      <h1 className="text-xl font-extrabold">Kamu diundang ke sebuah grup keluarga</h1>
      <p className="text-sm text-navy/60 dark:text-white/60">
        Bergabung tidak otomatis membagikan lokasimu. Kamu yang memutuskan kapan mulai berbagi, dan bisa berhenti kapan saja.
      </p>
      {error && <p role="alert" className="text-sm font-medium text-sos">{error}</p>}
      <button className="btn-primary w-full" onClick={join} disabled={busy}>{busy ? 'Memproses…' : 'Gabung ke grup'}</button>
      <button className="btn-ghost w-full" onClick={() => nav('/keluarga')}>Nanti saja</button>
    </div>
  )
}
