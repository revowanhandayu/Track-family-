import { supabase } from './supabase'

export interface Place { id: string; family_id: string; name: string; latitude: number; longitude: number; radius_m: number; created_by: string | null }

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function listPlaces(familyId?: string | null): Promise<Place[]> {
  let q = supabase.from('places').select('id,family_id,name,latitude,longitude,radius_m,created_by').order('created_at')
  if (familyId) q = q.eq('family_id', familyId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Place[]
}
export const addPlace = (family: string, name: string, lat: number, lng: number, radius: number) =>
  rpc<string>('add_place', { p_family: family, p_name: name, p_lat: lat, p_lng: lng, p_radius: radius })
export const deletePlace = (id: string) => rpc('delete_place', { p_place: id })
export const reportPlaceEvent = (id: string, ev: 'arrive' | 'leave', lat: number, lng: number, acc: number) =>
  rpc<{ ok: boolean; reason?: string }>('report_place_event', { p_place: id, p_event: ev, p_lat: lat, p_lng: lng, p_acc: acc })
