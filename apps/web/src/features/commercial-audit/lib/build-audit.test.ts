import { describe, expect, it } from 'vitest'
import type { MyPlanAction, ProfileContext, ProfileContextRevisionSummary, TalentStats } from '@bellum/contracts'
import { COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION, commercialAuditContextSchema } from '@bellum/contracts'
import {
  buildCommercialAudit,
  buildCommercialAuditContext,
  buildThirtyDayPlanFromActions,
  domainForActionTarget,
} from './build-audit'
import { commercialTensionSignalsFromTalentStats } from './tension-detectors'

/**
 * Ce que ces tests doivent savoir dire NON.
 *
 * Le défaut qu'ils gardent n'est pas « le composant ne rend rien » : c'est un
 * écran qui écrit « 0 » là où le profil n'a rien dit. Chaque cas ci-dessous
 * casse si la dérivation comble un trou.
 */

const FULL: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Assurance'],
    decisionLevel: 'manager',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: ['Data'],
  },
  messagingStyle: {
    tone: 'consultative',
    messageLength: 'concise',
    valuePropositionAngle: 'La reprise de dette technique sans arrêt de production',
    differentiationPoints: ['Crédibilité technique', 'Anciennes relations'],
    avoid: ['Ouvrir dix fronts sans responsable'],
  },
  coachingInsights: {
    mainWeakness: 'Les dossiers avancent sans responsable nommé',
    keyAdvice: 'Rappeler les reprises datées',
    cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 4 },
    kpiTargets: { accountsPerMonth: 8, rdvPerMonth: 4, conversionRateTarget: '12 %' },
  },
  bellumPhrases: {
    welcome: 'On reprend là où tu en étais',
    firstAnalysisCta: 'Ouvre un premier compte',
    weeklySummaryIntro: 'Cette semaine',
    emptyState: 'Rien pour le moment',
    scoreContext: 'Décomposé par axe',
  },
}

const REVISIONS: ProfileContextRevisionSummary[] = [
  { version: 2, schema_version: 1, created_at: '2026-09-12T08:00:00.000Z', was_last_validated: false },
  { version: 4, schema_version: 1, created_at: '2026-09-14T08:00:00.000Z', was_last_validated: false },
]

function headline(audit: ReturnType<typeof buildCommercialAudit>, key: string) {
  return audit.headlines.find(item => item.key === key)
}

function column(audit: ReturnType<typeof buildCommercialAudit>, key: string) {
  return audit.columns.find(item => item.key === key)
}

function consequence(audit: ReturnType<typeof buildCommercialAudit>, key: string) {
  return audit.consequences.find(item => item.key === key)
}

/** Les seules CLÉS de la liste — la raison se vérifie séparément. */
function unestablishedKeys(audit: ReturnType<typeof buildCommercialAudit>) {
  return audit.unestablished.map(entry => entry.key)
}

describe('buildCommercialAudit — ce qui est mesuré', () => {
  it('lit le goulot, la cadence et la cible sur le profil', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(headline(audit, 'bottleneck')?.value).toEqual({
      kind: 'text',
      text: 'Les dossiers avancent sans responsable nommé',
    })
    expect(headline(audit, 'cadence')?.value).toEqual({
      kind: 'cadence',
      analysesPerWeek: 3,
      messagesPerDay: 5,
      followUpsPerWeek: 4,
    })
    expect(headline(audit, 'target')?.value).toMatchObject({ size: 'eti', decisionLevel: 'manager' })
    // Profil COMPLET : plus aucune entrée de profil n'est manquante.
    expect(unestablishedKeys(audit)).not.toContain('coachingInsights')
    expect(unestablishedKeys(audit)).not.toContain('messagingStyle')
  })

  it('range les trois colonnes sur des phrases ÉCRITES dans le profil, jamais devinées', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(column(audit, 'stop')?.items).toEqual(['Ouvrir dix fronts sans responsable'])
    expect(column(audit, 'keep')?.items).toEqual(['Crédibilité technique', 'Anciennes relations'])
    expect(column(audit, 'reinforce')?.items).toEqual([
      'Les dossiers avancent sans responsable nommé',
      'Rappeler les reprises datées',
    ])
  })

  it('prend la version la PLUS RÉCENTE par son numéro, pas par l’ordre rendu', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(audit.version).toBe(4)
    expect(audit.updatedAt).toBe('2026-09-14T08:00:00.000Z')
  })
})

