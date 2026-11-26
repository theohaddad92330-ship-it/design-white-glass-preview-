import { describe, expect, it } from 'vitest'
import {
  esnAnswersToProfileData,
  startAnalysisSchema,
  contactScopeFromSelection,
  strategyScopeFromSelection,
} from './analysis.js'
import { analysisStatusSchema } from './account.js'
import { esnAnswersSchema, type EsnAnswers } from './onboarding.js'

// ── #3901 : les métiers placés voyagent jusqu'à l'analyse ─────────────────────
//
// Décision Louis (10-11/10/2026) : la pertinence d'une offre d'emploi par compte
// dépend du domaine d'offre ET des métiers placés. `placed_roles` voyageait
// jusqu'à Découvrir (#3923.a), pas jusqu'au profil que lit l'analyse.

describe('esnAnswersToProfileData — les métiers placés (#3901)', () => {
  const base = esnAnswersSchema.parse({
    esn_name: 'LouisESN',
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
  })

  it('porte les métiers déclarés, tels quels', () => {
    const out = esnAnswersToProfileData({ ...base, placed_roles: ['Analyste SOC', 'Pentester'] })
    expect(out.placedRoles).toEqual(['Analyste SOC', 'Pentester'])
  })

  it.each([[[] as string[]], [undefined]])('reste SILENCIEUX sur %s — jamais une liste inventée', value => {
    const out = esnAnswersToProfileData({ ...base, placed_roles: value })
    expect('placedRoles' in out).toBe(false)
  })
})

/** A fully-unanswered questionnaire (what `getAnswers` returns with no row). */
const EMPTY_ANSWERS: EsnAnswers = {
  esn_name: null,
  consultant_size: null,
  sales_team_size: null,
  expertise_areas: [],
  positioning: null,
  target_sectors: [],
  target_company_types: [],
  staffing_model: null,
  geo_zones: [],
  main_sales_pain: null,
  offer_domain: null,
  offer_domains: [],
}

describe('startAnalysisSchema', () => {
  it('accepts minimal valid input', () => {
    const result = startAnalysisSchema.parse({ company_name: 'Acme' })
    expect(result.company_name).toBe('Acme')
  })

  it('rejects empty company_name', () => {
    expect(() => startAnalysisSchema.parse({ company_name: '' })).toThrow()
  })

  it('accepts optional user_context as a typed analysis context', () => {
    const result = startAnalysisSchema.parse({
      company_name: 'Acme',
      user_context: { preset: 'free', notes: 'SaaS' },
    })
    expect(result.user_context).toEqual({ preset: 'free', notes: 'SaaS' })
  })

  it('rejects a free-text string user_context (now a typed discriminated union)', () => {
    expect(() => startAnalysisSchema.parse({ company_name: 'Acme', user_context: 'SaaS' })).toThrow()
  })

  it('accepts optional profile_data as an arbitrary record', () => {
    const result = startAnalysisSchema.parse({
      company_name: 'Acme',
      profile_data: { size: 'mid', anything: 42 },
    })
    expect(result.profile_data).toEqual({ size: 'mid', anything: 42 })
  })

  it('accepts a valid scope_mode and rejects an unknown one (Théo p.10/21)', () => {
    expect(startAnalysisSchema.parse({ company_name: 'SG', scope_mode: 'france' }).scope_mode).toBe('france')
    expect(startAnalysisSchema.parse({ company_name: 'SG', scope_mode: 'it_digital' }).scope_mode).toBe('it_digital')
    expect(() => startAnalysisSchema.parse({ company_name: 'SG', scope_mode: 'moon' })).toThrow()
  })

  it('accepts optional suggestion origin (id + reason) — Théo P0 §5', () => {
    const result = startAnalysisSchema.parse({
      company_name: 'Société Générale',
      suggestion_id: 'societe-generale--banque',
      suggestion_reason: 'Grand compte bancaire aligné sur votre expertise data',
    })
    expect(result.suggestion_id).toBe('societe-generale--banque')
    expect(result.suggestion_reason).toBe('Grand compte bancaire aligné sur votre expertise data')
  })

  it('leaves suggestion origin undefined when omitted (free search)', () => {
    const result = startAnalysisSchema.parse({ company_name: 'Acme' })
    expect(result.suggestion_id).toBeUndefined()
    expect(result.suggestion_reason).toBeUndefined()
  })

  it('rejects an empty suggestion_id (must be a real origin token, not "")', () => {
    expect(() => startAnalysisSchema.parse({ company_name: 'Acme', suggestion_id: '' })).toThrow()
  })
})

