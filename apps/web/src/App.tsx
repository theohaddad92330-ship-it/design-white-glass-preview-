import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AnalyticsConsentGate } from '@bellum/consent/react'
import { TooltipProvider } from '@bellum/ui'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from '@tanstack/react-router'
import { memo, Suspense, lazy } from 'react'
import { I18nextProvider } from 'react-i18next'
import { Toaster } from 'sonner'
import { i18n } from './i18n'
import { CrashPage } from './components/organisms/crash-page'
import { GlobalLoadingState } from './components/GlobalLoadingState'
import { SentryUserContext } from './components/SentryUserContext'
import { WorkspaceLexiconGate } from './features/lexicon/WorkspaceLexiconGate'
import { UpdateHandler } from './components/UpdateHandler'
import { DevToolbarWrapper } from './components/DevToolbarWrapper'
import {
  ContactEngagementPanelHost,
  ContactEngagementProvider,
} from './features/accounts/view/account-detail/components/contact-engagement/ContactEngagementProvider'
import { ReflagProvider } from './features/reflag/ReflagProvider'
import { SessionProvider } from './features/auth/session-provider'
import { BannerBar } from './features/banners/BannerBar'
import { SubscribePromoBanner } from './features/billing/components/SubscribePromoBanner'
import { CheckoutReturnBanner } from './features/billing/components/CheckoutReturnBanner'
import { ThemeProvider } from './features/theme/theme-provider'
import { PreferencesProvider } from './features/preferences/preferences-provider'
import { queryClient } from './lib/query-client'
import { createIndexedDbPersister } from './lib/cache/idb/tanstack-persister'
import { router } from './router'
import { isDevEnvironment } from '@bellum/utils'
import { BrandProvider } from '@/features/brand/BrandProvider'

const isDev: boolean = isDevEnvironment()

