import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { TooltipProvider } from '@bellum/ui'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/features/theme/theme-provider'
import { PreferencesProvider } from '@/features/preferences/preferences-provider'

/**
 * #2593 — LA PORTE DES RÉGLAGES TOMBAIT AU CHARGEMENT DIRECT, POUR LA
 * QUATRIÈME FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 18/09/2026 sur `7b9083854`
 * ─────────────────────────────────────────────────────────────────────────
 * `/settings` et `/integrations`, ouverts en PREMIÈRE navigation de l'onglet
 * (lien, favori, rechargement) : `Error: useSidebar must be used within a
 * SidebarProvider.` — alors que les DEUX écrans s'affichent sans erreur en y
 * arrivant PAR LE MENU depuis `/chat`, sans rechargement.
 *
 * La cause : `SidebarProvider` n'est monté par le gabarit applicatif qu'après
 * un premier rendu réussi d'une route qui le porte. Le composant fautif
 * (`SidebarMenuButton`, dans `packages/ui`) appelait `useSidebar()` — la
 * version STRICTE, qui lève hors fournisseur — inconditionnellement. Trois
 * appelants de la même famille avaient déjà été corrigés avant lui (voir
 * `packages/ui/src/components/sidebar.tsx` et
 * `apps/web/src/components/sidebar/SidebarCollapseToggle.tsx:22-31`) : ce
 * défaut REVIENT par un nouvel appelant à chaque fois, jamais par le même.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE FAIT DIFFÉREMMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Les trois correctifs précédents ont chacun réparé UN appelant nommé — cette
 * garde-ci ne nomme AUCUNE route. Elle LIT la liste des routes de premier
 * niveau dans `routeTree.gen.ts` (jamais une liste écrite à la main, comme
 * GA-277 le fait déjà pour un autre corpus) et monte CHACUNE, seule, en
 * chargement direct — exactement le geste qui a fait tomber `/settings` et
 * `/integrations` en production. Une vingt-troisième route ajoutée au routeur
 * entre automatiquement dans ce corpus, sans qu'on y pense.
 *
 * Les routes PUBLIQUES (`/login`, `/signup`, `/demo`, `/welcome`…) sont hors
 * corpus à dessein : elles ne portent aucune coquille applicative (pas de
 * `SidebarProvider` à monter), donc pas exposées à cette famille de défaut —
 * les inclure ferait de cette garde une garde de la session, pas de la
 * coquille.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE MONTE VRAIMENT, ET POURQUOI CE N'EST PAS TOUTES LES
 * ROUTES
 * ─────────────────────────────────────────────────────────────────────────
 * Monter chaque route de premier niveau pour de VRAI (routeur réel, données
 * réelles) suppose de doubler CHAQUE hook métier qu'elle appelle — sans quoi
 * `fetch`, réduit au double générique de `setup.ts` (`{}` pour toute
 * requête), rend des formes que le code n'attend pas (`signals.map`,
 * `sectors.map`… ne sont pas des tableaux) et fait tomber l'écran pour une
 * raison qui n'a RIEN à voir avec #2593. Doubler les ~25 hooks métier du
 * dépôt appartiendrait à un autre chantier.
 *
 * Le corpus RÉELLEMENT monté ici est donc dérivé — jamais énuméré à la main —
 * de la seule chose que #2593 vise : la coquille `SettingsPage`
 * (`apps/web/src/components/page/SettingsPage.tsx`), celle qui a RÉELLEMENT
 * crashé en production. `routesUsingTheVulnerableShell` lit le SOURCE de
 * chaque route de premier niveau et retient celles qui rendent cette coquille
 * — `/settings/`, `/integrations/`, `/billing/` aujourd'hui, n'importe quelle
 * future route de ce type demain (Réglages en ouvre régulièrement, voir
 * `SETTINGS_SECTIONS`) : c'est ELLE, la vingt-troisième route protégée, pas
 * une route au hasard qui n'a jamais touché cette coquille.
 *
 * La garde STRUCTURELLE, elle, n'a pas cette limite : `packages/ui/src/
 * components/sidebar.no-unsafe-usesidebar.test.ts` lit TOUT `packages/ui` et
 * refuse tout appel `useSidebar()` non filtré, quel que soit le composant ou
 * la route qui l'appellerait — la vraie protection générale de #2593.
 */

const ROUTE_TREE = join(__dirname, '..', 'routeTree.gen.ts')
const ROUTES_DIR = join(__dirname, '..', 'routes')

/**
 * Les routes-INDEX de premier niveau (`/settings/`, `/chat/`, `/pilotage/`…) :
 * un seul segment, un slash de fin, jamais de `$paramètre`. C'est exactement
 * le corpus des écrans que la barre latérale principale ouvre — la même forme
 * que `/settings/` dans l'arbre généré, jamais une route enfant ni un détail.
 */
