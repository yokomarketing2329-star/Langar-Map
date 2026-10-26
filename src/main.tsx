import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { I18nProvider } from './lib/i18n'
import App from './App'

const Admin = lazy(() => import('./pages/Admin'))
const isAdminRoute = location.pathname.replace(/\/+$/, '') === '/admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {isAdminRoute ? <Suspense fallback={null}><Admin /></Suspense> : <App />}
    </I18nProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