describe('buildCommercialAudit — « non mesuré » n’est jamais « 0 »', () => {
  it('rend null, et NOMME ce qui manque, quand il n’y a aucun contexte', () => {
    const audit = buildCommercialAudit(null, [])
    for (const item of audit.headlines) expect(item.value).toBeNull()
    for (const item of audit.columns) expect(item.items).toBeNull()
    for (const item of audit.consequences) expect(item.rule).toBeNull()
    expect(audit.version).toBeNull()
    expect(audit.updatedAt).toBeNull()
    // Ce qui remplace le « niveau de confiance » : une liste NOMMÉE, pas un
    // pourcentage — un chiffre unique mesurerait nos données et se lirait
    // comme une chance de réussite.
    expect(unestablishedKeys(audit)).toContain('coachingInsights')
    expect(unestablishedKeys(audit)).toContain('messagingStyle')
    expect(audit).not.toHaveProperty('confidence')
    expect(audit).not.toHaveProperty('score')
  })

  it('ne transforme pas un bloc de coaching absent en goulot vide', () => {
    const { coachingInsights: _dropped, ...withoutCoaching } = FULL
    const audit = buildCommercialAudit(withoutCoaching as ProfileContext, REVISIONS)
    expect(headline(audit, 'bottleneck')?.value).toBeNull()
    expect(headline(audit, 'cadence')?.value).toBeNull()
    expect(column(audit, 'reinforce')?.items).toBeNull()
    expect(consequence(audit, 'load')?.rule).toBeNull()
    expect(unestablishedKeys(audit)).toContain('coachingInsights')
  })

  it('traite une phrase VIDE comme non mesurée, pas comme un fait', () => {
    const audit = buildCommercialAudit({ ...FULL, coachingInsights: { mainWeakness: '   ', keyAdvice: '' } }, REVISIONS)
    expect(headline(audit, 'bottleneck')?.value).toBeNull()
    // Le bloc EXISTE : la colonne est mesurée et vide — ce n'est pas la même
    // chose qu'un bloc absent, et l'écran ne dit pas la même phrase.
    expect(column(audit, 'reinforce')?.items).toEqual([])
  })

  it('garde un ZÉRO MESURÉ comme un fait — un bloc présent qui dit zéro dit zéro', () => {
    const audit = buildCommercialAudit(
      {
        ...FULL,
        coachingInsights: {
          ...FULL.coachingInsights!,
          cadenceRecommendation: { analysesPerWeek: 0, messagesPerDay: 0, followUpsPerWeek: 0 },
        },
      },
      REVISIONS,
    )
    expect(headline(audit, 'cadence')?.value).toEqual({
      kind: 'cadence',
      analysesPerWeek: 0,
      messagesPerDay: 0,
      followUpsPerWeek: 0,
    })
    expect(unestablishedKeys(audit)).not.toContain('cadenceRecommendation')
  })

  it('distingue une liste VIDE d’un bloc ABSENT sur la colonne « Arrêter »', () => {
    const measuredButEmpty = buildCommercialAudit(
      { ...FULL, messagingStyle: { ...FULL.messagingStyle!, avoid: [] } },
      REVISIONS,
    )
    expect(column(measuredButEmpty, 'stop')?.items).toEqual([])
    expect(unestablishedKeys(measuredButEmpty)).not.toContain('messagingStyle')

    const { messagingStyle: _dropped, ...withoutMessaging } = FULL
    const absent = buildCommercialAudit(withoutMessaging as ProfileContext, REVISIONS)
    expect(column(absent, 'stop')?.items).toBeNull()
    expect(unestablishedKeys(absent)).toContain('messagingStyle')
  })

  it('ne promet pas une règle de message sans angle de valeur', () => {
    const audit = buildCommercialAudit(
      { ...FULL, messagingStyle: { ...FULL.messagingStyle!, valuePropositionAngle: '  ' } },
      REVISIONS,
    )
    expect(consequence(audit, 'messages')?.rule).toBeNull()
  })

  // #2067.1 / #2067.3 — un nombre de comptes actifs ET un volume de suivi
  // recommandés : le profileur les calcule déjà (`kpiTargets`), et rien ne
  // les affichait. #2067.2 (partenaires), #2067.4 (créneaux), #2067.5
  // (réserve) et #2067.6 (éléments à reporter) restent `retenu` : aucun champ
  // du profil ne les mesure, et les inventer serait la donnée fictive que le
  // dépôt refuse.
  it('recommande un nombre de comptes actifs et un volume de rendez-vous, jamais un taux de conversion', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(consequence(audit, 'kpiTargets')?.rule).toEqual({
      kind: 'kpiTargets',
      accountsPerMonth: 8,
      rdvPerMonth: 4,
      // #2067.2 — le profil de référence ne déclare aucun partenaire : la
      // cible est NOMMÉE absente, elle ne vaut pas 0 (GA-18 / GA-19).
      partnersPerMonth: null,
    })
    // #2066 / doctrine « aucune probabilité » — `conversionRateTarget` EXISTE
    // sur le profil (« 12 % ») mais ne doit JAMAIS atteindre l'audit : c'est
    // un taux de conversion, la forme exacte du prévisionnel pondéré refusé
    // six fois. Le test lit l'objet SÉRIALISÉ pour qu'aucun champ, même
    // ajouté par erreur ailleurs dans le fichier, ne le laisse passer.
    expect(JSON.stringify(audit)).not.toContain('conversionRateTarget')
    expect(JSON.stringify(audit)).not.toContain('12 %')
  })

  // #2067.2 — la cible partenaires suit l'archétype. C'était le DERNIER point
  // non répondu de #2067 : le moteur la calcule désormais (`kpiTargets
  // .partnersPerMonth`), et cet audit est l'écran qui la rend.
  it('remonte la cible partenaires quand le moteur l’a calculée', () => {
    const audit = buildCommercialAudit(
      {
        ...FULL,
        coachingInsights: {
          ...FULL.coachingInsights!,
          kpiTargets: { ...FULL.coachingInsights!.kpiTargets!, partnersPerMonth: 5 },
        },
      },
      REVISIONS,
    )
    expect(consequence(audit, 'kpiTargets')?.rule).toEqual({
      kind: 'kpiTargets',
      accountsPerMonth: 8,
      rdvPerMonth: 4,
      partnersPerMonth: 5,
    })
  })

  it('cible partenaires non calculée : `null` dans la règle, jamais 0 (GA-18 / GA-19)', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    const rule = consequence(audit, 'kpiTargets')?.rule
    expect(rule && rule.kind === 'kpiTargets' ? rule.partnersPerMonth : 'absent').toBeNull()
    expect(JSON.stringify(audit)).not.toContain('"partnersPerMonth":0')
  })

  it('sans objectifs mensuels sur le profil : `null`, jamais un compte à zéro', () => {
    const audit = buildCommercialAudit(
      { ...FULL, coachingInsights: { mainWeakness: FULL.coachingInsights!.mainWeakness, keyAdvice: '' } },
      REVISIONS,
    )
    expect(consequence(audit, 'kpiTargets')?.rule).toBeNull()
    // #2062 a change la FORME de `unestablished` (entrees `{ key, reason }`) apres
    // que #2067 a ecrit cette ligne sur des chaines nues : on lit la meme chose,
    // par le meme helper que le reste du fichier.
    expect(unestablishedKeys(audit)).toContain('kpiTargets')
  })
})

