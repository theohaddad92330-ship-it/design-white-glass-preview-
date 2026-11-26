import { describe, expect, it } from 'vitest'
import { resolveRouteAccess, routeContractSchema, type RouteAccessContext } from './route-access.js'

const contract = (over: Record<string, unknown> = {}) =>
  routeContractSchema.parse({ path: '/missions', section: 'missions', ...over })

const context = (over: Partial<RouteAccessContext> = {}): RouteAccessContext => ({
  role: 'sales',
  extraPermissions: [],
  planFeatures: ['needs', 'crm_native'],
  capabilities: [],
  ...over,
})

/**
 * Le contrat de route unifié (BEL-ARCH-002).
 *
 * Trois empêchements, trois gestes différents — et c'est la confusion entre eux
 * que ce contrat supprime. Le palier demande de changer d'offre, la permission
 * de demander l'accès à quelqu'un, la capacité de connecter un outil. La
 * troisième ne devrait même pas fermer la porte.
 */
describe('accès à une route', () => {
  it('ouvre une route sans exigence', () => {
    expect(resolveRouteAccess(contract(), context())).toEqual({ state: 'ready', missing: [] })
  })

  it('verrouille sur le palier, en nommant la fonctionnalité manquante', () => {
    const access = resolveRouteAccess(contract({ requiredPlanFeature: 'talent_pool' }), context())

    expect(access.state).toBe('plan_locked')
    expect(access.missing).toEqual(['talent_pool'])
  })

  it('n’interdit RIEN tant que les paliers ne sont pas connus', () => {
    // Le doute n'interdit pas : une liste vide veut dire « on ne sait pas
    // encore », pas « aucun ». Verrouiller pendant un chargement ferait
    // clignoter un cadenas sur des écrans que le client paie.
    const access = resolveRouteAccess(contract({ requiredPlanFeature: 'talent_pool' }), context({ planFeatures: [] }))

    expect(access.state).toBe('ready')
  })

  it('refuse sur la permission, et le DIT', () => {
    const access = resolveRouteAccess(contract({ requiredPermission: 'finance:read' }), context())

    expect(access.state).toBe('permission')
    expect(access.missing).toEqual(['finance:read'])
  })

  it('tient compte d’une permission accordée en propre', () => {
    const access = resolveRouteAccess(
      contract({ requiredPermission: 'finance:read' }),
      context({ extraPermissions: ['finance:read'] }),
    )

    expect(access.state).toBe('ready')
  })

  it('évalue le palier AVANT la permission — c’est l’ordre des guards serveur', () => {
    // Deux ordres différents donneraient deux messages différents pour un même
    // refus, selon qu'on regarde l'écran ou la réponse de l'API.
    const access = resolveRouteAccess(
      contract({ requiredPlanFeature: 'talent_pool', requiredPermission: 'finance:read' }),
      context(),
    )

    expect(access.state).toBe('plan_locked')
  })

  it('OUVRE l’écran quand une seule capacité manque, en dégradé', () => {
    // Fermer un écran de missions parce que l'agenda n'est pas connecté
    // cacherait tout ce qui marche.
    const access = resolveRouteAccess(
      contract({ degradesWithout: ['mailbox:send', 'agenda:read'] }),
      context({ capabilities: ['mailbox:send'] }),
    )

    expect(access.state).toBe('degraded')
    expect(access.missing).toEqual(['agenda:read'])
  })

  it('déclare `no_integration` quand AUCUNE des capacités n’est là', () => {
    const access = resolveRouteAccess(
      contract({ degradesWithout: ['mailbox:send', 'agenda:read'] }),
      context({ capabilities: [] }),
    )

    expect(access.state).toBe('no_integration')
    expect(access.missing).toEqual(['mailbox:send', 'agenda:read'])
  })

  it('ne dégrade pas un écran dont toutes les capacités sont là', () => {
    const access = resolveRouteAccess(
      contract({ degradesWithout: ['mailbox:send'] }),
      context({ capabilities: ['mailbox:send', 'agenda:read'] }),
    )

    expect(access.state).toBe('ready')
  })

  it('nomme toujours ce qui manque — un booléen nu n’aide personne à agir', () => {
    for (const access of [
      resolveRouteAccess(contract({ requiredPlanFeature: 'talent_pool' }), context()),
      resolveRouteAccess(contract({ requiredPermission: 'finance:read' }), context()),
      resolveRouteAccess(contract({ degradesWithout: ['agenda:read'] }), context()),
    ]) {
      expect(access.missing.length).toBeGreaterThan(0)
    }
  })

  it('refuse un contrat sans chemin ni section', () => {
    expect(routeContractSchema.safeParse({ path: '', section: 'missions' }).success).toBe(false)
    expect(routeContractSchema.safeParse({ path: '/x' }).success).toBe(false)
  })
})