describe('analysisScopeModeSchema', () => {
  it('has a label for every scope mode', async () => {
    const { analysisScopeModeSchema, ANALYSIS_SCOPE_MODE_LABELS } = await import('./analysis.js')
    for (const mode of analysisScopeModeSchema.options) {
      expect(ANALYSIS_SCOPE_MODE_LABELS[mode]).toBeTruthy()
    }
  })

  it('#2163.4-7 — accepte les quatre valeurs de périmètre organisationnel du constructeur de scope', async () => {
    const { analysisScopeModeSchema } = await import('./analysis.js')
    expect(analysisScopeModeSchema.options).toEqual(
      expect.arrayContaining(['business_unit', 'direction', 'programme', 'site']),
    )
  })

  it('#2163.4-7 — chaque nouvelle valeur a un coût de crédit, jamais implicite', async () => {
    const { ANALYSIS_SCOPE_CREDIT_COST } = await import('./analysis.js')
    for (const mode of ['business_unit', 'direction', 'programme', 'site'] as const) {
      expect(ANALYSIS_SCOPE_CREDIT_COST[mode]).toBeGreaterThan(0)
    }
  })
})

describe('analysisHierarchyLevelSchema — #2163.25-30', () => {
  it('porte les 5 niveaux de contact du constructeur de scope, chacun avec un label', async () => {
    const { analysisHierarchyLevelSchema, ANALYSIS_HIERARCHY_LEVEL_LABELS } = await import('./analysis.js')
    expect(analysisHierarchyLevelSchema.options).toEqual(['c_level', 'n1', 'n2', 'operational', 'purchasing'])
    for (const level of analysisHierarchyLevelSchema.options) {
      expect(ANALYSIS_HIERARCHY_LEVEL_LABELS[level]).toBeTruthy()
    }
  })

  it('un cadrage de 5 niveaux ordonnés reste valide — l’ordre porte la priorisation (#2163.30)', async () => {
    const { analysisScopeSelectionSchema } = await import('./analysis.js')
    const parsed = analysisScopeSelectionSchema.parse({
      hierarchy_levels: ['operational', 'n2', 'n1', 'purchasing', 'c_level'],
    })
    expect(parsed.hierarchy_levels).toEqual(['operational', 'n2', 'n1', 'purchasing', 'c_level'])
  })
})

describe('analysisGeoPerimeterSchema — #2163.9, #2163.10, #2163.11', () => {
  it('porte « Monde » et « Pays » en plus des valeurs existantes, chacune avec un label', async () => {
    const { analysisGeoPerimeterSchema, ANALYSIS_GEO_PERIMETER_LABELS } = await import('./analysis.js')
    expect(analysisGeoPerimeterSchema.options).toEqual(
      expect.arrayContaining(['world', 'international', 'europe', 'france', 'region', 'country']),
    )
    for (const perimeter of analysisGeoPerimeterSchema.options) {
      expect(ANALYSIS_GEO_PERIMETER_LABELS[perimeter]).toBeTruthy()
    }
  })

  it('un cadrage « région » avec des zones nommées reste valide', async () => {
    const { analysisScopeSelectionSchema } = await import('./analysis.js')
    const parsed = analysisScopeSelectionSchema.parse({
      geo_perimeter: 'region',
      geo_areas: ['Île-de-France', 'Auvergne-Rhône-Alpes'],
    })
    expect(parsed.geo_perimeter).toBe('region')
    expect(parsed.geo_areas).toEqual(['Île-de-France', 'Auvergne-Rhône-Alpes'])
  })

  it('un cadrage « pays » (#2163.10) porte un seul code dans geo_areas', async () => {
    const { analysisScopeSelectionSchema } = await import('./analysis.js')
    const parsed = analysisScopeSelectionSchema.parse({
      geo_perimeter: 'country',
      geo_areas: ['CH'],
    })
    expect(parsed.geo_perimeter).toBe('country')
    expect(parsed.geo_areas).toEqual(['CH'])
  })
})

describe('refreshDimensionSchema', () => {
  it('accepts the four canonical dimensions', async () => {
    const { refreshDimensionSchema } = await import('./analysis.js')
    for (const dim of ['signals', 'contacts', 'entities', 'strategy'] as const) {
      expect(refreshDimensionSchema.parse(dim)).toBe(dim)
    }
  })

  it('rejects an unknown dimension', async () => {
    const { refreshDimensionSchema } = await import('./analysis.js')
    expect(() => refreshDimensionSchema.parse('logo')).toThrow()
  })

  it('has a label and a (positive) credit cost for every dimension', async () => {
    const { refreshDimensionSchema, REFRESH_DIMENSION_LABELS, REFRESH_DIMENSION_CREDIT_COST } =
      await import('./analysis.js')
    for (const dim of refreshDimensionSchema.options) {
      expect(REFRESH_DIMENSION_LABELS[dim]).toBeTruthy()
      expect(REFRESH_DIMENSION_CREDIT_COST[dim]).toBeGreaterThan(0)
    }
  })

  // #2318.2 — LAU-FINAL-059 nomme neuf types de refresh (identité et groupe,
  // filiales et sites, signaux, contacts, postes, écosystème, voie d'achat,
  // projets, analyse complète). Le dépôt n'en tenait que quatre (signals,
  // contacts, entities, strategy — les PHASES techniques, pas le vocabulaire
  // produit). GA-08 interdit de retirer une valeur d'enum : les 4 existantes
  // restent, les 6 nouvelles s'AJOUTENT à la fin. « analyse complète » reste
  // hors de cet enum — c'est un mécanisme distinct (`relaunch: true`, pipeline
  // entier, crédit d'ANALYSE) que fusionner ici ferait passer pour un simple
  // refresh de dimension à `targeted_refresh` alors qu'il coûte et queue
  // différemment.
  it('#2318.2 — accepte les six nouveaux types nommés par LAU-FINAL-059', async () => {
    const { refreshDimensionSchema } = await import('./analysis.js')
    for (const dim of [
      'identity_group',
      'subsidiaries',
      'positions',
      'ecosystem',
      'buying_path',
      'projects',
    ] as const) {
      expect(refreshDimensionSchema.parse(dim)).toBe(dim)
    }
  })
})

