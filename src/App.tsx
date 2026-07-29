import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PersonListPage from '@/routes/PersonListPage'
import PersonDetailPage from '@/routes/PersonDetailPage'
import PersonCreatePage from '@/routes/PersonCreatePage'

function AppHeader() {
  const { signOut } = useAuthenticator()
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
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </header>
  )
}

function App() {
  const deliberateTypeError: string = 12345;
  console.log(deliberateTypeError);
  return (
    <BrowserRouter>
      <div className="min-h-svh">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <Routes>
            <Route path="/" element={<PersonListPage />} />
            <Route path="/people/new" element={<PersonCreatePage />} />
            <Route path="/people/:personId" element={<PersonDetailPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
