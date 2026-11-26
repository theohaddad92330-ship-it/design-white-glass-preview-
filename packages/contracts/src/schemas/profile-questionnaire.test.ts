import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from './onboarding.js'
import { ESN_ANSWER_OPTIONS } from './onboarding.js'
import {
  baseProspectingHolds,
  DEFAULT_QUESTION_CONTEXT,
  doesContentMarketing,
  PROFILE_BLOCKS,
  PROFILE_QUESTION_OPTIONS,
  PROFILE_QUESTIONS,
  profileQuestionnaireProgress,
  pursuesRfps,
  questionsOfBlock,
  recommendContentInvestment,
  RFP_DEAL_VALUE_UNKNOWN,
  RFP_DOCUMENT_READINESS_CONFIRMED,
  RFP_OWNER_ASSIGNED_CONFIRMED,
  rfpDocumentationIsReady,
  rfpEconomicsAreKnown,
  rfpOwnerIsAssigned,
  roleFunctionsPracticedFromWorkspaceRole,
  summariseProfileUnderstanding,
  toolingChoicesFromConnectedTools,
  visibleProfileBlocks,
  visibleProfileQuestions,
  worksAlone,
} from './profile-questionnaire.js'

const answers = (over: Partial<EsnAnswers> = {}): Partial<EsnAnswers> => over

