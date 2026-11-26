import { describe, expect, it } from 'vitest'
import { DOSSIER_CONTINUITY_BREAKS } from './answers-routines.js'
import { WEEKLY_SALES_TIME_BANDS } from './answers-temps.js'
import * as readoutModule from './audit-readout.js'
import { accessStrategy, auditFunnelBreak, auditStartingPoint, routineProposalsFromBreaks } from './audit-readout.js'
import { frontsBudget } from './fronts-budget.js'
import * as onboardingModule from '../onboarding.js'

/**
 * Les cinq dérivations de la lecture d'audit (#2042.15, #2043.10, #2049.15,
 * #2050.14, #2051.16).
 *
 * Chacune est tenue sur trois bords : elle sait dire OUI, elle sait dire
 * « je ne sais pas » (et ce n'est JAMAIS un zéro), et elle n'attrape pas ce
 * qu'elle ne vise pas. Le dernier bloc est transverse : AUCUNE sortie de ce
 * fichier ne porte de pourcentage, de score ni de probabilité.
 */

/**
 * #2050.14 / #2067 — décision Louis du 18/09/2026 : le nombre de fronts de
 * L'AUDIT gagne. `effortSpread` (plafond 3, un front RETIRÉ par érosion
 * déclarée) décrivait l'ANCIENNE règle de la relecture d'onboarding ; ses six
 * tests figeaient ce second calcul et partent avec lui. La règle unique
 * (jusqu'à 4 fronts, l'érosion CITÉE) est tenue par `frontsBudget`
 * (`onboarding/fronts-budget.ts`, testée dans `commercial-audit-signals.test.ts`),
 * et l'égalité des deux écrans par
 * `apps/web/src/features/onboarding/lib/audit-readout-fronts-parity.test.ts`.
 */
describe('#2050.14 — la relecture ne calcule PLUS son propre nombre de fronts', () => {
  it('le second calcul n’existe plus — ni ici, ni ré-exporté par le contrat', () => {
    expect(Object.keys(readoutModule)).not.toContain('effortSpread')
    expect(Object.keys(onboardingModule)).not.toContain('effortSpread')
  })

  it('le calcul unique est bien celui que la relecture peut appeler', () => {
    expect(frontsBudget({ weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[5] })).toMatchObject({
      kind: 'measured',
      maxFronts: 4,
    })
  })
})

describe('#2051.16 — une routine cite la rupture qui la fonde', () => {
  it('propose une routine par rupture DÉCLARÉE, en la citant', () => {
    const proposals = routineProposalsFromBreaks([DOSSIER_CONTINUITY_BREAKS[3], DOSSIER_CONTINUITY_BREAKS[0]])
    expect(proposals).toEqual([
      { routineKey: 'next_action', fromBreak: DOSSIER_CONTINUITY_BREAKS[3] },
      { routineKey: 'watchlist', fromBreak: DOSSIER_CONTINUITY_BREAKS[0] },
    ])
  })

  it('couvre les SIX ruptures nommables — le corpus n’est pas vide', () => {
    const nommables = DOSSIER_CONTINUITY_BREAKS.slice(0, 6)
    expect(routineProposalsFromBreaks(nommables)).toHaveLength(6)
    expect(new Set(routineProposalsFromBreaks(nommables).map(p => p.routineKey)).size).toBe(6)
  })

  it('sait dire NON — « je ne sais pas encore où ça décroche » ne configure RIEN', () => {
    expect(routineProposalsFromBreaks([DOSSIER_CONTINUITY_BREAKS[6]])).toEqual([])
    expect(routineProposalsFromBreaks([])).toEqual([])
    expect(routineProposalsFromBreaks(undefined)).toEqual([])
  })

  it('LE TÉMOIN — une valeur hors catalogue ne fabrique pas de routine', () => {
    expect(routineProposalsFromBreaks(['un truc écrit à la main'])).toEqual([])
  })
})