/**
 * #2073.11 — LA STRATÉGIE CHOISIE REMPLACE LA STRATÉGIE CALCULÉE, doublon
 * assumé de #2068.22-.33 : `entryStrategy` alimente déjà `AuditConsequences`
 * (règle « accounts ») — le 4e paramètre fait entrer le champ CHOISI (#2073.8,
 * persisté par l'utilisateur) là où le champ CALCULÉ par le profileur
 * entrait, sans re-câbler la règle elle-même (GA-26, un seul endroit tranche).
 */
describe('buildCommercialAudit — #2073.11 la stratégie CHOISIE remplace la CALCULÉE', () => {
  it('sans choix, la conséquence « accounts » lit la stratégie CALCULÉE par le profileur', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(consequence(audit, 'accounts')?.rule).toMatchObject({ entryStrategy: 'bottomUp' })
  })

  it('avec un choix, la conséquence « accounts » lit la stratégie CHOISIE — une correction humaine gagne toujours', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS, null, 'multiThread')
    expect(consequence(audit, 'accounts')?.rule).toMatchObject({ entryStrategy: 'multiThread' })
  })

  it('un choix seul, sans profil idéal établi, ne fabrique PAS une conséquence « accounts » — pas de donnée fictive', () => {
    const audit = buildCommercialAudit(null, [], null, 'multiThread')
    expect(consequence(audit, 'accounts')?.rule).toBeNull()
  })
})

/**
 * Défaut du 16/09/2026 — LA LISTE DIT LA VÉRITÉ SUR L'ÉCRAN, PAS SUR LE PROFIL.
 *
 * Mesuré en production le 16/09/2026 sur `/settings/profile/audit` (compte
 * réel, API `4172ec196`) : trois blocs rendaient « non mesuré » — le plan à
 * 4 semaines, les paliers, la configuration produit — et le bloc « Ce qui n'a
 * pas pu être établi » concluait, sur la MÊME page, « Tout ce que cet écran
 * affiche a pu être établi ». La liste ne lisait que les entrées du PROFIL ;
 * son titre promet l'ÉCRAN.
 */
