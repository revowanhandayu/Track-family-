import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'

export default function NotificationBell() {
  const { unread } = useNotifications()
  return (
    <Link to="/notifikasi" aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ''}`} className="relative grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
      <Bell size={20} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-sos px-1 text-[11px] font-bold">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  )
}
