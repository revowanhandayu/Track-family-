import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Hanya lapisan UX. Keamanan sebenarnya ada di RLS dan Edge Functions.
export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="p-6"><div className="skeleton h-24" /></div>
  if (!session) return <Navigate to="/masuk" replace state={{ from: loc }} />
  return <Outlet />
}
