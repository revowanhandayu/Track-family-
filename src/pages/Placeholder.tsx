import { Construction } from 'lucide-react'
import EmptyState from '../components/EmptyState'

// Halaman ini diisi pada tahap yang tertera. Belum ada data palsu di sini.
export default function Placeholder({ title, stage }: { title: string; stage: number }) {
  return (
    <>
      <h1 className="mb-4 text-2xl font-extrabold">{title}</h1>
      <EmptyState icon={Construction} title="Belum dibangun" hint={`Fitur ini dikerjakan pada Tahap ${stage}.`} />
    </>
  )
}
