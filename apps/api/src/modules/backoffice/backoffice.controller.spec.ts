import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigService } from '@nestjs/config'
import {
  SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT,
  type LauraAnalyticsSummary,
  type SurfaceAcceptanceMeasure,
} from '@bellum/contracts'
import { JwtGuard } from '../auth/jwt.guard'
import { BackofficeRoleGuard } from '../auth/backoffice-role.guard'
import type { LauraAcceptanceService } from '../laura/laura-acceptance.service'
import type { LauraAnalyticsService } from '../laura/laura-analytics.service'
import { BackofficeController } from './backoffice.controller'

const UNMEASURED_STUB = { state: 'unmeasured', reason: 'stub' } as const

/** Un résumé neutre — tout à zéro/non mesuré — pour les tests qui ne portent
 *  pas sur `/backoffice/laura-analytics`. */
const NEUTRAL_ANALYTICS_SUMMARY: LauraAnalyticsSummary = {
  offered: { state: 'measured', count: 0 },
  viewed: UNMEASURED_STUB,
  accepted: { state: 'measured', count: 0 },
  dismissed: { state: 'measured', count: 0 },
  ignored: { state: 'measured', count: 0 },
  converted_to_action: UNMEASURED_STUB,
  false_positive: UNMEASURED_STUB,
  disabled: { state: 'measured', count: 0 },
}

/** Un `ConfigService` réduit à ce que ce contrôleur lit. */
function configWith(backofficeUrl: string | undefined): ConfigService {
  return {
    get: (key: string) => (key === 'backofficeUrl' ? backofficeUrl : undefined),
  } as unknown as ConfigService
}

/** Un `LauraAcceptanceService` réduit à `bySurface()` — la seule méthode lue. */
function acceptanceWith(bySurface: ReadonlyMap<string, SurfaceAcceptanceMeasure>): LauraAcceptanceService {
  return {
    bySurface: jest.fn().mockResolvedValue(bySurface),
  } as unknown as LauraAcceptanceService
}

/** Un `LauraAnalyticsService` réduit à `summarize()` — la seule méthode lue. */
function analyticsWith(summary: LauraAnalyticsSummary = NEUTRAL_ANALYTICS_SUMMARY): LauraAnalyticsService {
  return {
    summarize: jest.fn().mockResolvedValue(summary),
  } as unknown as LauraAnalyticsService
}

describe('BackofficeController — GET /backoffice/address', () => {
  it('sans BACKOFFICE_URL, rend `null` — et surtout PAS une erreur', () => {
    // No-op strict : un opérateur sur un déploiement non configuré voit l'écran
    // honnête, pas un 500. L'entrée de navigation, elle, reste là (elle tient au
    // rôle), donc il n'y a rien d'inexplicable à comprendre.
    const controller = new BackofficeController(configWith(undefined), acceptanceWith(new Map()), analyticsWith())
    expect(controller.address()).toEqual({ url: null })
  })

  it('sans BACKOFFICE_URL, ne devine aucune adresse', () => {
    const controller = new BackofficeController(configWith(undefined), acceptanceWith(new Map()), analyticsWith())
    // Ni l'origine de l'API, ni un sous-domaine construit, ni localhost.
    expect(controller.address().url).toBeNull()
  })

  it('avec BACKOFFICE_URL, rend l’adresse telle quelle', () => {
    const controller = new BackofficeController(
      configWith('https://console.bellum-ai.com'),
      acceptanceWith(new Map()),
      analyticsWith(),
    )
    expect(controller.address()).toEqual({ url: 'https://console.bellum-ai.com' })
  })

  it('traite une valeur vide comme une absence', () => {
    // Une variable posée à `""` sur Railway est une variable NON configurée.
    const controller = new BackofficeController(configWith(''), acceptanceWith(new Map()), analyticsWith())
    expect(controller.address()).toEqual({ url: null })
  })

  it('est gardé par JwtGuard PUIS BackofficeRoleGuard, à la maille classe', () => {
    // La seule preuve qui compte pour « un non-porteur du rôle n'obtient pas
    // l'adresse même en appelant la route directement » : le rôle est vérifié
    // par le serveur, pas par l'écran. L'ORDRE compte — le rôle se lit sur une
    // identité déjà établie.
    const guards = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]
    expect(guards).toEqual([JwtGuard, BackofficeRoleGuard])
  })
})

