import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'
import {
  FEATURE_USAGE_SIGNALS,
  buildFeatureAdoptionReport,
  grantingPlanKeys,
  sumByPlans,
} from './feature-adoption-usage'

/**
 * #1685 — LA MESURE D'USAGE PAR FONCTION, testée en isolation (TDD).
 *
 * Ce fichier ne touche aucune base : `buildFeatureAdoptionReport` est une
 * fonction pure, alimentée par des comptes PAR PALIER déjà agrégés (jamais un
 * identifiant d'espace) — voir le docblock de tête de `feature-adoption-usage.ts`
 * pour pourquoi c'est la forme qui tient l'interdit « rien de comportemental
 * par espace nommé » : aucune ligne de ce fichier ne pourrait même écrire un
 * identifiant d'espace, la donnée en entrée n'en porte aucun.
 */

const PLANS = [
  { key: 'trial', features: ['chat_ai'] as PlanFeatureKey[] },
  { key: 'starter', features: ['chat_ai', 'exports'] as PlanFeatureKey[] },
  { key: 'growth', features: ['chat_ai', 'exports', 'crm_sync', 'watchlist'] as PlanFeatureKey[] },
]

describe('#1685 — grantingPlanKeys / sumByPlans', () => {
  it('grantingPlanKeys — les seuls paliers qui ouvrent la fonction, jamais tous', () => {
    expect(grantingPlanKeys(PLANS, 'crm_sync')).toEqual(['growth'])
    expect(grantingPlanKeys(PLANS, 'chat_ai').sort()).toEqual(['growth', 'starter', 'trial'])
    expect(grantingPlanKeys(PLANS, 'public_api')).toEqual([])
  })

  it('sumByPlans — somme les comptes des SEULS paliers demandés', () => {
    expect(sumByPlans({ trial: 3, starter: 5, growth: 50 }, ['starter', 'growth'])).toBe(55)
    expect(sumByPlans({ trial: 3 }, [])).toBe(0)
    // Un palier absent du compte (aucun abonné aujourd'hui) vaut 0, jamais une
    // exception : un palier tout neuf ne doit pas faire tomber le calcul.
    expect(sumByPlans({ trial: 3 }, ['beta'])).toBe(0)
  })
})

describe('#1685 — FEATURE_USAGE_SIGNALS — le catalogue, et rien que lui', () => {
  it('LIT quelque chose — une entrée pour CHACUNE des 15 fonctions du catalogue, jamais plus, jamais moins', () => {
    const keys = Object.keys(FEATURE_USAGE_SIGNALS).sort()
    expect(keys).toEqual([...PLAN_FEATURE_KEYS].sort())
    expect(PLAN_FEATURE_KEYS.length).toBe(15)
  })

  it('chaque entrée est soit mesurée avec une description, soit non branchée avec une raison — jamais les deux, jamais aucune', () => {
    for (const feature of PLAN_FEATURE_KEYS) {
      const signal = FEATURE_USAGE_SIGNALS[feature]
      if (signal.kind === 'measured') {
        expect(signal.description.length).toBeGreaterThan(10)
      } else {
        expect(signal.kind).toBe('not_wired')
        expect(signal.reason.length).toBeGreaterThan(10)
      }
    }
  })

  it('sait dire NON — une fonction sans aucune entrée serait détectée', () => {
    // Témoin : si on retire une clé, l'assertion ci-dessus tomberait. Prouvé en
    // le rejouant sur une copie tronquée du catalogue.
    const tronque: Partial<Record<PlanFeatureKey, unknown>> = { ...FEATURE_USAGE_SIGNALS }
    delete tronque.discover
    const keys = Object.keys(tronque).sort()
    expect(keys).not.toEqual([...PLAN_FEATURE_KEYS].sort())
  })

  it('exports et discover sont honnêtement SANS SIGNAL — aucune trace persistée trouvée', () => {
    expect(FEATURE_USAGE_SIGNALS.exports.kind).toBe('not_wired')
    expect(FEATURE_USAGE_SIGNALS.discover.kind).toBe('not_wired')
  })

  it('les treize autres sont mesurées', () => {
    const mesurees = PLAN_FEATURE_KEYS.filter(f => FEATURE_USAGE_SIGNALS[f].kind === 'measured')
    expect(mesurees.length).toBe(13)
  })
})