describe('refreshAnalysisSchema', () => {
  it('requires a valid dimension in the request body', async () => {
    const { refreshAnalysisSchema } = await import('./analysis.js')
    expect(refreshAnalysisSchema.parse({ dimension: 'strategy' }).dimension).toBe('strategy')
    expect(() => refreshAnalysisSchema.parse({})).toThrow()
    expect(() => refreshAnalysisSchema.parse({ dimension: 'moon' })).toThrow()
  })
})

describe('analysisStatusSchema', () => {
  it('accepts canceled status', () => {
    expect(analysisStatusSchema.parse('canceled')).toBe('canceled')
  })
})

describe('esnAnswersToProfileData', () => {
  it('maps every field-name-mismatched key to the profile_data shape', () => {
    const answers: EsnAnswers = {
      esn_name: 'Comet',
      consultant_size: '20-100',
      sales_team_size: '5',
      expertise_areas: ['Data', 'Cloud'],
      positioning: 'niche data',
      target_sectors: ['Banque', 'Assurance'],
      target_company_types: ['Grands comptes'],
      staffing_model: 'régie',
      geo_zones: ['France', 'Benelux'],
      main_sales_pain: 'accès aux décideurs IT',
      offer_domain: 'finance',
    }

    expect(esnAnswersToProfileData(answers)).toEqual({
      companyName: 'Comet',
      size: '20-100',
      salesTeamSize: '5',
      offers: ['Data', 'Cloud'],
      sectors: ['Banque', 'Assurance'],
      geoZone: 'France, Benelux',
      mainChallenge: 'accès aux décideurs IT',
      positioning: 'niche data',
      targetCompanyTypes: ['Grands comptes'],
      staffingModel: 'régie',
      offerDomain: 'finance',
    })
  })

  it('returns {} for an unanswered questionnaire (profile-neutral run)', () => {
    expect(esnAnswersToProfileData(EMPTY_ANSWERS)).toEqual({})
  })

  // #2056 / #2057 — appels d'offres et contenu : même règle de silence, et un
  // consommateur RÉEL (`esnAnswersToProfileData`, donc `bellum_rfp.py` qui
  // sérialise tout `profile_data`) pour chaque champ collecté.
  it('#2056 — fait entrer le bloc appels d’offres dans le profil', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        rfp_platforms_used: ['Plateforme interne du client'],
        rfp_referencing_status: 'Un référencement actif',
        rfp_volume: '6-15',
        rfp_volume_period: 'Le trimestre écoulé',
        rfp_document_readiness: 'Tout est à jour et prêt à l’usage',
      }),
    ).toEqual({
      rfpPlatformsUsed: ['Plateforme interne du client'],
      rfpReferencingStatus: 'Un référencement actif',
      rfpVolume: '6-15',
      rfpVolumePeriod: 'Le trimestre écoulé',
      rfpDocumentReadiness: 'Tout est à jour et prêt à l’usage',
    })
  })

  it('#2057.14 — porte le conseil qui refuse jusqu’au profil que lit le moteur', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        weekly_calls: '0',
        weekly_emails: '0',
        content_funnel_stages_reached: [
          'Publier',
          'Exploiter les réactions',
          'Ouvrir une conversation',
          'Obtenir un besoin',
        ],
      }).contentRecommendation,
    ).toBe('no_content_before_base_prospecting')
  })

  it('#2057.14 — reste silencieux tant que le bloc contenu n’a produit aucun signal', () => {
    expect(esnAnswersToProfileData(EMPTY_ANSWERS).contentRecommendation).toBeUndefined()
  })

  // #2015.7 / #2056.11 / #2057.10 — filiation, économie du dossier, owner.
  // Même règle de silence que le reste : un champ non répondu ne produit
  // AUCUNE clé.
  it('#2015.7 — fait entrer la filiation déclarée dans le profil', () => {
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, company_group_structure: "Filiale d'un groupe" })).toEqual({
      companyGroupStructure: "Filiale d'un groupe",
    })
  })

  it('#2056.11 / #2057.10 — fait entrer l’économie du dossier et l’owner dans le profil', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        rfp_deal_value: '150-500 k€',
        rfp_owner_assignment: 'Un porteur nommé sur chaque dossier',
      }),
    ).toEqual({
      rfpDealValue: '150-500 k€',
      rfpOwnerAssignment: 'Un porteur nommé sur chaque dossier',
    })
  })

  it('#2015.7 / #2056.11 / #2057.10 — restent silencieux sans réponse (témoin)', () => {
    const out = esnAnswersToProfileData(EMPTY_ANSWERS)
    expect(out.companyGroupStructure).toBeUndefined()
    expect(out.rfpDealValue).toBeUndefined()
    expect(out.rfpOwnerAssignment).toBeUndefined()
  })

  // #1920.12 — l'ancienneté dans le poste (`role_tenure`) est collectée par le
  // questionnaire (`profile-questionnaire.ts:102`) et écrite en base depuis la
  // migration ProfileQuestionnaire, mais ni cette fonction ni son miroir Python
  // (`seller_context.esn_row_to_profile_data`) ne la faisaient entrer dans
  // `AnalysisProfileData` : `bellum_advisor.py` lisait `p.get("roleTenure")`
  // sans qu'aucun écrivain n'ait jamais posé la clé. Ce test dit NON si le
  // mapping disparaît à nouveau.
  it('maps the declared role tenure (#1920.12)', () => {
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, role_tenure: '2-5 ans' })).toEqual({
      roleTenure: '2-5 ans',
    })
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, role_tenure: null })).toEqual({})
  })

  // #2052 — les objectifs commerciaux NOMMÉS. `build_analysis_user_prompt`
  // (`apps/ia/app/prompts/bellum_rfp.py`) sérialise TOUT `profile_data` : ce
  // test dit NON si le mapping disparaît et que la clé n'atteint plus jamais
  // le prompt, silencieusement.
  it('maps the declared named objectives (#2052), and produces no key when none is declared', () => {
    const objective = {
      kind: 'meetings' as const,
      value: 15,
      unit: 'rendez-vous',
      period: 'monthly' as const,
      horizon: null,
      commitmentLevel: 'objective' as const,
      source: 'human' as const,
      observedAt: '2026-09-16T00:00:00.000Z',
      note: null,
    }
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, esn_objectives: [objective] })).toEqual({
      objectives: [objective],
    })
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, esn_objectives: [] })).toEqual({})
  })

  // #2118.15 — la capacité DISPONIBLE (consultants en mission, vivier actif)
  // atteint la lecture du compte ; l'effectif total (`size`) n'en dit rien.
  it('maps the delivery capacity answers, keeping a declared zero as a real answer', () => {
    expect(
      esnAnswersToProfileData({ ...EMPTY_ANSWERS, consultants_on_mission: '31-80', consultants_in_pipe: '0' }),
    ).toEqual({ consultantsOnMission: '31-80', consultantsInPipe: '0' })
    expect(
      esnAnswersToProfileData({ ...EMPTY_ANSWERS, consultants_on_mission: '  ', consultants_in_pipe: null }),
    ).toEqual({})
  })

  // #2035.5 — la colonne `esn_profiles.available_consultants_band` et son
  // lecteur IA (`sales_context.py::_bench_band`) existaient déjà sans question
  // ni mapping pour les nourrir (lot L15). Ce test dit NON si le mapping
  // disparaît : sans lui, `availableConsultantsBand` reste absent et
  // `_bench_band` retombe silencieusement sur `inconnu`.
  it('maps the declared bench band (#2035.5)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        available_consultants_band: 'Quelques consultants disponibles en intercontrat',
      }),
    ).toEqual({ availableConsultantsBand: 'Quelques consultants disponibles en intercontrat' })
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, available_consultants_band: null })).toEqual({})
  })

  // #2053.3 — le coût d'intercontrat, DISTINCT de `available_consultants_band`
  // (un effectif, jamais un coût — le piège nommé dans le registre #2053.3).
  it('maps the declared intercontrat cost, distinct from the bench headcount (#2053.3)', () => {
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, intercontrat_cost: '5-10 k€' })).toEqual({
      intercontratCost: '5-10 k€',
    })
    // Même donnée, deux clés distinctes : ne jamais laisser l'une nourrir l'autre.
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        intercontrat_cost: '5-10 k€',
        available_consultants_band: 'Quelques consultants disponibles en intercontrat',
      }),
    ).toEqual({
      intercontratCost: '5-10 k€',
      availableConsultantsBand: 'Quelques consultants disponibles en intercontrat',
    })
  })

  // #2053.4 — la visibilité déclarée sur le délai d'encaissement, puis le
  // délai lui-même.
  it('maps the declared payment delay visibility and band (#2053.4)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        payment_delay_visibility: 'Oui, ici (Missions › Encaissements)',
        payment_delay_band: '45-60 jours',
      }),
    ).toEqual({
      paymentDelayVisibility: 'Oui, ici (Missions › Encaissements)',
      paymentDelayBand: '45-60 jours',
    })
  })

  // #2053.8 — AUCUNE extrapolation comptable quand la donnée manque : une
  // absence reste une absence, jamais un `0` ni une moyenne inventée. Ce test
  // dit NON si `text()` est remplacé par un repli (`?? '0'`, `?? 'inconnu'`) —
  // le remplacement ferait apparaître une clé sur une réponse jamais donnée.
  it('#2053.8 — never extrapolates an intercontrat cost or a payment delay that is missing', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        intercontrat_cost: null,
        payment_delay_visibility: null,
        payment_delay_band: null,
      }),
    ).toEqual({})
    // Un champ blanc n'est pas une réponse — même silence qu'une absence.
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, intercontrat_cost: '   ', payment_delay_band: '  ' })).toEqual(
      {},
    )
  })

  // #2034 / #2035 — les SIX autres réponses de maturité / santé d'activité /
  // effectif réel. Elles étaient posées à l'utilisateur, écrites en base
  // (migration `1794010000000-MaturiteEffectifReel`) et relues par
  // `mapRowToAnswers` — et s'arrêtaient là : `esnAnswersToProfileData` ne les
  // traduisait pas, donc AUCUN dossier ne les voyait. Ce test dit NON si le
  // mapping disparaît : sans lui, un questionnaire entièrement rempli rend un
  // profil amputé de six faits que le vendeur a pris le temps de déclarer.
  it('maps the maturity / activity-health / real-headcount answers (#2034, #2035)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        esn_maturity_situation: 'Croissance',
        company_growth_goal: 'Ouvrir un nouveau territoire',
        active_clients_band: '6 à 15 clients actifs',
        revenue_recurrence: 'Un mix de récurrent et de one-shot',
        client_concentration_risk: 'Un client pèse fort mais reste minoritaire',
        consultants_managed_by_user_band: '6 à 15 consultants',
      }),
    ).toEqual({
      esnMaturitySituation: 'Croissance',
      companyGrowthGoal: 'Ouvrir un nouveau territoire',
      activeClientsBand: '6 à 15 clients actifs',
      revenueRecurrence: 'Un mix de récurrent et de one-shot',
      clientConcentrationRisk: 'Un client pèse fort mais reste minoritaire',
      consultantsManagedByUserBand: '6 à 15 consultants',
    })
  })

  // Même règle de silence que tout le reste du mapping : une question passée
  // ne produit AUCUNE clé, donc le payload d'un espace qui n'a pas répondu
  // reste byte-identique à ce qu'il était avant ce branchement.
  it('emits nothing for unanswered maturity questions (#2034, #2035)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        esn_maturity_situation: null,
        company_growth_goal: '   ',
        active_clients_band: '',
        revenue_recurrence: null,
        client_concentration_risk: null,
        consultants_managed_by_user_band: null,
      }),
    ).toEqual({})
  })

  it('drops empty strings and empty arrays rather than emitting blank keys', () => {
    const answers: EsnAnswers = {
      ...EMPTY_ANSWERS,
      esn_name: '   ',
      expertise_areas: [],
      target_sectors: ['SaaS'],
    }

    // Whitespace-only name is dropped; only the non-empty sector survives.
    expect(esnAnswersToProfileData(answers)).toEqual({ sectors: ['SaaS'] })
  })

  it('maps positioning / target_company_types / staffing_model (consumed by the strategy/plan prompts)', () => {
    const answers: EsnAnswers = {
      ...EMPTY_ANSWERS,
      positioning: 'niche data',
      target_company_types: ['ETI'],
      staffing_model: 'régie',
    }

    expect(esnAnswersToProfileData(answers)).toEqual({
      positioning: 'niche data',
      targetCompanyTypes: ['ETI'],
      staffingModel: 'régie',
    })
  })

  it('maps the Temps-2 complement onto the keys the prompts already read', () => {
    // These five keys existed in every prompt template and rendered « N/A »
    // because nothing collected them. The complement is what fills them.
    const answers: EsnAnswers = {
      ...EMPTY_ANSWERS,
      decision_maker_personas: ['DSI', 'RSSI'],
      avg_sales_cycle: '3 à 6 mois',
      avg_tjm: '550-700',
      client_references: ['Société Générale', 'Airbus'],
      no_go_sectors: ['Aéronautique & Défense'],
    }

    expect(esnAnswersToProfileData(answers)).toEqual({
      personas: ['DSI', 'RSSI'],
      salesCycle: '3 à 6 mois',
      avgTJM: '550-700',
      references: ['Société Générale', 'Airbus'],
      noGoSectors: ['Aéronautique & Défense'],
    })
  })

  it('emits nothing for a complement left untouched (no phantom keys)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        decision_maker_personas: [],
        avg_sales_cycle: null,
        avg_tjm: '  ',
        client_references: [],
        no_go_sectors: [],
      }),
    ).toEqual({})
  })

  it('maps offer_domain → offerDomain and drops null (PDF6 §1 — domaine d’offre)', () => {
    // Faithful mapping: an explicit `esn_it` flows through (the IA lens treats
    // it as the byte-identical default); null stays profile-neutral.
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, offer_domain: 'esn_it' })).toEqual({ offerDomain: 'esn_it' })
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, offer_domain: 'finance' })).toEqual({ offerDomain: 'finance' })
    expect(esnAnswersToProfileData(EMPTY_ANSWERS)).toEqual({})
  })

  it('le portefeuille de domaines PRIME sur le champ singulier et porte les libellés FR (DATAFORGE V10)', () => {
    expect(
      esnAnswersToProfileData({
        ...EMPTY_ANSWERS,
        offer_domain: 'esn_it',
        offer_domains: ['FINANCE_FPNA', 'RISK_COMPLIANCE_AML', 'SW_ENGINEERING'],
      }),
    ).toEqual({
      offerDomain: 'finance',
      offerPortfolio: ['FINANCE_FPNA', 'RISK_COMPLIANCE_AML', 'SW_ENGINEERING'],
      offerPortfolioNames: [
        'Finance, comptabilité, FP&A, contrôle de gestion & consolidation',
        'Risques, conformité, AML/KYC, réglementaire & modèles',
        'Développement logiciel & applications',
      ],
    })
  })

  it('un portefeuille vide = comportement historique byte-identique', () => {
    expect(esnAnswersToProfileData({ ...EMPTY_ANSWERS, offer_domain: 'rh', offer_domains: [] })).toEqual({
      offerDomain: 'rh',
    })
  })
})

