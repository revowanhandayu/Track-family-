import { supabase } from './supabase'

export interface Msg { id: string; family_id: string; sender_id: string; body: string; created_at: string }

export async function listMessages(familyId: string): Promise<Msg[]> {
  const { data, error } = await supabase.from('messages').select('id,family_id,sender_id,body,created_at')
    .eq('family_id', familyId).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Msg[]).reverse()
}
export async function sendMessage(familyId: string, body: string) {
  const { error } = await supabase.rpc('send_message', { p_family: familyId, p_body: body })
  if (error) throw new Error(error.message)
}
