import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'error' | 'info'
interface T { id: number; kind: Kind; text: string }
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, kind, text }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000)
  }, [])
  const color = { ok: 'bg-live', error: 'bg-sos', info: 'bg-navy-700' }
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`${color[i.kind]} pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg`}>
            {i.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
