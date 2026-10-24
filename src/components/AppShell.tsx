import { NavLink, Outlet } from 'react-router-dom'
import { Home, Map, Users, History, UserRound, Radio } from 'lucide-react'
import { SharingProvider, useSharing } from '../hooks/useSharing'

const tabs = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/peta', label: 'Peta', icon: Map },
  { to: '/keluarga', label: 'Keluarga', icon: Users },
  { to: '/riwayat', label: 'Riwayat', icon: History },
  { to: '/profil', label: 'Profil', icon: UserRound },
]

// Indikator jelas selama lokasi dibagikan, tampil di semua halaman.
function SharingBanner() {
  const { live, stop } = useSharing()
  if (!live) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[1100] flex justify-center px-4" role="status">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-live py-1.5 pl-3 pr-1.5 text-xs font-semibold text-white shadow-lg">
        <Radio size={14} aria-hidden /> Berbagi lokasi aktif
        <button className="rounded-full bg-white/25 px-3 py-1" onClick={stop}>Hentikan</button>
      </div>
    </div>
  )
}

function Shell() {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl">
      <main className="px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <SharingBanner />
        <Outlet />
      </main>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-[1000] border-t border-navy/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-white/10 dark:bg-navy/95"
      >
        <ul className="mx-auto flex max-w-3xl justify-around px-2 py-2">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-3 py-1.5 text-[11px] font-semibold transition ${
                    isActive ? 'bg-sun text-navy' : 'text-navy/60 dark:text-white/60'
                  }`
                }
              >
                <Icon size={20} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default function AppShell() {
  return <SharingProvider><Shell /></SharingProvider>
}
