import { describe, expect, it } from 'vitest'
import {
  accountStrategy5PReadinessFor,
  accountStrategy5PSchema,
  deriveAccountStrategy5P,
  isHrTitle,
  isTechnicalDeciderTitle,
  technicalSeatGap,
  summarizeAccountStrategy5P,
  type AccountStrategy5PContactInput,
  type AccountStrategy5PMissionInput,
  type AccountStrategy5PPartnerInput,
  type AccountStrategy5PElement,
} from './account-strategy-5p.js'
import type { AccountAnalysis } from './analysis/account-analysis.js'
import { decisionRoleSchema } from './contact.js'

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function emptyAnalysis(): AccountAnalysis {
  return {}
}

describe('deriveAccountStrategy5P — jamais de donnée fictive', () => {
  it('un compte sans aucune source canonique rend cinq dimensions `missing`, jamais devinées', () => {
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [] })

    expect(strategy.account_id).toBe(ACCOUNT_ID)
    expect(strategy.perimeter.group.status).toBe('missing')
    expect(strategy.perimeter.group.value).toBeNull()
    expect(strategy.problem.operational_problem.status).toBe('missing')
    expect(strategy.people.users.status).toBe('missing')
    expect(strategy.proof.risks.status).toBe('missing')
    expect(strategy.passage.current_consultant.status).toBe('missing')
    // P5 est honnêtement VIDE dans ce lot (aucune source canonique câblée) —
    // `no_path` le dit, ce n'est jamais une treizième voie devinée.
    expect(strategy.passage.no_path.value).toBe(true)

    // Cinq dimensions vides → NO-GO, exactement le garde-fou du ticket.
    expect(strategy.readiness).toBe('NO_GO')
    expect(strategy.next_action_dimension).toBe('perimeter')

    // Le schéma public accepte exactement ce que la dérivation produit.
    expect(() => accountStrategy5PSchema.parse(strategy)).not.toThrow()
  })

  it("P1 PERIMETER se dérive de l'organigramme existant (entities_exhaustive), jamais d'une deuxième collecte", () => {
    const analysis: AccountAnalysis = {
      entities_exhaustive: [
        { name: 'Groupe Exemple', type: 'groupe' },
        { name: 'Exemple France BU Digital', type: 'bu' },
        { name: 'DSI Groupe', type: 'departement' },
      ],
      subsidiaries: [{ siren: '123456789', name: 'Exemple Filiale SA', legal_name: null }],
      sites_france: [{ city: 'Paris', region: 'IDF', is_headquarters: true }],
      program_names: [{ name: 'Programme Refonte SI', entity: null, budget: '2M€', description: null }],
    }

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis, contacts: [] })

    expect(strategy.perimeter.group).toEqual({ value: 'Groupe Exemple', status: 'observed' })
    expect(strategy.perimeter.business_unit).toEqual({ value: 'Exemple France BU Digital', status: 'observed' })
    expect(strategy.perimeter.direction).toEqual({ value: 'DSI Groupe', status: 'observed' })
    expect(strategy.perimeter.subsidiary).toEqual({ value: 'Exemple Filiale SA', status: 'observed' })
    expect(strategy.perimeter.site).toEqual({ value: 'Paris', status: 'observed' })
    expect(strategy.perimeter.program).toEqual({ value: 'Programme Refonte SI', status: 'observed' })
    expect(strategy.perimeter.budget_scope).toEqual({ value: '2M€', status: 'observed' })
    // `team`/`project`/`selected_scope`/`excluded_scopes` n'ont aucune source
    // canonique aujourd'hui — jamais devinés.
    expect(strategy.perimeter.team.status).toBe('missing')
    expect(strategy.perimeter.selected_scope.status).toBe('missing')
    expect(strategy.perimeter.confidence).toBe('medium')
  })

  it("P2 PROBLEM se dérive de pains + qualified_hypotheses ; l'hypothèse reste `inferred`, jamais `observed`", () => {
    const analysis: AccountAnalysis = {
      pains: [
        { pain: 'Migration cloud bloquée', business_impact: 'Retard programme', esn_offer: null, urgency: 'haute' },
      ],
      qualified_hypotheses: [
        {
          hypothesis: 'Le programme cherche un renfort intégration',
          confidence: 'moyenne',
          esn_angle: null,
          first_action: null,
        },
      ],
    }

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis, contacts: [] })

    expect(strategy.problem.operational_problem.value).toBe('Migration cloud bloquée')
    expect(strategy.problem.operational_problem.status).toBe('observed')
    expect(strategy.problem.business_impact.value).toBe('Retard programme')
    expect(strategy.problem.hypothesis.value).toBe('Le programme cherche un renfort intégration')
    // Une hypothèse est une DÉDUCTION par construction (#2687) — jamais un fait constaté.
    expect(strategy.problem.hypothesis.status).toBe('inferred')
    // trigger/current_status/expiry restent `missing` : aucune source canonique.
    expect(strategy.problem.trigger.status).toBe('missing')
  })

  it('P3 PEOPLE classe les contacts existants par decision_role (taxonomie MEDDIC unique), jamais dupliqués', () => {
    const contacts: AccountStrategy5PContactInput[] = [
      { id: '22222222-2222-4222-8222-222222222222', full_name: 'Alice Champion', decision_role: 'champion' },
      { id: '33333333-3333-4333-8333-333333333333', full_name: 'Bob Achats', decision_role: 'procurement' },
      { id: '44444444-4444-4444-8444-444444444444', full_name: 'Carla Sans Rôle', decision_role: null },
    ]

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts })

    expect(strategy.people.champions.value).toEqual([{ contactId: contacts[0]!.id, name: 'Alice Champion' }])
    expect(strategy.people.champions.status).toBe('observed')
    expect(strategy.people.procurement.value).toEqual([{ contactId: contacts[1]!.id, name: 'Bob Achats' }])
    // Aucun contact `user`/`economic`/`technical`/`blocker` → ces quatre rôles
    // apparaissent dans `missing_roles`, un FAIT CALCULÉ, jamais un texte généré.
    expect(strategy.people.missing_roles.status).toBe('observed')
    expect(strategy.people.missing_roles.value).toEqual(
      expect.arrayContaining(['technical', 'economic', 'user', 'blocker']),
    )
    expect(strategy.people.missing_roles.value).not.toContain('champion')
    expect(strategy.people.missing_roles.value).not.toContain('procurement')
  })

  // #3277 (recette prod 02/10, NOVA LOGISTIQUE) — le bandeau Contacts listait « Achats » et « Inconnu »
  // comme rôles à couvrir alors qu'un contact est badgé Achats : `missing_roles` partait de TOUTES les
  // valeurs de `decisionRoleSchema`, héritées comprises (`purchasing`, `unknown`, `sponsor`, `operational`).
  it('#3277 — un rôle hérité n’est jamais « manquant » et `purchasing` compte comme les Achats', () => {
    const contacts: AccountStrategy5PContactInput[] = [
      { id: '22222222-2222-4222-8222-222222222222', full_name: 'Solveig Achats', decision_role: 'purchasing' },
    ]
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts })

    expect(strategy.people.procurement.value).toEqual([{ contactId: contacts[0]!.id, name: 'Solveig Achats' }])
    const missing = strategy.people.missing_roles.value
    expect(missing).not.toContain('purchasing')
    expect(missing).not.toContain('procurement')
    for (const legacy of ['unknown', 'sponsor', 'operational']) expect(missing).not.toContain(legacy)
    expect([...missing].sort()).toEqual(['blocker', 'champion', 'economic', 'influencer', 'technical', 'user'])
  })

  /**
   * #3261.15 (épopée #3293) — RH, une source distincte du titre, jamais un
   * huitième `decision_role`.
   */
  it('P3 PEOPLE range un contact DRH dans `hr`, à côté de son decision_role habituel', () => {
    const contacts: AccountStrategy5PContactInput[] = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        full_name: 'Diane RH',
        title: 'DRH',
        decision_role: 'champion',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        full_name: 'Eloi Sans Titre RH',
        title: 'Directeur des Ressources Naturelles',
        decision_role: null,
      },
    ]

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts })

    // Le DRH apparaît sous `hr` ET sous `champions` — deux facettes du même
    // contact, jamais deux vérités concurrentes sur LE MÊME fait.
    expect(strategy.people.hr.value).toEqual([{ contactId: contacts[0]!.id, name: 'Diane RH' }])
    expect(strategy.people.champions.value).toEqual([{ contactId: contacts[0]!.id, name: 'Diane RH' }])
    // « Ressources Naturelles » ne matche jamais sur le seul mot « ressources ».
    expect(strategy.people.hr.value).not.toContainEqual({ contactId: contacts[1]!.id, name: 'Eloi Sans Titre RH' })
  })

  it('un compte sans aucun titre RH rend `hr` `missing`, jamais une ligne inventée', () => {
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [] })
    expect(strategy.people.hr.status).toBe('missing')
    expect(strategy.people.hr.value).toBeNull()
  })

  it('missing_roles sort du dénominateur (`not_applicable`) quand tous les rôles connus sont représentés', () => {
    const contacts: AccountStrategy5PContactInput[] = decisionRoleSchema.options.map((role, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      full_name: `Contact ${role}`,
      decision_role: role,
    }))

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts })

    expect(strategy.people.missing_roles.status).toBe('not_applicable')
    expect(strategy.people.missing_roles.value).toEqual([])
  })

  it('P4.risks est LEVÉ de AccountAnalysis.risks, jamais recalculé (même discipline que missing_po)', () => {
    const analysis: AccountAnalysis = {
      risks: [{ risk: 'Budget non arbitré', probability: 'moyenne', impact: 'important', mitigation: null }],
      angles: [
        {
          title: 'Angle A',
          strategy: null,
          description: null,
          entry_contact_persona: null,
          specific_offer: null,
          offer: null,
          estimated_deal_size: null,
          proof: 'Référence X',
          proof_status: 'mobilisable',
        },
      ],
    }

    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis, contacts: [] })

    expect(strategy.proof.risks.value).toEqual(analysis.risks)
    expect(strategy.proof.risks.status).toBe('observed')
    // Un angle `mobilisable` existe → missing_proof est faux, jamais un texte inventé.
    expect(strategy.proof.missing_proof.value).toBe(false)
  })
})

