import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import ProtectedRoute from './components/ProtectedRoute'
import ConfigMissing from './pages/ConfigMissing'
import Placeholder from './pages/Placeholder'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import FamilyPage from './pages/Family'
import JoinFamily from './pages/JoinFamily'
import Profile from './pages/Profile'
import { isConfigured } from './lib/supabase'

export default function App() {
  if (!isConfigured) return <ConfigMissing />

  return (
    <Routes>
      <Route path="/masuk" element={<Login />} />
      <Route path="/daftar" element={<Register />} />
      <Route path="/lupa-sandi" element={<ForgotPassword />} />
      <Route path="/atur-ulang" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Placeholder title="Beranda" stage={3} />} />
          <Route path="peta" element={<Placeholder title="Peta keluarga" stage={3} />} />
          <Route path="keluarga" element={<FamilyPage />} />
          <Route path="gabung/:token" element={<JoinFamily />} />
          <Route path="riwayat" element={<Placeholder title="Riwayat lokasi" stage={4} />} />
          <Route path="profil" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Placeholder title="Halaman tidak ditemukan" stage={1} />} />
    </Routes>
  )
}
