import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installBreadcrumbs } from './features/feedback/breadcrumbs'
import { installConsoleBuffer } from './features/feedback/consoleBuffer'
import { installErrorBuffer } from './features/feedback/errorBuffer'
import { initAnalytics } from './lib/analytics'
import { installMotionVisibilityGuard } from './lib/motion-visibility'
import { initProductTracker } from './lib/product-tracker'
import { initSentry } from './lib/sentry'
import { installStaleBuildRecovery } from './lib/stale-build'
import { router } from './router'
import './i18n'
import './index.css'

initSentry(router)
// Mesure d'audience — DEUX conditions : VITE_PLAUSIBLE_DOMAIN posée ET le
// consentement du visiteur (cookie de `.bellum-ai.com`, donné sur le site).
// Sans l'une ou l'autre : no-op strict, aucun script, aucune requête.
initAnalytics()
// #1682 — le traceur produit (comportemental, aucune donnée personnelle).
// No-op strict sans VITE_PRODUCT_TRACKER_ENABLED : aucun timer, aucun
// écouteur, aucun appel réseau.
initProductTracker()
// Buffer console output and runtime failures early so a bug report can attach
// them for repro.
installConsoleBuffer()
installErrorBuffer()
// Le fil des gestes précédents — ce qu'une capture d'écran ne peut pas montrer :
// comment on est arrivé là.
installBreadcrumbs()
// Entry animations must never leave loaded content stuck at opacity 0 when the
// browser is not rendering this document (background tab, occluded window).
installMotionVisibilityGuard()
// Un onglet ouvert pendant un déploiement demande des chunks qui n'existent
// plus : on recharge au lieu d'afficher un crash pour une page simplement
// périmée.
installStaleBuildRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
