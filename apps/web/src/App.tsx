import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import NewAppPage from './pages/NewAppPage'
import AppDetailPage from './pages/AppDetailPage'

function Spinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  return (
    <Routes>
      <Route path="/auth" element={!session ? <AuthPage /> : <Navigate to="/" replace />} />
      <Route path="/" element={session ? <DashboardPage /> : <Navigate to="/auth" replace />} />
      <Route path="/apps/new" element={session ? <NewAppPage /> : <Navigate to="/auth" replace />} />
      <Route path="/apps/:id" element={session ? <AppDetailPage /> : <Navigate to="/auth" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
