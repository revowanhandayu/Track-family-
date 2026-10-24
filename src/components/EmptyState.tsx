import type { LucideIcon } from 'lucide-react'

export default function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sun-soft text-navy dark:bg-sun/20 dark:text-sun">
        <Icon size={24} aria-hidden />
      </div>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="max-w-xs text-sm text-navy/60 dark:text-white/60">{hint}</p>
    </div>
  )
}