describe('buildCommercialAudit — ce qui n’a pas pu être établi', () => {
  it('nomme les blocs que l’écran rend « non mesuré », même avec un profil COMPLET', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(unestablishedKeys(audit)).toEqual(expect.arrayContaining(['thirtyDayPlan', 'milestones']))
    // #2068.24/.26/.27 — décision Louis 21/09/2026 : `productConfiguration` a
    // une source (les réglages de cet espace, `audit-product-configuration.ts`).
    // Un profil COMPLET la RENSEIGNE : elle n'a plus à être nommée ici — la
    // nommer quand même serait l'inverse du défaut du 16/09, l'écran
    // l'afficherait et la liste la dirait absente.
    expect(unestablishedKeys(audit)).not.toContain('productConfiguration')
    expect(audit.contextBlocks.productConfiguration).not.toBeNull()
  })

  it('INVARIANT : un bloc rendu `null` interdit une liste vide — la phrase de secours mentirait', () => {
    for (const profile of [FULL, null]) {
      const audit = buildCommercialAudit(profile, REVISIONS)
      const rendered = [
        audit.contextBlocks.thirtyDayPlan,
        audit.contextBlocks.milestones,
        audit.contextBlocks.productConfiguration,
      ]
      const unmeasured = rendered.filter(block => block === null).length
      // Le témoin : la mesure n'est pas vide, sinon l'invariant est vide de sens.
      expect(rendered).toHaveLength(3)
      if (unmeasured > 0) expect(audit.unestablished.length).toBeGreaterThanOrEqual(unmeasured)
    }
  })

  it('distingue la RAISON : le profil manquant se complète, une source absente non', () => {
    const audit = buildCommercialAudit(null, [])
    const reasonOf = (key: string) => audit.unestablished.find(entry => entry.key === key)?.reason
    expect(reasonOf('coachingInsights')).toBe('profileMissing')
    // #2068.1 — décision Louis 19/09/2026 (2068.11) : `thirtyDayPlan` a
    // désormais une source (Actions) ; sa raison d'absence n'est plus
    // « aucune source » mais « aucune action ouverte ».
    expect(reasonOf('thirtyDayPlan')).toBe('noActionsYet')
    expect(reasonOf('milestones')).toBe('noSourceYet')
    // #2068.24/.26/.27 — même bascule que `thirtyDayPlan` ci-dessus :
    // `productConfiguration` lit les réglages de cet espace, donc son absence
    // se répare en complétant son profil — `noSourceYet` mentirait.
    expect(reasonOf('productConfiguration')).toBe('profileMissing')
  })

  it('#2067 — `kpiTargets` reste dans la liste : présent il n’y est pas, absent il y est', () => {
    expect(unestablishedKeys(buildCommercialAudit(FULL, REVISIONS))).not.toContain('kpiTargets')
    const { coachingInsights: _dropped, ...withoutCoaching } = FULL
    expect(unestablishedKeys(buildCommercialAudit(withoutCoaching as ProfileContext, REVISIONS))).toContain(
      'kpiTargets',
    )
  })

  it('ne rend jamais deux fois la même clé — une liste de doublons n’est pas une liste', () => {
    const keys = unestablishedKeys(buildCommercialAudit(null, []))
    expect(keys.length).toBeGreaterThan(0)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

/**
 * #2457 — Décision Louis 16/09/2026 : `verdict`/`maturity`/`priority` n'ont
 * pas pu CONCLURE, faute d'assez d'entrées mesurées — ils entrent dans
 * « Ce qui n'a pas pu être établi » au même titre qu'un bloc source absent,
 * chacun avec sa raison DÉRIVÉE (jamais un « indisponible » nu).
 *
 * GA-345 (`architecture/audit-unestablished-reads-the-screen.test.ts`) tient
 * la FORME (l'entrée arrive, avec un détail) ; ce fichier tient la VALEUR
 * rendue elle-même — les nombres exacts, pas seulement leur présence.
 */
describe('buildCommercialAudit — les trois conclusions non tirées', () => {
  function derivedEntry(audit: ReturnType<typeof buildCommercialAudit>, key: 'verdict' | 'maturity' | 'priority') {
    return audit.unestablished.find(entry => entry.key === key)
  }

  it('profil ABSENT : les trois n’ont rien pour conclure, chacune avec son compte', () => {
    const audit = buildCommercialAudit(null, [])

    const verdict = derivedEntry(audit, 'verdict')
    expect(verdict).toEqual({ key: 'verdict', reason: 'notConcluded', rulesChecked: 18 })

    const priority = derivedEntry(audit, 'priority')
    expect(priority).toEqual({ key: 'priority', reason: 'notConcluded', rulesChecked: 18 })

    const maturity = derivedEntry(audit, 'maturity')
    expect(maturity).toMatchObject({ key: 'maturity', reason: 'notConcluded', axesTotal: 13, axesMinimum: 3 })
    // #2065 — sous 3 axes évalués, jamais un taux : le compte RÉEL, pas une
    // couverture de marché (GA-259).
    expect((maturity as { axesEvaluated: number }).axesEvaluated).toBeLessThan(3)
  })

  it('profil COMPLET : les trois ont pu conclure — aucun n’apparaît dans la liste', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(derivedEntry(audit, 'verdict')).toBeUndefined()
    expect(derivedEntry(audit, 'priority')).toBeUndefined()
    expect(derivedEntry(audit, 'maturity')).toBeUndefined()
  })

  it('la raison est un COMPTE, jamais une probabilité ni un pourcentage — doctrine « aucune probabilité » (six fois refusée)', () => {
    const entries = buildCommercialAudit(null, []).unestablished
    expect(JSON.stringify(entries)).not.toMatch(/%|chance|probabilit/i)
  })
})

/**
 * #2061 — `buildCommercialAuditContext` : le CONTRAT distinct, versionné.
 *
 * Ne rejoue pas les cas ci-dessus (même moteur, `buildCommercialAudit` en
 * dessous) : vérifie seulement le PONT vers la nouvelle forme, et que
 * l'objet produit est un `CommercialAuditContext` VALIDE au sens du schéma
 * (le `.parse()` fait échouer le test si un champ dérive du contrat).
 */
describe('buildCommercialAuditContext — le contrat versionné', () => {
  it('produit un objet qui PARSE contre `commercialAuditContextSchema`', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(() => commercialAuditContextSchema.parse(context)).not.toThrow()
  })

  it('porte la version de SCHÉMA et la même référence que le ProfileContext (#2061.24)', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.schemaVersion).toBe(COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION)
    expect(context.profileContextVersion).toBe(4)
    expect(context.generatedAt).toBe('2026-09-14T08:00:00.000Z')
  })

  it('sans instantané, la date et la version restent `null` ENSEMBLE — jamais un horodatage inventé', () => {
    const context = buildCommercialAuditContext(null, [])
    expect(context.generatedAt).toBeNull()
    expect(context.profileContextVersion).toBeNull()
  })

  it('#2061.5 — nomme les origines non établies dans `unknowns`, jamais une liste vide qui ment', () => {
    const context = buildCommercialAuditContext(null, [])
    expect(context.unknowns).toEqual(
      expect.arrayContaining([
        { label: 'coachingInsights', reason: null },
        { label: 'messagingStyle', reason: null },
      ]),
    )
  })

  it('#2061.9 — la capacité est RETIRÉE du contrat (24/09/2026) : `AuditHero` la dit déjà via la carte « Cadence »', () => {
    // Un champ qui ne pouvait STRUCTURELLEMENT jamais valoir autre chose que
    // « non mesuré » (aucun producteur pour `state: 'measured'`) et que
    // personne ne lisait était exactement le défaut n°1 de ce dépôt — voir
    // le docblock d'`auditContradictionSchema` (`commercial-audit-context.ts`).
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context).not.toHaveProperty('capacity')
  })

  it('#2061.12 — porte le goulot unique en breakpoint NOMMÉ quand il est établi', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.breakpoints).toEqual([
      {
        label: 'Goulot principal',
        detail: 'Les dossiers avancent sans responsable nommé',
        provenance: null,
        confidence: null,
      },
    ])
  })

  it('#2061.12 — aucun goulot établi → `null`, pas un tableau vide qui prétend avoir cherché', () => {
    const { coachingInsights: _dropped, ...withoutCoaching } = FULL
    const context = buildCommercialAuditContext(withoutCoaching as ProfileContext, REVISIONS)
    expect(context.breakpoints).toBeNull()
  })

  it('#2061.16 — reprend Stop/Keep/Reinforce déjà mesuré, sans le recalculer autrement', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.stopKeepReinforce).toEqual({
      stop: ['Ouvrir dix fronts sans responsable'],
      keep: ['Crédibilité technique', 'Anciennes relations'],
      reinforce: ['Les dossiers avancent sans responsable nommé', 'Rappeler les reprises datées'],
    })
  })

  it('#2061.19 — ne porte que les personnalisations MESURÉES, jamais une clé sans règle', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    const keys = context.productPersonalization?.map(item => item.key) ?? []
    expect(keys.sort()).toEqual(['accounts', 'contacts', 'copilot', 'kpiTargets', 'load', 'messages', 'routines'])

    const empty = buildCommercialAuditContext(null, [])
    expect(empty.productPersonalization).toEqual([])
  })

  // #2064.1-.17 — le moteur de détection est désormais BRANCHÉ ici : sans cet
  // appel, `tension-detectors.ts` serait du code juste, calculé, testé, que
  // personne n'appelle — le défaut n°1 du dépôt.
  it('#2064 — `contradictions` est TOUJOURS un tableau, jamais `null` : le moteur tourne systématiquement', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(Array.isArray(context.contradictions)).toBe(true)
  })

  it('#2064/#2066 — un profil équilibré ne déclenche aucune des 5 règles calculables depuis le profil, et les 13 règles à signal externe restent NOMMÉES dans `unknowns`', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.contradictions).toEqual([])
    const unknownLabels = context.unknowns?.map(u => u.label) ?? []
    expect(unknownLabels).toEqual(
      expect.arrayContaining([
        'Vivier sans disponibilité',
        'Besoins sans qualification',
        'Profils sans engagement',
        'Partenaires sans économie ni feedback',
        'Contenu sans exploitation commerciale',
        'Appels d’offres sans GO/NO-GO',
        'Missions sans capitalisation',
        'Contact sans date de reprise',
        'Besoin réduit à un intitulé',
        'Profil non sécurisé',
        'Entretien sans suite',
        'Mission sans renouvellement',
        'Feedback non consigné',
      ]),
    )
  })

  it('#2064.2 — un profil qui vise trop de secteurs à la fois DÉCLENCHE la règle nommée', () => {
    const context = buildCommercialAuditContext(
      { ...FULL, idealAccountProfile: { ...FULL.idealAccountProfile!, sectorsPriority: ['A', 'B', 'C', 'D'] } },
      REVISIONS,
    )
    expect(context.contradictions?.map(c => c.ruleId)).toContain('tooManySimultaneousMarkets')
  })

  // #2065.1-.18 — le moteur de maturité est désormais BRANCHÉ ici.
  it('#2065 — `maturity` porte TOUJOURS les 13 axes (#2860), jamais `null`', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.maturity).not.toBeNull()
    expect(context.maturity?.axes).toHaveLength(13)
  })

  it('#2065 — sans aucun profil, moins de 3 axes sont évaluables : aucun score global, les axes restent NOMMÉS', () => {
    const context = buildCommercialAuditContext(null, [])
    expect(context.maturity?.score).toBeNull()
    expect(context.maturity?.reason).not.toBeNull()
    expect(context.maturity?.axes).toHaveLength(13)
  })
})

