import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Send, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useActiveFamily } from '../hooks/useActiveFamily'
import { useToast } from '../components/Toast'
import { listMembers, type Member } from '../lib/family'
import { listMessages, sendMessage, type Msg } from '../lib/chat'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { inputCls } from '../components/AuthLayout'

const hm = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export default function ChatPage() {
  const { user } = useAuth()
  const toast = useToast()
  const { families, familyId, setFamilyId, loading, family } = useActiveFamily()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => { if (familyId) setMsgs(await listMessages(familyId).catch(() => [])) }, [familyId])
  useEffect(() => { load(); if (familyId) listMembers(familyId).then(setMembers).catch(() => {}) }, [load, familyId])

  useEffect(() => {
    if (!familyId) return
    const ch = supabase.channel(`chat-${familyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `family_id=eq.${familyId}` }, (p) => {
        const m = p.new as Msg
        setMsgs((x) => (x.some((i) => i.id === m.id) ? x : [...x, m]))
      }).subscribe()
    const poll = setInterval(load, 30000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [familyId, load])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const name = (id: string) => members.find((m) => m.user_id === id)?.profiles?.full_name ?? 'Anggota'

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!familyId || !text.trim()) return
    setBusy(true)
    try { await sendMessage(familyId, text); setText(''); await load() } catch (err) { toast((err as Error).message, 'error') }
    setBusy(false)
  }

  if (loading) return <div className="skeleton h-64" />
  if (!family) return <><PageHeader title="Chat Keluarga" /><EmptyState icon={MessageCircle} title="Belum ada grup" hint="Buat atau gabung grup keluarga dulu." /><Link to="/keluarga" className="btn-primary mt-3 w-full">Ke Keluarga</Link></>

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <div className="flex items-center justify-between gap-2">
        <PageHeader title={`Chat · ${family.name}`} />
        {families.length > 1 && <select className={`${inputCls} mb-4 w-auto`} value={familyId ?? ''} onChange={(e) => setFamilyId(e.target.value)} aria-label="Pilih grup">{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
      </div>
      <div className="flex-1 space-y-2 pb-3">
        {msgs.length === 0 && <EmptyState icon={MessageCircle} title="Belum ada pesan" hint="Mulai obrolan dengan keluargamu." />}
        {msgs.map((m) => {
          const mine = m.sender_id === user!.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-sun text-navy' : 'rounded-bl-md bg-white shadow-sm ring-1 ring-navy/5 dark:bg-navy-800 dark:ring-white/10'}`}>
                {!mine && <p className="text-xs font-bold text-blue-600 dark:text-sun">{name(m.sender_id)}</p>}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className="mt-0.5 text-right text-[10px] opacity-60">{hm(m.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="sticky bottom-24 flex gap-2">
        <input className={inputCls} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Tulis pesan…" aria-label="Pesan" />
        <button className="btn-primary px-4" disabled={busy || !text.trim()} aria-label="Kirim"><Send size={18} /></button>
      </form>
    </div>
  )
}
