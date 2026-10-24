import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anon)

// Jika env belum diisi, klien tetap dibuat dengan placeholder agar app bisa
// menampilkan layar "konfigurasi belum lengkap" alih-alih crash.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anon ?? 'placeholder',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
