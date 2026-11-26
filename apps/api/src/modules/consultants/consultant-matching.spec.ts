import type { Consultant } from '@bellum/contracts'
import {
  collectSkillGaps,
  consultantMatchVerdict,
  matchConsultant,
  MATCH_PIPELINE_STEPS,
  missingMustHaveSkills,
  recommendedStepFor,
  rankConsultants,
  runMatchPipeline,
  selectDefendableTop,
  selectPush,
  skillEvidence,
  type MatchTarget,
} from './consultant-matching'

/**
 * Matching besoin ↔ profil (annexe méthodo p22).
 *
 * Deux interdits de la page structurent ces tests :
 *   - « pas de CV catalogue » → le push est borné à 2, quoi qu'il arrive ;
 *   - « raisons ET RISQUES » → un push muet sur les risques se retourne en
 *     soutenance, quand le client découvre lui-même le trou.
 */

const base = (over: Partial<Consultant>): Consultant => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: null,
  kind: 'consultant',
  source: null,
  last_contact_at: null,
  archived_at: null,
  archived_reason: null,
  review_status: 'qualified' as const,
  consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
  full_name: 'Nadia Fournier',
  title: 'Ingénieure sécurité',
  seniority: 'senior',
  years_experience: null,
  availability: 'immediate',
  available_from: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie' as const,
  partner_account_id: null,
  contact_visible: true,
  finance_visible: true,
  tjm: 620,
  stack: ['Cybersécurité', 'SOC', 'Splunk'],
  sectors: ['Banque'],
  zones: ['IDF'],
  education: [],
  mobility: {
    zones: null,
    remote: null,
    travel: null,
    relocation: null,
    siteFrequency: null,
    international: null,
    restrictions: null,
  },
  process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
  positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
  preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
  references: ['SOC 24/7 pour un assureur'],
  languages: [],
  clearances: [],
  wants: 'rester sur du SOC',
  notes: null,
  cv_text: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  ...over,
})

const BESOIN: MatchTarget = {
  label: 'Renfort SOC après incident de sécurité',
  detail: 'Supervision Splunk à reprendre',
  offer: 'Cybersécurité',
  sector: 'Banque',
  zone: 'IDF',
}

describe('matchConsultant — le score est adossé à ses preuves', () => {
  it('score un profil aligné et cite ce qui l’a produit', () => {
    const match = matchConsultant(base({}), BESOIN)

    expect(match.score).toBeGreaterThan(80)
    expect(match.reasons.join(' ')).toContain('Cybersécurité')
    expect(match.breakdown.every(item => item.proof.length > 0)).toBe(true)
  })

  it('n’invente aucune compétence à partir du titre', () => {
    // Le titre dit « Ingénieure sécurité » mais la stack est vide : on ne déduit
    // rien. C'est la règle « jamais de donnée inventée », appliquée au staffing.
    const match = matchConsultant(base({ stack: [] }), BESOIN)

    expect(match.breakdown.find(item => item.criterion === 'stack')).toBeUndefined()
    expect(match.blocked).toBe(true)
  })

  it('ne pénalise pas un consultant pour une donnée que le BESOIN n’a pas', () => {
    // Besoin sans secteur ni zone : le critère sort du dénominateur au lieu de
    // coûter des points. Sinon le score mesurerait la complétude de nos données.
    const sansContexte: MatchTarget = { label: 'Renfort SOC', offer: 'Cybersécurité' }
    const match = matchConsultant(base({}), sansContexte)

    expect(match.breakdown.map(item => item.criterion)).not.toContain('sector')
    expect(match.breakdown.map(item => item.criterion)).not.toContain('zone')
    expect(match.score).toBeGreaterThan(80)
  })

  it('le score ne peut pas dériver de sa justification', () => {
    const match = matchConsultant(base({}), BESOIN)
    const points = match.breakdown.reduce((sum, item) => sum + item.points, 0)
    const denominator = match.breakdown.reduce((sum, item) => sum + item.max, 0)

    expect(match.score).toBe(Math.round((points * 100) / denominator))
  })

  it('borne chaque critère à son plafond', () => {
    const match = matchConsultant(base({ stack: ['SOC', 'Splunk', 'Cybersécurité', 'SIEM'] }), BESOIN)

    for (const item of match.breakdown) expect(item.points).toBeLessThanOrEqual(item.max)
    expect(match.score).toBeLessThanOrEqual(100)
  })
})