describe('cadrage d’un refresh — le pont qui manquait', () => {
  it('une entité retenue devient l’ancre des contacts', () => {
    expect(contactScopeFromSelection({ included_entities: ['Boursorama'] })).toEqual({ entity: 'Boursorama' })
  })

  it('plusieurs entités : aucune ancre, donc pleine dimension', () => {
    // Il n'y a pas d'ancre UNIQUE à donner à la recherche, et en choisir une au
    // hasard cadrerait sur la mauvaise.
    expect(contactScopeFromSelection({ included_entities: ['Boursorama', 'ITIM', 'SGSS'] })).toBeUndefined()
  })

  it('un angle retenu construit le plan autour de lui', () => {
    expect(strategyScopeFromSelection({ selected_angles: ['cybersécurité'] })).toEqual({ angle: 'cybersécurité' })
  })

  it('entité ET angle voyagent ensemble', () => {
    const scope = strategyScopeFromSelection({ included_entities: ['ITIM'], selected_angles: ['data'] })
    expect(scope).toEqual({ angle: 'data', focusEntity: 'ITIM' })
  })

  it('un cadrage vide ou absent ne cadre rien', () => {
    expect(contactScopeFromSelection(undefined)).toBeUndefined()
    expect(contactScopeFromSelection(null)).toBeUndefined()
    expect(contactScopeFromSelection({})).toBeUndefined()
    expect(strategyScopeFromSelection({ excluded_angles: ['rh'] })).toBeUndefined()
  })
})

