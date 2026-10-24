import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PageHeader({ title, back = true }: { title: string; back?: boolean }) {
  const nav = useNavigate()
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <button onClick={() => nav(-1)} aria-label="Kembali" className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-navy/5 dark:bg-navy-800 dark:ring-white/10">
          <ChevronLeft size={20} />
        </button>
      )}
      <h1 className="text-xl font-extrabold">{title}</h1>
    </header>
  )
}
