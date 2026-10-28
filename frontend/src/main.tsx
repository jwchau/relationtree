import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { setUnauthorizedHandler } from '@/api/client'
import { prefetchStartup } from '@/api/prefetch'
import { queryClient } from '@/api/queryClient'
import { meQueryKey } from '@/hooks/useAuth'
import { readRememberedTree } from '@/lib/currentTreeStorage'
import { preloadRoute } from '@/routes/lazy'

// A 401 mid-session (expired or revoked session) drops the cached user, and RequireAuth
// then redirects to /login.
setUnauthorizedHandler(() => queryClient.setQueryData(meQueryKey, null))

// Ask for the session, the trees and this page's data at once, rather than one after another
// as the components mount (see prefetchStartup).
void prefetchStartup(queryClient, window.location.pathname, readRememberedTree())
// And this page's code, if it isn't in the main bundle.
preloadRoute(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