/**
 * GA-18/GA-19 — « non mesuré » ne se rend jamais « 0 », et sous
 * {@link MIN_AXES_FOR_SCORE} axes évaluables, il n'y a pas de score du tout
 * (`matchScoreIsMeasured`, `packages/contracts/src/schemas/match.ts`).
 *
 * Le calcul divisait par `denominator`, et repliait sur `0` quand ce
 * dénominateur était nul plutôt que de dire « je n'ai pas pu noter ». Un
 * profil non bloqué (dispo connue, stack non vide) peut pourtant n'avoir
 * QU'UN SEUL critère évaluable — ici, la disponibilité — dès que le besoin
 * n'exprime aucun terme exploitable et que le profil ne porte ni secteur, ni
 * zone, ni référence, ni cadre contractuel connu. Le score qui en sortait
 * mesurait alors la complétude de nos données, pas l'adéquation de la
 * personne — exactement ce que la doctrine interdit.
 */
describe('le score respecte « sous 3 axes, il n’y a pas de score » (GA-18/GA-19)', () => {
  // Aucun terme exploitable dans le besoin (que des mots vides) : la
  // compétence sort du dénominateur même si la stack n'est pas vide.
  const besoinOpaque: MatchTarget = {
    label: 'mission pour le client',
    detail: null,
    offer: null,
    sector: null,
    zone: null,
  }
  const profilPeuRenseigne = (over: Partial<Consultant> = {}) =>
    base({
      stack: ['Java'],
      sectors: [],
      zones: [],
      references: [],
      contract_type: 'inconnu',
      ...over,
    })

  it('rend `score: null` — jamais 0 — quand un seul critère est évaluable', () => {
    const match = matchConsultant(profilPeuRenseigne(), besoinOpaque)

    expect(match.breakdown).toHaveLength(1) // seule la disponibilité est évaluable
    expect(match.blocked).toBe(false) // dispo connue + stack non vide : pas bloqué
    expect(match.score).toBeNull()
  })

  it('n’écarte pas le profil pour autant — il reste consultable dans le vivier classé', () => {
    const ranked = rankConsultants([profilPeuRenseigne()], besoinOpaque)

    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.score).toBeNull()
  })

  it('exclut du PUSH un profil non bloqué mais non mesuré', () => {
    // Un score qu'on n'a pas pu noter ne devient pas une recommandation.
    const push = selectPush(rankConsultants([profilPeuRenseigne()], besoinOpaque))

    expect(push).toHaveLength(0)
  })

  it('classe un profil non mesuré DERRIÈRE tout profil qui porte un score', () => {
    // Même règle que pour une fiche sans nom (D366) : rien à comparer, donc
    // jamais en tête plutôt que rangé arbitrairement.
    const mesure = base({ id: 'aaaaaaaa-1111-4111-8111-111111111111', full_name: 'Alice Mesurée' })
    const nonMesure = profilPeuRenseigne({
      id: 'bbbbbbbb-2222-4222-8222-222222222222',
      full_name: 'Zoé NonMesurée',
    })

    const ranked = rankConsultants([nonMesure, mesure], besoinOpaque)

    expect(ranked[0]?.full_name).toBe('Alice Mesurée')
    expect(ranked[1]?.full_name).toBe('Zoé NonMesurée')
  })
})

