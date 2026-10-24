import { supabase } from './supabase'

export interface Family { id: string; name: string; owner_id: string; require_approval: boolean }
export interface Member {
  id: string; family_id: string; user_id: string
  role: 'owner' | 'member'; status: 'pending' | 'active' | 'removed' | 'left'
  joined_at: string | null
  profiles: { full_name: string; avatar_url: string | null } | null
}
export type AcceptResult =
  | { ok: true; status: 'pending' | 'active'; family_id: string }
  | { ok: false; error: 'invalid' | 'already_member' | 'rate_limited' | 'unauthenticated' }

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function listFamilies(): Promise<Family[]> {
  const { data, error } = await supabase.from('families').select('id,name,owner_id,require_approval').order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listMembers(familyId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id,family_id,user_id,role,status,joined_at,profiles(full_name,avatar_url)')
    .eq('family_id', familyId)
    .in('status', ['active', 'pending'])
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Member[]
}

export async function countMyPending(userId: string): Promise<number> {
  const { count, error } = await supabase.from('family_members')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export const createFamily = (name: string) => rpc<string>('create_family', { p_name: name })
export const createInvitation = (familyId: string, ttlHours: number, singleUse: boolean) =>
  rpc<string>('create_invitation', { p_family: familyId, p_ttl_hours: ttlHours, p_single_use: singleUse })
export const acceptInvitation = (token: string) => rpc<AcceptResult>('accept_invitation', { p_token: token })
export const decideMember = (memberId: string, approve: boolean) => rpc('decide_member', { p_member: memberId, p_approve: approve })
export const removeMember = (memberId: string) => rpc('remove_member', { p_member: memberId })
export const leaveFamily = (familyId: string) => rpc('leave_family', { p_family: familyId })
export const transferOwnership = (familyId: string, newOwner: string) =>
  rpc('transfer_ownership', { p_family: familyId, p_new_owner: newOwner })

export const inviteLink = (token: string) => `${location.origin}/gabung/${token}`

export function acceptErrorText(e: AcceptResult & { ok: false }): string {
  switch (e.error) {
    case 'invalid': return 'Undangan tidak valid, sudah dipakai, atau sudah kedaluwarsa. Minta pemilik grup membuat yang baru.'
    case 'already_member': return 'Kamu sudah menjadi anggota atau permintaanmu masih menunggu persetujuan.'
    case 'rate_limited': return 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.'
    default: return 'Silakan masuk terlebih dulu.'
  }
}
