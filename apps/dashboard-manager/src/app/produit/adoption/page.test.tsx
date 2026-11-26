import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminOverview, AdminPlan } from '@/lib/admin'
import type { FeatureAdoptionUsageReport } from '@/lib/feature-adoption-usage'

/**
 * LE FILET DE `/produit/adoption` (issue 1657.2 / issue 1685).
 *
 * Le VRAI composant serveur, sur un catalogue de plans, une distribution
 * d'abonnements et un rapport d'usage FABRIQUÉS — jamais une lecture de
 * classes CSS (jsdom ne met rien en page). Dans l'ordre de l'issue :
 *
 *  1. Le dénominateur de chaque pourcentage est ÉCRIT À L'ÉCRAN (« N sur M
 *     abonnements »), jamais seulement dans le code.
 *  2. #1685 — la mesure d'usage réelle change bien l'état des lignes
 *     branchées, et la bannière dit honnêtement combien de fonctions sont
 *     mesurées et pourquoi les autres ne le sont pas encore.
 *  3. Le résidu (« aucun espace éligible », « pas encore mesurable ») se
 *     rend APRÈS les quatre seaux de l'issue dans la barre segmentée — jamais
 *     en tête.
 *  4. Une route interne en échec (plans/overview) ne casse pas la page, et ne
 *     fait apparaître AUCUNE ligne de fonction par accident. Une route
 *     d'USAGE en échec dégrade vers l'état honnête d'avant #1685 (tout
 *     `non_mesurable`), sans casser la page non plus.
 */
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('@/lib/admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin')>('@/lib/admin')
  return { ...actual, fetchAdminPlans: vi.fn(), fetchAdminOverview: vi.fn() }
})

vi.mock('@/lib/feature-adoption-usage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feature-adoption-usage')>('@/lib/feature-adoption-usage')
  return { ...actual, fetchFeatureAdoptionUsage: vi.fn() }
})

import { fetchAdminOverview, fetchAdminPlans } from '@/lib/admin'
import { fetchFeatureAdoptionUsage } from '@/lib/feature-adoption-usage'
import AdoptionPage from './page'

const plans = vi.mocked(fetchAdminPlans)
const overview = vi.mocked(fetchAdminOverview)
const usage = vi.mocked(fetchFeatureAdoptionUsage)

// GROWTH ouvre tout SAUF `public_api` (pour obtenir un cas « aucun espace
// éligible ») ; ENTREPRISE (`team`) n'ouvre que trois fonctions — les deux se
// recoupent sur `exports`/`chat_ai`/`discover`.
const GROWTH_FEATURES = [
  'exports',
  'chat_ai',
  'discover',
  'watchlist',
  'knowledge_base',
  'team_workspace',
  'needs',
  'talent_pool',
  'crm_native',
  'ats_native',
  'manager_cockpit',
  'crm_sync',
  'mcp_assistant',
  'rfp',
]
const TEAM_FEATURES = ['exports', 'chat_ai', 'discover']
const TOUTES_FONCTIONS = [
  'exports',
  'chat_ai',
  'discover',
  'watchlist',
  'knowledge_base',
  'team_workspace',
  'needs',
  'talent_pool',
  'crm_native',
  'ats_native',
  'manager_cockpit',
  'crm_sync',
  'mcp_assistant',
  'public_api',
  'rfp',
]

function plan(overrides: Partial<AdminPlan>): AdminPlan {
  return {
    key: 'growth',
    label: 'Growth',
    price: 19900,
    accountsLimit: 250,
    enrichmentCredits: 0,
    seats: 1,
    extraSeatPrice: 0,
    selfServe: true,
    sortOrder: 3,
    features: GROWTH_FEATURES,
    ...overrides,
  }
}

const PLANS_FIXTURE: AdminPlan[] = [
  plan({}),
  plan({ key: 'team', label: 'Entreprise', seats: 3, selfServe: false, sortOrder: 2, features: TEAM_FEATURES }),
]

// 50 + 4 + 3 + 1 + 0 = 58 abonnements, tous paliers confondus.
const OVERVIEW_FIXTURE: AdminOverview = {
  totalUsers: 58,
  totalWorkspaces: 55,
  totalAccounts: 900,
  plans: { trial: 3, starter: 0, team: 4, growth: 50, beta: 1 },
}

