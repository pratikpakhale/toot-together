import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/800.css'
import './index.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initAnalytics, track } from './analytics'
import { isHippocamRoute, isLabRoute } from './game/controller'
import { installPlatformGuards } from './platform'
import { ErrorBoundary, FatalScreen, hasWebGL } from './ui/Fatal'
import { keepUpToDate } from './updates'

// Loaded only on /lab, so the game never downloads it.
const LabPage = lazy(() => import('./lab/LabPage'))

installPlatformGuards()
if (!isHippocamRoute()) initAnalytics()
keepUpToDate()

const webgl = hasWebGL()
if (!webgl) track('webgl_missing')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {webgl ? (
        isLabRoute() ? (
          <Suspense fallback={null}>
            <LabPage />
          </Suspense>
        ) : (
          <App />
        )
      ) : (
        <FatalScreen
          title="No 3D here"
          message="Your browser has WebGL turned off or doesn't support it. Try a recent Chrome, Safari, Firefox or Edge."
        />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
