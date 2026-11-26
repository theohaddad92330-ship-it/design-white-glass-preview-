import { useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'
import { isTabDemo, TAB_DEMO_CHANGED_EVENT } from '@/features/auth/demo-tab'
import { consumeImpersonationToken, stopImpersonation } from './api'
import { readImpersonationState, type ImpersonationState } from './impersonation-state'

const TOKEN_HASH_PREFIX = '#imp_token='

/** #4608.3 — « Tu incarnes … » ne se dit que de l'onglet qui incarne : la salle de démonstration, ouverte à côté
 *  d'une incarnation, n'est PAS le compte incarné (le cookie d'état, lui, survit à côté). */
function currentState(): ImpersonationState | null {
  return isTabDemo() ? null : readImpersonationState()
}

/** SIMON-FIX — la hauteur du bandeau (fixe, au-dessus de tout), lue par la fenêtre partagée `Dialog`
 *  (`packages/ui/src/components/dialog.tsx`) pour se poser SOUS lui : le titre des modales passait dessous. */
const BANNER_HEIGHT_VAR = '--impersonation-banner-height'

/**
 * Persistent, app-wide impersonation UI. Two responsibilities:
 *
 *  1. CONSUME — when the operator lands with `#imp_token=…` in the URL fragment
 *     (opened from the backoffice), exchange it for the HttpOnly session cookie,
 *     scrub the fragment from the URL immediately, then reload as the impersonated
 *     user. The token never touches storage and never reaches a server log.
 *
 *  2. BANNER — whenever an impersonation session is active (the JS-readable
 *     `imp_state` cookie is present), show a loud, fixed warning bar identifying
 *     the impersonated user with a one-click "Quitter" that ends the session.
 */
export function ImpersonationBanner() {
  const { t } = useTranslation('impersonation')
  const [state, setState] = useState<ImpersonationState | null>(currentState)
  const [consuming, setConsuming] = useState(false)
  const [exiting, setExiting] = useState(false)

  const bannerRef = useRef<HTMLDivElement>(null)
  const showing = consuming || state !== null
  // SIMON-FIX — publie la hauteur réelle du bandeau tant qu'il est affiché, la retire ensuite.
  useEffect(() => {
    const root = document.documentElement
    const element = bannerRef.current
    if (!showing || !element) return
    const publish = () => root.style.setProperty(BANNER_HEIGHT_VAR, `${Math.ceil(element.offsetHeight)}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(BANNER_HEIGHT_VAR)
    }
  }, [showing])

  // #4608.3 — relit l'état quand l'onglet entre/sort de la démo ou revient (retour arrière, onglet réactivé).
  useEffect(() => {
    const refresh = () => setState(currentState())
    window.addEventListener(TAB_DEMO_CHANGED_EVENT, refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(TAB_DEMO_CHANGED_EVENT, refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  // (1) Consume a token arriving in the URL fragment.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash.startsWith(TOKEN_HASH_PREFIX)) return

    const token = decodeURIComponent(hash.slice(TOKEN_HASH_PREFIX.length))
    // Scrub the fragment from the address bar right away — before any network.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (!token) return

    setConsuming(true)
    void consumeImpersonationToken(token).then(ok => {
      if (ok) {
        // Reboot the SPA as the impersonated user (cookies are now set).
        window.location.replace('/')
      } else {
        setConsuming(false)
      }
    })
  }, [])

  async function exit() {
    setExiting(true)
    await stopImpersonation()
    // Leave the impersonated session cleanly — back to the login screen.
    window.location.replace('/login')
  }

  if (consuming) {
    return (
      <div ref={bannerRef} className={FIXED} aria-live="polite">
        <Banner layout="app" tone="danger" icon={ShieldAlert}>
          {t('starting')}
        </Banner>
      </div>
    )
  }

  if (!state) return null

  return (
    <div ref={bannerRef} className={FIXED}>
      <Banner
        layout="app"
        tone="danger"
        icon={ShieldAlert}
        role="alert"
        title={`${t('banner.prefix')} ${state.email}`}
        actions={
          <button type="button" onClick={exit} disabled={exiting} className={bannerActionClassName('danger')}>
            {exiting ? t('banner.exiting') : t('banner.exit')}
          </button>
        }
      >
        {`${t('banner.readOnly')}${state.by ? ` · ${t('banner.by', { admin: state.by })}` : ''}`}
      </Banner>
    </div>
  )
}

/** Fixe, au-dessus de tout : la hauteur est publiée dans `--impersonation-banner-height` (voir plus haut).
 *  Le fond de page sous la carte : le contenu ne transparaît pas dans la gouttière. */
const FIXED = 'fixed inset-x-0 top-0 z-[9999] bg-[var(--bellum-bg)] pb-3'
