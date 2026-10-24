import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listMembers, type Member } from '../lib/family'
import { resolveAvatars } from '../lib/avatar'
import { shareIsLive, statusOf, type Loc, type LocStatus, type Share } from '../lib/location'

export interface MemberLoc {
  id: string; name: string; avatar: string | null; role: 'owner' | 'member'
  loc?: Loc; sharing: boolean; status: LocStatus
}

export function useFamilyLocations(familyId: string | null) {
  const [members, setMembers] = useState<Member[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [locs, setLocs] = useState<Record<string, Loc>>({})
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({})

  const loadShares = useCallback(async () => {
    if (!familyId) return
    const { data } = await supabase.from('location_shares')
      .select('id,user_id,family_id,is_active,duration,started_at,expires_at')
      .eq('family_id', familyId).eq('is_active', true)
    setShares((data ?? []) as Share[])
  }, [familyId])

  const loadAll = useCallback(async () => {
    if (!familyId) { setMembers([]); setShares([]); setLocs({}); setLoading(false); return }
    try {
      const ms = (await listMembers(familyId)).filter((m) => m.status === 'active')
      setMembers(ms)
      await loadShares()
      const { data } = await supabase.from('current_locations')
        .select('user_id,latitude,longitude,accuracy_m,recorded_at').in('user_id', ms.map((m) => m.user_id))
      setLocs(Object.fromEntries(((data ?? []) as Loc[]).map((l) => [l.user_id, l])))
    } finally { setLoading(false) }
  }, [familyId, loadShares])

  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  useEffect(() => {
    const paths = members.map((m) => m.profiles?.avatar_url).filter((x): x is string => !!x)
    if (!paths.length) { setAvatarMap({}); return }
    let off = false
    resolveAvatars(paths).then((m) => { if (!off) setAvatarMap(m) })
    return () => { off = true }
  }, [members])

  // Realtime + polling cadangan (jika koneksi realtime terputus)
  useEffect(() => {
    if (!familyId) return
    const ch = supabase.channel(`loc-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'current_locations' }, (p) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as { user_id?: string }).user_id
          if (id) setLocs((m) => { const { [id]: _drop, ...rest } = m; return rest })
        } else {
          const l = p.new as Loc
          setLocs((m) => ({ ...m, [l.user_id]: l }))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_shares', filter: `family_id=eq.${familyId}` }, () => { loadShares() })
      .subscribe()
    const poll = setInterval(loadAll, 60000)
    const tick = setInterval(() => setNow(Date.now()), 20000)
    return () => { supabase.removeChannel(ch); clearInterval(poll); clearInterval(tick) }
  }, [familyId, loadAll, loadShares])

  const rows: MemberLoc[] = useMemo(() => members.map((m) => {
    const sharing = shares.some((s) => s.user_id === m.user_id && shareIsLive(s, now))
    const loc = sharing ? locs[m.user_id] : undefined // lokasi lama tidak ditampilkan bila tidak berbagi
    return {
      id: m.user_id, name: m.profiles?.full_name ?? 'Pengguna', avatar: (m.profiles?.avatar_url && avatarMap[m.profiles.avatar_url]) || null,
      role: m.role, loc, sharing, status: statusOf(sharing, loc, now),
    }
  }), [members, shares, locs, now, avatarMap])

  return { rows, loading, refresh: loadAll }
}
