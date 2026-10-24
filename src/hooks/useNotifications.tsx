import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { useToast } from '../components/Toast'
import * as A from '../lib/alerts'
import type { AlertRow, Notif } from '../lib/alerts'

interface Ctx {
  items: Notif[]; unread: number; activeSos: AlertRow[]; incoming: Notif | null
  read: (ids: string[]) => Promise<void>; readAll: () => Promise<void>; dismissIncoming: () => void; refresh: () => Promise<void>
}
const C = createContext<Ctx | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState<Notif[]>([])
  const [activeSos, setActiveSos] = useState<AlertRow[]>([])
  const [incoming, setIncoming] = useState<Notif | null>(null)

  const refresh = useCallback(async () => {
    try { const [n, s] = await Promise.all([A.listNotifications(), A.listActiveSos()]); setItems(n.filter((i) => i.type !== 'chat_message')); setActiveSos(s) } catch { /* abaikan */ }
  }, [])

  useEffect(() => {
    if (!user) return
    refresh()
    const ch = supabase.channel(`notif-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, (p) => {
        const n = p.new as Notif
        if (n.type === 'chat_message') { if (location.pathname !== '/chat') toast(`${n.title}: ${n.body ?? ''}`, 'info'); return }
        setItems((x) => (x.some((i) => i.id === n.id) ? x : [n, ...x]))
        if (n.type === 'sos') {
          setIncoming(n); navigator.vibrate?.([300, 150, 300, 150, 600])
        } else toast(n.title, 'info')
        A.listActiveSos().then(setActiveSos)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_alerts' }, () => { A.listActiveSos().then(setActiveSos) })
      .subscribe()
    const poll = setInterval(refresh, 60000) // cadangan bila realtime terputus
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [user, refresh, toast])

  const read = useCallback(async (ids: string[]) => {
    const now = new Date().toISOString()
    setItems((x) => x.map((i) => (ids.includes(i.id) && !i.read_at ? { ...i, read_at: now } : i)))
    await A.markRead(ids)
  }, [])
  const readAll = useCallback(async () => { await read(items.filter((i) => !i.read_at).map((i) => i.id)) }, [items, read])
  const unread = useMemo(() => items.filter((i) => !i.read_at).length, [items])

  return (
    <C.Provider value={{ items, unread, activeSos, incoming, read, readAll, refresh, dismissIncoming: () => setIncoming(null) }}>
      {children}
    </C.Provider>
  )
}

export function useNotifications() {
  const v = useContext(C)
  if (!v) throw new Error('useNotifications harus di dalam NotificationsProvider')
  return v
}