/**
 * #2068.1 / #2068.24-.31 — Décision Louis 19/09/2026 (2068.11) : la
 * replanification vit dans ACTIONS, l'audit y renvoie. Issue #2068 réfutée en
 * prod le 19/09 (e6f8a20ea) : `auditWeeklyPlanSchema` n'avait AUCUN
 * producteur. Ces tests savent dire NON tant que `thirtyDayPlan` reste écrit
 * `null` en dur ou qu'une répartition par semaine est DEVINÉE.
 */
const TODAY = new Date('2026-09-19T00:00:00.000Z')

function myAction(overrides: Partial<MyPlanAction> = {}): MyPlanAction {
  return {
    id: 'a-1',
    account_id: 'acc-1',
    label: 'Relancer le DSI',
    week_index: 0,
    step_index: 0,
    done: false,
    due_date: null,
    completed_at: null,
    execution_status: 'todo',
    snoozed_until: null,
    assigned_to: null,
    owner_name: null,
    expected_outcome: null,
    kpi: null,
    result: null,
    target: null,
    reason: null,
    contact_id: null,
    depends_on_item_id: null,
    provenance: null,
    confidence: null,
    cost_credits: null,
    outcome: null,
    completion_mode: null,
    source_recommendation: null,
    method_rule: null,
    external_execution_id: null,
    stop_condition: null,
    send_status: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    company_name: 'Thales',
    ...overrides,
    // #2395.4 — explicite plutôt que laissé au spread : `overrides.channel`
    // optionnel se relirait `| undefined`, incompatible avec le champ requis.
    channel: overrides.channel ?? null,
  }
}

