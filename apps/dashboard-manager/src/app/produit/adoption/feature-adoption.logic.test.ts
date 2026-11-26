import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  ADOPTION_THRESHOLDS,
  compterSeaux,
  construireRapportAdoption,
  entitlementPourFonction,
  classerAdoption,
  formaterTauxAdoption,
  libelleEtatAdoption,
  resumerMesureUsage,
  RAISON_USAGE_INDISPONIBLE,
  TOUS_LES_SEAUX,
  usageParFonctionDepuisSignaux,
  type AdoptionPlanCatalogue,
  type SignalUsageAPI,
} from './feature-adoption.logic'

// issue 1657.2 / issue 1685 — voir le rapport du lot pour le numéro complet.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUE CE FICHIER PROUVE, DANS L'ORDRE DE L'ISSUE
// ─────────────────────────────────────────────────────────────────────────────
//  1. Le catalogue des fonctions GATÉES PAR L'OFFRE (jamais les actions
//     d'écran, jamais les 85 écrans du catalogue produit — cadrage tranché par
//     Louis) est celui de `@bellum/contracts` (`PLAN_FEATURE_KEYS`), pas une
//     recopie qui pourrait dériver.
//  2. Le DÉNOMINATEUR de chaque pourcentage est NOMMÉ : les abonnements
//     (celui du propriétaire d'un espace) sur un palier qui ouvre la fonction
//     aujourd'hui — jamais « tous les espaces ».
//  3. « morte » et « ignorée » se distinguent par un fait, pas par le hasard :
//     zéro usage jamais observé (morte) contre un usage non nul mais sous 10 %
//     (ignorée) — toutes deux exigent une fenêtre mûre (60 j), sinon c'est
//     encore trop tôt pour trancher.
//  4. Les seaux s'ADDITIONNENT jusqu'au nombre de fonctions — par construction
//     (chaque ligne reçoit EXACTEMENT un état), testé quand même.

