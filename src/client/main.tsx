import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/800.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initAnalytics } from './analytics'
import { isHippocamRoute } from './game/controller'
import { installPlatformGuards } from './platform'
import { ErrorBoundary, FatalScreen, hasWebGL } from './ui/Fatal'

installPlatformGuards()
if (!isHippocamRoute()) initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {hasWebGL() ? (
        <App />
      ) : (
        <FatalScreen title="No 3D here" message="Your browser has WebGL turned off or doesn't support it. Try a recent Chrome, Safari, Firefox or Edge." />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