describe('accountStrategy5PReadinessFor — jamais un pourcentage de chance de signature', () => {
  const known = (): AccountStrategy5PElement<string> => ({ value: 'x', status: 'observed' })
  const gap = (): AccountStrategy5PElement<string> => ({ value: null, status: 'missing' })

  it('cinq dimensions solides → READY_TO_ACT, aucune dimension à désigner', () => {
    const dims = { perimeter: [known()], problem: [known()], people: [known()], proof: [known()], passage: [known()] }
    expect(accountStrategy5PReadinessFor(dims)).toEqual({ readiness: 'READY_TO_ACT', nextActionDimension: null })
  })

  it('un seul trou → READY_TO_VERIFY, et désigne la dimension exacte', () => {
    const dims = { perimeter: [known()], problem: [known()], people: [known()], proof: [gap()], passage: [known()] }
    expect(accountStrategy5PReadinessFor(dims)).toEqual({ readiness: 'READY_TO_VERIFY', nextActionDimension: 'proof' })
  })

  it("l'exemple du ticket (périmètre et personnes clairs, aucune preuve ni voie d'accès) ne se déclare jamais prêt", () => {
    // « Le périmètre et les personnes sont assez clairs. En revanche, tu n'as
    // aucune preuve contextualisée ni voie d'accès. » — trois trous
    // (problem/proof/passage) ⇒ jamais READY_TO_ACT/READY_TO_VERIFY : c'est
    // le NO-GO du ticket (« déclarée complète alors que plusieurs P restent
    // vides »).
    const dims = { perimeter: [known()], problem: [gap()], people: [known()], proof: [gap()], passage: [gap()] }
    const result = accountStrategy5PReadinessFor(dims)
    expect(result.readiness).toBe('INCOMPLETE')
    expect(result.nextActionDimension).toBe('problem')
  })

  it('quatre trous → BLOCKED, cinq trous → NO_GO', () => {
    const four = { perimeter: [known()], problem: [gap()], people: [gap()], proof: [gap()], passage: [gap()] }
    expect(accountStrategy5PReadinessFor(four).readiness).toBe('BLOCKED')

    const five = { perimeter: [gap()], problem: [gap()], people: [gap()], proof: [gap()], passage: [gap()] }
    expect(accountStrategy5PReadinessFor(five).readiness).toBe('NO_GO')
  })

  it('`not_applicable` sort du dénominateur : un axe non évaluable ne compte ni comme connu ni comme trou (GA-18/19)', () => {
    const notApplicable = (): AccountStrategy5PElement<string> => ({ value: null, status: 'not_applicable' })
    const dims = {
      perimeter: [known()],
      problem: [known()],
      people: [known()],
      proof: [notApplicable()],
      passage: [known()],
    }
    expect(accountStrategy5PReadinessFor(dims)).toEqual({ readiness: 'READY_TO_ACT', nextActionDimension: null })
  })
})

