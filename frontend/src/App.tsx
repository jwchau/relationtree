import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Network, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/kiln/Page'
import { CurrentTreeProvider } from '@/components/CurrentTreeProvider'
import { RequireAuth } from '@/components/RequireAuth'
import { TreeSwitcher } from '@/components/TreeSwitcher'
import { ServerStatusBanner } from '@/components/ServerStatusBanner'
import { useLogout } from '@/hooks/useAuth'
import { useCurrentTree } from '@/hooks/useCurrentTree'
import LoginPage from '@/routes/LoginPage'
import PersonListPage from '@/routes/PersonListPage'
import {
  InvitePage,
  MapPage,
  PersonCreatePage,
  PersonDetailPage,
  TreeSettingsPage,
} from '@/routes/lazy'

/** What shows while a page's code loads (see routes/lazy.ts): the page's band, empty. */
function PageFallback() {
  return (
    <div
      className="ink min-h-[104px] min-[1200px]:mx-auto min-[1200px]:max-w-[1200px] min-[1200px]:rounded-b-[16px]"
      aria-busy="true"
      aria-label="Loading the page"
    />
  )
}

function AppHeader() {
  const logout = useLogout()
  const { canEdit } = useCurrentTree()
  // The People page carries Add person as its primary action, so the bar doesn't repeat it.
  const { pathname } = useLocation()
  const onPeople = pathname === '/'
  const onMap = pathname === '/map'
  return (
    <header className="ink sticky top-0 z-[6] border-b border-band-divider">
      <div className="mx-auto flex min-h-16 max-w-[1200px] items-center gap-2 px-[var(--gutter)] sm:gap-4">
        <Link
          to="/"
          className="focus-ring -ml-2 flex h-12 items-center gap-2.5 rounded-[12px] px-2"
          aria-label="RelationTree, people"
        >
          <BrandMark />
          <span className="display-face hidden text-[16px] leading-6 sm:inline">RelationTree</span>
        </Link>
        <TreeSwitcher />
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="band" className="max-sm:size-11 max-sm:px-0">
            <Link to="/map" aria-label="Map" aria-current={onMap ? 'page' : undefined}>
              <Network />
              <span className="max-sm:sr-only">Map</span>
            </Link>
          </Button>
          {canEdit && !onPeople && (
            <Button asChild variant="band" className="max-sm:size-11 max-sm:px-0">
              <Link to="/people/new" aria-label="Add person">
                <UserPlus />
                <span className="max-sm:sr-only">Add person</span>
              </Link>
            </Button>
          )}
          <Button
            variant="band"
            className="max-sm:size-11 max-sm:px-0"
            onClick={() => logout.mutate()}
            aria-label="Sign out"
          >
            <LogOut />
            <span className="max-sm:sr-only">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

function AppLayout() {
  return (
    <RequireAuth>
      <CurrentTreeProvider>
        <div className="min-h-svh">
          <AppHeader />
          <main>
            <Suspense fallback={<PageFallback />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </CurrentTreeProvider>
    </RequireAuth>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ServerStatusBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/invite/:token"
          element={
            <Suspense fallback={<PageFallback />}>
              <InvitePage />
            </Suspense>
          }
        />
        <Route element={<AppLayout />}>
          <Route path="/" element={<PersonListPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/people/new" element={<PersonCreatePage />} />
          <Route path="/people/:personId" element={<PersonDetailPage />} />
          <Route path="/trees/:treeId" element={<TreeSettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
