import { Badge, Button, Text } from '@bellum/ui'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Loader2, LogIn } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { workspaceRoleLabels, type AcceptWorkspaceInvitationResult } from '@bellum/contracts'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { useSession } from '@/lib/hooks/use-session'
import { teamApi } from '@/features/team/api'
import { PENDING_INVITATION_KEY } from '@/features/team/pending-invitation'
import { landingRouteNow } from '@/features/preferences/preferences-provider'

type Status =
  | { kind: 'need_auth' }
  | { kind: 'accepting' }
  | { kind: 'success'; result: AcceptWorkspaceInvitationResult }
  | { kind: 'error'; message: string }

/**
 * Le libellé d'un rôle vient du CONTRAT, pas d'une liste recopiée ici.
 *
 * Cet écran portait `['owner', 'admin', 'member']` en dur depuis la version à
 * trois rôles. Les quatre rôles ajoutés par la migration RBAC tombaient donc
 * déjà dans le repli, qui affiche la valeur brute — un membre invité comme
 * `sales_ops` lisait « Vous avez rejoint … en tant que sales_ops ». Deux rôles
 * de plus auraient élargi le trou sans que rien ne le signale.
 */
function roleLabel(role: string): string {
  return workspaceRoleLabels[role as keyof typeof workspaceRoleLabels] ?? role
}

/**
 * Public `/invitation/:token` page. Logged-in → accept immediately. Logged-out →
 * stash the token and route to /login; after auth the user is bounced back here
 * (see `useRedirectAfterAuth`) and the accept fires.
 */
export function AcceptInvitationView() {
  const { t } = useTranslation('team')
  const { token } = useParams({ from: '/invitation/$token' })
  const { user } = useSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>(user ? { kind: 'accepting' } : { kind: 'need_auth' })
  const attempted = useRef(false)

  useEffect(() => {
    if (!user) {
      // Remember the invite so the user lands back here after logging in.
      try {
        localStorage.setItem(PENDING_INVITATION_KEY, token)
      } catch {
        // storage unavailable (private mode) — the login-then-back is best-effort
      }
      setStatus({ kind: 'need_auth' })
      return
    }

    if (attempted.current) return
    attempted.current = true
    setStatus({ kind: 'accepting' })
    teamApi
      .acceptInvitation(token)
      .then(result => {
        try {
          localStorage.removeItem(PENDING_INVITATION_KEY)
        } catch {
          /* ignore */
        }
        setStatus({ kind: 'success', result })
      })
      .catch((error: Error) => setStatus({ kind: 'error', message: error.message || t('accept.error.fallback') }))
  }, [user, token, t])

  // Grammaire `onboarding-accueil` : surtitre + pastille d'état, h1 et phrase hors
  // de la carte ; la carte porte le geste (se connecter, ouvrir l'espace, revenir).
  const heading =
    status.kind === 'need_auth'
      ? { badge: null, title: t('accept.needAuth.title'), lead: t('accept.needAuth.description') }
      : status.kind === 'accepting'
        ? {
            badge: <Badge variant="info">{t('accept.badge.accepting')}</Badge>,
            title: t('accept.accepting.title'),
            lead: t('accept.accepting.description'),
          }
        : status.kind === 'success'
          ? {
              badge: <Badge variant="success">{t('accept.badge.success')}</Badge>,
              title: t('accept.success.title', { workspaceName: status.result.workspaceName }),
              lead: t('accept.success.description', { role: roleLabel(status.result.role) }),
            }
          : {
              badge: <Badge variant="danger">{t('accept.badge.error')}</Badge>,
              title: t('accept.error.title'),
              lead: status.message,
            }

  return (
    <AccessShell kicker={t('accept.kicker')} status={heading.badge} title={heading.title} lead={heading.lead}>
      <div className="w-full max-w-md">
        {status.kind === 'need_auth' && (
          <div className="space-y-5">
            <Button variant="violet" icon={LogIn} className="w-full" onClick={() => navigate({ to: '/login' })}>
              {t('accept.needAuth.login')}
            </Button>
            <Text
              size="sm"
              color="text-[var(--bellum-text-secondary)]"
              className="border-t border-[var(--bellum-border)] pt-4"
            >
              {t('accept.needAuth.noAccount')}{' '}
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-medium text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
                onClick={() => navigate({ to: '/signup' })}
              >
                {t('accept.needAuth.signup')}
              </button>
            </Text>
          </div>
        )}

        {status.kind === 'accepting' && (
          <div role="status" className="flex items-center gap-3 text-sm text-[var(--bellum-text-secondary)]">
            <Loader2 className="size-5 animate-spin text-[var(--bellum-text-accent)]" aria-hidden />
            {t('accept.accepting.title')}
          </div>
        )}

        {status.kind === 'success' && (
          <Button
            variant="violet"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate({ to: landingRouteNow() })}
          >
            {t('accept.success.cta')}
          </Button>
        )}

        {status.kind === 'error' && (
          <Button variant="outline" icon={ArrowLeft} onClick={() => navigate({ to: landingRouteNow() })}>
            {t('accept.error.back')}
          </Button>
        )}
      </div>
    </AccessShell>
  )
}