// ── #1124 : le placement en CDI chez le client ────────────────────────────────
//
// « Je propose aussi à mes clients du recrutement de profil IT en fixe chez
// eux. » Le mapper n'émet la clé que sur un OUI explicite : le service IA ne
// peut donc pas distinguer un « non » d'une absence de réponse, et c'est la
// bonne lecture — les deux veulent dire « ne change rien ».

describe('esnAnswersToProfileData — le placement (#1124)', () => {
  const base = esnAnswersSchema.parse({
    esn_name: 'LouisESN',
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
  })

  it('émet la clé sur un OUI explicite', () => {
    expect(esnAnswersToProfileData({ ...base, recruits_for_clients: 'yes' }).recruitsForClients).toBe(true)
  })

  it.each([['no' as const], [null], [undefined]])('reste SILENCIEUX sur %s', value => {
    // Aucune clé ⇒ payload historique à l'octet près pour tous les espaces
    // existants, et les goldens de prompts ne bougent pas.
    const out = esnAnswersToProfileData({ ...base, recruits_for_clients: value })
    expect('recruitsForClients' in out).toBe(false)
  })
})

/**
 * Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
 * secteurs référencés, crédibilité et modes de réponse au besoin.
 */
describe('esnAnswersToProfileData — lot 26 (#2038, #2039, #2040, #2041)', () => {
  const base = esnAnswersSchema.parse({
    esn_name: 'LouisESN',
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
  })

  it('mappe les neuf champs quand ils sont répondus', () => {
    const out = esnAnswersToProfileData({
      ...base,
      service_types: ['Régie', 'Forfait'],
      service_types_proven: ['Régie'],
      service_types_desired: ['Audit'],
      reference_sectors: ['Banque de détail & Banque privée'],
      case_study_results: ['-30% de délai de recrutement'],
      client_testimonials: ['« Équipe réactive » — DSI, client X'],
      expertise_no_concrete_proof: ['IoT & Systèmes embarqués'],
      expertise_client_reference: ['Data & Intelligence Artificielle'],
      expertise_personal_experience: ['Cybersécurité & Conformité'],
      expertise_partner: ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'],
      expertise_talent_pool: ['Data & Intelligence Artificielle'],
      staffing_modes: ['Sous-traitance'],
      profile_validation_methods: ['Entretien technique interne'],
      contractual_constraints: ["Durée d'engagement minimale"],
      reference_accounts: ['Société Générale', 'SNCF'],
    })
    // #3476 — les comptes de référence NOMMÉS atteignent le chat (résolveur de territoire).
    expect(out.referenceAccounts).toEqual(['Société Générale', 'SNCF'])
    expect(out.serviceTypes).toEqual(['Régie', 'Forfait'])
    expect(out.serviceTypesProven).toEqual(['Régie'])
    expect(out.serviceTypesDesired).toEqual(['Audit'])
    expect(out.referenceSectors).toEqual(['Banque de détail & Banque privée'])
    expect(out.caseStudyResults).toEqual(['-30% de délai de recrutement'])
    expect(out.clientTestimonials).toEqual(['« Équipe réactive » — DSI, client X'])
    expect(out.expertiseWithoutConcreteProof).toEqual(['IoT & Systèmes embarqués'])
    expect(out.expertiseWithClientReference).toEqual(['Data & Intelligence Artificielle'])
    expect(out.expertiseWithPersonalExperience).toEqual(['Cybersécurité & Conformité'])
    expect(out.expertiseWithPartner).toEqual(['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)'])
    expect(out.expertiseWithTalentPool).toEqual(['Data & Intelligence Artificielle'])
    expect(out.staffingModes).toEqual(['Sous-traitance'])
    expect(out.profileValidationMethods).toEqual(['Entretien technique interne'])
    expect(out.contractualConstraints).toEqual(["Durée d'engagement minimale"])
  })

  it('reste SILENCIEUX quand rien n’est répondu — payload historique à l’octet près', () => {
    const out = esnAnswersToProfileData(base)
    for (const key of [
      'serviceTypes',
      'serviceTypesProven',
      'serviceTypesDesired',
      'referenceSectors',
      'referenceAccounts',
      'caseStudyResults',
      'clientTestimonials',
      'expertiseWithoutConcreteProof',
      'expertiseWithClientReference',
      'expertiseWithPersonalExperience',
      'expertiseWithPartner',
      'expertiseWithTalentPool',
      'staffingModes',
      'profileValidationMethods',
      'contractualConstraints',
    ] as const) {
      expect(key in out).toBe(false)
    }
  })

  // #2038.15 — DOCTRINE : une ambition n'est jamais une référence ni une preuve.
  it('SAIT DIRE NON — l’ambition ne fuit jamais dans le prouvé, même sur la même valeur', () => {
    const out = esnAnswersToProfileData({
      ...base,
      service_types: ['Audit'],
      service_types_proven: [],
      service_types_desired: ['Audit'],
    })
    expect(out.serviceTypesDesired).toEqual(['Audit'])
    // La preuve reste ABSENTE : rien ne la déduit de l'ambition, même quand
    // les deux portent le même libellé.
    expect('serviceTypesProven' in out).toBe(false)
  })
})