// Lazy-load devtools only in development to exclude them from production bundle
const ReactQueryDevtools = isDev
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then(m => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : () => null
const TanStackRouterDevtools = isDev
  ? lazy(() =>
      import('@tanstack/react-router-devtools').then(m => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : () => null

/**
 * Provider shell for the whole app.
 *
 * Order: ErrorBoundary → QueryClientProvider → SessionProvider (gates on
 * session hydration) → Suspense → (SentryUserContext, Toaster, RouterProvider).
 */
export const App = memo(function App() {
  return (
    <Sentry.ErrorBoundary fallback={<CrashPage />}>
      <I18nextProvider i18n={i18n}>
        {/* `buster` = l'identifiant de build.
         *
         * Le cache de requêtes est PERSISTÉ dans IndexedDB, donc il survit aux
         * déploiements. Sans casseur, une réponse mise en cache par une version
         * précédente est rendue par la nouvelle : le jour où une réponse gagne un
         * champ que l'écran lit sans le protéger, chaque utilisateur DÉJÀ VENU voit
         * une page blanche, et seul un vidage manuel du navigateur la répare.
         *
         * C'est arrivé le 17/08 sur « Ma journée » : le brief a gagné son bloc
         * Tâches, et l'écran lisait `data.tasks.state` sur une réponse d'avant.
         * Changer le casseur à chaque build fait repartir le cache à neuf — le
         * réseau refait une requête, et la donnée fraîche a la forme du code qui la
         * lit. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: createIndexedDbPersister(), buster: __CODE_VERSION_ID__ }}
        >
          <ThemeProvider>
            <PreferencesProvider>
              <TooltipProvider delayDuration={300}>
                <SessionProvider>
                  {/* Inside SessionProvider: the flag context needs the
                      hydrated user and their workspace. */}
                  {/* La MARQUE, sous la session et au-dessus de tout le reste
                      (marque blanche, 01/09/2026). Sous la session parce qu'un
                      utilisateur membre de plusieurs espaces doit voir la marque
                      de celui qu'il a CHOISI ; au-dessus de tout le reste parce
                      que l'entête, la bulle du copilote et le titre de l'onglet
                      la lisent tous. Sans espace connecté elle se rabat sur
                      l'hôte, ce qui est le cas de l'écran de connexion. */}
                  <BrandProvider>
                    <ReflagProvider>
                      <DevToolbarWrapper />
                      <div id="app-shell" className="flex flex-col">
                        <ContactEngagementProvider>
                          {/* Incitation à l'abonnement AU-DESSUS des bandeaux
                          opérateur : visible sur tout l'app pour les seuls paliers
                          non durables (essai / Découverte), rien pour un payant. */}
                          <SubscribePromoBanner />
                          {/* Le retour de la page de paiement (#2003.23, #2004.16).
                          ICI et pas sur /billing : la caisse renvoie sur la
                          facturation, mais `SettingsPage` réexpédie vers
                          l'onboarding tant que le questionnaire n'est pas fini —
                          c'est-à-dire exactement l'état de celui qui vient de
                          s'inscrire et de payer. Monté à la racine, le bandeau
                          lit le retour AVANT que l'URL change. Aucun retour à
                          annoncer = aucun rendu. */}
                          <CheckoutReturnBanner />
                          {/* #4463 — l'alerte « bientôt à court de crédits » est retirée : plus aucun chiffre côté client. */}
                          {/* Persistent top-of-screen banner bar (shrink-0, pushes
                          the app content down). Outside Suspense so it shows
                          immediately; renders nothing when there is no active
                          banner, so it never affects layout. */}
                          <BannerBar />
                          <div className="relative flex min-h-0 flex-1 flex-col">
                            <Suspense fallback={<GlobalLoadingState />}>
                              <SentryUserContext />
                              {/* Le lexique de l'espace (D17) : les mots de
                                l'équipe posés sur les libellés d'objet. Ne rend
                                rien, et ne fait rien du tout quand l'espace n'a
                                posé aucun terme. */}
                              <WorkspaceLexiconGate />
                              <Toaster
                                position="bottom-right"
                                /* #1119 — « soit on peut cliquer dessus avec une croix et ça ferme,
                                 soit ça disparaît tout seul ». Les deux : chaque toast porte sa
                                 croix, et ceux qui remplacent un chargement redonnent leur durée
                                 (voir `lib/toast-duration.ts` — sonner conserve l'infini du
                                 chargement quand on met à jour par `id`). */
                                closeButton
                                toastOptions={{
                                  style: {
                                    background: 'var(--bellum-surface-1)',
                                    border: '1px solid var(--bellum-border)',
                                    color: 'var(--bellum-text-primary)',
                                  },
                                }}
                              />
                              <UpdateHandler>
                                <RouterProvider router={router} />
                              </UpdateHandler>
                              <ContactEngagementPanelHost />
                              <TanStackRouterDevtools router={router} initialIsOpen={false} position="top-left" />
                            </Suspense>
                          </div>
                        </ContactEngagementProvider>
                      </div>
                    </ReflagProvider>
                  </BrandProvider>
                </SessionProvider>
              </TooltipProvider>
            </PreferencesProvider>
          </ThemeProvider>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-right" />
        </PersistQueryClientProvider>
      </I18nextProvider>
      {/*
        Mesure d'audience ET mesure des performances de chargement — derrière le
        consentement, et derrière lui SEULEMENT. Le choix est porté par un cookie
        de `.bellum-ai.com`, donc la réponse donnée sur le site est lue ici. Sans
        réponse : rien ne se charge, ni script ni requête.

        Les DEUX sont dans la même porte. C'est ce que la garde GA-46 exige, et
        c'est ce qu'elle a un temps refusé : sa première version cherchait le
        motif « la porte, un seul enfant, la porte », si bien qu'ajouter ici un
        second traceur légitime la faisait rougir sur le premier. Elle compte
        désormais les balises À L'INTÉRIEUR du bloc — voir le pourquoi dans
        `src/architecture/analytics-behind-consent.test.ts`.
      */}
      <AnalyticsConsentGate>
        <Analytics />
        <SpeedInsights />
      </AnalyticsConsentGate>
    </Sentry.ErrorBoundary>
  )
})