describe("summarizeAccountStrategy5P — ce que l'écran affiche, jamais un second calcul", () => {
  it('désigne la dimension `next_action_dimension`, et compte les résumés hors du dénominateur', () => {
    const analysis: AccountAnalysis = {
      pains: [{ pain: 'Migration bloquée', business_impact: null, esn_offer: null, urgency: null }],
    }
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis, contacts: [] })
    const summaries = summarizeAccountStrategy5P(strategy)

    // `problem` a un fait connu (operational_problem) → pas la dimension désignée.
    expect(summaries.problem.known).toBeGreaterThan(0)
    expect(summaries.problem.isNextAction).toBe(false)
    // `perimeter` est entièrement vide et arrive avant `problem` dans l'ordre canonique.
    expect(summaries.perimeter.known).toBe(0)
    expect(summaries.perimeter.isNextAction).toBe(true)
    expect(strategy.next_action_dimension).toBe('perimeter')
    // `missing_roles` (résumé calculé) ne gonfle pas le compte `people`.
    expect(summaries.people.total).toBe(10) // 11 champs P3 (dont `hr`, #3261.15) moins missing_roles
  })
})

describe('isHrTitle (#3261.15) — ancré sur la fonction, jamais sur le mot « ressources » seul', () => {
  it.each(['DRH', 'RRH', 'CHRO', 'HRBP', 'Directeur des Ressources Humaines', 'HR Business Partner', 'Head of HR'])(
    'reconnaît %s',
    title => {
      expect(isHrTitle(title)).toBe(true)
    },
  )

  it.each([null, undefined, '', 'Directeur des Ressources Naturelles', 'Directeur Rhône-Alpes', 'Directeur Achats'])(
    'ne reconnaît pas %s',
    title => {
      expect(isHrTitle(title)).toBe(false)
    },
  )
})

