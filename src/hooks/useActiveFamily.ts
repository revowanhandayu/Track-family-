import { useEffect, useState } from 'react'
import { listFamilies, type Family } from '../lib/family'

export function useActiveFamily() {
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(true)
  const [familyId, setFamilyIdState] = useState<string | null>(null)

  useEffect(() => {
    listFamilies().then((fs) => {
      setFamilies(fs)
      const saved = localStorage.getItem('ft-family')
      setFamilyIdState(fs.find((f) => f.id === saved)?.id ?? fs[0]?.id ?? null)
    }).catch(() => setFamilies([])).finally(() => setLoading(false))
  }, [])

  const setFamilyId = (id: string) => { localStorage.setItem('ft-family', id); setFamilyIdState(id) }
  return { families, familyId, setFamilyId, loading, family: families.find((f) => f.id === familyId) ?? null }
}
