import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRODUCT_SCREENS,
  hasPermission,
  resolveRouteAccess,
  routeContractFor,
  workspacePermissionValues,
  workspaceRoleValues,
  type RouteAccess,
  type RouteContract,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'

/**
 * GA-346 — LE WEB LIT LE VRAI RÔLE (#2222).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur cloisonne depuis des mois (341 endpoints `@RequirePermission`), et
 * le web ne lisait rien : `useUserPermissions()` rendait `[]` pour tout le
 * monde, et `useRouteAccess` posait `role: 'owner'` EN DUR. La branche
 * `permission` de `resolveRouteAccess` ne pouvait donc jamais se déclencher.
 * **Un garde qui dit toujours OUI est plus dangereux qu'un garde absent : on le
 * croit.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS CHOSES QU'UNE GARDE DOIT PROUVER (règle du dépôt)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Elle sait dire NON** — un `viewer` se voit refuser `/team`.
 *  2. **Elle LIT un corpus non vide** — le catalogue porte des écrans, dont
 *     plusieurs gardés, et la matrice de rôles n'est pas vide. Un catalogue
 *     vidé par accident rendrait tout le reste vert sans rien vérifier.
 *  3. **Elle n'attrape pas ce qu'elle ne vise pas** — un `owner` passe partout,
 *     et un écran SANS `requiredPermission` reste ouvert à tous, `viewer`
 *     compris. C'est le témoin des cas légitimes voisins : une garde qui ferme
 *     un écran non catalogué serait pire que l'absence de garde.
 *
 * Plus la non-régression qui compte le plus à l'usage : **rôle INCONNU ⇒
 * attente, jamais refus.**
 */

const permissionScreens = PRODUCT_SCREENS.filter(screen => screen.requiredPermission)

/**
 * L'accès d'un rôle à un écran, la dimension PERMISSION isolée.
 *
 * `planFeatures` et `capabilities` sont neutralisés — on ne veut pas qu'un
 * palier ou un connecteur manquant fasse passer un test de permission pour
 * vert (ou pour rouge) sur une raison qui n'est pas la sienne.
 */
function accessFor(role: WorkspaceRole, path: string, extra: readonly WorkspacePermission[] = []): RouteAccess {
  const contract = routeContractFor(path)
  if (!contract) throw new Error(`Route absente du catalogue : ${path}`)
  return resolveRouteAccess(contract, {
    role,
    extraPermissions: extra,
    planFeatures: [],
    capabilities: contract.degradesWithout,
  })
}

describe('GA-346 — elle sait dire NON', () => {
  it('un `viewer` se voit REFUSER /team, et le refus NOMME le droit qui manque', () => {
    const access = accessFor('viewer', '/team')

    expect(access.state).toBe('permission')
    // `missing` porte le NOM de la permission, jamais un booléen nu : c'est ce
    // qui permet au bandeau de dire QUOI demander.
    expect(access.missing).toContain('team:manage')
  })

  it('les quatre rôles non-gestionnaires sont refusés sur /team', () => {
    for (const role of ['viewer', 'sales', 'recruiter', 'tech_admin'] as const) {
      expect(accessFor(role, '/team').state, `${role} devrait être refusé sur /team`).toBe('permission')
    }
  })

  it('une permission accordée EN PROPRE lève le refus, sans changer le rôle', () => {
    // C'est la raison d'être de `can(role, additional, permission)` : accorder
    // un droit sans promouvoir quelqu'un `admin` pour un seul geste.
    expect(accessFor('viewer', '/team').state).toBe('permission')
    expect(accessFor('viewer', '/team', ['team:manage']).state).toBe('ready')
  })
})

describe('GA-346 — elle LIT un corpus non vide', () => {
  it('le catalogue porte des écrans, et plusieurs sont gardés', () => {
    // Sans ce plancher, vider `PRODUCT_SCREENS` rendrait toute cette garde verte.
    expect(PRODUCT_SCREENS.length).toBeGreaterThanOrEqual(80)
    expect(permissionScreens.length).toBeGreaterThanOrEqual(5)
  })

  it('la matrice de rôles n’est pas vide', () => {
    expect(workspaceRoleValues.length).toBeGreaterThanOrEqual(9)
    expect(workspacePermissionValues.length).toBeGreaterThanOrEqual(12)
    // Un `owner` porte au moins de quoi gérer son équipe — si la matrice était
    // vidée, tout le reste de cette garde passerait sans rien mesurer.
    expect(hasPermission('owner', 'team:manage')).toBe(true)
    expect(hasPermission('viewer', 'team:manage')).toBe(false)
  })

  it('chaque permission déclarée au catalogue EXISTE dans l’enum', () => {
    // Une permission mal orthographiée fermerait un écran pour tout le monde,
    // en silence : `can()` rendrait toujours faux.
    for (const screen of permissionScreens) {
      const declared = screen.requiredPermission
      const list = typeof declared === 'string' ? [declared] : (declared ?? [])
      expect(list.length, `${screen.route} déclare une liste vide`).toBeGreaterThan(0)
      for (const permission of list) {
        expect(workspacePermissionValues, `${screen.route} → ${permission}`).toContain(permission)
      }
    }
  })
})

