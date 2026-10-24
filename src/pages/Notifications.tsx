import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, CircleCheck, MapPin, Radio, ShieldCheck, Siren, Users } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import Switch from '../components/Switch'
import * as Push from '../lib/push'
import { ago } from '../lib/location'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import type { Notif } from '../lib/alerts'

function icon(t: string) {
  if (t === 'sos') return { I: Siren, c: 'bg-sos/15 text-sos' }
  if (t === 'safe') return { I: ShieldCheck, c: 'bg-live/15 text-live' }
  if (t === 'sos_resolved') return { I: CircleCheck, c: 'bg-live/15 text-live' }
  if (t.startsWith('sharing')) return { I: Radio, c: 'bg-sky-500/15 text-sky-600' }
  if (t.startsWith('place')) return { I: MapPin, c: 'bg-blue-500/15 text-blue-600' }
  if (t.startsWith('member') || t.startsWith('join') || t === 'family_invite') return { I: Users, c: 'bg-sun/30 text-navy dark:text-sun' }
  return { I: Bell, c: 'bg-navy/10 text-navy dark:bg-white/10 dark:text-white' }
}

function PushSettings() {
  const { user } = useAuth()
  const toast = useToast()
  const [state, setState] = useState<Push.PushState>('off')
  const [sos, setSos] = useState(true)
  const [members, setMembers] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { Push.pushState().then(setState); Push.getNotifySettings(user!.id).then((s) => { setSos(s.sos); setMembers(s.members) }) }, [user])

  async function toggle(on: boolean) {
    setBusy(true)
    try { if (on) await Push.enablePush(); else await Push.disablePush(); setState(await Push.pushState()) }
    catch (e) { toast((e as Error).message, 'error'); setState(await Push.pushState()) }
    setBusy(false)
  }
  async function save(s: boolean, m: boolean) {
    setSos(s); setMembers(m)
    try { await Push.saveNotify(s, m) } catch (e) { toast((e as Error).message, 'error') }
  }
  const sub = 'text-xs text-navy/60 dark:text-white/60'
  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="font-bold">Notifikasi di perangkat ini</p>
          <p className={sub}>
            {state === 'unsupported' ? 'Browser ini belum mendukung notifikasi push. Di iPhone, pasang aplikasi ke Layar Utama dulu.'
              : state === 'denied' ? 'Izin notifikasi diblokir. Ubah di pengaturan situs browser.'
              : !Push.pushConfigured() ? 'Server push belum dikonfigurasi oleh pengelola aplikasi.'
              : 'Terima SOS dan kabar keluarga walau aplikasi sedang ditutup.'}
          </p>
        </div>
        <Switch label="Notifikasi push" checked={state === 'on'} disabled={busy || state === 'unsupported' || state === 'denied' || !Push.pushConfigured()} onChange={toggle} />
      </div>
      <div className="flex items-center gap-3"><span className="flex-1 text-sm">SOS dan status aman</span><Switch label="Notifikasi SOS" checked={sos} onChange={(v) => save(v, members)} /></div>
      <div className="flex items-center gap-3"><span className="flex-1 text-sm">Aktivitas keluarga, tempat, dan chat</span><Switch label="Notifikasi aktivitas" checked={members} onChange={(v) => save(sos, v)} /></div>
      <p className={sub}>Pengaturan ini mengatur push. Pemberitahuan di dalam aplikasi tetap muncul.</p>
    </section>
  )
}

export default function NotificationsPage() {
  const { items, unread, read, readAll } = useNotifications()
  const nav = useNavigate()
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const list = tab === 'all' ? items : items.filter((i) => !i.read_at)

  function open(n: Notif) {
    read([n.id])
    if (n.payload.alert_id) nav(`/sos/${n.payload.alert_id}`)
    else if (n.type.startsWith('sharing') || n.type.startsWith('place')) nav('/peta')
    else if (n.type.startsWith('member') || n.type.startsWith('join')) nav('/keluarga')
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Notifikasi" />
      <PushSettings />
      <div className="flex items-center gap-2">
        {(['all', 'unread'] as const).map((t) => (
          <button key={t} className={tab === t ? 'btn-primary px-4 py-1.5' : 'btn-ghost px-4 py-1.5'} onClick={() => setTab(t)}>{t === 'all' ? 'Semua' : `Belum dibaca${unread ? ` (${unread})` : ''}`}</button>
        ))}
        {unread > 0 && <button className="ml-auto text-sm font-semibold underline" onClick={readAll}><CheckCheck size={14} className="mr-1 inline" />Tandai dibaca</button>}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Bell} title={tab === 'all' ? 'Belum ada notifikasi' : 'Semua sudah dibaca'} hint="SOS, status aman, dan kabar dari anggota keluarga akan muncul di sini." />
      ) : (
        <ul className="card divide-y divide-navy/5 !p-0 dark:divide-white/10">
          {list.map((n) => {
            const { I, c } = icon(n.type)
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} className="flex w-full items-start gap-3 p-4 text-left">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${c}`}><I size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read_at ? 'font-medium' : 'font-extrabold'}`}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-navy/60 dark:text-white/60">{n.body}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs text-navy/50 dark:text-white/50">{ago(n.created_at)}{!n.read_at && <span className="mx-auto mt-1 block h-2 w-2 rounded-full bg-sos" />}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
