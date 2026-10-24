export default function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || '?'
  if (url) return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-sun font-bold text-navy" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </div>
  )
}