describe('GA-346 — elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('un `owner` passe sur TOUS les écrans catalogués', () => {
    // La matrice le garantit explicitement (« un `owner` ne doit jamais se voir
    // refuser une route »). Si cette assertion tombe, c'est la matrice qu'il
    // faut lire, pas le catalogue.
    for (const screen of permissionScreens) {
      expect(accessFor('owner', screen.route).state, `owner refusé sur ${screen.route}`).toBe('ready')
    }
  })

  it('un écran SANS `requiredPermission` reste ouvert à tous, `viewer` compris', () => {
    // Le témoin du cas légitime voisin. Le défaut est OUVERT, et il doit le
    // rester : fermer par défaut transformerait chaque oubli de catalogage en
    // panne silencieuse pour un rôle entier.
    for (const path of ['/accounts', '/contacts', '/briefing', '/missions', '/settings/team']) {
      expect(routeContractFor(path)?.requiredPermission, `${path} ne devrait rien exiger`).toBeUndefined()
      expect(accessFor('viewer', path).state, `${path} devrait rester ouvert`).toBe('ready')
    }
  })

  it('une route ABSENTE du catalogue n’a pas de contrat — donc elle est ouverte', () => {
    expect(routeContractFor('/une-route-qui-nexiste-pas')).toBeNull()
  })

  it('une liste de permissions veut dire « l’UNE suffit », jamais « toutes »', () => {
    // `/expenses` est ouvert par `finance:read` OU `records:write`
    // (`expense-reports.controller.ts:102`). Aucun des deux ne couvre seul
    // l'union des rôles : `finance` n'a pas `records:write`, `sales` n'a pas
    // `finance:read`. Exiger l'un des deux fermerait l'écran à l'autre moitié —
    // un FAUX REFUS, que rien côté serveur ne viendrait démentir.
    expect(hasPermission('sales', 'records:write')).toBe(true)
    expect(hasPermission('sales', 'finance:read')).toBe(false)
    expect(hasPermission('finance', 'finance:read')).toBe(true)
    expect(hasPermission('finance', 'records:write')).toBe(false)

    expect(accessFor('sales', '/expenses').state).toBe('ready')
    expect(accessFor('finance', '/expenses').state).toBe('ready')
    // Et le refus tient quand même pour qui n'a NI l'un NI l'autre.
    expect(accessFor('viewer', '/expenses').state).toBe('permission')
    expect(accessFor('tech_admin', '/expenses').state).toBe('permission')
    // Théo C missions-notes-de-frais.N1 — l'onglet de Missions garde EXACTEMENT le même OR.
    expect(accessFor('sales', '/missions/notes-de-frais').state).toBe('ready')
    expect(accessFor('finance', '/missions/notes-de-frais').state).toBe('ready')
    expect(accessFor('viewer', '/missions/notes-de-frais').state).toBe('permission')
  })

  it('/pilotage/finance reste ouvert à qui ne voit QUE son périmètre', () => {
    // `finance:read:own` (D1, 26/08) — le commercial voit ce qu'il a produit.
    // N'exiger que `finance:read` lui fermerait un écran que le serveur ouvre.
    expect(accessFor('sales', '/pilotage/finance').state).toBe('ready')
    expect(accessFor('sales_ops', '/pilotage/finance').state).toBe('ready')
    expect(accessFor('finance', '/pilotage/finance').state).toBe('ready')
    expect(accessFor('viewer', '/pilotage/finance').state).toBe('permission')
  })
})

/* -------------------------------------------------------------------------- */
/*  Le rôle INCONNU — la non-régression qui compte le plus à l'usage.         */
/* -------------------------------------------------------------------------- */

const getTeamMock = vi.hoisted(() => vi.fn())
const useRouterStateMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/team/api', () => ({ teamApi: { getTeam: () => getTeamMock() } }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'user-1' } }) }))
vi.mock('@tanstack/react-router', () => ({ useRouterState: (...a: unknown[]) => useRouterStateMock(...a) }))
vi.mock('@/features/integration-center/api', () => ({ useToolRegistry: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => ({ data: undefined }) }))

const { useCurrentRouteAccess } = await import('@/components/access/useRouteAccess')

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function teamOf(role: WorkspaceRole) {
  return {
    workspace: { id: 'ws-1', name: 'Espace', role, memberCount: 1 },
    members: [{ userId: 'user-1', email: null, fullName: null, role, joinedAt: '', extraPermissions: [] }],
    invitations: [],
    seats: { used: 1, total: 5 },
  }
}