describe('les RISQUES sont un livrable, pas un commentaire', () => {
  it('dit qu’un consultant sans expérience du secteur devra prouver autrement', () => {
    const match = matchConsultant(base({ sectors: ['Industrie'] }), BESOIN)

    expect(match.risks.join(' ')).toContain('Banque')
  })

  it('dit qu’une disponibilité à 3 mois ne tient pas un besoin urgent', () => {
    const match = matchConsultant(base({ availability: 'sous_3_mois' }), BESOIN)

    expect(match.risks.join(' ')).toContain('3 mois')
  })

  it('dit qu’un TJM absent empêche de vérifier la marge', () => {
    const match = matchConsultant(base({ tjm: null }), BESOIN)

    expect(match.risks.join(' ')).toContain('marge')
  })

  it('dit qu’un profil sans envie renseignée est un risque de départ', () => {
    // p22 liste « envie » dans le vivier. Un profil poussé contre son gré part
    // en mission puis démissionne — le coût est réel.
    const match = matchConsultant(base({ wants: null }), BESOIN)

    expect(match.risks.join(' ')).toContain('envie')
  })

  it('ne prétend jamais « aucun risque »', () => {
    // Un profil parfait renvoie une liste VIDE — l'absence de risque détecté
    // n'est pas une affirmation d'absence de risque.
    const match = matchConsultant(base({}), BESOIN)

    expect(Array.isArray(match.risks)).toBe(true)
    expect(match.risks.join(' ')).not.toContain('aucun risque')
  })
})

describe('selectPush — « pas de CV catalogue » est une règle du code', () => {
  const vivier = (count: number): Consultant[] =>
    Array.from({ length: count }, (_, index) =>
      base({
        id: `1111111${index}-1111-4111-8111-111111111111`.slice(0, 36),
        full_name: `Consultant ${String(index).padStart(2, '0')}`,
      }),
    )

  it('ne pousse jamais plus de deux profils, même avec un vivier de quarante', () => {
    const push = selectPush(rankConsultants(vivier(40), BESOIN))

    expect(push).toHaveLength(2)
  })

  it('ne pousse aucun profil bloqué', () => {
    const indisponible = base({ id: '22222222-2222-4222-8222-222222222222', availability: 'indisponible' })
    const inconnu = base({ id: '33333333-3333-4333-8333-333333333333', availability: 'inconnu' })
    const push = selectPush(rankConsultants([indisponible, inconnu], BESOIN))

    expect(push).toHaveLength(0)
  })

  it('rend tout le vivier classé, même si le push est borné', () => {
    // Le commercial doit pouvoir regarder au-delà des deux premiers ; c'est le
    // PUSH qui est borné, pas la consultation.
    const ranked = rankConsultants(vivier(5), BESOIN)

    expect(ranked).toHaveLength(5)
  })

  it('classe de façon stable et reproductible', () => {
    // « Pourquoi ce profil ? » doit avoir la même réponse à chaque exécution.
    const first = rankConsultants(vivier(6), BESOIN).map(m => m.full_name)
    const second = rankConsultants([...vivier(6)].reverse(), BESOIN).map(m => m.full_name)

    expect(first).toEqual(second)
  })

  it('fait remonter le profil le plus aligné en tête', () => {
    const aligne = base({ id: '44444444-4444-4444-8444-444444444444', full_name: 'Zoé Aligne' })
    const eloigne = base({
      id: '55555555-5555-4555-8555-555555555555',
      full_name: 'Adam Eloigne',
      stack: ['COBOL'],
      sectors: ['Agroalimentaire'],
      zones: ['Nantes'],
      mobility: {
        zones: null,
        remote: null,
        travel: null,
        relocation: null,
        siteFrequency: null,
        international: null,
        restrictions: null,
      },
      process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
      positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
      preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
      references: [],
    })
    const [top] = rankConsultants([eloigne, aligne], BESOIN)

    expect(top?.full_name).toBe('Zoé Aligne')
  })
})

