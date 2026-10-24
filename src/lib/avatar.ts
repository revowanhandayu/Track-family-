import { supabase } from './supabase'

const cache = new Map<string, { url: string; exp: number }>()

// Foto disimpan di bucket privat; path diubah jadi URL bertanda tangan yang berlaku 1 jam.
export async function resolveAvatars(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now()
  const out: Record<string, string> = {}
  const need: string[] = []
  for (const p of new Set(paths)) {
    if (p.startsWith('https://')) out[p] = p
    else if ((cache.get(p)?.exp ?? 0) > now) out[p] = cache.get(p)!.url
    else need.push(p)
  }
  if (need.length) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(need, 3600)
    for (const d of data ?? []) {
      if (d.path && d.signedUrl && !d.error) { cache.set(d.path, { url: d.signedUrl, exp: now + 55 * 60000 }); out[d.path] = d.signedUrl }
    }
  }
  return out
}

// Potong persegi dari tengah, kecilkan, lalu simpan ulang sebagai JPEG.
// Proses ini juga membuang metadata EXIF (termasuk koordinat GPS yang kadang menempel di foto).
export async function squareJpeg(file: File, size = 320): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  bmp.close()
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses gambar'))), 'image/jpeg', 0.85))
}

export async function uploadAvatar(uid: string, file: File, oldPath: string | null): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Pilih foto berformat JPG, PNG, atau WebP.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Ukuran foto maksimal 10 MB.')
  const blob = await squareJpeg(file)
  const path = `${uid}/avatar-${Date.now()}.jpg`
  const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw new Error('Gagal mengunggah foto. Coba lagi.')
  const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', uid)
  if (error) { await supabase.storage.from('avatars').remove([path]); throw new Error('Gagal menyimpan foto profil.') }
  if (oldPath && !oldPath.startsWith('https://')) await supabase.storage.from('avatars').remove([oldPath])
  return path
}

export async function removeAvatar(uid: string, oldPath: string | null) {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid)
  if (error) throw new Error('Gagal menghapus foto.')
  if (oldPath && !oldPath.startsWith('https://')) await supabase.storage.from('avatars').remove([oldPath])
}