function firstLevelAppRoutes(): string[] {
  const tree = readFileSync(ROUTE_TREE, 'utf8')
  const start = tree.indexOf('export interface FileRoutesByFullPath {')
  const end = tree.indexOf('\n}', start)
  const block = tree.slice(start, end)
  const paths = [...block.matchAll(/^\s+'([^']+)':/gm)].map(match => match[1])
  return paths.filter(path => /^\/[a-z-]+\/$/.test(path)).sort()
}

/** Le fichier source d'une route index (`/settings/` → `routes/settings/
 *  index.tsx`), ou `null` — même motif que `nested-route-parent-renders-
 *  outlet.test.ts`. */
function routeSourceFile(path: string): string | null {
  const rel = path.replace(/^\//, '').replace(/\/$/, '')
  for (const candidate of [`${rel}.tsx`, join(rel, 'index.tsx'), join(rel, 'route.tsx')]) {
    try {
      readFileSync(join(ROUTES_DIR, candidate), 'utf8')
      return join(ROUTES_DIR, candidate)
    } catch {
      /* le candidat suivant */
    }
  }
  return null
}

/** Les routes de `routes` dont le SOURCE rend `SettingsPage` — la coquille qui
 *  a RÉELLEMENT crashé en production pour #2593. */
function routesUsingTheVulnerableShell(routes: string[]): string[] {
  return routes.filter(path => {
    const file = routeSourceFile(path)
    return file !== null && readFileSync(file, 'utf8').includes('SettingsPage')
  })
}

/** Un témoin CONNU pour ne pas passer par `SettingsPage` (coquille
 *  `CustomerPage`/`MenuLayout`, toujours pourvue d'un `SidebarProvider`) —
 *  prouve que la garde ne crie pas sur tout, seulement sur la coquille
 *  fautive (« n'attrape pas ce qu'elle ne vise pas »). */
const CONTROL_ROUTE = '/pilotage/'

// ─────────────────────────────────────────────────────────────────────────
// Le double de session : un compte connecté, sans passer par le vrai
// `SessionProvider` (localStorage + un appel réseau `session()`). Le même
// motif que `chat-nav-route.integration.test.tsx`, qui monte déjà le routeur
// COMPLET de la même façon.
// ─────────────────────────────────────────────────────────────────────────
vi.mock('@/features/auth/session-provider', async () => {
  const { SessionContext } = await import('@/features/auth/session-context')
  return {
    SessionProvider: ({ children }: { children: ReactNode }) =>
      createElement(
        SessionContext.Provider,
        {
          value: {
            user: { id: 'u1', email: 'sales@esn.fr', created_at: '2026-01-01T00:00:00Z', roles: [] },
            loading: false,
          },
        },
        children,
      ),
  }
})
// Monté au root pour TOUTES les routes — ce test ne mesure pas la tâche de
// fond du contexte profil.
vi.mock('@/features/profile-context/hooks/useProfileContextBackgroundTask', () => ({
  useProfileContextBackgroundTask: () => undefined,
}))
// jsdom n'a pas d'IndexedDB — le cache de requêtes persisté (lu par `NavUser`,
// monté sur la plupart des coquilles) lèverait sans filet.
vi.mock('@/lib/cache/idb/query-snapshots', () => ({
  toSnapshotKey: (queryKey: readonly unknown[]) => JSON.stringify(queryKey),
  getQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  saveQuerySnapshot: vi.fn().mockResolvedValue(undefined),
  useHydrateFromSnapshot: () => undefined,
}))
// Onboarding terminé : sinon `SettingsPage` (et d'autres coquilles) renvoient
// vers `/onboarding`, ce que ce test ne mesure pas non plus.
vi.mock('@/features/profiles/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ needsOnboarding: false, isLoading: false }),
}))
// ⚠️ SANS ce double, `useTeam()` reste `undefined` le temps du premier rendu
// (la requête réseau simulée n'a pas encore résolu), puis se résout vers `{}` —
// un objet VRAI mais sans `workspace`. `SettingsNavbarBody` lit alors
// `team.workspace.role` et lève « Cannot read properties of undefined »,
// un DEUXIÈME crash, sans rapport avec #2593, qui masquerait le premier une
// fois `waitFor` écoulé. Un compte réel a toujours un espace de travail.
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { members: [], workspace: { role: 'member' } }, isLoading: false, isError: false }),
  // Un `vi.mock` remplace le module ENTIER : sans ce ré-export, tout
  // consommateur direct de `TEAM_KEY` (le cockpit, entre autres) lit
  // `undefined` et lève — la vraie valeur, pour qu'elle ne mente pas.
  TEAM_KEY: ['workspace-team'] as const,
}))
// ⚠️ Même famille que `useTeam` ci-dessus, sur `/integrations/` : le double
// générique de `fetch` (`{}`) n'est pas un TABLEAU, et `IntegrationCenterPage`
// appelle `registry.data.map(...)`. Sans ce double, le crash mesuré n'a rien
// à voir avec #2593 (`connectors.ts:179`, « registry.map is not a function »).
vi.mock('@/features/integration-center/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/integration-center/api')>()
  return { ...actual, useToolRegistry: () => ({ data: [], isLoading: false, isError: false }) }
})
// ⚠️ Même famille, sur `/dashboard/` (le témoin) : `usePersonalCockpit` sait
// se replier sur un cockpit VIDE (`?? EMPTY_PERSONAL_COCKPIT`), mais `{}` ─ le
// double générique de `fetch` ─ est un objet VRAI, donc ce repli ne joue
// jamais, et `PersonalKpiRow` lit `kpis.my_accounts` sur `undefined`.
vi.mock('@/features/dashboard/hooks/usePersonalCockpit', () => ({
  usePersonalCockpit: () => ({
    loading: false,
    error: false,
    data: {
      kpis: { my_accounts: 0, relances_open: 0, relances_overdue: 0, messages_this_week: 0 },
      priorities: [],
      relances: [],
      accounts: [],
      messages: [],
    },
  }),
}))