/**
 * K.4 / #4324 (Louis 19/10/2026, cas Arkéa) — « aucun DSI / RSSI » écrit alors que le compte porte un CISO :
 * « chaque boîte donne des noms différents aux gens ». Un rôle ne se déclare absent qu'APRÈS avoir
 * rapproché les intitulés équivalents. Même motif que `isHrTitle` : le TITRE, jamais un texte deviné.
 */
describe('isTechnicalDeciderTitle (#4324) — les intitulés équivalents du décideur technique', () => {
  it.each([
    'DSI',
    'DSI Groupe',
    'Directeur des systèmes d’information',
    "Directeur du Système d'Information",
    'Directeur des SI',
    'CIO',
    'Chief Information Officer',
    'Head of IT',
    'IT Director',
    'RSSI',
    'CISO',
    'Chief Information Security Officer',
    'Responsable sécurité SI',
    'Responsable de la sécurité des systèmes d’information',
    'Directeur de la sécurité informatique',
    'Head of Security',
    'Directeur numérique',
    'Directeur des Services Numériques',
    'DOSI',
  ])('reconnaît %s', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    'Directeur Financier',
    'Directeur Commercial',
    'Responsable Achats IT',
    'Stagiaire DSI',
    'Directeur de site',
    'Responsable sécurité incendie',
  ])('ne reconnaît pas %s', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(false)
  })
})

describe('deriveAccountStrategy5P — le décideur technique se rapproche par intitulé (#4324)', () => {
  const ciso: AccountStrategy5PContactInput = {
    id: '66666666-6666-4666-8666-666666666666',
    full_name: 'Camille Sécu',
    title: 'CISO',
    decision_role: null,
  }

  it('un CISO sans rôle décisionnel posé tient le siège technique : « technical » n’est PAS manquant', () => {
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [ciso] })
    expect(strategy.people.technical_references.value).toEqual([{ contactId: ciso.id, name: 'Camille Sécu' }])
    expect(strategy.people.missing_roles.value).not.toContain('technical')
  })

  it('sait dire NON : sans aucun titre équivalent, « technical » reste manquant', () => {
    const buyer: AccountStrategy5PContactInput = {
      id: '77777777-7777-4777-8777-777777777777',
      full_name: 'Dora Finance',
      title: 'Directeur Financier',
      decision_role: null,
    }
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [buyer] })
    expect(strategy.people.missing_roles.value).toContain('technical')
  })

  it('un rôle posé (humain ou modèle) n’est jamais écrasé par le titre', () => {
    const blocker: AccountStrategy5PContactInput = { ...ciso, decision_role: 'blocker' }
    const strategy = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [blocker] })
    expect(strategy.people.blockers.value).toEqual([{ contactId: ciso.id, name: 'Camille Sécu' }])
    expect(strategy.people.missing_roles.value).toContain('technical')
  })
})

