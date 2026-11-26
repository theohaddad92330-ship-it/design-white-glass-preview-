import { ArrowRight, Contact, FileSearch, Loader2, RotateCw, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '@bellum/ui'
import { AccessShell } from '@/features/auth/components/AccessShell'
import { AuthBrandingPanel } from '@/features/auth/components/AuthBrandingPanel'
import { clearVolatileUserState } from '@/features/auth/clear-client-user-state'
import { forgetTabDemoFlag, isTabDemo, markTabAsDemo } from '@/features/auth/demo-tab'
import { rememberPreDemoIdentity } from '@/features/auth/pre-demo-identity'
import { rememberTabIdentity } from '@/features/auth/tab-identity'
import { demoApi } from '@/features/demo/api'
import { withDemoProfile, type DemoProfile } from '@/features/demo/demo-profile'
import { DemoTimeoutError } from '@/features/demo/demo-timeout'
import { track } from '@/lib/analytics'
import { ApiError } from '@/lib/api-error'
import { clearPersistedQueryCache } from '@/lib/cache/idb/tanstack-persister'

/** #3483.4 — au-delà, le semis est dit « encore en cours » : 50 s sans un mot se lisent comme un blocage. */
const SLOW_PREPARING_MS = 8000

type FailureReason = 'refused' | 'unavailable' | 'timeout'

type State = { status: 'intro' } | { status: 'preparing' } | { status: 'failed'; reason: FailureReason }

/**
 * Landing page of the SHARED demo link. The visitor arrives on a plain URL
 * (`/demo`) with no account and no session — that is the whole point: one link
 * to paste in a message, nothing to copy alongside it.
 *
 * `token` is only there for an environment locked with `DEMO_LINK_TOKEN`
 * (`/demo?t=…`); the normal link carries none, and the API decides.
 *
 * The page OPENS ON AN EXPLANATION, not on a redemption. Two reasons, both
 * learned the hard way:
 *  - a prospect who clicks a link in a message needs to know where they landed
 *    (fictional companies, product shipping in September) before judging what
 *    they see;
 *  - redeeming on load means every link *preview* — Slack, LinkedIn, a mail
 *    scanner following URLs — leases and wipes a room of the bounded pool.
 * So the redemption happens on the visitor's click, and only then.
 *
 * On success we do a FULL page load rather than a client navigation — the app
 * boots exactly as it does for a returning user (reads the sentinel cookie,
 * hydrates the session, loads credits), instead of relying on this page to seed
 * the client state correctly.
 */
export function DemoEntryPage({ token }: { token?: string }) {
  const { t } = useTranslation('common')
  const [state, setState] = useState<State>({ status: 'intro' })
  // Two redemptions would wipe the space out from under the first one, so a
  // double click must not start a second one.
  const running = useRef(false)
  // #4291 J — la démo choisie (forfait / conseil, ou staffing si absent) : « Réessayer » relance la MÊME.
  const chosen = useRef<DemoProfile | undefined>(undefined)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (state.status !== 'preparing') {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), SLOW_PREPARING_MS)
    return () => clearTimeout(timer)
  }, [state.status])

  /**
   * #2705 — « Lancer la démo » n'appelle plus `demoApi.redeem` directement.
   * `leadTouch()` regarde d'abord si le cookie `bellum_did` porte déjà un
   * lead (un visiteur qui revient, #2705.6) : si oui, on entre exactement
   * comme avant ; sinon on route vers le formulaire obligatoire — jamais la
   * démo sans savoir qui est ce visiteur.
   */
  function start(profile?: DemoProfile) {
    if (running.current) return
    running.current = true
    chosen.current = profile
    setState({ status: 'preparing' })
    // Le seul chiffre qui dit si le lien collé dans un message fait effet :
    // combien de visiteurs ouvrent vraiment la démo. No-op sans mesure d'audience.
    track('demo_started')

    demoApi
      .leadTouch()
      .then(touch => {
        if (touch.found) return enterDemo(profile)
        goToAccessForm(profile)
      })
      .catch(() => {
        // Le cookie n'a pas pu être vérifié (réseau) : on préfère montrer le
        // formulaire plutôt que risquer une entrée anonyme non tracée.
        goToAccessForm(profile)
      })
  }

  /** Le `?t=` (environnement verrouillé) et les UTM éventuels de CETTE page
   *  survivent tels quels — c'est la query entière qui est reportée, jamais
   *  reconstruite champ par champ (#2705.7). */
  function goToAccessForm(profile?: DemoProfile) {
    window.location.assign(`/demo/acces${withDemoProfile(window.location.search, profile)}`)
  }

  function enterDemo(profile?: DemoProfile) {
    // 29/09/2026 — marqué démo DÈS l'attente (le semis dure plus d'une minute) :
    // une 401 pendant ce temps revient sur `/demo/acces`, jamais vers `/login`.
    const wasDemoTab = isTabDemo()
    // #4608 — la session réelle de cet onglet est gardée pour la sortie de la démo.
    if (!wasDemoTab) rememberPreDemoIdentity()
    markTabAsDemo()
    // #4291 J — même jeton, même durée de vie, même sortie : seule la salle louée change.
    const redeemed = profile ? demoApi.redeem(token, { profile }) : demoApi.redeem(token)
    redeemed
      .then(async session => {
        // CET onglet devient l'onglet de la démonstration, et il le restera même
        // si un vrai compte est ouvert à côté. Sans ce marquage, le navigateur
        // porte deux cookies de session et le serveur lisait le premier venu :
        // l'onglet de démonstration se mettait à afficher de vrais dossiers, ou
        // l'inverse en pleine présentation (DEMO-01). `sessionStorage` survit au
        // chargement complet qui suit, et ne franchit jamais la frontière de
        // l'onglet.
        rememberTabIdentity(session?.user?.id)
        // Constat 27/09/2026 — même raison que `useDemoAccessForm.ts` : une
        // session perdue plus tard doit revenir ici, jamais vers `/login`.
        markTabAsDemo()
        // #3788.6 — recette prod 08/10 : un navigateur portant déjà une
        // session RÉELLE (onglet jamais marqué démo avant ce clic) gardait le
        // scroll infini des comptes et des contacts de ce compte réel dans
        // `useAccountsStore`/`useContactsStore` — persisté en localStorage,
        // donc HORS de portée du cache react-query et de l'identité d'onglet.
        // Le rechargement qui suit affichait alors les dossiers RÉELS sous le
        // bandeau MODE DÉMO, le temps que le scroll infini les réécrive —
        // jamais pour /projects ou /missions, qui résolvent leurs comptes
        // CONTRE ce même cache périmé et échouaient. `clearVolatileUserState`
        // (déjà le mécanisme du changement d'espace, `useWorkspaces.ts`) vide
        // ce cache AVANT le rechargement ; `clearPersistedQueryCache` reste à
        // côté pour l'instantané IndexedDB scopé à CETTE identité (#3068).
        clearVolatileUserState()
        if (session?.user?.id) await clearPersistedQueryCache(session.user.id)
        window.location.replace('/')
      })
      .catch((error: unknown) => {
        if (!wasDemoTab) forgetTabDemoFlag()
        running.current = false
        setState({ status: 'failed', reason: failureReason(error) })
      })
  }

  const highlights = [
    { icon: FileSearch, key: 'accounts' },
    { icon: Contact, key: 'contacts' },
    { icon: Send, key: 'actions' },
  ] as const

  // Maquette `demo.html` (#demo-intro … #demo-trop-long), dans la grammaire de
  // `onboarding-accueil` : surtitre + pastille d'état teintée, h1 et phrase
  // HORS de la carte ; la carte porte la liste et les gestes.
  const heading =
    state.status === 'intro'
      ? {
          status: <Badge variant="warning">{t('demo.entry.badge.demo')}</Badge>,
          title: t('demo.entry.introTitle'),
          lead: t('demo.entry.introBody'),
        }
      : state.status === 'preparing'
        ? {
            status: (
              <Badge variant={slow ? 'warning' : 'info'}>
                {t(slow ? 'demo.entry.badge.slow' : 'demo.entry.badge.preparing')}
              </Badge>
            ),
            title: t('demo.entry.preparingTitle'),
            lead: t('demo.entry.preparingBody'),
          }
        : {
            status: (
              <Badge variant={state.reason === 'refused' ? 'danger' : 'warning'}>
                {t(`demo.entry.badge.${state.reason}`)}
              </Badge>
            ),
            title: t(`demo.entry.${state.reason}Title`),
            lead: t(`demo.entry.${state.reason}Body`),
          }

  // Inscription démo : la page défile (retour prospect 29/09)
  return (
    <AccessShell
      kicker={t('demo.entry.kicker')}
      status={heading.status}
      title={heading.title}
      lead={heading.lead}
      aside={state.status === 'intro' ? <AuthBrandingPanel /> : undefined}
    >
      <div className="w-full max-w-md">
        {state.status === 'intro' ? (
          <div>
            <ul className="divide-y divide-[var(--bellum-border)] rounded-card border border-[var(--bellum-border)]">
              {highlights.map(({ icon: Icon, key }) => (
                <li key={key} className="flex items-start gap-3 px-4 py-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                  <span className="text-sm text-[var(--bellum-text-secondary)]">
                    {t(`demo.entry.highlights.${key}`)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <Button variant="violet" fullWidth icon={ArrowRight} iconPosition="right" onClick={() => start()}>
                {t('demo.entry.start')}
              </Button>
              {/* #4291 J — le second espace démo, au profil forfait / conseil (#4270). */}
              <Button variant="outline" fullWidth onClick={() => start('forfait_conseil')}>
                {t('demo.entry.startForfait')}
              </Button>
              <p className="text-xs text-[var(--bellum-text-secondary)]">{t('demo.entry.startForfaitHint')}</p>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-5">
              <p className="text-xs text-[var(--bellum-text-muted)]">{t('demo.entry.introFootnote')}</p>
              <a
                href="/login"
                className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
              >
                {t('demo.entry.backToLogin')}
              </a>
            </div>
          </div>
        ) : state.status === 'preparing' ? (
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 shrink-0 animate-spin text-[var(--bellum-text-accent)]" aria-hidden />
            <p className="text-sm text-[var(--bellum-text-secondary)]">
              {slow ? (
                <span data-testid="demo-preparing-slow">{t('demo.entry.preparingSlow')}</span>
              ) : (
                t('demo.entry.preparingStay')
              )}
            </p>
            <span role="status" className="sr-only">
              {t('demo.entry.preparingTitle')}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="violet" icon={RotateCw} onClick={() => start(chosen.current)}>
              {t('demo.entry.retry')}
            </Button>
            <a
              href="/login"
              className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
            >
              {t('demo.entry.backToLogin')}
            </a>
          </div>
        )}
      </div>
    </AccessShell>
  )
}

/**
 * Tells "this link is not valid" apart from "our side is down right now".
 *
 * Only an explicit rejection of the credential (401/403) is the link's fault.
 * Everything else — 5xx, a network error, and NOTABLY 404 — is ours: the API
 * answers 404 both when the demo isn't configured on this deployment and, at
 * the Railway edge, when the API host is down entirely. Blaming the link there
 * told a prospect "expired link" while the link was fine (prod, 31/07/2026).
 */
function failureReason(error: unknown): FailureReason {
  if (error instanceof DemoTimeoutError) return 'timeout'
  if (!(error instanceof ApiError)) return 'unavailable'
  return error.status === 401 || error.status === 403 ? 'refused' : 'unavailable'
}
