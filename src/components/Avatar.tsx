import { useEffect, useState } from 'react'
import { resolveAvatars } from '../lib/avatar'

export default function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [src, setSrc] = useState<string | null>(url?.startsWith('https://') ? url : null)
  useEffect(() => {
    let off = false
    if (!url) { setSrc(null); return }
    if (url.startsWith('https://')) { setSrc(url); return }
    resolveAvatars([url]).then((m) => { if (!off) setSrc(m[url] ?? null) })
    return () => { off = true }
  }, [url])

  const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?'
  if (src) return <img src={src} alt="" width={size} height={size} onError={() => setSrc(null)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-sun font-bold text-navy" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </div>
  )
}