describe('catalogue du profil progressif (§21-30)', () => {
  it('couvre les 6 blocs du rapport, dans l’ordre', () => {
    expect([...PROFILE_BLOCKS]).toEqual(['role', 'company', 'offer', 'market', 'routine', 'maturity'])
    for (const block of PROFILE_BLOCKS) {
      expect(questionsOfBlock(block, answers()).length).toBeGreaterThan(0)
    }
  })

  it('tient la promesse « blocs de 4 à 6 questions » sur le tronc commun', () => {
    for (const block of PROFILE_BLOCKS) {
      // Le tronc commun = les questions posées à TOUT LE MONDE. Les extras
      // conditionnels du §28 (marchés publics, secteur régulé, rang 2) viennent
      // EN PLUS, et le rapport les demande explicitement en plus des 30.
      const base = PROFILE_QUESTIONS.filter(q => q.block === block && !q.when).length
      expect(base, `bloc ${block}`).toBeLessThanOrEqual(6)
    }
  })

  it('n’ajoute les questions conditionnelles qu’au profil concerné', () => {
    const generic = visibleProfileQuestions(answers()).length
    const publicSector = visibleProfileQuestions(answers({ target_company_types: ['Secteur public local'] })).length
    // #2056 — `targetsPublicSector` déclenche aussi `pursuesRfps` (secteur
    // public ⊂ AO) : `public_sector_practice` (+1, déjà là) ET les 11 questions
    // du bloc AO (9 + `rfp_deal_value`/`rfp_owner_assignment`, #2056.11/#2057.10).
    expect(publicSector).toBe(generic + 1 + 11)
  })

  it('n’a aucune clé de réponse en double', () => {
    const keys = PROFILE_QUESTIONS.map(q => q.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('donne des valeurs fermées à toute question à choix', () => {
    for (const q of PROFILE_QUESTIONS) {
      if (q.kind === 'tags') continue
      expect(q.choices, `${q.key} sans choix`).toBeDefined()
      expect(q.choices?.length ?? 0).toBeGreaterThan(1)
    }
  })

  // #1920.4 — directeur d'agence, décision Louis 15/09/2026 : la valeur
  // n'existait pas dans `user_role`, donc un directeur d'agence choisissait le
  // rôle le plus proche (« Directeur commercial »/« Directeur de BU ») et le
  // produit ne le reconnaissait pas. Ajoutée EN FIN d'énumération (GA-08 : un
  // enum n'insère jamais une valeur au milieu).
  it("porte « Directeur d'agence » avant les choix de PARCOURS ajoutés ensuite (#1920.4)", () => {
    // #2032.2-.8 (16/09) a ajouté 7 valeurs EN FIN après « Directeur d'agence » :
    // elle n'est donc plus la dernière, mais reste à sa place (GA-08).
    expect(PROFILE_QUESTION_OPTIONS.user_role.indexOf("Directeur d'agence")).toBe(10)
    expect(PROFILE_QUESTION_OPTIONS.user_role).toContain("Directeur d'agence")
  })

  // #2032.2-.8 — le PARCOURS (comment on travaille) est un axe DISTINCT du
  // TITRE (`user_role` porte les deux, `PROFILE_QUESTION_OPTIONS.user_role`
  // étendue plutôt que dupliquée — GA-26).
  it("porte les 7 choix de parcours en fin d'énumération de user_role (#2032.2-.8)", () => {
    const parcours = [
      'Pur commercial',
      'Commercial avec culture technique',
      'Hybride business / delivery',
      'Ancien consultant devenu commercial',
      'Pur technique / delivery',
      'Recrutement / talent',
      'Direction / management',
    ]
    expect(PROFILE_QUESTION_OPTIONS.user_role.slice(-7)).toEqual(parcours)
  })

  // BEL-SC-222 (#3251) — deux titres que le ticket distingue mais que le
  // catalogue ne portait pas encore : un responsable staffing et un profil
  // ADV/finance. Ajoutés EN FIN du bloc TITRES (GA-08 : jamais au milieu,
  // et jamais après les 7 choix de PARCOURS — sinon `.slice(-7)` ci-dessus
  // les avalerait).
  it('porte « Responsable staffing », « ADV / Finance » et « Freelance / activité individuelle » avant les choix de parcours (BEL-SC-222, #3251)', () => {
    const added = ['Responsable staffing', 'ADV / Finance', 'Freelance / activité individuelle']
    const parcoursStart = PROFILE_QUESTION_OPTIONS.user_role.length - 7
    for (const value of added) {
      expect(PROFILE_QUESTION_OPTIONS.user_role).toContain(value)
      expect(PROFILE_QUESTION_OPTIONS.user_role.indexOf(value)).toBeLessThan(parcoursStart)
    }
  })

  // #2032.10 — la question de suivi n'existe que si `user_role` est répondu.
  it('ne pose « quelles fonctions as-tu réellement exercées » que si le rôle est répondu (#2032.10)', () => {
    const withoutRole = visibleProfileQuestions(answers()).map(q => q.key)
    const withRole = visibleProfileQuestions(answers({ user_role: 'Business Manager' })).map(q => q.key)
    expect(withoutRole).not.toContain('role_functions_practiced')
    expect(withRole).toContain('role_functions_practiced')
  })

  // #2036.9 — l'ambition territoriale est une clé DISTINCTE de `geo_zones`
  // (la zone où l'on intervient déjà / a des relations) : jamais fusionnées.
  it('distingue `growth_target_zones` (souhaité) de `geo_zones` (déjà là) (#2036.9)', () => {
    const question = PROFILE_QUESTIONS.find(q => q.key === 'growth_target_zones')
    expect(question).toBeDefined()
    expect(question?.key).not.toBe('geo_zones')
    expect(question?.choices?.length).toBeGreaterThan(1)
  })

  // #2015.7 — « dire si c'est un groupe ou une filiale ». `establishment_count`
  // (prefill Pappers) n'est PAS une filiation : posée à TOUT LE MONDE (bloc B),
  // jamais gatée — contrairement au bloc AO.
  it('pose `company_group_structure` à tout le monde, sans branchement (#2015.7)', () => {
    const question = PROFILE_QUESTIONS.find(q => q.key === 'company_group_structure')
    expect(question).toBeDefined()
    expect(question?.block).toBe('company')
    expect(question?.when).toBeUndefined()
    expect(question?.choices?.length).toBeGreaterThan(1)
    expect(visibleProfileQuestions(answers()).map(q => q.key)).toContain('company_group_structure')
  })
})

describe('logique conditionnelle (§28)', () => {
  it('masque la coordination d’équipe pour un commercial seul', () => {
    const solo = visibleProfileQuestions(answers({ sales_team_size: '1' })).map(q => q.key)
    expect(solo).not.toContain('team_overlap')
    expect(solo).not.toContain('shared_data_scope')

    const team = visibleProfileQuestions(answers({ sales_team_size: '4-6' })).map(q => q.key)
    expect(team).toContain('team_overlap')
    expect(team).toContain('shared_data_scope')
  })

  it('ouvre les questions marchés publics quand le secteur public est ciblé', () => {
    const base = visibleProfileQuestions(answers()).map(q => q.key)
    expect(base).not.toContain('public_sector_practice')

    const publicSector = visibleProfileQuestions(answers({ target_company_types: ['Secteur public local'] }))
    expect(publicSector.map(q => q.key)).toContain('public_sector_practice')
  })

  it('ouvre les contraintes réglementaires sur banque / assurance', () => {
    const keys = visibleProfileQuestions(answers({ target_sectors: ['Assurance & Mutuelles'] })).map(q => q.key)
    expect(keys).toContain('regulated_sector_readiness')
  })

  it('ouvre les questions partenaires quand on travaille en rang 2', () => {
    const keys = visibleProfileQuestions(answers({ go_to_market_channels: ['Rang 2'] })).map(q => q.key)
    expect(keys).toContain('partner_relationship')
  })

  // #2067.2 — décision Louis du 18/09/2026 : « avec combien de partenaires
  // (ESN, cabinets, rangs 1) travailles-tu réellement aujourd'hui ? », réguliers
  // et ponctuels séparés. Posée UNIQUEMENT derrière une porte partenaire
  // (`worksThroughPartners`, le prédicat de `partner_relationship`) : l'audit ne
  // sait pas établir un nombre de partenaires à travailler sans elle.
  it('#2067.2 — demande AVEC COMBIEN de partenaires, seulement derrière une porte partenaire', () => {
    const counts = ['partners_regular_count', 'partners_occasional_count']
    const withPartner = visibleProfileQuestions(answers({ go_to_market_channels: ['Partenaires ESN'] })).map(q => q.key)
    expect(withPartner).toEqual(expect.arrayContaining(counts))
    // Juste après la nature de la relation : le même sujet, lu d'une traite.
    expect(withPartner.indexOf('partners_regular_count')).toBe(withPartner.indexOf('partner_relationship') + 1)
    // SAIT DIRE NON — en direct seul, la question n'est pas posée.
    const direct = visibleProfileQuestions(answers({ go_to_market_channels: ['Direct client final'] })).map(q => q.key)
    for (const key of counts) expect(direct).not.toContain(key)
    // Un seul catalogue pour les deux questions (GA-26), et « je ne sais pas » y est.
    expect(PROFILE_QUESTION_OPTIONS.partners_regular_count).toEqual(PROFILE_QUESTION_OPTIONS.partners_occasional_count)
    expect(PROFILE_QUESTION_OPTIONS.partners_regular_count).toContain('Je ne sais pas')
  })

  it('ne redemande pas un outil déjà déduit comme branché, mais garde la question pour les autres', () => {
    // #2031.10 — un seul CRM branché ne fait plus disparaître les 14 choix :
    // seul le choix déduit sort de la liste, la question reste posée pour le
    // reste (Outlook, l'agenda, un outil d'enrichissement ou de séquence).
    const withHubspot = visibleProfileQuestions(answers(), { connectedToolNames: ['HubSpot'] })
    const tooling = withHubspot.find(q => q.key === 'tooling')
    expect(tooling).toBeDefined()
    expect(tooling?.choices).not.toContain('HubSpot')
    expect(tooling?.choices).toContain('Outlook')
    expect(tooling?.choices).toContain('Outil de séquence')

    const without = visibleProfileQuestions(answers(), { connectedToolNames: [] }).map(q => q.key)
    expect(without).toContain('tooling')
    const withoutQuestion = visibleProfileQuestions(answers(), { connectedToolNames: [] }).find(
      q => q.key === 'tooling',
    )
    expect(withoutQuestion?.choices?.length).toBe(PROFILE_QUESTION_OPTIONS.tooling.length)
  })

  it('sans rien de connecté, les quatorze choix de `tooling` sont tous là (témoin)', () => {
    const tooling = visibleProfileQuestions(answers(), { connectedToolNames: [] }).find(q => q.key === 'tooling')
    expect(tooling?.choices?.length).toBe(14)
  })

  it('ne fait disparaître `tooling` que quand LA TOTALITÉ de ses choix est déduite', () => {
    const allDeduced = { connectedToolNames: [...PROFILE_QUESTION_OPTIONS.tooling] }
    const keys = visibleProfileQuestions(answers(), allDeduced).map(q => q.key)
    expect(keys).not.toContain('tooling')

    // Un choix manquant à la déduction : la question reste.
    const almostAll = { connectedToolNames: PROFILE_QUESTION_OPTIONS.tooling.slice(0, -1) }
    expect(visibleProfileQuestions(answers(), almostAll).map(q => q.key)).toContain('tooling')
  })

  it('le total SERVEUR (contexte vide) reste ≥ au total ÉCRAN, sur les trois cas', () => {
    const serverTotal = visibleProfileQuestions(answers()).length
    const cases = [
      { connectedToolNames: [] },
      { connectedToolNames: ['HubSpot'] },
      { connectedToolNames: [...PROFILE_QUESTION_OPTIONS.tooling] },
    ]
    for (const context of cases) {
      expect(serverTotal).toBeGreaterThanOrEqual(visibleProfileQuestions(answers(), context).length)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  #2037.13 — `worksAlone` comparait à des littéraux qui n'existent pas.   */
  /*                                                                          */
  /*  Le prédicat testait `=== '1'` et `=== '1 personne'`. Les six valeurs     */
  /*  réelles de `sales_team_size` (ESN_ANSWER_OPTIONS) sont « Je suis seul    */
  /*  (fondateur / indépendant) », « 2-3 personnes », « 4-8 personnes »,       */
  /*  « 8-15 personnes », « 15+ personnes » et « Je n'ai pas d'équipe          */
  /*  commerciale dédiée ». Aucune ne valait '1' : le prédicat était TOUJOURS  */
  /*  faux en production, et les deux questions qu'il garde étaient posées à   */
  /*  tout le monde — dont « Partager quoi, avec qui ? » à un fondateur seul.  */
  /*                                                                          */
  /*  Les tests ne le voyaient pas : leurs fixtures écrivaient '1' et          */
  /*  '1-3 personnes', des valeurs que le produit ne produit jamais.           */
  /* ---------------------------------------------------------------------- */
  describe('#2037.13 — worksAlone lit les valeurs RÉELLES du questionnaire', () => {
    const SEUL = 'Je suis seul (fondateur / indépendant)'
    const SANS_EQUIPE = "Je n'ai pas d'équipe commerciale dédiée"

    it("dit OUI sur les deux valeurs qui désignent quelqu'un sans équipe", () => {
      expect(worksAlone({ sales_team_size: SEUL })).toBe(true)
      expect(worksAlone({ sales_team_size: SANS_EQUIPE })).toBe(true)
    })

    it('dit NON sur toutes les autres valeurs réelles — témoin de sur-détection', () => {
      for (const band of ['2-3 personnes', '4-8 personnes', '8-15 personnes', '15+ personnes']) {
        expect(worksAlone({ sales_team_size: band })).toBe(false)
      }
      expect(worksAlone({})).toBe(false)
      expect(worksAlone({ sales_team_size: null })).toBe(false)
    })

    it('ne tourne pas sur un corpus vide : les six valeurs réelles sont couvertes', () => {
      const reelles = ESN_ANSWER_OPTIONS.sales_team_size
      expect(reelles).toHaveLength(6)
      const seules = reelles.filter(v => worksAlone({ sales_team_size: v }))
      expect(seules).toEqual([SEUL, SANS_EQUIPE])
    })

    it('retire bien les deux questions de coordination à un fondateur seul', () => {
      const avecEquipe = visibleProfileQuestions({ sales_team_size: '4-8 personnes' }, DEFAULT_QUESTION_CONTEXT)
      const seul = visibleProfileQuestions({ sales_team_size: SEUL }, DEFAULT_QUESTION_CONTEXT)
      expect(avecEquipe.map(q => q.key)).toContain('team_overlap')
      expect(avecEquipe.map(q => q.key)).toContain('shared_data_scope')
      expect(seul.map(q => q.key)).not.toContain('team_overlap')
      expect(seul.map(q => q.key)).not.toContain('shared_data_scope')
    })
  })

  it('ne laisse jamais un bloc vide dans la liste des blocs à parcourir', () => {
    // Un commercial seul, tout connecté : le bloc « maturité » perd 2 questions
    // sur 4 mais garde les autres, donc reste dans la liste.
    const allDeduced = { connectedToolNames: [...PROFILE_QUESTION_OPTIONS.tooling] }
    const blocks = visibleProfileBlocks(answers({ sales_team_size: '1' }), allDeduced)
    for (const block of blocks) {
      expect(questionsOfBlock(block, answers({ sales_team_size: '1' }), allDeduced).length).toBeGreaterThan(0)
    }
  })
})

describe('toolingChoicesFromConnectedTools (#2031.10) — la déduction champ par champ', () => {
  it('ne déduit QUE les outils dont le nom affiché figure dans le catalogue `tooling`', () => {
    const tools = [
      { provider: 'hubspot', family: 'crm' as const, name: 'HubSpot' },
      { provider: 'gmail', family: 'email' as const, name: 'Gmail' },
      // Connecté, mais son nom affiché n'a pas de choix `tooling` correspondant —
      // jamais une fausse déduction plutôt qu'un manque.
      { provider: 'notion', family: 'documents' as const, name: 'Notion' },
    ]
    expect(toolingChoicesFromConnectedTools(tools)).toEqual(['HubSpot', 'Gmail'])
  })

  it('ne casse rien sur une liste vide (témoin — la déduction ne tourne pas dans le vide)', () => {
    expect(toolingChoicesFromConnectedTools([])).toEqual([])
  })

  it('ne compte pas deux fois le même nom déduit', () => {
    const tools = [
      { provider: 'hubspot', family: 'crm' as const, name: 'HubSpot' },
      { provider: 'hubspot', family: 'crm' as const, name: 'HubSpot' },
    ]
    expect(toolingChoicesFromConnectedTools(tools)).toEqual(['HubSpot'])
  })
})

describe('avancement', () => {
  it('compte sur les questions RÉELLEMENT posées, pas sur le catalogue entier', () => {
    const solo = answers({ sales_team_size: '1' })
    const withTeam = answers({ sales_team_size: '4-6' })
    expect(profileQuestionnaireProgress(solo).total).toBeLessThan(profileQuestionnaireProgress(withTeam).total)
  })

  it('ne compte pas une réponse vide', () => {
    const before = profileQuestionnaireProgress(answers({ sales_team_size: '4-6' }))
    const after = profileQuestionnaireProgress(answers({ sales_team_size: '4-6', user_role: '   ', sales_routine: [] }))
    expect(after.answered).toBe(before.answered)
  })

  it('compte une réponse renseignée, tableau comme texte', () => {
    const { answered } = profileQuestionnaireProgress(
      answers({ user_role: 'Business Manager', sales_routine: ['Priorisation hebdo'] }),
    )
    expect(answered).toBe(2)
  })
})

describe('« voici ce que Bellum a compris »', () => {
  it('ne dit que ce qui a été répondu', () => {
    expect(summariseProfileUnderstanding(answers())).toEqual([])
  })

  it('cite les valeurs de l’utilisateur, jamais une paraphrase inventée', () => {
    const summary = summariseProfileUnderstanding(
      answers({
        user_role: 'Business Manager',
        individual_goal: 'Ouvrir de nouveaux comptes',
        monthly_target: '6-10 RDV',
        sales_blockers: ['Pas de réponse', 'Timing'],
      }),
    )
    expect(summary.find(s => s.id === 'role')?.values).toEqual(['Business Manager'])
    expect(summary.find(s => s.id === 'goal')?.values).toEqual(['Ouvrir de nouveaux comptes', '6-10 RDV'])
    expect(summary.find(s => s.id === 'blockers')?.values).toEqual(['Pas de réponse', 'Timing'])
    expect(summary.find(s => s.id === 'sharing')).toBeUndefined()
  })
})

describe('#2056 — pursuesRfps élargit au-delà du seul secteur public', () => {
  it('reste vrai sur le secteur public (comportement historique)', () => {
    expect(pursuesRfps(answers({ target_company_types: ['Secteur public local'] }))).toBe(true)
  })

  it("s'active sur le canal « Appels d'offres », valeur RÉELLE de go_to_market_channels", () => {
    expect(pursuesRfps(answers({ go_to_market_channels: ["Appels d'offres"] }))).toBe(true)
  })

  it('reste faux sans aucun des deux signaux (témoin)', () => {
    expect(pursuesRfps(answers({ go_to_market_channels: ['Direct client final'] }))).toBe(false)
    expect(pursuesRfps(answers())).toBe(false)
  })

  it('pose les 11 questions AO uniquement quand pursuesRfps est vrai', () => {
    const withoutRfp = visibleProfileQuestions(answers({ go_to_market_channels: ['Direct client final'] })).map(
      q => q.key,
    )
    expect(withoutRfp).not.toContain('rfp_platforms_used')
    expect(withoutRfp).not.toContain('rfp_document_readiness')
    expect(withoutRfp).not.toContain('rfp_deal_value')
    expect(withoutRfp).not.toContain('rfp_owner_assignment')

    const withRfp = visibleProfileQuestions(answers({ go_to_market_channels: ["Appels d'offres"] })).map(q => q.key)
    for (const key of [
      'rfp_platforms_used',
      'rfp_referencing_status',
      'rfp_lot_allocation',
      'rfp_response_templates',
      'rfp_volume',
      'rfp_volume_period',
      'rfp_outcomes',
      'rfp_go_no_go_process',
      'rfp_document_readiness',
      // #2056.11 / #2057.10 — l'économie du dossier et l'owner.
      'rfp_deal_value',
      'rfp_owner_assignment',
    ]) {
      expect(withRfp, key).toContain(key)
    }
  })
})

describe('#2056.13 — rfpDocumentationIsReady', () => {
  it('confirme seulement sur la réponse EXPLICITE', () => {
    expect(rfpDocumentationIsReady(answers({ rfp_document_readiness: RFP_DOCUMENT_READINESS_CONFIRMED }))).toBe(true)
  })

  it('refuse toute autre réponse, y compris l’absence de réponse (témoin — jamais un false fabriqué)', () => {
    expect(rfpDocumentationIsReady(answers({ rfp_document_readiness: 'Des pièces manquent ou sont périmées' }))).toBe(
      false,
    )
    expect(rfpDocumentationIsReady(answers())).toBe(false)
  })
})

describe('#2056.11 — rfpEconomicsAreKnown', () => {
  it('confirme sur un MONTANT réel — jamais une proportion (2049.14)', () => {
    expect(rfpEconomicsAreKnown(answers({ rfp_deal_value: '150-500 k€' }))).toBe(true)
  })

  it('refuse un « je ne sais pas » explicite et l’absence de réponse (témoin)', () => {
    expect(rfpEconomicsAreKnown(answers({ rfp_deal_value: RFP_DEAL_VALUE_UNKNOWN }))).toBe(false)
    expect(rfpEconomicsAreKnown(answers())).toBe(false)
  })
})

describe('#2057.10 — rfpOwnerIsAssigned', () => {
  it('confirme seulement sur la réponse EXPLICITE', () => {
    expect(rfpOwnerIsAssigned(answers({ rfp_owner_assignment: RFP_OWNER_ASSIGNED_CONFIRMED }))).toBe(true)
  })

  it('refuse toute autre réponse, y compris l’absence de réponse (témoin — jamais un true fabriqué)', () => {
    expect(rfpOwnerIsAssigned(answers({ rfp_owner_assignment: 'Aucun processus' }))).toBe(false)
    expect(rfpOwnerIsAssigned(answers())).toBe(false)
  })
})

describe('#2057.1 — doesContentMarketing lit des valeurs RÉELLEMENT produites', () => {
  it("s'active sur `sales_routine` contenant exactement « Contenu LinkedIn »", () => {
    expect(doesContentMarketing(answers({ sales_routine: ['Contenu LinkedIn'] }))).toBe(true)
  })

  it("s'active sur `weekly_linkedin` non nul", () => {
    expect(doesContentMarketing(answers({ weekly_linkedin: '1-20' }))).toBe(true)
  })

  it('reste faux quand `weekly_linkedin` vaut explicitement 0 et sans routine contenu (témoin)', () => {
    expect(doesContentMarketing(answers({ weekly_linkedin: '0' }))).toBe(false)
    expect(doesContentMarketing(answers())).toBe(false)
  })

  it('pose les 6 questions contenu uniquement quand doesContentMarketing est vrai', () => {
    const without = visibleProfileQuestions(answers({ weekly_linkedin: '0' })).map(q => q.key)
    expect(without).not.toContain('content_funnel_stages_reached')

    const withActivity = visibleProfileQuestions(answers({ weekly_linkedin: '1-20' })).map(q => q.key)
    for (const key of [
      'content_active_profile',
      'content_audience_size',
      'content_visible_expertise',
      'content_reactions',
      'content_conversations_generated',
      'content_funnel_stages_reached',
    ]) {
      expect(withActivity, key).toContain(key)
    }
  })
})

describe('#2057.14 — recommendContentInvestment est un conseil qui REFUSE', () => {
  it('refuse le contenu quand la prospection de base ne tient pas, MÊME si les 4 étapes sont cochées', () => {
    const result = recommendContentInvestment(
      answers({
        weekly_calls: '0',
        weekly_emails: '0',
        content_funnel_stages_reached: [...PROFILE_QUESTION_OPTIONS.content_funnel_stages_reached],
      }),
    )
    expect(result.recommendation).toBe('no_content_before_base_prospecting')
  })

  it('dit "non mesuré" quand rien n’a de réponse — jamais un refus fabriqué', () => {
    expect(recommendContentInvestment(answers()).recommendation).toBe('not_enough_data')
  })

  it('encourage à publier davantage quand la prospection tient mais rien n’est encore publié', () => {
    const result = recommendContentInvestment(answers({ weekly_calls: '1-20' }))
    expect(result.recommendation).toBe('publish_more')
  })

  it('encourage à exploiter davantage un contenu qui ne fait que publier', () => {
    const result = recommendContentInvestment(
      answers({ weekly_calls: '1-20', content_funnel_stages_reached: ['Publier'] }),
    )
    expect(result.recommendation).toBe('exploit_further')
  })

  it('reconnaît un contenu qui fonctionne quand les 4 étapes sont atteintes', () => {
    const result = recommendContentInvestment(
      answers({
        weekly_calls: '1-20',
        content_funnel_stages_reached: [...PROFILE_QUESTION_OPTIONS.content_funnel_stages_reached],
      }),
    )
    expect(result.recommendation).toBe('content_is_working')
  })
})

describe('baseProspectingHolds — non mesuré n’est jamais un échec (GA-18/GA-19)', () => {
  it('rend null sans aucune réponse', () => {
    expect(baseProspectingHolds(answers())).toBeNull()
  })

  it('rend false seulement quand les deux valent explicitement 0', () => {
    expect(baseProspectingHolds(answers({ weekly_calls: '0', weekly_emails: '0' }))).toBe(false)
  })

  it('rend true dès qu’un canal est actif', () => {
    expect(baseProspectingHolds(answers({ weekly_calls: '1-20', weekly_emails: '0' }))).toBe(true)
  })
})

describe('roleFunctionsPracticedFromWorkspaceRole (#2031.3) — le rôle invité, champ par champ', () => {
  it('déduit « Vente / prospection » pour un rôle sales — le nom du rôle EST la fonction', () => {
    expect(roleFunctionsPracticedFromWorkspaceRole('sales')).toEqual(['Vente / prospection'])
  })

  it('déduit « Recrutement / sourcing » pour un rôle recruiter', () => {
    expect(roleFunctionsPracticedFromWorkspaceRole('recruiter')).toEqual(['Recrutement / sourcing'])
  })

  // ⚠️ #2031.3 — AUCUNE déduction fabriquée. `tech_admin` (intégrations),
  // `finance`, `sales_ops`, `viewer`, `member`, `admin`, `owner` n'ont aucune
  // correspondance NON devinée dans les six options de `role_functions_practiced`
  // (Vente / prospection, Delivery / conseil en mission, Recrutement / sourcing,
  // Management / direction, Marketing / communication, Support / opérations) —
  // mapper `admin` sur « Management / direction » ferait porter à un droit
  // d'ACCÈS un jugement sur ce que la personne EXERCE réellement (doctrine :
  // « jamais de donnée fictive », « un préremplissage deviné est pire qu'une
  // question de plus »). Le champ reste vide, la question se pose entière.
  it.each(['tech_admin', 'finance', 'sales_ops', 'viewer', 'member', 'admin', 'owner'] as const)(
    'ne devine rien pour le rôle %s',
    role => {
      expect(roleFunctionsPracticedFromWorkspaceRole(role)).toEqual([])
    },
  )

  it('rend un tableau vide quand le rôle est inconnu (source pas encore lue)', () => {
    expect(roleFunctionsPracticedFromWorkspaceRole(null)).toEqual([])
  })
})

describe('#2031.2 — la BU n’est pas une source de préremplissage (décision Louis 15/09)', () => {
  /**
   * #2031.2 — reformulé 18/09 : la BU (business unit / agence / territoire)
   * est un LIBELLÉ DÉCLARATIF, pas une partition — une réponse de
   * questionnaire + un filtre de lecture ailleurs, jamais une source externe
   * à VÉRIFIER avant un bloc comme le sont `connectedToolNames` (#2031.10) ou
   * `invitedRoleFunctions` (#2031.3). Cette garde sait dire NON : un futur
   * champ `businessUnit*` ajouté ici pour imiter #2031.5–.8 la fait rougir,
   * pour forcer à relire la décision plutôt qu'à la recontourner en silence.
   */
  it('ProfileQuestionContext ne porte AUCUN champ « business unit »', () => {
    expect(Object.keys(DEFAULT_QUESTION_CONTEXT).some(key => /business.?unit/i.test(key))).toBe(false)
  })

  it('le contexte par défaut garde exactement sa forme connue', () => {
    expect(Object.keys(DEFAULT_QUESTION_CONTEXT).sort()).toEqual(['connectedToolNames', 'invitedRoleFunctions'])
  })
})

describe('#2031.3 — le rôle invité prérempli via ProfileQuestionContext.invitedRoleFunctions', () => {
  const roleFunctionsQuestion = PROFILE_QUESTIONS.find(q => q.key === 'role_functions_practiced')

  it('le catalogue porte un prefillValue pour role_functions_practiced', () => {
    expect(roleFunctionsQuestion?.prefillValue).toBeTypeOf('function')
  })

  it('prefillValue rend EXACTEMENT ce que porte le contexte — aucune source en dur', () => {
    const context = { ...DEFAULT_QUESTION_CONTEXT, invitedRoleFunctions: ['Vente / prospection'] }
    expect(roleFunctionsQuestion?.prefillValue?.(context)).toEqual(['Vente / prospection'])
  })

  it('le défaut du contexte ne prérempli rien (source non lue = vide, jamais 0 traité comme un fait)', () => {
    expect(DEFAULT_QUESTION_CONTEXT.invitedRoleFunctions).toEqual([])
  })

  it('la question reste posée (when) même avec un préremplissage — un booléen ne masque rien ici', () => {
    // #2031.10 est le contre-exemple à ne pas reproduire : `when` de
    // `role_functions_practiced` ne dépend QUE de `user_role` répondu, jamais
    // du contexte de préremplissage.
    expect(roleFunctionsQuestion?.when?.({ user_role: 'Business Manager' }, DEFAULT_QUESTION_CONTEXT)).toBe(true)
  })
})

describe('#2058.2 / #2058.10 — les moments acceptés et le niveau de détail attendu', () => {
  const contactWindows = PROFILE_QUESTIONS.find(q => q.key === 'contact_windows')
  const detailLevel = PROFILE_QUESTIONS.find(q => q.key === 'detail_level')

  it('les deux questions existent, dans le bloc maturité, posées à tout le monde', () => {
    expect(contactWindows).toMatchObject({ block: 'maturity', kind: 'multi' })
    expect(detailLevel).toMatchObject({ block: 'maturity', kind: 'single' })
    // Aucune porte : contrairement à `shared_data_scope`, rien ne les masque.
    expect(contactWindows?.when).toBeUndefined()
    expect(detailLevel?.when).toBeUndefined()
  })

  it('donne des choix FERMÉS qui couvrent le besoin — jamais un texte libre', () => {
    expect(PROFILE_QUESTION_OPTIONS.contact_windows.length).toBeGreaterThan(1)
    expect(PROFILE_QUESTION_OPTIONS.detail_level.length).toBeGreaterThan(1)
    expect(contactWindows?.choices).toEqual(PROFILE_QUESTION_OPTIONS.contact_windows)
    expect(detailLevel?.choices).toEqual(PROFILE_QUESTION_OPTIONS.detail_level)
  })

  it('les deux clés existent dans l’énumération que le prédicat de test lit — jamais un littéral fantôme', () => {
    // #2037.13 — le défaut exact de `worksAlone` : comparer à une valeur qui
    // n'existe pas dans l'énumération rend le prédicat TOUJOURS faux, en
    // silence. On prouve ici que les valeurs utilisées plus bas viennent
    // RÉELLEMENT de `PROFILE_QUESTION_OPTIONS`, jamais d'un littéral recopié.
    const firstWindow = PROFILE_QUESTION_OPTIONS.contact_windows[0]!
    const firstDetail = PROFILE_QUESTION_OPTIONS.detail_level[0]!
    expect(PROFILE_QUESTION_OPTIONS.contact_windows).toContain(firstWindow)
    expect(PROFILE_QUESTION_OPTIONS.detail_level).toContain(firstDetail)
  })

  it('summariseProfileUnderstanding ne dit rien d’une réponse non renseignée (silence, jamais une valeur inventée)', () => {
    expect(summariseProfileUnderstanding({}).find(l => l.id === 'contact_windows')).toBeUndefined()
    expect(summariseProfileUnderstanding({}).find(l => l.id === 'detail_level')).toBeUndefined()
  })

  it('summariseProfileUnderstanding restitue les valeurs VERBATIM une fois répondues', () => {
    const understanding = summariseProfileUnderstanding({
      contact_windows: ['Jamais après 19h', 'Y compris le week-end'],
      detail_level: 'Court et dense',
    })
    expect(understanding).toContainEqual({
      id: 'contact_windows',
      values: ['Jamais après 19h', 'Y compris le week-end'],
    })
    expect(understanding).toContainEqual({ id: 'detail_level', values: ['Court et dense'] })
  })

  it('sait dire NON : une réponse à liste vide ne produit toujours aucune ligne (`[]` n’est pas « répondu »)', () => {
    expect(summariseProfileUnderstanding({ contact_windows: [] }).find(l => l.id === 'contact_windows')).toBeUndefined()
  })
})

describe('#3923 — métiers placés posés au complément Temps 2 (décision Louis 09/10)', () => {
  it('pose `placed_roles` en saisie libre, à tout le monde', () => {
    const question = visibleProfileQuestions(answers()).find(q => q.key === 'placed_roles')
    expect(question?.block).toBe('role')
    expect(question?.kind).toBe('tags')
    // Aucun catalogue fermé : ce sont les métiers de L'ESPACE, tapés par lui.
    expect(question?.choices).toBeUndefined()
  })

  it('la complétude compte la réponse — et sait dire NON quand elle est vide', () => {
    const empty = profileQuestionnaireProgress(answers())
    const filled = profileQuestionnaireProgress(answers({ placed_roles: ['Développeur', 'Data'] }))
    expect(filled.total).toBe(empty.total)
    expect(filled.answered).toBe(empty.answered + 1)
    expect(profileQuestionnaireProgress(answers({ placed_roles: [] })).answered).toBe(empty.answered)
  })
})