describe('deriveAccountStrategy5P — P4/P5 depuis les missions DÉJÀ menées chez le compte (#3277.6, #3277.7)', () => {
  const mission = (over: Partial<AccountStrategy5PMissionInput>): AccountStrategy5PMissionInput => ({
    label: 'Refonte SI',
    status: 'active',
    consultants: [],
    ...over,
  })

  it('sans mission : P4/P5 restent `missing`, no_path vrai — jamais une voie devinée', () => {
    const strategy = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [],
    })
    expect(strategy.passage.existing_client.status).toBe('missing')
    expect(strategy.proof.mission_rex.status).toBe('missing')
    expect(strategy.passage.no_path.value).toBe(true)
  })

  it('une mission en cours = client existant + consultant en place + preuve relationnelle', () => {
    const strategy = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [mission({ consultants: ['Awa Diallo'] })],
    })
    expect(strategy.passage.existing_client.value).toBe('1 mission en cours')
    expect(strategy.passage.current_consultant.value).toBe('Awa Diallo')
    expect(strategy.proof.relevant_consultant.value).toBe('Awa Diallo')
    expect(strategy.passage.no_path.value).toBe(false)
    expect(strategy.passage.confidence).toBe('low') // 2 voies sur 12 : jamais une confiance « haute »
    expect(() => accountStrategy5PSchema.parse(strategy)).not.toThrow()
  })

  // #3277 (recette prod 02/10) — « 3 éléments connus sur 9 » à côté de « Aucune preuve mobilisable » :
  // le consultant en place et la mission menée sont des preuves lues, `missing_proof` ne peut pas les ignorer.
  it('#3277 — une mission menée chez le compte est une preuve : `missing_proof` est faux, pas contredit', () => {
    const withMission = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [mission({ consultants: ['Awa Diallo'] })],
    })
    expect(withMission.proof.relevant_consultant.status).toBe('observed')
    expect(withMission.proof.missing_proof.value).toBe(false)

    const without = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [mission({ status: 'cancelled' })],
    })
    expect(without.proof.missing_proof.value).toBe(true)
  })

  it('une mission terminée = REX + ancien consultant ; un consultant encore en place n’est pas « ancien »', () => {
    const strategy = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [
        mission({ status: 'completed', label: 'Migration cloud', consultants: ['Awa Diallo', 'Paul Roy'] }),
        mission({ consultants: ['Awa Diallo'] }),
      ],
    })
    expect(strategy.proof.mission_rex.value).toBe('Migration cloud')
    expect(strategy.passage.former_consultant.value).toBe('Paul Roy')
    expect(strategy.passage.current_consultant.value).toBe('Awa Diallo')
  })

  it('une mission annulée ou archivée ne prouve rien', () => {
    const strategy = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      missions: [mission({ status: 'cancelled', consultants: ['X Y'] }), mission({ status: 'archived' })],
    })
    expect(strategy.passage.existing_client.status).toBe('missing')
    expect(strategy.passage.former_consultant.status).toBe('missing')
  })
})

