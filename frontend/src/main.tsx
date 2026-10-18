import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/sonner'
import { setUnauthorizedHandler } from '@/api/client'
import { queryClient } from '@/api/queryClient'
import { meQueryKey } from '@/hooks/useAuth'

// A 401 mid-session (expired or revoked session) drops the cached user, and RequireAuth
// then redirects to /login.
setUnauthorizedHandler(() => queryClient.setQueryData(meQueryKey, null))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
