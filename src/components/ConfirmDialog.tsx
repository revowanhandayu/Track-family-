import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean; title: string; children?: ReactNode
  confirmLabel: string; danger?: boolean; busy?: boolean; disabled?: boolean
  onConfirm: () => void; onCancel: () => void
}

export default function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, disabled, onConfirm, onCancel }: Props) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1500] grid place-items-end bg-navy/60 p-4 sm:place-items-center" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="card w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title" className="text-lg font-bold">{title}</h2>
        <div className="text-sm text-navy/70 dark:text-white/70">{children}</div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy || disabled}>
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
