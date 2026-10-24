import type { ReactNode } from 'react'
import Logo from './Logo'

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={72} />
        <p className="mt-4 text-xl font-extrabold tracking-wide">FAMILY TRACKER</p>
        <p className="text-sm text-navy/60 dark:text-white/60">Keluarga Dekat, Hati Tenang</p>
      </div>
      <h1 className="text-xl font-extrabold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-navy/60 dark:text-white/60">{subtitle}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  )
}

export const inputCls =
  'w-full rounded-xl border border-navy/15 bg-white px-3.5 py-3 text-sm outline-none focus:border-sun focus:ring-2 focus:ring-sun/40 dark:border-white/15 dark:bg-navy dark:text-white'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  )
}