/**
 * La preuve par compétence (addendum final p63).
 *
 * Le score global disait « 78 % » sans dire ce que ces 78 % recouvraient. Or la
 * distinction décide de ce qu'on écrit au client : une compétence démontrée se
 * cite, une déclarée se fait valider en entretien, une adjacente s'annonce comme
 * une montée en charge, une absente se dit. Les fondre produit le push qui se
 * retourne en soutenance.
 */
describe('preuve par compétence', () => {
  const need: MatchTarget = { label: 'kubernetes', detail: null, offer: null, sector: null, zone: null }

  it('dit DÉMONTRÉE quand une mission le prouve — et cite la mission', () => {
    const [evidence] = skillEvidence(base({ stack: [], references: ['Migration Kubernetes chez ACME'] }), need)
    expect(evidence.level).toBe('demonstrated')
    expect(evidence.proof).toContain('ACME')
  })

  it('accepte aussi le CV comme preuve d’usage', () => {
    const [evidence] = skillEvidence(base({ stack: [], cv_text: 'Déploiements Kubernetes en production' }), need)
    expect(evidence.level).toBe('demonstrated')
  })

  it('dit DÉCLARÉE quand la compétence n’est que revendiquée', () => {
    const [evidence] = skillEvidence(base({ stack: ['Kubernetes'], references: [] }), need)
    expect(evidence.level).toBe('declared')
    expect(evidence.proof).toContain('déclarée')
  })

  it('préfère la preuve à la déclaration quand les deux existent', () => {
    const [evidence] = skillEvidence(
      base({ stack: ['Kubernetes'], references: ['Plateforme Kubernetes chez BETA'] }),
      need,
    )
    expect(evidence.level).toBe('demonstrated')
  })

  it('dit ADJACENTE quand seul le contexte s’en approche', () => {
    const [evidence] = skillEvidence(
      base({ stack: [], references: [], sectors: [], title: 'Ingénieur Kubernetes en formation' }),
      need,
    )
    expect(evidence.level).toBe('adjacent')
  })

  it('dit ABSENTE sans fabriquer de justification', () => {
    // Une preuve inventée pour une absence serait pire que l'absence elle-même.
    const [evidence] = skillEvidence(base({ stack: ['Java'], references: [], sectors: [], title: null }), need)
    expect(evidence.level).toBe('absent')
    expect(evidence.proof).toBe('')
  })

  it('ne rend rien quand le besoin n’exprime aucun terme exploitable', () => {
    expect(skillEvidence(base({}), { label: '', detail: null, offer: null, sector: null, zone: null })).toEqual([])
  })

  it('accompagne chaque matching — le score ne voyage plus seul', () => {
    expect(matchConsultant(base({ stack: ['Kubernetes'] }), need).skills.length).toBeGreaterThan(0)
  })
})

/**
 * Le drapeau « déjà vu chez ce client » dans le matching (§7.2, BEL-ATS-205).
 *
 * Le matching était AVEUGLE à l'historique : un profil refusé chez EDF en
 * janvier remontait premier sur le besoin EDF de mars. « C'est la façon la plus
 * rapide de perdre un compte. »
 */
