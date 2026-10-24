// Menghapus akun pemanggil. Memakai service_role HANYA di sini (secret Edge Function).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Belum login' }, 401)

  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'HAPUS') return json({ error: 'Konfirmasi tidak cocok' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: owned } = await admin.from('families').select('id,name').eq('owner_id', user.id)
  for (const f of owned ?? []) {
    const { count } = await admin.from('family_members').select('id', { count: 'exact', head: true })
      .eq('family_id', f.id).eq('status', 'active').neq('user_id', user.id)
    if ((count ?? 0) > 0) {
      return json({ error: `Transfer kepemilikan grup "${f.name}" dulu sebelum menghapus akun.` }, 409)
    }
  }
  for (const f of owned ?? []) await admin.from('families').delete().eq('id', f.id)

  const { data: files } = await admin.storage.from('avatars').list(user.id)
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))

  await admin.from('audit_logs').insert({ actor_id: user.id, action: 'account.delete' })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return json({ error: 'Gagal menghapus akun' }, 500)
  return json({ ok: true })
})
