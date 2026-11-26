import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_MEASURES,
  DOSSIER_CONTINUITY_BREAKS,
  DOSSIER_CONTINUITY_PRACTICES,
  WEEKLY_SALES_TIME_BANDS,
} from './onboarding.js'
import {
  auditDeclaredSignalsSchema,
  AUDIT_ENTRY_AXIS_BY_RESPONSE_LEVEL,
  AUDIT_MAX_FRONTS_BY_WEEKLY_BAND,
  AUDIT_PRACTICE_BY_CONTINUITY_BREAK,
  AUDIT_SIGNAL_CORPUS,
  buildAuditDeclaredSignals,
  buildStrategicOptions,
} from './commercial-audit-signals.js'

/**
 * #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — LA GARDE DE CE LOT.
 *
 * Ce que ces tests doivent savoir dire NON :
 *  - un signal qui rendrait une valeur alors que RIEN n'a été déclaré (le
 *    défaut « non mesuré rendu 0 ») ;
 *  - un vocabulaire inventé : chaque libellé transporté doit être VERBATIM une
 *    valeur des catalogues du questionnaire ;
 *  - des seaux qui ne s'additionnent pas jusqu'au dénominateur (#2049.15) ;
 *  - une probabilité, un pourcentage ou un taux de conversion.
 */

/** Ce que l'audit lit quand la personne a répondu à tout le bloc L19/L17. */
const FULL = {
  activity_measures_tracked: ['Comptes travaillés', 'Contacts sollicités', 'Réponses obtenues'],
  activity_reference_period: 'Le trimestre écoulé',
  ideal_client_current_state: ['Correspond au profil théorique', 'Déjà un client connu'],
  ideal_client_accessibility: 'Accessible directement (réseau ou déjà en contact)',
  real_response_level: 'Niveau opérationnel',
  weekly_sales_time_declared: '10 à 20 heures par semaine',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  workload_variability: 'Ma charge est stable d’une semaine à l’autre',
  dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
} as const

describe('buildAuditDeclaredSignals — le corpus est lu', () => {
  it('lit des catalogues NON VIDES (un test qui ne lit rien ne garde rien)', () => {
    expect(ACTIVITY_MEASURES.length).toBe(11)
    expect(WEEKLY_SALES_TIME_BANDS.length).toBeGreaterThan(5)
    expect(DOSSIER_CONTINUITY_BREAKS.length).toBe(7)
    expect(DOSSIER_CONTINUITY_PRACTICES.length).toBe(10)
    expect(Object.keys(AUDIT_ENTRY_AXIS_BY_RESPONSE_LEVEL).length).toBe(4)
    expect(Object.keys(AUDIT_MAX_FRONTS_BY_WEEKLY_BAND).length).toBeGreaterThan(5)
  })

  it('le résultat complet passe son propre schéma', () => {
    expect(() => auditDeclaredSignalsSchema.parse(buildAuditDeclaredSignals(FULL))).not.toThrow()
    expect(() => auditDeclaredSignalsSchema.parse(buildAuditDeclaredSignals({}))).not.toThrow()
  })

  it('AUCUN signal ne rend de valeur quand rien n’a été déclaré', () => {
    const signals = buildAuditDeclaredSignals({})
    expect(signals.funnelBreak.kind).toBe('notDeclared')
    expect(signals.startingPoint.kind).toBe('notDeclared')
    expect(signals.entryAxis.kind).toBe('notDeclared')
    expect(signals.frontsBudget.kind).toBe('notDeclared')
    expect(signals.routineSeeds.kind).toBe('notDeclared')
  })
})