async function buildRouter(initialPath: string) {
  const { routeTree } = await import('@/routeTree.gen')
  // ⚠️ `RootErrorBoundary` DOIT être posé ici — `chat-nav-route.integration
  // .test.tsx` ne le fait pas, parce qu'il ne teste que des navigations qui
  // réussissent. Sans lui, un routeur de test retombe sur le fallback
  // GÉNÉRIQUE de TanStack (« Something went wrong! », `CatchBoundary.js`) au
  // lieu de la frontière d'erreur RÉELLE de l'application — et cette garde
  // ne verrait jamais rien, quel que soit le crash.
  const { RootErrorBoundary } = await import('@/components/templates/error-boundary')
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPendingMinMs: 0,
    defaultErrorComponent: RootErrorBoundary,
  })
}

function renderRouter(router: Awaited<ReturnType<typeof buildRouter>>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    createElement(
      ThemeProvider,
      null,
      createElement(
        PreferencesProvider,
        null,
        createElement(
          TooltipProvider,
          null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createElement(RouterProvider as any, { router }),
          ),
        ),
      ),
    ),
  )
}

function stubMatchMedia(isNarrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isNarrow,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

// Le budget suit celui de `chat-nav-route.integration.test.tsx` : le coût de
// monter le routeur COMPLET est celui de l'application entière, pas celui
// d'une route.
const ROUTE_MOUNT_TIMEOUT_MS = 60_000

// #2763 (25/09/2026, suite) — le SEUL montage à froid (le `beforeAll`
// ci-dessous) porte un budget PLUS LARGE que chaque montage réel. Mesuré sur
// #2912/#2960 (une PR sur deux) : le coût à froid de 20-40 s documenté au
// `beforeAll` dépassait par endroits les 60 000 ms de `ROUTE_MOUNT_TIMEOUT_MS`
// sous la contention d'un runner CI chargé — un timeout de HOOK (`beforeAll`),
// jamais un montage bloqué, mais assez pour faire échouer une PR sur deux.
// 180 s laisse trois fois la marge mesurée sans toucher aux budgets PAR ROUTE
// (`ROUTE_MOUNT_TIMEOUT_MS`, inchangé) : un vrai montage bloqué continue de
// faire échouer son test en 60 s, ce hook-ci ne fait qu'attendre plus
// longtemps un échauffement qui, lui, se termine toujours.
const BEFORE_ALL_WARMUP_TIMEOUT_MS = 180_000

describe('#2593 — une route de premier niveau survit à son chargement direct', () => {
  // ⚠️ #2763 (24/09/2026) — CE `beforeAll` N'EST PAS un timeout relevé.
  //
  // Mesuré en isolant chaque test par `-t` : QUELLE QUE SOIT LA ROUTE, le
  // PREMIER montage du fichier coûte 20 à 40 s (import dynamique de
  // `routeTree.gen` + transform à la volée par vitest/esbuild de tout le
  // graphe de modules qu'il entraîne), et chaque montage SUIVANT coûte
  // quelques dizaines de ms — le graphe transformé reste en cache process.
  // `/billing/` n'a rien de spécial : c'est la première route par ordre
  // alphabétique dans `routesUsingTheVulnerableShell`, donc celle qui hérite
  // de ce coût au premier test de chaque bloc « largeur ». La v29 a ajouté
  // 142 fichiers / ~4 900 lignes à `apps/web/src` (aucune nouvelle
  // dépendance : `git diff origin/main...HEAD --stat -- pnpm-lock.yaml` est
  // vide) — le graphe à transformer a grossi d'autant, et ce coût, déjà
  // present sur main, a fini par dépasser 60 000 ms sous la contention d'un
  // runner CI (même famille de défaut que celui documenté plus haut dans
  // `vitest.config.ts`, TEST_TIMEOUT_MS).
  //
  // Ce hook paie ce coût UNE fois, hors du budget par route, sur un montage
  // témoin qu'on démonte aussitôt — les budgets `ROUTE_MOUNT_TIMEOUT_MS` des
  // tests réels restent inchangés et continuent de détecter un VRAI montage
  // bloqué.
  //
  // #2763 (25/09/2026) — timeout porté à `BEFORE_ALL_WARMUP_TIMEOUT_MS`
  // (180 s) : un runner CI chargé faisait dépasser les 60 s d'origine à cet
  // échauffement à froid une PR sur deux (#2912, #2960), pas parce que le
  // montage était bloqué.
  beforeAll(async () => {
    stubMatchMedia(false)
    const router = await buildRouter(CONTROL_ROUTE)
    await router.load()
    renderRouter(router)
    await waitFor(() => expect(router.state.status).toBe('idle'))
    cleanup()
  }, BEFORE_ALL_WARMUP_TIMEOUT_MS)

  // ⚠️ PAS de `vi.restoreAllMocks()` ici : les mocks globaux de `setup.ts`
  // (`apiFetch`, `fetch`…) sont eux-mêmes créés par `vi.fn(...)`, et
  // `restoreAllMocks` les aurait vidés après le PREMIER test du fichier —
  // chaque route suivante aurait alors vu `apiFetch()` rendre `undefined`
  // au lieu d'une promesse, un crash sans rapport avec #2593 (mesuré :
  // `useLaura.ts:197`, `apiFetch(...).then` sur `undefined`).
  it('LIT un corpus non vide — sinon la garde ne garde rien', () => {
    const routes = firstLevelAppRoutes()
    expect(routes.length).toBeGreaterThanOrEqual(20)
    expect(routes).toContain('/settings/')
    expect(routes).toContain('/integrations/')
    // Une route PUBLIQUE (sans coquille applicative) n'entre pas dans ce
    // corpus — sinon la garde mesurerait la session, pas la coquille.
    expect(routes).not.toContain('/login/')
  })

  it('trouve la coquille fautive par LECTURE du source, pas par une liste écrite à la main', () => {
    const vulnerable = routesUsingTheVulnerableShell(firstLevelAppRoutes())
    // Le témoin des trois routes RÉELLEMENT touchées en production (#2593) —
    // un rouge ici dit que la LECTURE du source a cessé de fonctionner, pas
    // que le produit a changé de forme.
    expect(vulnerable, `routes vues : ${vulnerable.join(', ') || '(aucune)'}`).toEqual(
      expect.arrayContaining(['/settings/', '/integrations/', '/billing/']),
    )
    // Et elle ne prend PAS tout : le témoin connu pour ne pas passer par
    // `SettingsPage` reste dehors.
    expect(vulnerable).not.toContain(CONTROL_ROUTE)
  })

  describe.each([
    ['bureau', false],
    ['téléphone', true],
  ] as const)('largeur %s', (_label, isNarrow) => {
    beforeEach(() => {
      stubMatchMedia(isNarrow)
    })

    const routes = [...routesUsingTheVulnerableShell(firstLevelAppRoutes()), CONTROL_ROUTE]

    for (const path of routes) {
      it(
        `${path} ne remonte pas à la frontière d'erreur en chargement direct`,
        { timeout: ROUTE_MOUNT_TIMEOUT_MS },
        async () => {
          const router = await buildRouter(path)
          await router.load()
          renderRouter(router)

          // Le routeur a fini de RÉSOUDRE — une redirection de `beforeLoad`
          // (onboarding, ex.) est une décision légitime, pas un crash.
          await waitFor(() => expect(router.state.status).toBe('idle'))

          // La frontière d'erreur (`RootErrorBoundary`, `error-boundary.tsx`)
          // rend toujours ce titre pour un crash générique — c'est la trace
          // EXACTE mesurée en production (`crash-page.tsx`, `common.json`
          // `errorScreens.crash.title`).
          expect(screen.queryByText('Oups.')).not.toBeInTheDocument()
        },
      )
    }
  })
})