describe('matchConsultant — l’historique client', () => {
  it('ne dit RIEN quand la personne n’est jamais passée chez ce client', () => {
    const match = matchConsultant(base({}), BESOIN, [])
    expect(match.clientHistory).toBeNull()
  })

  it('SIGNALE un refus, avec son motif', () => {
    const match = matchConsultant(base({ id: 'c-1' }), BESOIN, [
      { consultantId: 'c-1', stage: 'rejected', outcomeReason: 'skills', closedAt: '2026-01-15T00:00:00.000Z' },
    ])
    expect(match.clientHistory?.flag).toBe('rejected')
    expect(match.clientHistory?.reason).toBe('skills')
  })

  it('n’attribue le drapeau qu’à la BONNE personne', () => {
    // Un historique chargé pour tout le vivier ne doit pas colorer tout le
    // monde du refus d'un seul.
    const match = matchConsultant(base({ id: 'c-1' }), BESOIN, [
      { consultantId: 'c-2', stage: 'rejected', outcomeReason: 'skills', closedAt: null },
    ])
    expect(match.clientHistory).toBeNull()
  })

  it('ne CHANGE PAS le score — un drapeau informe, il ne classe pas', () => {
    // Écarter automatiquement un profil déjà refusé serait une décision prise à
    // la place du commercial : le §7.2 demande de SIGNALER, pas de retirer.
    const sans = matchConsultant(base({ id: 'c-1' }), BESOIN, [])
    const avec = matchConsultant(base({ id: 'c-1' }), BESOIN, [
      { consultantId: 'c-1', stage: 'rejected', outcomeReason: 'skills', closedAt: null },
    ])
    expect(avec.score).toBe(sans.score)
    expect(avec.blocked).toBe(sans.blocked)
  })
})

/**
 * Les préférences déclarées dans le matching (§8.3).
 *
 * « Un profil qui refuse le secteur bancaire reste proposable pour une mission
 * bancaire — avec un drapeau. C'est le recruteur qui parle au consultant, pas
 * l'algorithme. » Ce test protège exactement cette phrase.
 */
describe('matchConsultant — les préférences déclarées', () => {
  it('SIGNALE un secteur refusé sans écarter le profil', () => {
    const profil = base({
      preferences: {
        wantedSectors: [],
        refusedSectors: ['Banque'],
        refusedTechnologies: [],
        wantedContractKinds: [],
      },
    })
    const match = matchConsultant(profil, BESOIN)
    expect(match.risks.some(risk => risk.includes('refuser le secteur'))).toBe(true)
    // Ni retiré, ni bloqué : la préférence informe, elle ne décide pas.
    expect(match.blocked).toBe(false)
    expect(match.score).toBeGreaterThan(0)
  })

  it('ne reproche RIEN à quelqu’un dont on ignore les préférences', () => {
    const match = matchConsultant(base({}), BESOIN)
    expect(match.risks.some(risk => risk.includes('refuser'))).toBe(false)
  })
})

/**
 * #2330.1/.5 — le verdict NOMMÉ, jamais un pourcentage seul.
 */
describe('consultantMatchVerdict', () => {
  it('NON ÉVALUABLE quand le score n’a pas pu être mesuré', () => {
    expect(consultantMatchVerdict({ score: null, blocked: false })).toBe('non_evaluable')
    expect(consultantMatchVerdict({ score: null, blocked: true })).toBe('non_evaluable')
  })

  it('FORTEMENT DÉFENDABLE sur un score élevé, non bloqué', () => {
    expect(consultantMatchVerdict({ score: 85, blocked: false })).toBe('fortement_defendable')
  })

  it('À QUALIFIER sur un score correct, non bloqué', () => {
    expect(consultantMatchVerdict({ score: 60, blocked: false })).toBe('a_qualifier')
  })

  it('ALTERNATIVE quand une donnée décisive bloque MAIS le reste du profil tient', () => {
    expect(consultantMatchVerdict({ score: 70, blocked: true })).toBe('alternative')
  })

  it('NON DÉFENDABLE sur un score faible, bloqué ou non', () => {
    expect(consultantMatchVerdict({ score: 20, blocked: false })).toBe('non_defendable')
    expect(consultantMatchVerdict({ score: 20, blocked: true })).toBe('non_defendable')
  })
})

/**
 * #2330.3 — NO-GO : un must-have absent n'est JAMAIS compensé par des
 * souhaitables cumulés, quel que soit le score par ailleurs.
 */