describe('#2049.15 — l’audit LOCALISE la rupture sans INVENTER de conversion', () => {
  it('nomme la première étape non comptée, et rien d’autre', () => {
    const { funnelBreak } = buildAuditDeclaredSignals({
      activity_measures_tracked: ['Comptes travaillés', 'Contacts sollicités'],
    })
    expect(funnelBreak).toMatchObject({ kind: 'break', stage: 'Réponses obtenues', unit: 'réponses' })
  })

  it('les quatre seaux s’ADDITIONNENT jusqu’au dénominateur des onze unités', () => {
    const { funnelBreak } = buildAuditDeclaredSignals({ activity_measures_tracked: ['Comptes travaillés'] })
    if (funnelBreak.kind !== 'break') throw new Error('attendu: break')
    expect(funnelBreak.trackedStages.length + funnelBreak.untrackedStages.length).toBe(ACTIVITY_MEASURES.length)
    // Chaque libellé transporté est VERBATIM une unité du catalogue.
    for (const stage of [...funnelBreak.trackedStages, ...funnelBreak.untrackedStages]) {
      expect(ACTIVITY_MEASURES.map(m => m.value)).toContain(stage)
    }
  })

  it('une liste vide n’est PAS « rien n’est suivi » : c’est « on n’a pas demandé »', () => {
    expect(buildAuditDeclaredSignals({ activity_measures_tracked: [] }).funnelBreak.kind).toBe('notDeclared')
  })

  it('les onze unités comptées rendent « complete », jamais 100 %', () => {
    const { funnelBreak } = buildAuditDeclaredSignals({
      activity_measures_tracked: ACTIVITY_MEASURES.map(m => m.value),
    })
    expect(funnelBreak.kind).toBe('complete')
    expect(JSON.stringify(funnelBreak)).not.toMatch(/%|rate|probab|chance/i)
  })

  it('AUCUN signal ne transporte un nombre à virgule (un taux déguisé)', () => {
    const serialized = JSON.stringify(buildAuditDeclaredSignals(FULL))
    expect(serialized).not.toMatch(/\d+\.\d+/)
    expect(serialized).not.toMatch(/%/)
  })
})

describe('#2042.15 — le point de départ peut différer de l’ambition', () => {
  it('« déjà un client connu » et un accès direct : le départ EST l’ambition', () => {
    const { startingPoint } = buildAuditDeclaredSignals(FULL)
    expect(startingPoint).toMatchObject({ kind: 'sameAsAmbition', reachableToday: ['Déjà un client connu'] })
  })

  it('un profil seulement THÉORIQUE fait diverger le point de départ', () => {
    const { startingPoint } = buildAuditDeclaredSignals({
      ideal_client_current_state: ['Correspond au profil théorique'],
    })
    expect(startingPoint).toMatchObject({
      kind: 'differsFromAmbition',
      declaredStates: ['Correspond au profil théorique'],
      reachableToday: [],
    })
  })

  it('la prospection à froid nécessaire est NOMMÉE comme écart, verbatim', () => {
    const { startingPoint } = buildAuditDeclaredSignals({
      ideal_client_current_state: ['Déjà un client connu'],
      ideal_client_accessibility: 'Hors réseau actuel, prospection à froid nécessaire',
    })
    expect(startingPoint).toMatchObject({
      kind: 'differsFromAmbition',
      gaps: ['Hors réseau actuel, prospection à froid nécessaire'],
    })
  })
})

describe('#2043.10 — la stratégie nomme son axe (top-down / bottom-up / multi-thread)', () => {
  it('l’axe se lit sur le niveau où les réponses arrivent RÉELLEMENT', () => {
    expect(
      buildAuditDeclaredSignals({ real_response_level: 'Niveau exécutif (COMEX / CODIR)' }).entryAxis,
    ).toMatchObject({ kind: 'measured', axis: 'topDown' })
    expect(buildAuditDeclaredSignals({ real_response_level: 'Niveau opérationnel' }).entryAxis).toMatchObject({
      axis: 'bottomUp',
    })
    expect(buildAuditDeclaredSignals({ real_response_level: 'Variable selon le compte' }).entryAxis).toMatchObject({
      axis: 'multiThread',
    })
  })

  it('un niveau hors catalogue ne se devine PAS', () => {
    expect(buildAuditDeclaredSignals({ real_response_level: 'Niveau inventé' }).entryAxis.kind).toBe('notDeclared')
  })

  it('l’écart avec l’axe VISÉ n’existe que si les deux sont connus', () => {
    const measured = buildAuditDeclaredSignals({ real_response_level: 'Niveau opérationnel' }, 'topDown')
    expect(measured).toMatchObject({ entryAxis: { divergesFromAim: true, aimedEntryStrategy: 'topDown' } })
    const noAim = buildAuditDeclaredSignals({ real_response_level: 'Niveau opérationnel' })
    expect(noAim.entryAxis).toMatchObject({ divergesFromAim: false, aimedEntryStrategy: null })
  })
})