describe('#1685 — buildFeatureAdoptionReport', () => {
  it('une fonction MESURÉE avec des comptes actifs rend eligibleWorkspaces ET activeWorkspaces', () => {
    const report = buildFeatureAdoptionReport(
      PLANS,
      { trial: 3, starter: 5, growth: 50 },
      { crm_sync: { growth: 12 } },
      90,
    )
    const crmSync = report.find(r => r.feature === 'crm_sync')!
    expect(crmSync.eligibleWorkspaces).toBe(50)
    expect(crmSync.activeWorkspaces).toBe(12)
    expect(crmSync.windowDays).toBe(90)
    expect(crmSync.signal).not.toBeNull()
    expect(crmSync.notWiredReason).toBeNull()
  })

  it('une fonction MESURÉE mais sans compte actif transmis rend activeWorkspaces à 0, jamais null (0 est un vrai zéro ici, pas une absence de mesure)', () => {
    const report = buildFeatureAdoptionReport(PLANS, { growth: 50 }, { crm_sync: {} }, 90)
    expect(report.find(r => r.feature === 'crm_sync')!.activeWorkspaces).toBe(0)
  })

  it('une fonction NON BRANCHÉE rend activeWorkspaces à null — JAMAIS 0 — même si un compte lui est fourni par erreur', () => {
    // Témoin de non-sur-attrapage : même en glissant par erreur un compte pour
    // `exports` (non branché), le rapport ne le lit jamais — la garde
    // structurelle est le TYPE `not_wired` du catalogue, pas la présence ou
    // l'absence de la clé côté appelant.
    const report = buildFeatureAdoptionReport(
      PLANS,
      { starter: 5, growth: 50 },
      { exports: { growth: 999 } } as never,
      90,
    )
    const exports_ = report.find(r => r.feature === 'exports')!
    expect(exports_.activeWorkspaces).toBeNull()
    expect(exports_.eligibleWorkspaces).toBe(55) // starter + growth ouvrent `exports`
    expect(exports_.notWiredReason).not.toBeNull()
    expect(exports_.signal).toBeNull()
  })

  it('rend EXACTEMENT les 15 fonctions du catalogue, une ligne chacune', () => {
    const report = buildFeatureAdoptionReport(PLANS, {}, {}, 30)
    expect(report.map(r => r.feature).sort()).toEqual([...PLAN_FEATURE_KEYS].sort())
  })

  it('windowDays est reporté TEL QUEL sur chaque ligne mesurée — jamais falsifié à une valeur ≥ 60', () => {
    // C'est ce qui fait que `classerAdoption`, côté écran, applique
    // correctement la règle de l'issue : une fenêtre courte (< 60 j) ne peut
    // jamais produire « ignorée » — encore faut-il que la fenêtre transmise
    // soit la VRAIE fenêtre interrogée, pas une valeur maquillée ici.
    const report = buildFeatureAdoptionReport(PLANS, { growth: 50 }, { crm_sync: { growth: 1 } }, 10)
    expect(report.find(r => r.feature === 'crm_sync')!.windowDays).toBe(10)
  })

  it('un palier absent du catalogue LIVE (retiré depuis) ne fait pas planter l’agrégation', () => {
    const report = buildFeatureAdoptionReport([], { growth: 50 }, { crm_sync: { growth: 50 } }, 30)
    expect(report.find(r => r.feature === 'crm_sync')!.eligibleWorkspaces).toBe(0)
  })
})