/** Un rapport d'usage où AUCUNE fonction n'est branchée — l'état d'avant
 *  #1685, reproduit comme fixture pour les tests qui n'en ont pas besoin. */
const USAGE_TOUT_NON_MESURABLE: FeatureAdoptionUsageReport = {
  windowDays: 90,
  measuredAt: '2026-09-10T00:00:00.000Z',
  signals: TOUTES_FONCTIONS.map(feature => ({
    feature,
    eligibleWorkspaces: 0,
    activeWorkspaces: null,
    windowDays: 90,
    signal: null,
    notWiredReason: 'fixture de test — aucun signal fourni',
  })),
}

/** Un rapport d'usage CONTRASTÉ : `chat_ai` largement adoptée (54 éligibles,
 *  40 actifs → 74 %), `exports`/`discover` honnêtement sans signal. */
const USAGE_CONTRASTE: FeatureAdoptionUsageReport = {
  windowDays: 90,
  measuredAt: '2026-09-10T00:00:00.000Z',
  signals: TOUTES_FONCTIONS.map(feature => {
    if (feature === 'chat_ai') {
      return {
        feature,
        eligibleWorkspaces: 54,
        activeWorkspaces: 40,
        windowDays: 90,
        signal: 'x',
        notWiredReason: null,
      }
    }
    if (feature === 'exports' || feature === 'discover') {
      return {
        feature,
        eligibleWorkspaces: 54,
        activeWorkspaces: null,
        windowDays: 90,
        signal: null,
        notWiredReason: `${feature} : aucune trace persistée par espace`,
      }
    }
    return {
      feature,
      eligibleWorkspaces: 0,
      activeWorkspaces: null,
      windowDays: 90,
      signal: null,
      notWiredReason: null,
    }
  }),
}

function mock(
  p: AdminPlan[] = PLANS_FIXTURE,
  o: AdminOverview = OVERVIEW_FIXTURE,
  u: FeatureAdoptionUsageReport = USAGE_TOUT_NON_MESURABLE,
) {
  plans.mockResolvedValue(p)
  overview.mockResolvedValue(o)
  usage.mockResolvedValue(u)
}

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await AdoptionPage())
}