describe('missingMustHaveSkills et son effet sur le verdict', () => {
  it('ne signale rien quand le besoin ne porte aucun must-have (comportement inchangé)', () => {
    expect(missingMustHaveSkills(base({}), [])).toEqual([])
  })

  it('nomme le terme manquant, littéral ou via le référentiel', () => {
    const profil = base({ stack: ['Cybersécurité', 'SOC'] })
    expect(missingMustHaveSkills(profil, ['Kubernetes'])).toEqual(['Kubernetes'])
    expect(missingMustHaveSkills(profil, ['Cybersécurité'])).toEqual([])
  })

  it('NO-GO : un must-have absent force NON DÉFENDABLE même avec un score élevé par ailleurs', () => {
    // Ce profil est par ailleurs EXCELLENT sur le besoin (stack, secteur, zone,
    // dispo) — sans le must-have, il serait FORTEMENT DÉFENDABLE.
    const excellent = base({ availability: 'immediate' })
    const sansMustHave = matchConsultant(excellent, BESOIN)
    expect(sansMustHave.verdict).toBe('fortement_defendable')

    const avecMustHaveAbsent = matchConsultant(excellent, { ...BESOIN, mustHaveSkills: ['Kubernetes'] })
    expect(avecMustHaveAbsent.verdict).toBe('non_defendable')
    expect(avecMustHaveAbsent.gaps.some(gap => gap.includes('Kubernetes') && gap.includes('indispensable'))).toBe(true)
    expect(avecMustHaveAbsent.risks.some(risk => risk.includes('non compensable'))).toBe(true)
    // Le score BRUT des six critères n'est pas modifié — c'est le VERDICT qui
    // porte la non-compensation, pas le calcul historique.
    expect(avecMustHaveAbsent.score).toBe(sansMustHave.score)
  })
})

/**
 * #2330.6 — chaque profil expose gaps ET la prochaine action, déduits de son
 * état réel, jamais une phrase générique.
 */
describe('gaps et recommendedStep', () => {
  it('collectSkillGaps NOMME les compétences absentes ou seulement adjacentes', () => {
    const skills = [
      { skill: 'kubernetes', level: 'demonstrated' as const, proof: 'mission X' },
      { skill: 'kafka', level: 'absent' as const, proof: '' },
      { skill: 'go', level: 'adjacent' as const, proof: 'poste proche' },
    ]
    expect(collectSkillGaps(skills)).toEqual(['kafka — non prouvé', 'go — contexte proche seulement (poste proche)'])
  })

  it('recommendedStepFor propose de PROPOSER sur un verdict fortement défendable', () => {
    expect(recommendedStepFor('fortement_defendable', [])).toContain('proposer')
  })

  it('recommendedStepFor rend `null` sur non défendable — rien à FAIRE avec CE profil', () => {
    expect(recommendedStepFor('non_defendable', ['un risque'])).toBeNull()
  })

  it('recommendedStepFor reprend le PREMIER risque réel sur à qualifier / alternative', () => {
    expect(recommendedStepFor('a_qualifier', ['TJM non renseigné'])).toContain('TJM non renseigné')
    expect(recommendedStepFor('alternative', ['hors zone'])).toContain('hors zone')
  })

  it('un match complet expose gaps ET recommendedStep cohérents avec son verdict', () => {
    const match = matchConsultant(base({}), BESOIN)
    expect(match.verdict).toBe('fortement_defendable')
    expect(match.recommendedStep).toContain('proposer')
  })
})

/**
 * #2330.7/.9 — le TOP défendable, borné à cinq et JAMAIS rempli
 * artificiellement.
 */
