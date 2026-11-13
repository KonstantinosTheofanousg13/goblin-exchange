import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './index.css'
import { ApiError } from './lib/api'
import { Layout } from './pages/Layout'
import { MarketPage } from './pages/MarketPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Snapshots arrive about hourly; a minute of caching is plenty fresh.
      staleTime: 60_000,
      // Don't retry 4xx (bad request, not found): only server/network errors.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
})

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <MarketPage /> },
      {
        path: '/items/:id',
        // Loaded on first visit: keeps the chart library out of the initial bundle.
        lazy: async () => ({ Component: (await import('./pages/ItemPage')).ItemPage }),
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