describe('GA-346 — un rôle INCONNU est une ATTENTE, jamais un refus', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getTeamMock.mockReset()
    useRouterStateMock.mockReset()
    // Le hook lit `state.location.pathname` par un sélecteur.
    useRouterStateMock.mockImplementation(({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: '/team' } }),
    )
  })

  it('tant que `GET /workspaces/me` n’a pas répondu : on ATTEND, on ne refuse pas', async () => {
    // La requête ne se résout jamais — c'est exactement l'état « en vol ».
    getTeamMock.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    // L'enveloppe de page affiche une attente sur ce booléen.
    expect(result.current.pending).toBe(true)
    // Et SURTOUT : pas de refus. Rendre `permission` ici ferait clignoter un
    // refus d'accès à chaque rechargement de page, sur un écran que la personne
    // paie. « Inconnu » n'est pas « aucun droit ».
    expect(result.current.access.state).not.toBe('permission')
  })

  it('le rôle arrivé, le refus se dit — l’attente était bien une attente', async () => {
    getTeamMock.mockResolvedValue(teamOf('viewer'))

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.access.state).toBe('permission')
    expect(result.current.access.missing).toContain('team:manage')
  })

  it('le rôle arrivé et suffisant, l’écran sert', async () => {
    getTeamMock.mockResolvedValue(teamOf('admin'))

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    // ⚠️ On attend `pending`, PAS `state` : pendant le chargement l'état est
    // DÉJÀ `ready` (le doute n'interdit pas), donc attendre `ready` serait
    // satisfait immédiatement et ce test ne mesurerait rien.
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.access.state).toBe('ready')
  })

  it('un écran qui n’exige RIEN n’attend pas le rôle', async () => {
    // La nuance qui empêche cette garde de coûter une attente à tout le
    // produit : la grande majorité des écrans n'exige aucune permission, et
    // les faire patienter sur `GET /workspaces/me` ajouterait un aller-retour
    // visible à chaque navigation, pour une question qui n'est pas posée.
    useRouterStateMock.mockImplementation(({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: '/accounts' } }),
    )
    getTeamMock.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    expect(result.current.pending).toBe(false)
    expect(result.current.access.state).toBe('ready')
  })
})

/**
 * GA-346 bis — une réponse MAL FORMÉE dégrade, elle ne tue pas l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCIDENT QUI A PAYÉ CES DEUX TESTS (16/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `useCurrentRouteAccess` est monté par l'enveloppe de TOUTE page cliente. Deux
 * lectures y étaient nues :
 *
 *   · `data.workspace.role` — une réponse sans `workspace` jetait ;
 *   · `(tools ?? []).filter(…)` — `??` ne rattrape QUE `null`/`undefined`, donc
 *     un OBJET là où le contrat promet une liste passait au travers et `.filter`
 *     jetait.
 *
 * Dans les deux cas la frontière d'erreur du routeur remplaçait l'écran entier
 * par « Something went wrong! ». Le symptôme observé n'accusait pas le hook : un
 * test d'intégration disait « DASHBOARD_MARKER introuvable », c'est-à-dire
 * l'écran. En production, ç'aurait été une page blanche sur un déploiement d'API
 * qui change une forme de réponse.
 *
 * La règle appliquée est celle du dépôt, d'un cran plus bas : « inconnu » n'est
 * pas « aucun droit », et ce n'est pas non plus une page morte.
 */
describe('GA-346 bis — une réponse mal formée dégrade, elle ne tue pas l’écran', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    getTeamMock.mockReset()
    useRouterStateMock.mockReset()
    useRouterStateMock.mockImplementation(({ select }: { select: (s: unknown) => unknown }) =>
      select({ location: { pathname: '/team' } }),
    )
  })

  it('une réponse SANS workspace ne jette pas — le rôle reste inconnu', async () => {
    // Ce que rendrait une API d'une version antérieure, ou un proxy qui tronque.
    getTeamMock.mockResolvedValue({ members: [], invitations: [] })

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    // ⚠️ Attendre l'APPEL ne suffit pas : tant que la promesse n'a pas été
    // servie dans le cache, `data` vaut `undefined` et le hook sort par
    // « inconnu » SANS avoir touché la réponse mal formée. Le test passait alors
    // même avec la lecture nue — une garde qui ne lit rien. On attend donc que
    // la réponse SOIT dans le cache.
    await waitFor(() => expect(client.getQueryData(['workspace-team'])).toBeDefined())
    // Pas de jet : le hook rend une valeur. Et « inconnu », donc pas de refus.
    expect(result.current.access.state).not.toBe('permission')
  })

  it('n’attrape pas ce qu’il ne vise pas — une réponse BIEN formée décide toujours', async () => {
    // Le témoin : la tolérance ci-dessus ne doit pas rendre la garde aveugle.
    // Une réponse complète continue de produire un refus quand le rôle ne suffit pas.
    getTeamMock.mockResolvedValue(teamOf('viewer'))

    const { result } = renderHook(() => useCurrentRouteAccess(), { wrapper })

    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.access.state).toBe('permission')
  })
})