describe('deriveAccountStrategy5P — P5 partenaire et rang 2 depuis les ESN du compte (#3277.7)', () => {
  const partner = (over: Partial<AccountStrategy5PPartnerInput>): AccountStrategy5PPartnerInput => ({
    name: 'ALTEN',
    rank: 'rank1',
    relationship: 'unknown',
    ...over,
  })
  const derive = (partners: AccountStrategy5PPartnerInput[]) =>
    deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: emptyAnalysis(), contacts: [], partners })

  it('une ESN rang 1 avec qui on travaille = la voie `partner` ; un concurrent n’en est pas une', () => {
    const strategy = derive([
      partner({ name: 'ALTEN', relationship: 'partner' }),
      partner({ name: 'Sopra', relationship: 'competitor' }),
    ])
    expect(strategy.passage.partner.value).toBe('ALTEN')
    expect(strategy.passage.no_path.value).toBe(false)
  })

  it('une ESN de rang 2 non concurrente = la voie `rank_2`', () => {
    const strategy = derive([partner({ name: 'Talan', rank: 'rank2' })])
    expect(strategy.passage.rank_2.value).toBe('Talan')
    expect(strategy.passage.partner.status).toBe('missing')
  })

  it('#3684.3 — une observation d’analyse seule (sans placement) ne fonde ni `partner` ni `rank_2`', () => {
    const strategy = derive([
      partner({ name: 'ALTEN', relationship: 'partner', source: 'analysis', placements: 0 }),
      partner({ name: 'Talan', rank: 'rank2', source: 'analysis', placements: 0 }),
    ])
    expect(strategy.passage.partner.status).toBe('missing')
    expect(strategy.passage.rank_2.status).toBe('missing')
    expect(strategy.passage.no_path.value).toBe(true)
  })

  it('#3684.1 — une ESN déclarée par l’équipe, ou observée AVEC placement, fonde la voie', () => {
    const strategy = derive([
      partner({ name: 'ALTEN', relationship: 'partner', source: 'declared' }),
      partner({ name: 'Sopra', relationship: 'partner', source: 'analysis', placements: 2 }),
      partner({ name: 'Talan', relationship: 'partner', source: 'analysis', placements: 0 }),
    ])
    expect(strategy.passage.partner.value).toBe('ALTEN, Sopra')
  })

  it('rang 2 concurrent ou rang inconnu : aucune voie — jamais devinée', () => {
    const strategy = derive([
      partner({ name: 'Talan', rank: 'rank2', relationship: 'competitor' }),
      partner({ name: 'X', rank: 'unknown' }),
    ])
    expect(strategy.passage.rank_2.status).toBe('missing')
    expect(strategy.passage.partner.status).toBe('missing')
    expect(strategy.passage.no_path.value).toBe(true)
  })
  it('#3684.2/#3667.R1 — chaque ESN non écartée est retrouvable avec sa certitude canonique (même vocabulaire qu’Accès), son périmètre et sa prochaine vérification', () => {
    const strategy = derive([
      partner({ id: 'p1', name: 'ALTEN', relationship: 'partner', source: 'declared', scope: 'TMA SAP' }),
      partner({ id: 'p2', name: 'Talan', source: 'analysis', placements: 0 }),
      partner({ id: 'p3', name: 'Sopra', source: 'analysis', placements: 2, scope: null }),
    ])
    const cited = strategy.passage.cited_esns ?? []
    // #3667.R1 — `probable_relation` / `historic_observation` / `verified_access` : le MÊME
    // vocabulaire que `personalAccessCertainty` (onglet Accès), plus jamais `declared`/
    // `documented`/`observed_only` (vocabulaire maison retiré, pas doublé).
    expect(cited.map(c => [c.name, c.certainty])).toEqual([
      ['ALTEN', 'probable_relation'],
      ['Talan', 'historic_observation'],
      ['Sopra', 'verified_access'],
    ])
    expect(cited.every(c => c.freshness === 'undated')).toBe(true)
    expect(cited[0]).toMatchObject({ partner_id: 'p1', scope: 'TMA SAP', next_check: null })
    // observation seule : hypothèse à vérifier, jamais un statut confirmé
    expect(cited[1]).toMatchObject({ founded: false, next_check: 'confirm_relation' })
    // fondée mais sans périmètre : la prochaine vérification est le périmètre
    expect(cited[2]).toMatchObject({ founded: true, scope: null, next_check: 'confirm_scope' })
  })

  it('#3684.2 — plusieurs éléments sur la même ESN se réunissent sur UNE ligne sans s’écraser', () => {
    const strategy = derive([
      partner({ id: 'a', name: 'Sopra Steria', source: 'analysis', placements: 0, scope: 'Cloud' }),
      partner({ id: 'b', name: 'sopra steria', source: 'declared', placements: 1 }),
    ])
    const cited = strategy.passage.cited_esns ?? []
    expect(cited).toHaveLength(1)
    // La ligne 'b' (placements réels) fonde une certitude PLUS FORTE que la ligne 'a'
    // (observation seule) : la plus forte gagne, jamais une moyenne ni la dernière lue.
    expect(cited[0]?.certainty).toBe('verified_access')
    expect(cited[0]?.scope).toBe('Cloud')
  })

  it('#3667.R1 — une ESN datée et observée seule (sans placement ni déclaration) reste une relation probable, jamais confirmée ni muette', () => {
    const now = new Date('2026-10-08T00:00:00Z')
    const strategy = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: emptyAnalysis(),
      contacts: [],
      partners: [partner({ name: 'Devoteam', source: 'analysis', detectedAt: '2026-10-01T00:00:00Z' })],
      now,
    })
    expect(strategy.passage.cited_esns?.[0]).toMatchObject({ certainty: 'probable_relation', freshness: 'fresh' })
  })

  it('#3684.5 — aucune ESN : « relation non documentée », jamais « aucune ESN n’intervient »', () => {
    const strategy = derive([])
    expect(strategy.passage.cited_esns).toEqual([])
    expect(strategy.passage.relation_documented).toBe(false)
    expect(derive([partner({ name: 'X', source: 'analysis' })]).passage.relation_documented).toBe(true)
  })
})

