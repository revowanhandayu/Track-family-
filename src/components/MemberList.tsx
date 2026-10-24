import { Link } from 'react-router-dom'
import type { MemberLoc } from '../hooks/useFamilyLocations'
import { STATUS_LABEL, ago, type LocStatus } from '../lib/location'
import Avatar from './Avatar'

const pill: Record<LocStatus, string> = {
  live: 'bg-live/15 text-live',
  stale: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  waiting: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  off: 'bg-navy/10 text-navy/60 dark:bg-white/10 dark:text-white/60',
}

function Row({ r, meId }: { r: MemberLoc; meId: string }) {
  return (
    <>
      <Avatar name={r.name} url={r.avatar} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{r.name}{r.id === meId && ' (kamu)'}</p>
        <p className="truncate text-xs text-navy/60 dark:text-white/60">
          {r.loc
            ? `Diperbarui ${ago(r.loc.recorded_at)}${r.loc.accuracy_m != null ? ` · ±${Math.round(r.loc.accuracy_m)} m` : ''}`
            : r.sharing ? 'Menunggu pembaruan lokasi' : 'Lokasi tidak dibagikan'}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${pill[r.status]}`}>{STATUS_LABEL[r.status]}</span>
    </>
  )
}

export default function MemberList({ rows, meId, onSelect, linkBase }: { rows: MemberLoc[]; meId: string; onSelect?: (id: string) => void; linkBase?: string }) {
  const cls = 'flex w-full items-center gap-3 py-3 text-left'
  return (
    <ul className="divide-y divide-navy/5 dark:divide-white/10">
      {rows.map((r) => (
        <li key={r.id}>
          {linkBase ? <Link to={`${linkBase}/${r.id}`} className={cls}><Row r={r} meId={meId} /></Link>
            : <button className={`${cls} disabled:cursor-default`} disabled={!onSelect} onClick={() => onSelect?.(r.id)}><Row r={r} meId={meId} /></button>}
        </li>
      ))}
    </ul>
  )
}