describe('selectDefendableTop', () => {
  it('rend SEULEMENT les profils défendables — deux profils défendables sur cinq rendent DEUX, pas cinq', () => {
    const aligne = base({ id: '44444444-4444-4444-8444-444444444444', full_name: 'Zoé Aligne' })
    const autreAligne = base({ id: '66666666-6666-4666-8666-666666666666', full_name: 'Ana Aligne' })
    const eloignes = Array.from({ length: 3 }, (_, index) =>
      base({
        id: `7777777${index}-7777-4777-8777-777777777777`.slice(0, 36),
        full_name: `Loin ${index}`,
        stack: ['COBOL'],
        sectors: ['Agroalimentaire'],
        zones: ['Nantes'],
        mobility: {
          zones: null,
          remote: null,
          travel: null,
          relocation: null,
          siteFrequency: null,
          international: null,
          restrictions: null,
        },
        process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
        positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
        preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
        references: [],
        availability: 'inconnu',
      }),
    )
    const ranked = rankConsultants([aligne, autreAligne, ...eloignes], BESOIN)
    const top = selectDefendableTop(ranked)

    expect(top.length).toBeLessThan(5)
    expect(top.every(match => match.verdict !== 'non_defendable' && match.verdict !== 'non_evaluable')).toBe(true)
  })

  it('borne à cinq même avec un vivier plus large de profils tous défendables', () => {
    const vivier = Array.from({ length: 8 }, (_, index) =>
      base({
        id: `8888888${index}-8888-4888-8888-888888888888`.slice(0, 36),
        full_name: `Bon Profil ${index}`,
      }),
    )
    const top = selectDefendableTop(rankConsultants(vivier, BESOIN))
    expect(top).toHaveLength(5)
  })
})

/**
 * #2330.2 — le pipeline suit dix étapes NOMMÉES, dans l'ordre (LAU-FINAL-071).
 */
describe('MATCH_PIPELINE_STEPS et runMatchPipeline — les dix étapes, dans l’ordre', () => {
  it('nomme les dix étapes EXACTEMENT dans l’ordre de la demande', () => {
    expect(MATCH_PIPELINE_STEPS.map(step => step.label)).toEqual([
      'Vérifier la qualité du besoin',
      'Charger les talents éligibles',
      'Appliquer les exclusions fortes',
      'Comparer les must-have',
      'Évaluer les nice-to-have',
      'Vérifier les preuves',
      'Vérifier disponibilité et conditions',
      'Vérifier consentement et historique',
      'Classer',
      'Produire verdicts et actions',
    ])
  })

  it('runMatchPipeline exécute les dix étapes dans CET ordre — la trace le PROUVE', () => {
    const { trace } = runMatchPipeline([base({})], BESOIN)
    expect(trace).toEqual(MATCH_PIPELINE_STEPS.map(step => step.id))
  })

  it('rankConsultants EST le pipeline — même classement que runMatchPipeline(...).ranked', () => {
    const vivier = [base({ id: '99999999-9999-4999-8999-999999999991', full_name: 'Un' })]
    expect(rankConsultants(vivier, BESOIN)).toEqual(runMatchPipeline(vivier, BESOIN).ranked)
  })
})

/**
 * #2330.2 étape 3 — un profil ARCHIVÉ est une exclusion FORTE : il ne peut
 * plus être proposé, quel que soit son score par ailleurs.
 */
describe('runMatchPipeline — exclusions fortes (profil archivé)', () => {
  it('un profil archivé n’apparaît PLUS dans le classement, même excellent sur le besoin', () => {
    const excellent = base({ id: 'a1111111-1111-4111-8111-111111111112', archived_at: '2026-09-01T00:00:00.000Z' })
    const { ranked } = runMatchPipeline([excellent], BESOIN)
    expect(ranked).toEqual([])
  })

  it('ne touche PAS les profils non archivés du même appel', () => {
    const excellent = base({ id: 'a2222222-2222-4222-8222-222222222223' })
    const archive = base({ id: 'a3333333-3333-4333-8333-333333333334', archived_at: '2026-09-01T00:00:00.000Z' })
    const { ranked } = runMatchPipeline([excellent, archive], BESOIN)
    expect(ranked.map(match => match.consultant_id)).toEqual([excellent.id])
  })
})