describe('BackofficeController — GET /backoffice/laura-acceptance', () => {
  it('rend une mesure MESURÉE telle quelle — aucun champ n’est inventé ni recalculé', async () => {
    const measure: SurfaceAcceptanceMeasure = { state: 'measured', acceptedPercent: 42.5, sample: 30 }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map([['first_login', measure]])),
      analyticsWith(),
    )
    const reading = await controller.lauraAcceptance()
    expect(reading.surfaces.first_login).toEqual(measure)
  })

  it('« non mesuré » (échantillon trop petit) survit intact — JAMAIS aplati en 0', async () => {
    const measure: SurfaceAcceptanceMeasure = { state: 'unmeasured', reason: 'sample_too_small', sample: 4 }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map([['weekly_digest', measure]])),
      analyticsWith(),
    )
    const reading = await controller.lauraAcceptance()
    expect(reading.surfaces.weekly_digest).toEqual(measure)
    // La preuve qui compte : la clé même n'existe pas, pas seulement `undefined`.
    expect(reading.surfaces.weekly_digest).not.toHaveProperty('acceptedPercent')
  })

  it('« non mesuré » (aucune observation) survit intact — pas confondu avec un taux à 0 %', async () => {
    const measure: SurfaceAcceptanceMeasure = { state: 'unmeasured', reason: 'no_observation', sample: 0 }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map([['stalled_deal', measure]])),
      analyticsWith(),
    )
    const reading = await controller.lauraAcceptance()
    const surface = reading.surfaces.stalled_deal
    expect(surface.state).toBe('unmeasured')
    if (surface.state === 'unmeasured') {
      expect(surface.reason).toBe('no_observation')
    }
    expect(surface).not.toHaveProperty('acceptedPercent')
  })

  it('porte plusieurs surfaces à la fois, mesurées et non mesurées mélangées, sans en perdre une', async () => {
    const measured: SurfaceAcceptanceMeasure = { state: 'measured', acceptedPercent: 61.11, sample: 36 }
    const unmeasured: SurfaceAcceptanceMeasure = { state: 'unmeasured', reason: 'sample_too_small', sample: 2 }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(
        new Map<string, SurfaceAcceptanceMeasure>([
          ['first_login', measured],
          ['weekly_digest', unmeasured],
        ]),
      ),
      analyticsWith(),
    )
    const reading = await controller.lauraAcceptance()
    expect(Object.keys(reading.surfaces).sort()).toEqual(['first_login', 'weekly_digest'])
    expect(reading.surfaces.first_login).toEqual(measured)
    expect(reading.surfaces.weekly_digest).toEqual(unmeasured)
  })

  it('un catalogue vide rend un objet vide — pas une erreur', async () => {
    const controller = new BackofficeController(configWith(undefined), acceptanceWith(new Map()), analyticsWith())
    const reading = await controller.lauraAcceptance()
    expect(reading.surfaces).toEqual({})
  })

  it('rend le seuil SUGGÉRÉ séparément de la mesure — nommé comme suggestion, jamais appliqué', async () => {
    const controller = new BackofficeController(configWith(undefined), acceptanceWith(new Map()), analyticsWith())
    const reading = await controller.lauraAcceptance()
    expect(reading.suggestedFloorPercent).toBe(SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT)
    // Rien d'autre : pas de champ dérivé du genre « belowThreshold » / « flagged »
    // qui classerait une surface — c'est exactement ce que D648 interdit à cette
    // route (elle mesure, elle ne décide pas).
    expect(Object.keys(reading).sort()).toEqual(['suggestedFloorPercent', 'surfaces'])
  })

  it('même une surface sous le seuil suggéré n’est ni colorée ni signalée — la mesure seule voyage', async () => {
    const belowFloor: SurfaceAcceptanceMeasure = { state: 'measured', acceptedPercent: 3, sample: 25 }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map([['stalled_deal', belowFloor]])),
      analyticsWith(),
    )
    const reading = await controller.lauraAcceptance()
    // Le champ exact — ni plus, ni un `flag`/`belowFloor` ajouté par comparaison.
    expect(Object.keys(reading.surfaces.stalled_deal).sort()).toEqual(['acceptedPercent', 'sample', 'state'])
  })

  it('est gardé par JwtGuard PUIS BackofficeRoleGuard, à la même maille CLASSE que /address', () => {
    // Un guard posé au niveau CLASSE s'applique à TOUTES les routes du
    // contrôleur, y compris celles ajoutées après lui — c'est ce qui rend
    // cette route protégée sans rien déclarer de plus sur elle-même.
    const guards = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]
    expect(guards).toEqual([JwtGuard, BackofficeRoleGuard])
  })
})