describe('/produit/adoption — le dénominateur est nommé, le résidu jamais en tête', () => {
  beforeEach(() => {
    plans.mockReset()
    overview.mockReset()
    usage.mockReset()
  })

  it('LIT quelque chose — la fixture est bien contrastée (croisement, et un cas « aucun palier »)', () => {
    expect(GROWTH_FEATURES).not.toContain('public_api')
    expect(TEAM_FEATURES).not.toContain('public_api')
    expect(GROWTH_FEATURES).toContain('talent_pool')
    expect(TEAM_FEATURES).not.toContain('talent_pool')
  })

  it('le dénominateur est ÉCRIT À L’ÉCRAN — « N sur 58 abonnements », jamais seulement dans le code', () => {
    mock()
    return rendu().then(html => {
      // chat_ai/discover : growth (50) + team (4) = 54.
      expect(html).toContain('54 sur 58 abonnements')
      // talent_pool : growth SEUL = 50.
      expect(html).toContain('50 sur 58 abonnements')
      // public_api : AUCUN palier de la fixture ne l’ouvre → 0.
      expect(html).toContain('0 sur 58 abonnements')
    })
  })

  it('une fonction qu’aucun palier n’ouvre dit « aucun palier aujourd’hui », jamais un tiret muet', () => {
    mock()
    return rendu().then(html => {
      expect(html).toContain('aucun palier aujourd’hui')
      expect(html).toContain('aucun espace éligible')
    })
  })

  it('« Ouverte par » nomme les paliers qui l’ouvrent, jamais un code brut', () => {
    mock()
    return rendu().then(html => {
      expect(html).toContain('Growth, Entreprise')
    })
  })

  it('sans aucun signal d’usage, la bannière dit « 0 sur 15 » et liste TOUTES les fonctions avec leur raison', () => {
    mock()
    return rendu().then(html => {
      expect(html).toContain('Mesure d’usage : disponible pour 0 sur 15 fonctions')
      expect(html).toContain('fixture de test — aucun signal fourni')
      const positionBanniere = html.indexOf('Mesure d’usage')
      const positionDetail = html.indexOf('Le détail, fonction par fonction')
      expect(positionBanniere).toBeGreaterThan(-1)
      expect(positionDetail).toBeGreaterThan(-1)
      expect(positionBanniere).toBeLessThan(positionDetail)
    })
  })

  it('avec un signal d’usage RÉEL, une fonction largement adoptée sort de « non_mesurable » et affiche son taux', () => {
    mock(PLANS_FIXTURE, OVERVIEW_FIXTURE, USAGE_CONTRASTE)
    return rendu().then(html => {
      // chat_ai : 40 actifs / 54 éligibles ≈ 74 % → adoptée.
      expect(html).toContain('adoptée')
      expect(html).toContain('74 %')
    })
  })

  it('exports/discover restent honnêtement « pas encore mesurable », avec leur raison écrite dans la bannière', () => {
    mock(PLANS_FIXTURE, OVERVIEW_FIXTURE, USAGE_CONTRASTE)
    return rendu().then(html => {
      expect(html).toContain('Mesure d’usage : disponible pour 1 sur 15 fonctions')
      expect(html).toContain('exports : aucune trace persistée par espace')
      expect(html).toContain('discover : aucune trace persistée par espace')
    })
  })

  it('une route d’usage en ÉCHEC dégrade vers l’état honnête d’avant ce lot, sans casser la page', () => {
    plans.mockResolvedValue(PLANS_FIXTURE)
    overview.mockResolvedValue(OVERVIEW_FIXTURE)
    usage.mockRejectedValue(new Error('feature-adoption endpoint returned 503'))
    return rendu().then(html => {
      expect(html).toContain('Mesure d’usage : indisponible pour le moment')
      expect(html).toContain('La route qui agrège l’usage réel')
      // Le catalogue et son dénominateur restent lisibles malgré la panne.
      expect(html).toContain('54 sur 58 abonnements')
      expect(html).not.toContain('adoptée')
    })
  })

  it('dit honnêtement POURQUOI — jamais « aucun usage », jamais un 0 % inventé', () => {
    mock()
    return rendu().then(html => {
      expect(html).not.toContain('0 % adoptée')
    })
  })

  it('le résidu (« aucun espace éligible », « pas encore mesurable ») se rend APRÈS les quatre seaux de l’issue', () => {
    mock()
    return rendu().then(html => {
      const positionAdoptee = html.indexOf('Adoptée (≥ 60 %)')
      const positionConfidentielle = html.indexOf('Confidentielle (10 à 60 %)')
      const positionIgnoree = html.indexOf('Ignorée (moins de 10 %, ≥ 60 j)')
      const positionMorte = html.indexOf('Morte (0 usage, ≥ 60 j)')
      const positionSansTitulaire = html.indexOf('Aucun espace éligible')
      const positionNonMesurable = html.indexOf('Pas encore mesurable')
      for (const position of [positionAdoptee, positionConfidentielle, positionIgnoree, positionMorte]) {
        expect(position).toBeGreaterThan(-1)
        expect(position).toBeLessThan(positionSansTitulaire)
        expect(position).toBeLessThan(positionNonMesurable)
      }
    })
  })

  it('sait dire NON — les seaux affichés s’ADDITIONNENT jusqu’au nombre de fonctions du catalogue', () => {
    mock()
    return rendu().then(html => {
      // 15 fonctions, 1 sans titulaire (public_api), 14 non mesurables (aucun
      // signal fourni par la fixture) : 1 + 14 = 15, jamais 14 ni 16.
      expect(html).toContain('15 fonctions')
    })
  })

  it('une route interne en échec ne casse pas la page — et ne fait apparaître AUCUNE ligne de fonction', () => {
    plans.mockRejectedValue(new Error('plans endpoint returned 500 Internal Server Error'))
    overview.mockResolvedValue(OVERVIEW_FIXTURE)
    usage.mockResolvedValue(USAGE_TOUT_NON_MESURABLE)
    return rendu().then(html => {
      expect(html).toContain('Impossible de lire le catalogue des paliers')
      // Aucun libellé de fonction connu n'apparaît par accident.
      expect(html).not.toContain('Assistant IA externe (MCP)')
      expect(html).not.toContain('sur 58 abonnements')
    })
  })
})