describe('domainForActionTarget — #2068.24-.31, le lien type d’action ↔ domaine, à UN endroit', () => {
  it('relie les 6 natures qui ont une aire produit nommée', () => {
    expect(domainForActionTarget('contact')).toBe('contacts')
    expect(domainForActionTarget('meeting')).toBe('routinesPilotageNotifications')
    expect(domainForActionTarget('crm_task')).toBe('routinesPilotageNotifications')
    expect(domainForActionTarget('sequence')).toBe('sequences')
    expect(domainForActionTarget('need')).toBe('matchingActionPlan')
    expect(domainForActionTarget('partner')).toBe('reverseMarket')
  })

  it('#2068.24-.31 — `project`/`verification` n’ont AUCUNE aire aujourd’hui : `null`, jamais un rattachement deviné', () => {
    expect(domainForActionTarget('project')).toBeNull()
    expect(domainForActionTarget('verification')).toBeNull()
  })

  it('sans nature (action historique sans objet canonique) : `null`', () => {
    expect(domainForActionTarget(null)).toBeNull()
    expect(domainForActionTarget(undefined)).toBeNull()
  })
})

describe('buildThirtyDayPlanFromActions — #2068.1, lu depuis Actions', () => {
  it('#2068.1 — aucune action ouverte du tout (`null`/`undefined`/`[]`) → `null`, jamais un plan inventé', () => {
    expect(buildThirtyDayPlanFromActions(null, TODAY)).toBeNull()
    expect(buildThirtyDayPlanFromActions(undefined, TODAY)).toBeNull()
    expect(buildThirtyDayPlanFromActions([], TODAY)).toBeNull()
  })

  it('place chaque action dans SA semaine (fenêtre glissante de 7 jours depuis `today`), jamais sur `week_index`', () => {
    const plan = buildThirtyDayPlanFromActions(
      [
        // En retard de 9 jours : traité comme LA semaine en cours (la plus urgente).
        myAction({ id: 'overdue', label: 'Relance en retard', due_date: '2026-09-10' }),
        myAction({ id: 'w1', label: 'Cette semaine', due_date: '2026-09-22' }),
        myAction({ id: 'w2', label: 'Semaine prochaine', due_date: '2026-09-27' }),
        myAction({ id: 'w3', label: 'Dans 3 semaines', due_date: '2026-10-05' }),
        myAction({ id: 'w4', label: 'Dans 4 semaines', due_date: '2026-10-12' }),
        // Hors fenêtre (5+ semaines) : n'entre pas dans ce bloc.
        myAction({ id: 'far', label: 'Trop loin', due_date: '2026-10-20' }),
        // Sans échéance : reste sur /actions, n'entre pas dans ce bloc (#2068.13).
        myAction({ id: 'undated', label: 'Sans date' }),
      ],
      TODAY,
    )
    expect(plan).toHaveLength(4)
    expect(plan?.map(week => week.priorities.map(p => p.action))).toEqual([
      ['Relance en retard', 'Cette semaine'],
      ['Semaine prochaine'],
      ['Dans 3 semaines'],
      ['Dans 4 semaines'],
    ])
  })

  it('#2068.2/.13 — coupe à 3 priorités par semaine, jamais 15 projets', () => {
    const plan = buildThirtyDayPlanFromActions(
      [1, 2, 3, 4].map(n => myAction({ id: `x${n}`, label: `Action ${n}`, due_date: '2026-09-20' })),
      TODAY,
    )
    expect(plan?.[0]?.priorities).toHaveLength(3)
    expect(plan?.[0]?.priorities.map(p => p.action)).toEqual(['Action 1', 'Action 2', 'Action 3'])
  })

  it('#2068.24-.31 — chaque priorité porte le domaine de l’objet visé par l’action d’origine', () => {
    const plan = buildThirtyDayPlanFromActions(
      [myAction({ due_date: '2026-09-20', target: { kind: 'contact', id: 'c-1', label: 'Sophie Marchand' } })],
      TODAY,
    )
    expect(plan?.[0]?.priorities[0]?.domain).toBe('contacts')
  })

  it('sans objet canonique visé (action historique), le domaine reste `null` — jamais deviné', () => {
    const plan = buildThirtyDayPlanFromActions([myAction({ due_date: '2026-09-20', target: null })], TODAY)
    expect(plan?.[0]?.priorities[0]?.domain).toBeNull()
  })

  it('reprend `expected_outcome` en résultat attendu, sinon replie sur le libellé — jamais un texte inventé', () => {
    const withOutcome = buildThirtyDayPlanFromActions(
      [myAction({ due_date: '2026-09-20', label: 'Relancer', expected_outcome: 'Un RDV posé' })],
      TODAY,
    )
    expect(withOutcome?.[0]?.priorities[0]?.expectedResult).toBe('Un RDV posé')

    const withoutOutcome = buildThirtyDayPlanFromActions(
      [myAction({ due_date: '2026-09-20', label: 'Relancer', expected_outcome: null })],
      TODAY,
    )
    expect(withoutOutcome?.[0]?.priorities[0]?.expectedResult).toBe('Relancer')
  })

  it('#2068.13 — ne suppose jamais un créneau, une dépendance, une preuve : les 5 champs qu’Actions ne mesure pas restent `null`', () => {
    const plan = buildThirtyDayPlanFromActions([myAction({ due_date: '2026-09-20' })], TODAY)
    const priority = plan?.[0]?.priorities[0]
    expect(priority?.slot).toBeNull()
    expect(priority?.dependency).toBeNull()
    expect(priority?.completionProof).toBeNull()
    expect(priority?.surfaceLink).toBeNull()
    expect(priority?.replacementCondition).toBeNull()
  })

  it('un compte source EXISTE mais rien à placer dans une semaine → `[]` sur cette semaine, jamais un `null` qui prétendrait le contraire', () => {
    const plan = buildThirtyDayPlanFromActions([myAction({ due_date: '2026-09-20' })], TODAY)
    expect(plan?.[0]?.priorities).not.toHaveLength(0)
    expect(plan?.[1]?.priorities).toEqual([])
    expect(plan?.[2]?.priorities).toEqual([])
    expect(plan?.[3]?.priorities).toEqual([])
  })

  it('des actions ouvertes existent mais AUCUNE n’a de date exploitable dans la fenêtre → 4 semaines rendues, chacune `[]` (source répondue, pas `null`)', () => {
    const plan = buildThirtyDayPlanFromActions([myAction({ due_date: null }), myAction({ id: 'a-2' })], TODAY)
    expect(plan).toHaveLength(4)
    expect(plan?.every(week => week.priorities.length === 0)).toBe(true)
  })
})