/**
 * #4324.1 (retour client 21/10, DSI de chaque compte suivi) — des intitulés de terrain (DHL, STEF, STG, Dachser…)
 * que le rapprochement K.4 laissait passer : « Directeur IT », « VP IT », « Directeur Infrastructures et Production IT »…
 */
describe('isTechnicalDeciderTitle (#4324.1) — intitulés de terrain', () => {
  it.each([
    "Directeur des Systèmes d'Informations",
    'Direction des Systèmes d’Information',
    'DSIN',
    'Directeur IT',
    'IT Director France',
    'Director, IT',
    'VP IT',
    'VP Information Technology',
    'Head of Information Systems',
    'Information Systems Director',
    'Director of Information Systems',
    'Directeur des Opérations IT',
    'Directeur Infrastructures et Production IT',
    'Directeur IS/IT',
    'Information Security Officer',
    'Directeur Cybersécurité',
    'Responsable Cybersécurité',
    'Chief Digital & Information Officer',
    'Directeur Général Adjoint en charge des Systèmes d’Information',
  ])('reconnaît %s', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(true)
  })

  it.each([
    'Chef de projet DSI',
    'Chargé de mission DSI',
    'Assistante de direction DSI',
    'Chef de projet infrastructure IT',
    'Directeur Logistique',
    'Directeur Achats IT',
  ])('ne prend pas %s pour le siège technique', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(false)
  })
})

describe('technicalSeatGap (#4324.1) — dire POURQUOI un compte n’a pas de DSI connu', () => {
  const titles = (...list: Array<string | null>) => list.map(title => ({ title, decision_role: null }))

  it('un titulaire reconnu : aucun manque à dire', () => {
    expect(technicalSeatGap(titles('DSI', 'Chef de projet'))).toBeNull()
    expect(technicalSeatGap([{ title: 'Directeur', decision_role: 'technical' }])).toBeNull()
  })

  it('aucun contact IT collecté : le manque est de COLLECTE', () => {
    expect(technicalSeatGap(titles('Directeur Financier', 'Responsable RH', null))).toEqual({
      reason: 'no_it_contact',
      itContacts: 0,
    })
    expect(technicalSeatGap([])).toEqual({ reason: 'no_it_contact', itContacts: 0 })
  })

  // #4324.1 (26/10) — un « IT Manager » est un titulaire d'intitulé voisin : il TIENT le siège (il ne le laisse plus
  // « en dessous du niveau direction »). Seuls les profils sans responsabilité (chef de projet, technicien…) restent dessous.
  it('des contacts IT, aucun au niveau direction : le manque est de NIVEAU, avec le nombre', () => {
    expect(
      technicalSeatGap(titles('Chef de projet DSI', 'Technicien réseau', 'Développeur', 'Directeur Financier')),
    ).toEqual({
      reason: 'it_below_director',
      itContacts: 3,
    })
  })

  it('un rôle technique posé à la main compte comme titulaire, jamais écrasé par le titre', () => {
    expect(technicalSeatGap([{ title: 'Directeur Financier', decision_role: 'technical' }])).toBeNull()
  })
})

