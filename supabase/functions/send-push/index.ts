// Mengirim Web Push saat ada baris baru di tabel notifications (dipicu Database Webhook).
// Hanya menerima panggilan dari webhook: header x-webhook-secret HARUS cocok, atau Authorization = service role.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const secret = Deno.env.get('WEBHOOK_SECRET')
  const authorized = req.headers.get('authorization') === `Bearer ${key}` || (!!secret && req.headers.get('x-webhook-secret') === secret)
  if (!authorized) return new Response('forbidden', { status: 403 })

  const body = await req.json().catch(() => null)
  const n = body?.record
  if (body?.type !== 'INSERT' || !n?.recipient_id) return ok({ skipped: 'bukan INSERT notifikasi' })

  const admin = createClient(url, key)
  const { data: st } = await admin.from('user_settings').select('notify_sos,notify_members').eq('user_id', n.recipient_id).maybeSingle()
  const critical = ['sos', 'safe', 'sos_resolved'].includes(n.type)
  if (critical ? st?.notify_sos === false : st?.notify_members === false) return ok({ skipped: 'dimatikan pengguna' })

  const { data: subs } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', n.recipient_id)
  if (!subs?.length) return ok({ skipped: 'tidak ada perangkat terdaftar' })

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const path = n.payload?.alert_id ? `/sos/${n.payload.alert_id}` : n.type === 'chat_message' ? '/chat' : '/notifikasi'
  const payload = JSON.stringify({ title: n.title, body: n.body ?? '', url: path, tag: n.type === 'sos' ? `sos-${n.id}` : n.type, urgent: n.type === 'sos' })
  const opts = { TTL: n.type === 'sos' ? 3600 : 600, urgency: n.type === 'sos' ? 'high' : 'normal' } as const

  let sent = 0
  for (const s of subs) {
    let attempts = 0, lastErr = '', done = false
    while (!done && attempts < 2) {
      attempts++
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts)
        done = true
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        lastErr = `HTTP ${code ?? '?'}`
        if (code === 404 || code === 410) { await admin.from('push_subscriptions').delete().eq('id', s.id); lastErr += ' (langganan kedaluwarsa, dihapus)'; break }
        if (attempts < 2) await sleep(1000)
      }
    }
    // "sent" = diterima layanan push, bukan jaminan sudah sampai ke perangkat
    await admin.from('notification_deliveries').insert({
      notification_id: n.id, channel: 'web_push', status: done ? 'sent' : 'failed',
      attempts, last_error: done ? null : lastErr, sent_at: done ? new Date().toISOString() : null,
    })
    if (done) sent++
  }
  return ok({ sent, total: subs.length })
})