describe('BackofficeController — GET /backoffice/laura-analytics', () => {
  it('rend les huit métriques telles que le service les a résumées, sans rien recalculer', async () => {
    const summary: LauraAnalyticsSummary = {
      ...NEUTRAL_ANALYTICS_SUMMARY,
      offered: { state: 'measured', count: 12 },
      accepted: { state: 'measured', count: 5 },
    }
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map()),
      analyticsWith(summary),
    )
    const reading = await controller.lauraAnalytics()
    expect(reading).toEqual(summary)
  })

  it('une métrique NON MESURÉE survit intacte — jamais aplatie en zéro', async () => {
    const controller = new BackofficeController(
      configWith(undefined),
      acceptanceWith(new Map()),
      analyticsWith(NEUTRAL_ANALYTICS_SUMMARY),
    )
    const reading = await controller.lauraAnalytics()
    expect(reading.viewed).toEqual(UNMEASURED_STUB)
    expect(reading.viewed).not.toHaveProperty('count')
  })

  it('est gardé par JwtGuard PUIS BackofficeRoleGuard, à la même maille CLASSE que les autres routes', () => {
    const guards = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]
    expect(guards).toEqual([JwtGuard, BackofficeRoleGuard])
  })
})

/**
 * GA-194 — la lecture d'acceptation par surface est INACCESSIBLE sans le rôle
 * opérateur (`backoffice`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `LauraAcceptanceService.bySurface()` lit à travers TOUS les espaces, sans
 * filtre `workspace_id` (délibéré, voir son docblock — un seul espace
 * n'atteint quasiment jamais l'échantillon minimum en 30 jours). Rendre ça à
 * un espace client serait exactement l'agrégat inter-espaces que la doctrine
 * interdit (`COMMUNITY_FORBIDDEN_KINDS`, GA-43) : les espaces sont des ESN,
 * donc des concurrents. La seule chose qui empêche ça est
 * `BackofficeRoleGuard`, posé au niveau CLASSE sur `BackofficeController`
 * (`backoffice.controller.ts`) — cette garde vérifie qu'il y est vraiment, et
 * qu'il continuerait de couvrir toute route future du même contrôleur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PREUVES, COMME TOUTE GARDE DE CE DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle LIT quelque chose : le corpus des routes RÉELLEMENT déclarées dans
 *    le fichier source du contrôleur n'est pas vide, et `laura-acceptance` en
 *    fait partie — donc ce n'est pas un test qui vérifierait une route qui
 *    n'existe pas.
 * 2. Elle SAIT DIRE NON : la protection de rôle est retirée TEMPORAIREMENT de
 *    la classe RÉELLE (mutation de la métadonnée `__guards__`, la même que
 *    Nest utilise pour appliquer les guards), la vérification ROUGIT, puis la
 *    protection est remise et la vérification reverdit. Un `afterEach` la
 *    remet aussi, même si une assertion tombe en cours de route — cette garde
 *    ne doit jamais laisser la classe réelle affaiblie pour les tests suivants.
 */
describe('GA-194 — la route d’acceptation est inaccessible sans le rôle opérateur', () => {
  const CONTROLLER_SOURCE = readFileSync(join(__dirname, 'backoffice.controller.ts'), 'utf8')
  const ORIGINAL_GUARDS = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]

  afterEach(() => {
    Reflect.defineMetadata('__guards__', ORIGINAL_GUARDS, BackofficeController)
  })

  it('LIT un corpus non vide : les routes réellement déclarées dans le fichier, dont `laura-acceptance`', () => {
    const routes = [...CONTROLLER_SOURCE.matchAll(/@Get\('([^']+)'\)/g)].map(match => match[1])
    expect(routes.length).toBeGreaterThan(0)
    expect(routes).toContain('address')
    expect(routes).toContain('laura-acceptance')
  })

  it('l’état de départ est protégé : JwtGuard PUIS BackofficeRoleGuard, sur la classe RÉELLE', () => {
    expect(ORIGINAL_GUARDS).toEqual([JwtGuard, BackofficeRoleGuard])
  })

  it('SAIT DIRE NON — protection retirée de la classe RÉELLE : la vérification rougit', () => {
    // On retire temporairement `BackofficeRoleGuard`, comme si un futur agent
    // avait affaibli le guard sans le vouloir — exactement ce que cette garde
    // doit être capable de voir.
    Reflect.defineMetadata('__guards__', [JwtGuard], BackofficeController)
    const weakened = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]
    expect(weakened).not.toContain(BackofficeRoleGuard) // ROUGE
  })

  it('… et remise en place : `afterEach` restaure la protection avant le test suivant', () => {
    // Ce test s'exécute APRÈS le précédent (Jest respecte l'ordre de
    // déclaration dans un `describe`) : il prouve que la remise en place a eu
    // lieu, pas seulement qu'elle a été écrite.
    const restored = Reflect.getMetadata('__guards__', BackofficeController) as unknown[]
    expect(restored).toEqual([JwtGuard, BackofficeRoleGuard]) // VERT à nouveau
  })
})