describe('#2050.14 — peu de temps ⇒ moins de fronts, pas plus d’outils', () => {
  it('le budget se lit sur le temps PROTÉGÉ, jamais sur une fusion des trois états', () => {
    const { frontsBudget } = buildAuditDeclaredSignals(FULL)
    expect(frontsBudget).toMatchObject({
      kind: 'measured',
      source: 'protected',
      band: '2 à 5 heures par semaine',
      maxFronts: 1,
    })
  })

  it('à défaut de temps protégé, le temps ANNONCÉ sert et sa source est NOMMÉE', () => {
    const { frontsBudget } = buildAuditDeclaredSignals({ weekly_sales_time_declared: 'Plus de 20 heures par semaine' })
    expect(frontsBudget).toMatchObject({ source: 'declared', maxFronts: 4 })
  })

  it('« Je ne sais pas » n’est pas zéro heure', () => {
    expect(buildAuditDeclaredSignals({ weekly_sales_time_protected: 'Je ne sais pas' }).frontsBudget.kind).toBe(
      'notDeclared',
    )
  })

  it('« aucune heure » est un ZÉRO DÉCLARÉ, donc mesuré', () => {
    expect(
      buildAuditDeclaredSignals({ weekly_sales_time_protected: 'Aucune heure dans une semaine ordinaire' })
        .frontsBudget,
    ).toMatchObject({ kind: 'measured', maxFronts: 0 })
  })

  it('les érosions déclarées sont citées verbatim, jamais converties en malus', () => {
    const { frontsBudget } = buildAuditDeclaredSignals(FULL)
    if (frontsBudget.kind !== 'measured') throw new Error('attendu: measured')
    expect(frontsBudget.erosionRisks).toEqual(['Je bloque des créneaux mais ils sautent souvent'])
    // Le malus n'existe pas : la bande seule fixe le nombre de fronts.
    expect(frontsBudget.maxFronts).toBe(AUDIT_MAX_FRONTS_BY_WEEKLY_BAND['2 à 5 heures par semaine'])
  })
})

describe('#2051.16 — les routines se configurent à partir de ces ruptures', () => {
  it('chaque rupture déclarée cite l’habitude qui la tiendrait, verbatim du catalogue', () => {
    const { routineSeeds } = buildAuditDeclaredSignals(FULL)
    expect(routineSeeds).toMatchObject({
      kind: 'measured',
      seeds: [
        {
          breakDeclared: 'Un compte reste sans prochaine action',
          practice: 'Une prochaine action datée sur chaque compte',
          alreadyHeld: false,
        },
      ],
      unrouted: [],
    })
  })

  it('une habitude DÉJÀ tenue est dite tenue', () => {
    const { routineSeeds } = buildAuditDeclaredSignals({
      dossier_continuity_breaks: ['Une activité s’interrompt sans qu’on le voie'],
      dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
    })
    expect(routineSeeds).toMatchObject({ seeds: [{ alreadyHeld: true }] })
  })

  it('une rupture qu’aucune habitude du catalogue ne tient est NOMMÉE non routée', () => {
    const { routineSeeds } = buildAuditDeclaredSignals({
      dossier_continuity_breaks: ['Un besoin est mal qualifié au départ'],
    })
    expect(routineSeeds).toMatchObject({
      kind: 'measured',
      seeds: [],
      unrouted: ['Un besoin est mal qualifié au départ'],
    })
  })

  it('« je ne sais pas encore où ça décroche » est un état DISTINCT du silence', () => {
    expect(
      buildAuditDeclaredSignals({ dossier_continuity_breaks: ['Je ne sais pas encore où ça décroche'] }).routineSeeds
        .kind,
    ).toBe('notLocatedYet')
    expect(buildAuditDeclaredSignals({ dossier_continuity_breaks: [] }).routineSeeds.kind).toBe('notDeclared')
  })

  it('la table rupture → habitude ne cite QUE des valeurs des deux catalogues', () => {
    const entries = Object.entries(AUDIT_PRACTICE_BY_CONTINUITY_BREAK)
    expect(entries.length).toBeGreaterThan(3)
    for (const [declaredBreak, practice] of entries) {
      expect(DOSSIER_CONTINUITY_BREAKS as readonly string[]).toContain(declaredBreak)
      expect(DOSSIER_CONTINUITY_PRACTICES as readonly string[]).toContain(practice)
    }
  })
})