describe('esnAnswersToProfileData — #2304.23 / #2304.26 (épopée #2932, LAU-FINAL-045)', () => {
  const base = esnAnswersSchema.parse({
    esn_name: 'LouisESN',
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    offer_domain: null,
    offer_domains: [],
  })

  // #2304.26 — la bande existait déjà en base et au contrat d'onboarding
  // (#2050) mais n'atteignait jamais le profil que lisent les prompts de
  // plan/stratégie : branchement absent, pas une colonne à créer.
  it('mappe le temps hebdomadaire protégé (#2304.26)', () => {
    expect(
      esnAnswersToProfileData({ ...base, weekly_sales_time_protected: '2 à 5 heures par semaine' })
        .weeklySalesTimeProtected,
    ).toBe('2 à 5 heures par semaine')
  })

  // #2304.23 — le réseau personnel déclaré (#2045) : même branchement absent.
  it('mappe les quatre bandes du réseau personnel déclaré (#2304.23)', () => {
    const out = esnAnswersToProfileData({
      ...base,
      former_clients_count_band: '6-15',
      former_colleagues_count_band: '16-30',
      partners_count_band: '1-5',
      referrers_count_band: '0',
    })
    expect(out.formerClientsCountBand).toBe('6-15')
    expect(out.formerColleaguesCountBand).toBe('16-30')
    expect(out.partnersCountBand).toBe('1-5')
    expect(out.referrersCountBand).toBe('0')
  })

  it('reste SILENCIEUX quand rien n’est répondu — payload historique à l’octet près', () => {
    const out = esnAnswersToProfileData(base)
    for (const key of [
      'weeklySalesTimeProtected',
      'formerClientsCountBand',
      'formerColleaguesCountBand',
      'partnersCountBand',
      'referrersCountBand',
    ] as const) {
      expect(key in out).toBe(false)
    }
  })
})

