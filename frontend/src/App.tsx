import { BrowserRouter, Routes, Route, Link, Outlet } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RequireAuth } from '@/components/RequireAuth'
import { ServerStatusBanner } from '@/components/ServerStatusBanner'
import { useLogout } from '@/hooks/useAuth'
import LoginPage from '@/routes/LoginPage'
import PersonListPage from '@/routes/PersonListPage'
import PersonDetailPage from '@/routes/PersonDetailPage'
import PersonCreatePage from '@/routes/PersonCreatePage'

function AppHeader() {
  const logout = useLogout()
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <nav className="flex items-center gap-6">
        <Link to="/" className="font-semibold">
          RelationTree
        </Link>
        <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">
          People
        </Link>
      </nav>
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/people/new">
            <UserPlus />
            Add person
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
          Sign out
        </Button>
      </div>
    </header>
  )
}

function AppLayout() {
  return (
    <RequireAuth>
      <div className="min-h-svh">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Outlet />
        </main>
      </div>
    </RequireAuth>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ServerStatusBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<PersonListPage />} />
          <Route path="/people/new" element={<PersonCreatePage />} />
          <Route path="/people/:personId" element={<PersonDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