describe('#2066.19/.27 — buildStrategicOptions : la combinaison DÉJÀ DÉCLARÉE, jamais un catalogue générique', () => {
  it('corpus : le catalogue lu n’est pas vide', () => {
    expect(AUDIT_SIGNAL_CORPUS.goToMarketChannels.length).toBeGreaterThan(3)
  })

  it('rend `null` sans réponse déclarée — jamais une combinaison inventée', () => {
    expect(buildStrategicOptions({})).toBeNull()
  })

  it('rend `null` sous 2 voies : une seule option n’est pas un choix', () => {
    expect(buildStrategicOptions({ go_to_market_channels: ["Appels d'offres"] })).toBeNull()
  })

  it('« Mixte » seul ne compte pour aucune voie (comparer un choix à lui-même n’aide personne)', () => {
    expect(buildStrategicOptions({ go_to_market_channels: ['Mixte'] })).toBeNull()
    expect(buildStrategicOptions({ go_to_market_channels: ['Mixte', "Appels d'offres"] })).toBeNull()
  })

  it('2 voies déclarées : les deux, VERBATIM, sans potentiel/prérequis/limite/charge inventés', () => {
    const options = buildStrategicOptions({ go_to_market_channels: ['Rang 2', "Appels d'offres"] })
    expect(options).toEqual([
      { label: 'Rang 2', potential: null, prerequisite: null, limit: null, load: null },
      { label: "Appels d'offres", potential: null, prerequisite: null, limit: null, load: null },
    ])
  })

  it('l’ordre rendu est celui du catalogue du questionnaire, pas celui de la saisie', () => {
    const options = buildStrategicOptions({ go_to_market_channels: ["Appels d'offres", 'Direct client final'] })
    expect(options?.map(o => o.label)).toEqual(['Direct client final', "Appels d'offres"])
  })

  it('au-delà de 5 voies déclarées : LIMITÉE à 5 (#2066.27 — pas tout garder actif)', () => {
    const options = buildStrategicOptions({
      go_to_market_channels: [
        'Direct client final',
        'Rang 2',
        'Rang 3',
        'Partenaires ESN',
        'Cabinets de recrutement',
        'Freelance marketplaces',
      ],
    })
    expect(options).toHaveLength(5)
  })

  it('une entrée doublée ne compte qu’une fois', () => {
    const options = buildStrategicOptions({
      go_to_market_channels: ['Rang 2', 'Rang 2', "Appels d'offres"],
    })
    expect(options).toHaveLength(2)
  })
})

describe('le témoin des cas voisins — la garde n’attrape pas ce qu’elle ne vise pas', () => {
  it('un questionnaire rempli SUR D’AUTRES BLOCS ne déclenche aucun signal', () => {
    const signals = buildAuditDeclaredSignals({
      // des réponses réelles, mais d'autres questions : rien ici ne concerne
      // les cinq signaux — aucun ne doit s'inventer une valeur.
      ideal_client_max_sales_cycle: '3 à 6 mois',
      weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
      dossier_continuity_practices: ['Un suivi tenu à jour dans le CRM'],
    } as Parameters<typeof buildAuditDeclaredSignals>[0])
    expect(signals.funnelBreak.kind).toBe('notDeclared')
    expect(signals.startingPoint.kind).toBe('notDeclared')
    expect(signals.entryAxis.kind).toBe('notDeclared')
    expect(signals.frontsBudget.kind).toBe('notDeclared')
    expect(signals.routineSeeds.kind).toBe('notDeclared')
  })
})