describe('buildCommercialAudit / buildCommercialAuditContext — #2068.1, le plan à 4 semaines traverse jusqu’au contrat', () => {
  // `buildCommercialAudit`/`buildCommercialAuditContext` ne prennent pas de
  // `today` injectable (seule `buildThirtyDayPlanFromActions` l'expose, pour
  // ses propres tests) : une échéance dans 3 jours, calculée depuis
  // `new Date()` RÉEL au moment du test, reste dans la fenêtre quel que soit
  // le jour où la suite tourne.
  const dueSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  it('threade `myActions` de `buildCommercialAudit` jusqu’à `contextBlocks.thirtyDayPlan`', () => {
    const audit = buildCommercialAudit(FULL, REVISIONS, null, null, [myAction({ due_date: dueSoon })])
    expect(audit.contextBlocks.thirtyDayPlan).not.toBeNull()
    expect(audit.unestablished.find(entry => entry.key === 'thirtyDayPlan')).toBeUndefined()
  })

  it('threade `myActions` de `buildCommercialAuditContext` jusqu’au `thirtyDayPlan` du contrat versionné', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS, null, [myAction({ due_date: dueSoon })])
    expect(context.thirtyDayPlan).not.toBeNull()
    expect(() => commercialAuditContextSchema.parse(context)).not.toThrow()
  })
})

// #2074.12 — `candidatePool` est le SEUL des sept signaux externes de
// `CommercialTensionExternalSignals` qu'un module existant exposait déjà
// (`useTalentStats()` → `GET /talents/stats`). `signals` (6e paramètre) reçoit
// le résultat de {@link commercialTensionSignalsFromTalentStats}, jamais un
// recalcul — absence = `unknown`, jamais un vivier deviné vide (0 total, 0
// disponible).
describe('buildCommercialAudit / buildCommercialAuditContext — #2074.12, `talentStats` traverse jusqu’à la tension `poolWithoutAvailability`', () => {
  it('sans `talentStats`, la règle reste `unknown` — jamais un vivier deviné vide', () => {
    // `buildCommercialAudit` n'expose pas `contradictions` lui-même (c'est
    // `CommercialAuditScreen.tsx` qui les dérive de `auditContext`, GA-26) —
    // l'effet observable ici est `unestablished.moves` : aucune règle
    // déclenchée, donc aucun mouvement, donc « non conclu ».
    const audit = buildCommercialAudit(FULL, REVISIONS)
    expect(unestablishedKeys(audit)).toContain('moves')
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect((context.contradictions ?? []).some(c => c.ruleId === 'poolWithoutAvailability')).toBe(false)
  })

  it('avec un vivier non vide et personne de disponible, `poolWithoutAvailability` se déclenche', () => {
    const talentStats = { total: 12, availableNow: 0 } as TalentStats
    const signals = commercialTensionSignalsFromTalentStats(talentStats)
    const audit = buildCommercialAudit(FULL, REVISIONS, null, null, null, signals)
    expect(unestablishedKeys(audit)).not.toContain('moves')
    const context = buildCommercialAuditContext(FULL, REVISIONS, null, null, signals)
    expect((context.contradictions ?? []).some(c => c.ruleId === 'poolWithoutAvailability')).toBe(true)
    expect(() => commercialAuditContextSchema.parse(context)).not.toThrow()
  })

  it('un vivier avec du monde disponible ne déclenche pas `poolWithoutAvailability`', () => {
    const talentStats = { total: 12, availableNow: 3 } as TalentStats
    const context = buildCommercialAuditContext(
      FULL,
      REVISIONS,
      null,
      null,
      commercialTensionSignalsFromTalentStats(talentStats),
    )
    expect((context.contradictions ?? []).some(c => c.ruleId === 'poolWithoutAvailability')).toBe(false)
  })
})

/**
 * #2061 rouverte le 24/09/2026 (audit du soir) — Scope, Facts, Assets,
 * Constraints, Recommended direction, Conditional roadmap et Questions to
 * revisit étaient écrits `null` EN DUR dans `buildCommercialAuditContext` et
 * rendus par AUCUN composant. Chaque test ci-dessous sait dire NON : il casse
 * si la dérivation redevient `null` en dur, invente une phrase, ou redit
 * `messaging.avoid`/`differentiationPoints` sous un autre nom (#2072.1-.3).
 */