/**
 * GA-51 — le prix ANNONCÉ d'un refresh de dimension et le prix DÉBITÉ sortent de
 * la MÊME dérivation.
 *
 * `REFRESH_DIMENSION_CREDIT_COST` était une table de prix RECOPIÉE à la main
 * (`{ signals: 1, contacts: 1, entities: 1, strategy: 1 }`) pendant que le débit
 * côté API retombait sur le poids de l'ENRICHISSEMENT DE CONTACT — deux
 * grandeurs qui valent 1 aujourd'hui et qui n'ont aucune raison de rester
 * égales. Deux sources pour un prix, c'est la définition d'une dérivation
 * dupliquée (GA-26) : le jour où l'une bouge, l'écran annonce un chiffre et la
 * caisse en prélève un autre.
 *
 * La garde LIT : elle échoue si le corpus des dimensions est vide, et elle
 * compare à `creditCostOf('targeted_refresh')` — pas à un littéral, qui la
 * rendrait complice de la table qu'elle est censée surveiller.
 */
describe('GA-51 — le coût d’un refresh de dimension vient de la grille, jamais d’une copie', () => {
  it('a un corpus de dimensions non vide', async () => {
    const { refreshDimensionSchema } = await import('./analysis.js')
    expect(refreshDimensionSchema.options.length).toBeGreaterThanOrEqual(4)
  })

  it('chaque dimension est facturée au poids de `targeted_refresh`', async () => {
    const { refreshDimensionSchema, REFRESH_DIMENSION_CREDIT_COST } = await import('./analysis.js')
    const { creditCostOf } = await import('../billing/credit-weights.js')
    for (const dim of refreshDimensionSchema.options) {
      expect(REFRESH_DIMENSION_CREDIT_COST[dim]).toBe(creditCostOf('targeted_refresh'))
    }
  })

  it('n’est JAMAIS facturé au poids de l’enrichissement de contact par accident', async () => {
    // Les deux valent 1 aujourd'hui. On ne peut donc pas prouver la distinction
    // par la valeur : on la prouve par la PROVENANCE, en vérifiant que la table
    // reste dans la fourchette DÉCLARÉE de `targeted_refresh` — une fourchette
    // que `contact_enrichment` n'a pas.
    const { refreshDimensionSchema, REFRESH_DIMENSION_CREDIT_COST } = await import('./analysis.js')
    const { creditCostRange } = await import('../billing/credit-weights.js')
    const range = creditCostRange('targeted_refresh')
    expect(range.max).toBeGreaterThan(range.min)
    for (const dim of refreshDimensionSchema.options) {
      expect(REFRESH_DIMENSION_CREDIT_COST[dim]).toBeGreaterThanOrEqual(range.min)
      expect(REFRESH_DIMENSION_CREDIT_COST[dim]).toBeLessThanOrEqual(range.max)
    }
  })
})