describe('#2042.15 — le point de départ peut différer de l’ambition', () => {
  it('nomme les OBSTACLES déclarés, et les appuis qui restent', () => {
    const start = auditStartingPoint({
      ideal_client_accessibility: 'Hors réseau actuel, prospection à froid nécessaire',
      ideal_client_referencement_constraints: ['Accord-cadre ou marché existant requis'],
      ideal_client_current_state: ['Correspond au profil théorique', 'Déjà un client connu'],
    })
    expect(start).toEqual({
      kind: 'differs',
      obstacles: ['Hors réseau actuel, prospection à froid nécessaire', 'Accord-cadre ou marché existant requis'],
      // « Correspond au profil théorique » décrit le PROFIL, pas l'accès : il
      // n'est jamais un appui.
      grounds: ['Déjà un client connu'],
    })
  })

  it('dit que l’ambition EST le point de départ quand rien ne s’y oppose', () => {
    expect(
      auditStartingPoint({
        ideal_client_accessibility: 'Accessible directement (réseau ou déjà en contact)',
        ideal_client_referencement_constraints: ['Aucune contrainte de référencement connue'],
        ideal_client_current_state: ['Accessible dès maintenant'],
      }),
    ).toEqual({ kind: 'ambition_is_reachable', grounds: ['Accessible dès maintenant'] })
  })

  it('se TAIT quand rien n’est déclaré — jamais « aucun obstacle »', () => {
    expect(auditStartingPoint({})).toEqual({ kind: 'not_measured' })
    expect(auditStartingPoint({ ideal_client_current_state: ['Correspond au profil théorique'] })).toEqual({
      kind: 'not_measured',
    })
  })

  it('LE TÉMOIN — « aucune contrainte connue » n’est pas un obstacle', () => {
    expect(
      auditStartingPoint({
        ideal_client_referencement_constraints: ['Aucune contrainte de référencement connue'],
        ideal_client_current_state: ['Particulièrement rentable'],
      }),
    ).toMatchObject({ kind: 'ambition_is_reachable' })
  })
})

describe('#2043.10 — top-down / bottom-up / multi-thread', () => {
  it('top-down quand les réponses arrivent au niveau exécutif et que le budget s’y valide', () => {
    expect(
      accessStrategy({
        real_response_level: 'Niveau exécutif (COMEX / CODIR)',
        budget_validator: 'Le décideur rencontré directement',
      }),
    ).toEqual({ kind: 'axis', axis: 'top_down', basedOn: ['real_response_level', 'budget_validator'] })
  })

  it('bottom-up quand on est reçu au niveau opérationnel et que le budget s’y valide', () => {
    expect(
      accessStrategy({
        real_response_level: 'Niveau opérationnel',
        budget_validator: 'Le décideur rencontré directement',
      }),
    ).toMatchObject({ axis: 'bottom_up' })
  })

  it('multi-thread quand le budget se valide AILLEURS que là où l’on est reçu', () => {
    expect(
      accessStrategy({
        real_response_level: 'Niveau opérationnel',
        budget_validator: 'Un niveau direction générale (COMEX)',
      }),
    ).toMatchObject({ axis: 'multi_thread' })
    // Même pour un accès exécutif : les achats sont une seconde porte.
    expect(
      accessStrategy({
        real_response_level: 'Niveau exécutif (COMEX / CODIR)',
        budget_validator: 'Les achats, après validation technique',
      }),
    ).toMatchObject({ axis: 'multi_thread' })
  })

  it('multi-thread quand la personne déclare elle-même « variable selon le compte »', () => {
    expect(accessStrategy({ real_response_level: 'Variable selon le compte' })).toMatchObject({
      axis: 'multi_thread',
    })
  })

  it('sait dire « je ne sais pas » — aucune stratégie par DÉFAUT', () => {
    expect(accessStrategy({})).toEqual({ kind: 'not_measured' })
    expect(accessStrategy({ budget_validator: 'Un niveau direction générale (COMEX)' })).toEqual({
      kind: 'not_measured',
    })
  })
})

describe('#2049.15 — la rupture est localisée, sans conversion inventée', () => {
  it('nomme la première unité non suivie', () => {
    const readout = auditFunnelBreak({ activity_measures_tracked: ['Contacts travaillés'] })
    expect(readout.kind).toBe('break')
  })

  it('distingue « rien n’est déclaré » de « rien n’est suivi »', () => {
    expect(auditFunnelBreak({ activity_measures_tracked: [] })).toEqual({ kind: 'not_declared' })
    expect(auditFunnelBreak({})).toEqual({ kind: 'not_declared' })
  })
})

describe('LE BORD TRANSVERSE — aucune sortie ne porte de probabilité', () => {
  it('ne rend jamais ni taux, ni score, ni pourcentage', () => {
    const sorties: unknown[] = [
      frontsBudget({ weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS[4] }),
      routineProposalsFromBreaks(DOSSIER_CONTINUITY_BREAKS.slice(0, 6)),
      auditStartingPoint({ ideal_client_accessibility: 'Hors réseau actuel, prospection à froid nécessaire' }),
      accessStrategy({ real_response_level: 'Niveau opérationnel' }),
      auditFunnelBreak({ activity_measures_tracked: ['Contacts travaillés'] }),
    ]
    // Le corpus n'est pas vide : cinq sorties réelles, pas un tableau qu'on
    // parcourt sans rien lire.
    expect(sorties).toHaveLength(5)
    const clefs = sorties.flatMap(sortie => Object.keys(JSON.parse(JSON.stringify(sortie)) as object))
    expect(clefs.length).toBeGreaterThan(5)
    for (const clef of clefs) {
      expect(clef).not.toMatch(/rate|percent|score|probab|chance|conversion/i)
    }
  })
})