describe('LIT quelque chose — le catalogue des fonctions gatées existe et n’est pas vide', () => {
  it('porte 15 fonctions au 28/09/2026 (canari : un ajout/retrait doit se voir ici)', () => {
    expect(PLAN_FEATURE_KEYS.length).toBe(15)
    expect(TOUS_LES_SEAUX.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// entitlementPourFonction — le DÉNOMINATEUR
// ─────────────────────────────────────────────────────────────────────────────

const PLANS: AdoptionPlanCatalogue[] = [
  { key: 'growth', label: 'Growth', features: ['chat_ai', 'discover', 'watchlist', 'talent_pool'] },
  { key: 'team', label: 'Entreprise', features: ['chat_ai', 'discover'] },
  { key: 'starter', label: 'Starter', features: [] },
]

const ABONNEMENTS = { growth: 40, team: 5, starter: 12, trial: 100 }

describe('entitlementPourFonction — le dénominateur est nommé, jamais « tous les espaces »', () => {
  it('somme les abonnements des SEULS paliers qui ouvrent la fonction', () => {
    const rapport = entitlementPourFonction('discover', PLANS, ABONNEMENTS)
    expect(rapport.entitledSubscriptions).toBe(40 + 5) // growth + team, pas starter ni trial
    expect(rapport.grantingPlanLabels).toEqual(['Growth', 'Entreprise'])
  })

  it('le total est TOUS les abonnements, quel que soit leur palier — pour situer le chiffre ci-dessus', () => {
    const rapport = entitlementPourFonction('discover', PLANS, ABONNEMENTS)
    expect(rapport.totalSubscriptions).toBe(40 + 5 + 12 + 100)
  })

  it('une fonction qu’AUCUN palier n’ouvre rend un dénominateur à ZÉRO, jamais deviné', () => {
    const rapport = entitlementPourFonction('talent_pool', [{ key: 'starter', label: 'Starter', features: [] }], {
      starter: 12,
    })
    expect(rapport.entitledSubscriptions).toBe(0)
    expect(rapport.grantingPlanLabels).toEqual([])
  })

  it('un palier dont `features` est absent (API antérieure) ne casse pas le calcul — traité comme vide', () => {
    const rapport = entitlementPourFonction(
      'discover',
      [{ key: 'growth', label: 'Growth', features: undefined as unknown as string[] }],
      { growth: 7 },
    )
    expect(rapport.entitledSubscriptions).toBe(0)
  })

  it('sait dire NON — un palier qui n’ouvre PAS la fonction ne contribue rien, même avec beaucoup d’abonnements', () => {
    const rapport = entitlementPourFonction('talent_pool', PLANS, ABONNEMENTS)
    // Seul `growth` porte `talent_pool` dans cette fixture.
    expect(rapport.entitledSubscriptions).toBe(40)
    expect(rapport.grantingPlanLabels).toEqual(['Growth'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classerAdoption — les quatre paliers de l'issue, plus les états honnêtes
// ─────────────────────────────────────────────────────────────────────────────

describe('classerAdoption — les seuils sont nommés, déclarés une fois (GA-26)', () => {
  it('aucun espace éligible → « sans_titulaire », jamais un taux inventé (division par zéro)', () => {
    expect(classerAdoption(0, { actifs: 0, joursObserves: 90 })).toEqual({ kind: 'sans_titulaire' })
    expect(classerAdoption(0, null)).toEqual({ kind: 'sans_titulaire' })
  })

  it('pas de mesure d’usage → « non_mesurable », jamais un taux à 0 % qui prétendrait une mesure', () => {
    expect(classerAdoption(40, null)).toEqual({ kind: 'non_mesurable' })
  })

  it('taux ≥ 60 % → adoptée, dès la première mesure (pas besoin d’attendre 60 j)', () => {
    expect(classerAdoption(10, { actifs: 6, joursObserves: 1 })).toEqual({ kind: 'adoptee', taux: 0.6 })
  })

  it('10 % ≤ taux < 60 % → confidentielle', () => {
    expect(classerAdoption(10, { actifs: 3, joursObserves: 5 })).toEqual({ kind: 'confidentielle', taux: 0.3 })
  })

  it('taux bas MAIS fenêtre encore jeune (< 60 j) → observation insuffisante, jamais ignorée ni morte', () => {
    expect(classerAdoption(10, { actifs: 0, joursObserves: 10 })).toEqual({
      kind: 'observation_insuffisante',
      joursObserves: 10,
    })
    // 1 sur 20 = 5 % — sous 10 %, mais la fenêtre (10 j) n'est pas mûre.
    expect(classerAdoption(20, { actifs: 1, joursObserves: 10 })).toEqual({
      kind: 'observation_insuffisante',
      joursObserves: 10,
    })
  })

  it('taux < 10 %, fenêtre mûre (≥ 60 j), et un usage NON NUL → ignorée', () => {
    // 1 sur 20 = 5 % — sous le seuil de 10 %, distinct de la borne testée ailleurs.
    expect(classerAdoption(20, { actifs: 1, joursObserves: 90 })).toEqual({
      kind: 'ignoree',
      taux: 0.05,
      joursObserves: 90,
    })
  })

  it('ce qui sépare « morte » d’« ignorée » : ZÉRO usage jamais observé, sur une fenêtre mûre — pas le hasard', () => {
    const morte = classerAdoption(20, { actifs: 0, joursObserves: 90 })
    const ignoree = classerAdoption(20, { actifs: 1, joursObserves: 90 })
    expect(morte).toEqual({ kind: 'morte', joursObserves: 90 })
    expect(ignoree.kind).toBe('ignoree')
    // Les deux partagent la même fenêtre mûre : seule la présence d'un usage
    // les distingue, jamais une seconde fenêtre inventée pour l'occasion.
    expect(morte).not.toEqual(ignoree)
  })

  it('sait dire NON — un taux de zéro trop récent n’est PAS classé « morte »', () => {
    const tropTot = classerAdoption(10, { actifs: 0, joursObserves: 59 })
    expect(tropTot.kind).not.toBe('morte')
    expect(tropTot).toEqual({ kind: 'observation_insuffisante', joursObserves: 59 })
  })

  it('bornes : exactement 60 % → adoptée ; exactement 10 % → confidentielle ; exactement 60 j → fenêtre mûre', () => {
    expect(classerAdoption(100, { actifs: 60, joursObserves: 1 }).kind).toBe('adoptee')
    expect(classerAdoption(100, { actifs: 10, joursObserves: 1 }).kind).toBe('confidentielle')
    expect(classerAdoption(100, { actifs: 0, joursObserves: 60 }).kind).toBe('morte')
  })

  it('les seuils sont ceux déclarés dans ADOPTION_THRESHOLDS — un seul endroit (GA-26)', () => {
    expect(ADOPTION_THRESHOLDS.adoptee).toBe(0.6)
    expect(ADOPTION_THRESHOLDS.confidentielle).toBe(0.1)
    expect(ADOPTION_THRESHOLDS.fenetreMinimaleJours).toBe(60)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// construireRapportAdoption + compterSeaux — LA PREUVE QUE ÇA S'ADDITIONNE
// ─────────────────────────────────────────────────────────────────────────────

describe('construireRapportAdoption — une ligne par fonction du catalogue, jamais plus, jamais moins', () => {
  it('rend EXACTEMENT une ligne par fonction gatée par l’offre', () => {
    const lignes = construireRapportAdoption(PLANS, ABONNEMENTS)
    expect(lignes).toHaveLength(PLAN_FEATURE_KEYS.length)
    expect(lignes.map(l => l.feature).sort()).toEqual([...PLAN_FEATURE_KEYS].sort())
  })

  it('sans mesure d’usage (l’état réel du 10/09/2026), chaque ligne est « non_mesurable » ou « sans_titulaire »', () => {
    const lignes = construireRapportAdoption(PLANS, ABONNEMENTS)
    for (const ligne of lignes) {
      expect(['non_mesurable', 'sans_titulaire']).toContain(ligne.etat.kind)
    }
  })

  it('avec une mesure d’usage fournie pour certaines fonctions, celles-ci sortent de « non_mesurable »', () => {
    const lignes = construireRapportAdoption(PLANS, ABONNEMENTS, {
      chat_ai: { actifs: 30, joursObserves: 90 }, // 30/45 = 66,7 % → adoptée
    })
    const chatAi = lignes.find(l => l.feature === 'chat_ai')
    expect(chatAi?.etat.kind).toBe('adoptee')
  })

  it('LES SEAUX S’ADDITIONNENT jusqu’au nombre de fonctions — la propriété centrale de ce lot', () => {
    const lignes = construireRapportAdoption(PLANS, ABONNEMENTS, {
      chat_ai: { actifs: 30, joursObserves: 90 },
      discover: { actifs: 3, joursObserves: 90 },
      watchlist: { actifs: 1, joursObserves: 90 },
      needs: { actifs: 0, joursObserves: 90 },
    })
    const compte = compterSeaux(lignes)
    const total = Object.values(compte).reduce((a, b) => a + b, 0)
    expect(total).toBe(PLAN_FEATURE_KEYS.length)
    expect(total).toBe(lignes.length)
  })

  it('sait dire NON — une ligne comptée dans le mauvais seau ferait échouer la somme ou l’égalité par état', () => {
    // Contrôle négatif de la garde d'addition : si `compterSeaux` oubliait un
    // état (ex. une clé absente de `TOUS_LES_SEAUX`), une ligne dans cet état
    // disparaîtrait de la somme plutôt que de faire échouer un `switch`.
    const lignes = construireRapportAdoption(PLANS, ABONNEMENTS, {
      chat_ai: { actifs: 30, joursObserves: 90 },
    })
    const compte = compterSeaux(lignes)
    expect(compte.adoptee).toBeGreaterThanOrEqual(1)
    // Retirer artificiellement le compte d'un seau connu romprait la somme —
    // preuve que le test ci-dessus mesure bien la vraie propriété.
    const compteFautif = { ...compte, adoptee: 0 }
    const totalFautif = Object.values(compteFautif).reduce((a, b) => a + b, 0)
    expect(totalFautif).toBeLessThan(lignes.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Libellés — jamais un chiffre nu, jamais un pourcentage sans phrase
// ─────────────────────────────────────────────────────────────────────────────

describe('libellés — un état ne s’affiche jamais en chiffre nu', () => {
  it('formaterTauxAdoption arrondit en pourcentage lisible', () => {
    expect(formaterTauxAdoption(0.6)).toBe('60 %')
    expect(formaterTauxAdoption(0.1)).toBe('10 %')
    expect(formaterTauxAdoption(0.667)).toBe('67 %')
  })

  it('libelleEtatAdoption nomme chacun des sept états, jamais un nombre seul', () => {
    const feature: PlanFeatureKey = 'discover'
    void feature
    expect(libelleEtatAdoption({ kind: 'sans_titulaire' })).toMatch(/éligible/)
    expect(libelleEtatAdoption({ kind: 'non_mesurable' })).toMatch(/mesurable/)
    expect(libelleEtatAdoption({ kind: 'observation_insuffisante', joursObserves: 12 })).toMatch(/12/)
    expect(libelleEtatAdoption({ kind: 'adoptee', taux: 0.72 })).toMatch(/72 %/)
    expect(libelleEtatAdoption({ kind: 'confidentielle', taux: 0.2 })).toMatch(/20 %/)
    expect(libelleEtatAdoption({ kind: 'ignoree', taux: 0.05, joursObserves: 90 })).toMatch(/5 %/)
    expect(libelleEtatAdoption({ kind: 'morte', joursObserves: 90 })).toMatch(/90/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #1685 — usageParFonctionDepuisSignaux : la route branchée sur le rapport
// ─────────────────────────────────────────────────────────────────────────────

function signal(overrides: Partial<SignalUsageAPI>): SignalUsageAPI {
  return { feature: 'crm_sync', activeWorkspaces: 12, windowDays: 90, notWiredReason: null, ...overrides }
}

describe('usageParFonctionDepuisSignaux — la route #1685 branchée sur `usageParFonction`', () => {
  it('un signal mesuré devient {actifs, joursObserves}', () => {
    const usage = usageParFonctionDepuisSignaux([signal({ feature: 'crm_sync', activeWorkspaces: 12, windowDays: 90 })])
    expect(usage.crm_sync).toEqual({ actifs: 12, joursObserves: 90 })
  })

  it('un signal non branché (`activeWorkspaces: null`) reste `null` — jamais un 0 inventé', () => {
    const usage = usageParFonctionDepuisSignaux([
      signal({ feature: 'exports', activeWorkspaces: null, notWiredReason: 'aucune trace persistée' }),
    ])
    expect(usage.exports).toBeNull()
  })

  it('sait dire NON — une clé qui n’est plus une fonction du catalogue LIVE est IGNORÉE, ne casse rien', () => {
    const usage = usageParFonctionDepuisSignaux([
      { feature: 'fonction_retiree_depuis', activeWorkspaces: 5, windowDays: 90, notWiredReason: null },
    ])
    expect(Object.keys(usage)).toHaveLength(0)
  })

  it('sait dire NON — un compte cassé (négatif, non entier) retombe sur `null`, jamais un petit compte', () => {
    expect(usageParFonctionDepuisSignaux([signal({ activeWorkspaces: -1 })]).crm_sync).toBeNull()
    expect(usageParFonctionDepuisSignaux([signal({ activeWorkspaces: 1.5 })]).crm_sync).toBeNull()
    expect(usageParFonctionDepuisSignaux([signal({ windowDays: Number.NaN })]).crm_sync).toBeNull()
  })

  it('une fenêtre COURTE (< 60 j) transmise par la route ne produit JAMAIS « ignorée » — le test que l’issue nomme', () => {
    // La route dit honnêtement qu'elle n'a observé que 10 jours, avec un taux
    // bas (1 sur 20 = 5 %, sous le seuil de « confidentielle »). Composé avec
    // `construireRapportAdoption` + `classerAdoption`, ceci NE DOIT JAMAIS
    // rendre « ignorée » : la fenêtre n'est pas mûre.
    const usage = usageParFonctionDepuisSignaux([signal({ feature: 'watchlist', activeWorkspaces: 1, windowDays: 10 })])
    const plans: AdoptionPlanCatalogue[] = [{ key: 'growth', label: 'Growth', features: ['watchlist'] }]
    const lignes = construireRapportAdoption(plans, { growth: 20 }, usage)
    const watchlist = lignes.find(l => l.feature === 'watchlist')!
    expect(watchlist.etat.kind).not.toBe('ignoree')
    expect(watchlist.etat.kind).not.toBe('morte')
    expect(watchlist.etat).toEqual({ kind: 'observation_insuffisante', joursObserves: 10 })
  })

  it('la MÊME fenêtre, mûre (≥ 60 j), avec le même taux bas non nul, rend bien « ignorée »', () => {
    const usage = usageParFonctionDepuisSignaux([signal({ feature: 'watchlist', activeWorkspaces: 1, windowDays: 90 })])
    const plans: AdoptionPlanCatalogue[] = [{ key: 'growth', label: 'Growth', features: ['watchlist'] }]
    const lignes = construireRapportAdoption(plans, { growth: 20 }, usage)
    expect(lignes.find(l => l.feature === 'watchlist')!.etat.kind).toBe('ignoree')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// #1685 — resumerMesureUsage : le résumé de tête d'écran
// ─────────────────────────────────────────────────────────────────────────────

describe('resumerMesureUsage — combien de fonctions sont mesurées, et pourquoi les autres ne le sont pas', () => {
  it('compte les fonctions mesurées et liste celles sans signal, avec leur raison', () => {
    const resume = resumerMesureUsage([
      signal({ feature: 'crm_sync', activeWorkspaces: 12 }),
      signal({ feature: 'exports', activeWorkspaces: null, notWiredReason: 'flux binaire, aucune ligne écrite' }),
      signal({
        feature: 'discover',
        activeWorkspaces: null,
        notWiredReason: 'aucun crédit dédié, aucune ligne écrite',
      }),
    ])
    expect(resume.totalFonctions).toBe(PLAN_FEATURE_KEYS.length)
    expect(resume.fonctionsMesurees).toBe(1)
    expect(resume.fonctionsSansSignal.map(f => f.feature).sort()).toEqual(['discover', 'exports'])
    expect(resume.fonctionsSansSignal.find(f => f.feature === 'exports')?.raison).toContain('flux binaire')
  })

  it('LIT quelque chose — totalFonctions vaut TOUJOURS 15, même sur une réponse partielle (déploiement asymétrique)', () => {
    const resume = resumerMesureUsage([signal({ feature: 'crm_sync', activeWorkspaces: 12 })])
    expect(resume.totalFonctions).toBe(15)
  })

  it('sait dire NON — n’expose JAMAIS autre chose qu’un nom de FONCTION : aucune clé d’espace possible dans la forme', () => {
    const resume = resumerMesureUsage([signal({ feature: 'exports', activeWorkspaces: null, notWiredReason: 'x' })])
    for (const entry of resume.fonctionsSansSignal) {
      expect(Object.keys(entry).sort()).toEqual(['feature', 'labelFr', 'raison'])
    }
  })
})

describe('RAISON_USAGE_INDISPONIBLE — jamais la même phrase que « aucune route n’existe »', () => {
  it('ne prétend plus qu’aucune route n’agrège ces signaux — ce serait redevenu FAUX depuis #1685', () => {
    expect(RAISON_USAGE_INDISPONIBLE).not.toMatch(/aucune route interne n.agrège/)
  })
})
