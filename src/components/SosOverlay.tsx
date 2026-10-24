import { useNavigate } from 'react-router-dom'
import { Siren } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'

export default function SosOverlay() {
  const { incoming, dismissIncoming, read } = useNotifications()
  const nav = useNavigate()
  if (!incoming) return null
  const open = () => { read([incoming.id]); dismissIncoming(); nav(incoming.payload.alert_id ? `/sos/${incoming.payload.alert_id}` : '/notifikasi') }
  return (
    <div role="alert" aria-live="assertive" className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1300] mx-auto max-w-md rounded-2xl bg-sos p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <Siren className="mt-0.5 shrink-0 animate-pulse" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{incoming.title}</p>
          <p className="text-sm text-white/90">{incoming.body}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn flex-1 bg-white text-sos" onClick={open}>Lihat</button>
        <button className="btn flex-1 bg-white/20 text-white" onClick={() => { read([incoming.id]); dismissIncoming() }}>Tutup</button>
      </div>
    </div>
  )
}