describe('people.technical_references (#4324.1) — un titulaire d’intitulé voisin tient le siège', () => {
  const holder = (title: string, role: string | null) =>
    ({ id: 'c2', full_name: 'Alex Voisin', title, decision_role: role }) as unknown as Parameters<
      typeof deriveAccountStrategy5P
    >[0]['contacts'][number]

  it.each([
    ['IT Manager', null],
    ['IT Manager', 'unknown'],
    ['Responsable informatique', null],
    ['Responsable informatique', 'unknown'],
    ['Head of IT', 'unknown'],
  ])('%s (rôle %s) n’est pas déclaré absent : « technical » n’est PAS manquant', (title, role) => {
    const s = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: {}, contacts: [holder(title, role)] })
    expect(s.people.technical_references.value).toEqual([{ contactId: 'c2', name: 'Alex Voisin' }])
    expect(s.people.missing_roles.value).not.toContain('technical')
    expect(s.people.technical_gap).toBeUndefined()
  })

  it('sait dire NON : un rôle posé n’est jamais écrasé par le titre, un chef de projet ne tient pas le siège', () => {
    const posed = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: {},
      contacts: [holder('IT Manager', 'user')],
    })
    expect(posed.people.technical_references.value).toBeNull()
    expect(posed.people.missing_roles.value).toContain('technical')
    const pm = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: {},
      contacts: [holder('Chef de projet DSI', 'unknown')],
    })
    expect(pm.people.missing_roles.value).toContain('technical')
  })
})

describe('people.technical_gap (#4324.1) — le siège technique vide dit POURQUOI', () => {
  const contact = (title: string) =>
    ({ id: 'c1', full_name: 'X Y', title, decision_role: null }) as unknown as Parameters<
      typeof deriveAccountStrategy5P
    >[0]['contacts'][number]

  it('aucun contact IT : manque de COLLECTE', () => {
    const s = deriveAccountStrategy5P({
      accountId: ACCOUNT_ID,
      analysis: {},
      contacts: [contact('Directeur Financier')],
    })
    expect(s.people.technical_gap).toEqual({ reason: 'no_it_contact', itContacts: 0 })
  })

  it('un DSI reconnu : aucune raison à dire', () => {
    const s = deriveAccountStrategy5P({ accountId: ACCOUNT_ID, analysis: {}, contacts: [contact('Directeur IT')] })
    expect(s.people.technical_gap).toBeUndefined()
  })
})

describe('isTechnicalDeciderTitle (#4324) — sigles pointés, abréviations, variantes', () => {
  it.each([
    'D.S.I.',
    'D.S.I. Groupe',
    'R.S.S.I',
    'Dir. des Systèmes d’Information',
    'Dir. SI',
    'DSIT',
    'Directeur des Services Informatiques',
    'Responsable de la sécurité de l’information',
    'Directrice des Systèmes d’Information et Télécoms',
  ])('« %s » tient le siège technique', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(true)
  })

  it.each([
    'Stagiaire DSI',
    'Responsable Achats IT',
    'Directeur Technique',
    'Responsable Sécurité Incendie',
    'Dir. Commercial',
    'Directeur Data',
  ])('sait dire NON : « %s » n’est pas un décideur technique', title => {
    expect(isTechnicalDeciderTitle(title)).toBe(false)
  })
})

// #4324.1 — « À qualifier » (`unknown`) n'est pas un rôle posé : l'intitulé du titulaire tient le siège technique.
describe('technicalSeatGap (#4324.1) — un titulaire « à qualifier » ou d’intitulé voisin tient le siège', () => {
  it('un « Responsable de Domaine IT » rangé unknown tient le siège technique', () => {
    expect(technicalSeatGap([{ title: 'Responsable de Domaine IT', decision_role: 'unknown' }])).toBeNull()
  })

  it('un « IT Infrastructure and Security Manager » (intitulé voisin) tient le siège', () => {
    expect(technicalSeatGap([{ title: 'IT Infrastructure and Security Manager', decision_role: 'unknown' }])).toBeNull()
  })

  it('sans aucun contact IT, le siège reste à pourvoir (la garde sait dire NON)', () => {
    expect(technicalSeatGap([{ title: 'Chauffeur', decision_role: 'unknown' }])).toEqual({
      reason: 'no_it_contact',
      itContacts: 0,
    })
  })
})