/**
 * La preuve que la garde ci-dessus ne peut PAS apporter seule.
 *
 * `creditCostOf('targeted_refresh')` et `CREDIT_WEIGHTS.contact_enrichment`
 * valent tous les deux 1 aujourd'hui. Une garde qui ne compare que des VALEURS
 * reste donc VERTE sur une table recopiée à la main — exactement le défaut qu'on
 * corrige. Elle serait borgne. On lit donc la SOURCE : la table doit être
 * CONSTRUITE par un appel à `creditCostOf`, et ne porter aucun prix littéral.
 */
describe('GA-51 (source) — la table de prix appelle la grille, elle ne la recopie pas', () => {
  const SOURCE_PATH = new URL('./analysis.ts', import.meta.url)

  /**
   * Le bloc `REFRESH_DIMENSION_CREDIT_COST = { … }`, commentaires RETIRÉS.
   *
   * Une garde qui cherche un motif dans un fichier trouve d'abord les
   * commentaires, et celui-ci en est plein — dont un qui contient littéralement
   * « signals: 1 ». Sans ce nettoyage, la garde surveillerait de la prose.
   */
  async function refreshCostBlock(): Promise<string> {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(SOURCE_PATH, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    const start = source.indexOf('REFRESH_DIMENSION_CREDIT_COST')
    expect(start, `REFRESH_DIMENSION_CREDIT_COST introuvable dans ${SOURCE_PATH.pathname}`).toBeGreaterThan(-1)
    const open = source.indexOf('{', start)
    const close = source.indexOf('}', open)
    expect(close, `bloc non refermé dans ${SOURCE_PATH.pathname}`).toBeGreaterThan(open)
    return source.slice(open, close + 1)
  }

  it('LIT quelque chose — le bloc extrait cite les quatre dimensions', async () => {
    const block = await refreshCostBlock()
    expect(block.length).toBeGreaterThan(40)
    for (const dim of ['signals', 'contacts', 'entities', 'strategy']) {
      expect(block, `dimension ${dim} absente du bloc lu dans ${SOURCE_PATH.pathname}`).toContain(dim)
    }
  })

  it('ne porte AUCUN prix écrit en dur', async () => {
    const block = await refreshCostBlock()
    const literals = [...block.matchAll(/:\s*(-?\d+(?:\.\d+)?)\s*[,}]/g)].map(m => m[1])
    expect(
      literals,
      '\npackages/contracts/src/schemas/analysis.ts — REFRESH_DIMENSION_CREDIT_COST porte des prix écrits ' +
        `en dur : ${literals.join(', ')}.\n` +
        "Un prix vit à UN seul endroit : appeler creditCostOf('targeted_refresh').\n",
    ).toEqual([])
  })

  it('appelle bien `creditCostOf` pour chacune des quatre dimensions', async () => {
    const block = await refreshCostBlock()
    const calls = block.match(/creditCostOf\(/g) ?? []
    expect(
      calls.length,
      '\npackages/contracts/src/schemas/analysis.ts — REFRESH_DIMENSION_CREDIT_COST doit dériver son prix ' +
        "de creditCostOf('targeted_refresh') pour chacune des 4 dimensions.\n",
    ).toBeGreaterThanOrEqual(4)
  })
})
