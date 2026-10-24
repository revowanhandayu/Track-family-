import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-navy text-sun dark:bg-sun dark:text-navy">
          <MapPin size={24} aria-hidden />
        </div>
        <div>
          <p className="text-lg font-extrabold leading-none">Family Tracker</p>
          <p className="text-xs text-navy/60 dark:text-white/60">Keluarga Dekat, Hati Tenang</p>
        </div>
      </div>
      <div className="card space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-navy/60 dark:text-white/60">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

export const inputCls =
  'w-full rounded-xl border border-navy/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-sun focus:ring-2 focus:ring-sun/40 dark:border-white/15 dark:bg-navy dark:text-white'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  )
}
