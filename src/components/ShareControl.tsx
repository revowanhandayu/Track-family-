import { useState } from 'react'
import { MapPinOff, Radio, TriangleAlert } from 'lucide-react'
import { useSharing } from '../hooks/useSharing'
import { DURATION_LABEL, type Duration } from '../lib/location'

const DURATIONS: Duration[] = ['15m', '1h', '8h', 'manual']

export default function ShareControl() {
  const { share, live, geo, fix, message, needsResume, start, stop, resume } = useSharing()
  const [d, setD] = useState<Duration>('1h')
  const busy = geo === 'starting' && !live

  if (live) {
    return (
      <div className="card space-y-3 ring-2 ring-live/40">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-live" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Lokasimu sedang dibagikan</p>
            <p className="text-sm text-navy/60 dark:text-white/60">
              {share?.expires_at
                ? `Berakhir pukul ${new Date(share.expires_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                : 'Sampai kamu menghentikannya'}
              {fix && ` · akurasi ±${Math.round(fix.acc)} m`}
            </p>
          </div>
        </div>
        {needsResume && (
          <div className="rounded-xl bg-sun-soft p-3 text-sm dark:bg-sun/10">
            <p className="mb-2">Berbagi masih aktif, tapi perangkat ini belum mengirim lokasi. Ketuk untuk melanjutkan.</p>
            <button className="btn-primary w-full" onClick={resume}>Lanjutkan kirim lokasi</button>
          </div>
        )}
        {fix && fix.acc > 100 && <p className="flex gap-2 text-xs text-amber-600"><TriangleAlert size={14} className="shrink-0" /> Akurasi rendah. Keluar ke tempat terbuka agar GPS lebih tepat.</p>}
        {message && <p role="status" className="text-xs text-amber-600">{message}</p>}
        <p className="text-xs text-navy/60 dark:text-white/60">Lokasi hanya dikirim saat aplikasi terbuka. Jika layar mati atau browser ditutup, pembaruan bisa berhenti.</p>
        <button className="btn-danger w-full" onClick={stop}><MapPinOff size={16} /> Hentikan Berbagi Lokasi</button>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div>
        <p className="font-bold">Bagikan lokasimu</p>
        <p className="text-sm text-navy/60 dark:text-white/60">Anggota aktif di grup keluargamu bisa melihat posisimu selama berbagi aktif. Kamu bisa berhenti kapan saja.</p>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Durasi berbagi">
        {DURATIONS.map((x) => (
          <button key={x} role="radio" aria-checked={d === x} className={d === x ? 'btn-primary' : 'btn-ghost'} onClick={() => setD(x)}>{DURATION_LABEL[x]}</button>
        ))}
      </div>
      {message && <p role="alert" className="text-sm font-medium text-sos">{message}</p>}
      <button className="btn-primary w-full" disabled={busy} onClick={() => start(d)}>
        <Radio size={16} /> {busy ? 'Meminta izin lokasi…' : 'Aktifkan Berbagi Lokasi'}
      </button>
      <p className="text-xs text-navy/60 dark:text-white/60">Browser akan meminta izin lokasi. Pilih <b>Izinkan</b> agar GPS bisa dibaca.</p>
    </div>
  )
}
