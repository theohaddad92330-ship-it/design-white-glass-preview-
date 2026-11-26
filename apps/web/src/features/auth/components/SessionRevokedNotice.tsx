import { MAX_ACTIVE_DEVICES } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { sessionManager } from '../session-manager'

function subscribe(listener: () => void): () => void {
  return sessionManager.subscribe(listener)
}

const PUBLIC_PREFIXES = ['/demo', '/login', '/signup', '/welcome', '/auth', '/verify-email']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

function isRevoked(): boolean {
  return sessionManager.getState().sessionRevoked
}

/**
 * R15-7 (15/09/2026) — UN APPAREIL RÉVOQUÉ LE DIT.
 *
 * Constaté en production : l'onglet Chrome de Louis a été révoqué dès qu'il
 * s'est connecté sur son téléphone (plafond d'appareils), et il n'a RIEN dit —
 * coquille vide, `/accounts` renvoyé vers `/chat` sans données, aucune
 * invitation à se reconnecter.
 *
 * L'avis est BLOQUANT (rien derrière n'a plus de données à montrer), il dit
 * pourquoi, et son seul geste mène à la connexion. Le chiffre vient de
 * `MAX_ACTIVE_DEVICES`, la constante que l'API applique — jamais écrit en dur.
 * Il nomme aussi l'autre cause possible (déconnecté depuis un autre appareil) :
 * la même 401 couvre les deux, et affirmer l'une seule serait faux une fois sur deux.
 */
export function SessionRevokedNotice() {
  const revoked = useSyncExternalStore(subscribe, isRevoked, isRevoked)
  const navigate = useNavigate()
  const pathname = useRouterState({ select: s => s.location.pathname })
  const { t } = useTranslation('auth', { keyPrefix: 'sessionRevoked' })

  // 29/09/2026 — jamais sur une route PUBLIQUE : un prospect sur `/demo/acces`
  // (ou quelqu'un sur `/login`) n'a rien à « retrouver », et l'avis bloquant
  // rendait le formulaire d'entrée en démo inutilisable.
  if (!revoked || isPublicRoute(pathname)) return null

  const signBackIn = () => {
    sessionManager.acknowledgeRevocation()
    void navigate({ to: '/login', replace: true })
  }

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-revoked-title"
        aria-describedby="session-revoked-body"
        className="w-full max-w-md rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6 shadow-xl"
      >
        <h2 id="session-revoked-title" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('title')}
        </h2>
        <p id="session-revoked-body" className="mt-2 text-sm text-[var(--bellum-text-secondary)]">
          {t('body', { count: MAX_ACTIVE_DEVICES })}
        </p>
        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={signBackIn}>
            {t('cta')}
          </Button>
        </div>
      </div>
    </div>
  )
}