describe('buildCommercialAuditContext — réouverture #2061.2/.3/.7/.8/.15/.18/.20 (24/09/2026)', () => {
  // #2064.2 — 4 secteurs déclenche `tooManySimultaneousMarkets` (seuil : 3),
  // sans toucher aux autres champs de FULL : la SEULE variable qui change.
  const TRIGGERING: ProfileContext = {
    ...FULL,
    idealAccountProfile: { ...FULL.idealAccountProfile!, sectorsPriority: ['Banque', 'Assurance', 'Retail', 'Santé'] },
  }

  it('#2061.2 — sans cible ni profondeur d’analyse, le PÉRIMÈTRE reste `null`', () => {
    expect(buildCommercialAuditContext(null, []).scope).toBeNull()
  })

  it('#2061.2 — le périmètre cite la cible et la profondeur d’analyse RÉELLEMENT renseignées', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.scope).toContain('eti')
    expect(context.scope).toContain('Banque, Assurance')
    expect(context.scope).toContain('standard')
  })

  it('#2061.3 — sans profil, les FAITS restent `null`, jamais une liste vide qui laisserait croire qu’on a cherché', () => {
    expect(buildCommercialAuditContext(null, []).facts).toBeNull()
  })

  it('#2061.3 — chaque fait cite une valeur RÉELLE du profil, jamais le taux de conversion (doctrine « aucune probabilité »)', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ statement: expect.stringContaining('eti') }),
        expect.objectContaining({ statement: expect.stringContaining('Les dossiers avancent sans responsable nommé') }),
      ]),
    )
    expect(JSON.stringify(context.facts)).not.toContain('12 %')
  })

  it('#2061.7 — sans vivier ni copilote personnalisé, les ATOUTS restent `null`', () => {
    const { bellumPhrases: _bellumPhrases, ...withoutPhrases } = FULL
    expect(buildCommercialAuditContext(withoutPhrases, REVISIONS).assets).toBeNull()
  })

  it('#2061.7 — le vivier et le copilote personnalisé deviennent des atouts NOMMÉS, jamais `messaging.differentiationPoints`', () => {
    const talentStats = { total: 12, availableNow: 3 } as TalentStats
    const context = buildCommercialAuditContext(
      FULL,
      REVISIONS,
      null,
      null,
      commercialTensionSignalsFromTalentStats(talentStats),
    )
    expect(context.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Vivier de consultants' }),
        expect.objectContaining({ label: 'Copilote personnalisé pour cet espace' }),
      ]),
    )
    expect(JSON.stringify(context.assets)).not.toContain('Crédibilité technique')
  })

  it('#2061.8 — sans cadence ni cible, les CONTRAINTES restent `null`', () => {
    expect(buildCommercialAuditContext(null, []).constraints).toBeNull()
  })

  it('#2061.8 — la cadence et l’accès visé deviennent des contraintes NOMMÉES, jamais `messaging.avoid`', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Cadence recommandée — plafond d'activité" }),
        expect.objectContaining({ label: 'Accès visé : niveau manager' }),
      ]),
    )
    expect(JSON.stringify(context.constraints)).not.toContain('Ouvrir dix fronts sans responsable')
  })

  it('#2061.15 — sans tension ni conseil, la DIRECTION RECOMMANDÉE reste `null`', () => {
    expect(buildCommercialAuditContext(null, []).recommendedDirection).toBeNull()
  })

  it('#2061.15 — à défaut de tension détectée, la direction retombe sur le conseil clé du profileur', () => {
    const context = buildCommercialAuditContext(FULL, REVISIONS)
    expect(context.recommendedDirection).toEqual({
      label: 'Rappeler les reprises datées',
      rationale: 'Les dossiers avancent sans responsable nommé',
      confidence: 'single_source',
    })
  })

  it('#2061.15 — une tension détectée prend le pas sur le conseil du profileur', () => {
    const context = buildCommercialAuditContext(TRIGGERING, REVISIONS)
    expect(context.recommendedDirection).toEqual({
      label: 'Resserrer la liste des secteurs prioritaires à 3 au maximum pour ce trimestre.',
      rationale: 'Plus de 3 secteurs visés à la fois, pour une seule activité commerciale.',
      confidence: 'deduced',
    })
  })

  it('#2061.18 — sans profil, la ROADMAP CONDITIONNELLE reste `null` ; avec un profil sans tension, elle est `[]` (mesurée, vide)', () => {
    expect(buildCommercialAuditContext(null, []).conditionalRoadmap).toBeNull()
    expect(buildCommercialAuditContext(FULL, REVISIONS).conditionalRoadmap).toEqual([])
  })

  it('#2061.18 — une tension détectée devient une ligne « SI … ALORS … »', () => {
    const context = buildCommercialAuditContext(TRIGGERING, REVISIONS)
    expect(context.conditionalRoadmap).toEqual([
      {
        condition: 'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
        then: 'Resserrer la liste des secteurs prioritaires à 3 au maximum pour ce trimestre.',
      },
    ])
  })

  it('#2061.20 — sans profil, les QUESTIONS À REVISITER restent `null` ; avec un profil sans tension, elles sont `[]`', () => {
    expect(buildCommercialAuditContext(null, []).questionsToRevisit).toBeNull()
    expect(buildCommercialAuditContext(FULL, REVISIONS).questionsToRevisit).toEqual([])
  })

  it('#2061.20 — une tension détectée nomme sa question à valider', () => {
    const context = buildCommercialAuditContext(TRIGGERING, REVISIONS)
    expect(context.questionsToRevisit).toEqual([
      'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
    ])
  })

  it('produit un objet qui PARSE contre `commercialAuditContextSchema`, avec ou sans tension détectée', () => {
    expect(() => commercialAuditContextSchema.parse(buildCommercialAuditContext(FULL, REVISIONS))).not.toThrow()
    expect(() => commercialAuditContextSchema.parse(buildCommercialAuditContext(TRIGGERING, REVISIONS))).not.toThrow()
  })
})
