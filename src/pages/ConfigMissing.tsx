import { KeyRound } from 'lucide-react'
import EmptyState from '../components/EmptyState'

export default function ConfigMissing() {
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        icon={KeyRound}
        title="Konfigurasi Supabase belum lengkap"
        hint="Salin .env.example menjadi .env.local, isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY, lalu jalankan ulang npm run dev."
      />
    </div>
  )
}
