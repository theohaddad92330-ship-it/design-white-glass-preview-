import { describe, expect, it } from 'vitest'
import { METHOD_REFUSALS, METHOD_RULES } from '../knowledge/method-delta.js'
import {
  METHOD_CORPUS_V1,
  METHOD_RULE_CATEGORIES,
  METHOD_RULE_DOMAINS,
  methodCorpusVersionSchema,
  methodRuleGovernanceSchema,
  methodRuleSchema,
  resolveRuleActivation,
  selectApplicableMethodRules,
  type MethodRule,
  type MethodRuleGovernance,
} from './method-corpus.js'

function baseRule(overrides: Partial<MethodRule> = {}): MethodRule {
  return {
    rule_id: 'test_rule',
    title: 'Règle de test',
    category: 'invariant',
    domain: 'Compte',
    source_document: 'test',
    source_page: null,
    version: '1.0.0',
    status: 'active',
    trigger: 'test trigger keywords',
    applicable_roles: [],
    applicable_stages: [],
    applicable_sectors: [],
    applicable_channels: [],
    prerequisites: [],
    recommendation: 'Faire le test.',
    exceptions: [],
    counter_example: null,
    stop_condition: null,
    evidence_required: true,
    confidence: 'high',
    user_override_allowed: false,
    telemetry_required: true,
    ...overrides,
  }
}

function baseGovernance(overrides: Partial<MethodRuleGovernance> = {}): MethodRuleGovernance {
  return {
    rule_id: 'test_rule',
    owner: 'produit',
    feature_flag_key: null,
    enabled: true,
    disabled_reason: null,
    comparison_to_product_rules: 'keep',
    impact_metric_key: null,
    ...overrides,
  }
}

describe('méthodRuleSchema', () => {
  it('accepte une règle complète valide', () => {
    expect(() => methodRuleSchema.parse(baseRule())).not.toThrow()
  })

  it('rejette un champ obligatoire manquant', () => {
    const { recommendation: _drop, ...incomplete } = baseRule()
    expect(() => methodRuleSchema.parse(incomplete)).toThrow()
  })

  it('les six catégories du ticket, ni plus ni moins', () => {
    expect([...METHOD_RULE_CATEGORIES].sort()).toEqual(
      ['adaptive_policy', 'case_study', 'commercial_claim', 'invariant', 'playbook', 'superseded'].sort(),
    )
  })

  it('rejette une catégorie inventée', () => {
    expect(() => methodRuleSchema.parse(baseRule({ category: 'heuristic' as never }))).toThrow()
  })

  it('le domaine est limité aux maisons canoniques (+ methode transversal)', () => {
    expect(METHOD_RULE_DOMAINS).toContain('Compte')
    expect(METHOD_RULE_DOMAINS).toContain('ProfileContext')
    expect(methodRuleSchema.safeParse(baseRule({ domain: 'Lead' as never })).success).toBe(false)
  })

  it('la confidence est qualitative — jamais un nombre (doctrine : aucune probabilité)', () => {
    expect(methodRuleSchema.safeParse(baseRule({ confidence: 0.8 as never })).success).toBe(false)
    expect(methodRuleSchema.safeParse(baseRule({ confidence: 'medium' })).success).toBe(true)
  })
})

describe('methodRuleGovernanceSchema', () => {
  it('exige une raison quand une règle est désactivée', () => {
    expect(
      methodRuleGovernanceSchema.safeParse(baseGovernance({ enabled: false, disabled_reason: null })).success,
    ).toBe(false)
    expect(
      methodRuleGovernanceSchema.safeParse(
        baseGovernance({ enabled: false, disabled_reason: 'produit de mauvais résultats' }),
      ).success,
    ).toBe(true)
  })

  it('accepte une règle activée sans raison', () => {
    expect(methodRuleGovernanceSchema.safeParse(baseGovernance()).success).toBe(true)
  })
})

describe('methodCorpusVersionSchema', () => {
  const validCorpus = {
    version: '9.9.9',
    released_at: '2026-09-28',
    rules: [baseRule()],
    governance: [baseGovernance()],
    change_log: [
      {
        version: '9.9.9',
        released_at: '2026-09-28',
        summary: 'test',
        rule_ids: ['test_rule'],
        comparison_note: null,
      },
    ],
  }

  it('accepte un corpus cohérent', () => {
    expect(methodCorpusVersionSchema.safeParse(validCorpus).success).toBe(true)
  })

  it('rejette une règle orpheline sans gouvernance', () => {
    const withoutGovernance = { ...validCorpus, governance: [] }
    expect(methodCorpusVersionSchema.safeParse(withoutGovernance).success).toBe(false)
  })

  it('rejette un rule_id dupliqué', () => {
    const duplicated = { ...validCorpus, rules: [baseRule(), baseRule()] }
    expect(methodCorpusVersionSchema.safeParse(duplicated).success).toBe(false)
  })

  it('une règle SUPERSEDED doit être désactivée en gouvernance', () => {
    const supersededButActive = {
      ...validCorpus,
      rules: [baseRule({ category: 'superseded' })],
      governance: [baseGovernance({ enabled: true })],
    }
    expect(methodCorpusVersionSchema.safeParse(supersededButActive).success).toBe(false)

    const supersededDisabled = {
      ...validCorpus,
      rules: [baseRule({ category: 'superseded' })],
      governance: [baseGovernance({ enabled: false, disabled_reason: 'contredit la doctrine actuelle' })],
    }
    expect(methodCorpusVersionSchema.safeParse(supersededDisabled).success).toBe(true)
  })
})

describe('METHOD_CORPUS_V1 — la donnée réelle', () => {
  it('est un corpus valide en version 1.2.0 (BEL-SC-233 a ajouté les deux derniers points)', () => {
    expect(METHOD_CORPUS_V1.version).toBe('1.2.0')
    expect(() => methodCorpusVersionSchema.parse(METHOD_CORPUS_V1)).not.toThrow()
  })

  it('#3262.22/.29 (épopée #3284) — porte la cadence configurable et le NO-GO logo prestigieux', () => {
    const cadence = METHOD_CORPUS_V1.rules.find(rule => rule.rule_id === 'cadence_de_revue_configurable')
    expect(cadence?.category).toBe('adaptive_policy')
    expect(cadence?.user_override_allowed).toBe(true)

    const noGo = METHOD_CORPUS_V1.rules.find(rule => rule.rule_id === 'logo_prestigieux_ne_justifie_jamais_la_priorite')
    expect(noGo?.category).toBe('invariant')
    // NO-GO absolu : jamais désactivable par l'espace, contrairement à la cadence.
    expect(noGo?.user_override_allowed).toBe(false)

    for (const ruleId of [cadence?.rule_id, noGo?.rule_id]) {
      const governance = METHOD_CORPUS_V1.governance.find(entry => entry.rule_id === ruleId)
      expect(governance?.enabled).toBe(true)
      expect(governance?.comparison_to_product_rules).toBe('keep')
    }
  })

  it('dérive ses 17 invariants de method-delta.ts — jamais une seconde copie du même contenu', () => {
    const expectedIds = new Set([...METHOD_RULES.map(rule => rule.id), ...METHOD_REFUSALS.map(rule => rule.id)])
    const invariantIds = new Set(
      METHOD_CORPUS_V1.rules.filter(rule => rule.category === 'invariant').map(rule => rule.rule_id),
    )
    for (const id of expectedIds) expect(invariantIds.has(id)).toBe(true)
    // #3262.29 (épopée #3284, lot P05 29/09) — le NO-GO « logo prestigieux »
    // ajoute UN invariant de plus, sourcé au ticket BEL-SC-233 (comme
    // `SUPERSEDED_EXAMPLE_RULE` l'était à sa spec) — jamais une copie de
    // method-delta.ts, mais un ajout légitime que ce test doit refléter.
    expect(invariantIds.size).toBe(expectedIds.size + 1)
    expect(invariantIds.has('logo_prestigieux_ne_justifie_jamais_la_priorite')).toBe(true)
  })

  it('classe tous les invariants (les 17 migrés + le NO-GO #3262.29) en KEEP', () => {
    const invariantGovernance = METHOD_CORPUS_V1.governance.filter(
      entry => METHOD_CORPUS_V1.rules.find(rule => rule.rule_id === entry.rule_id)?.category === 'invariant',
    )
    // #3262.29 (épopée #3284) — +1 (`logo_prestigieux_ne_justifie_jamais_la_priorite`).
    expect(invariantGovernance.length).toBe(METHOD_RULES.length + METHOD_REFUSALS.length + 1)
    for (const entry of invariantGovernance) {
      expect(entry.comparison_to_product_rules).toBe('keep')
      expect(entry.enabled).toBe(true)
    }
  })

  it('porte au moins un exemple SUPERSEDED, désactivé', () => {
    const superseded = METHOD_CORPUS_V1.rules.filter(rule => rule.category === 'superseded')
    expect(superseded.length).toBeGreaterThan(0)
    for (const rule of superseded) {
      const gov = METHOD_CORPUS_V1.governance.find(entry => entry.rule_id === rule.rule_id)
      expect(gov?.enabled).toBe(false)
    }
  })
})

describe('resolveRuleActivation', () => {
  it('une règle SUPERSEDED est toujours inactive', () => {
    expect(resolveRuleActivation(baseRule({ category: 'superseded' }), baseGovernance({ enabled: true }), [])).toBe(
      false,
    )
  })

  it('une règle désactivée en gouvernance est inactive', () => {
    expect(resolveRuleActivation(baseRule(), baseGovernance({ enabled: false, disabled_reason: 'x' }), [])).toBe(false)
  })

  it('un feature flag requis mais pas actif désactive la règle', () => {
    const rule = baseRule()
    const gov = baseGovernance({ feature_flag_key: 'sc_221_gate' })
    expect(resolveRuleActivation(rule, gov, [])).toBe(false)
    expect(resolveRuleActivation(rule, gov, ['sc_221_gate'])).toBe(true)
  })

  it('une règle active sans contrainte est active', () => {
    expect(resolveRuleActivation(baseRule(), baseGovernance(), [])).toBe(true)
  })

  // BEL-SC-235 — NO-GO : « le système applique mécaniquement une règle du PDF
  // malgré des résultats contraires dans le workspace ». `disabled_reason` est
  // une désactivation GLOBALE (tous les workspaces) ; ceci est le cran manquant :
  // un signal PROPRE à CE workspace, qui n'affecte jamais les autres.
  it('un résultat contraire observé dans CE workspace désactive la règle, même active en gouvernance', () => {
    const rule = baseRule()
    const gov = baseGovernance({ enabled: true })
    expect(resolveRuleActivation(rule, gov, [])).toBe(true)
    expect(resolveRuleActivation(rule, gov, [], new Set(['test_rule']))).toBe(false)
  })

  it('un résultat contraire sur une AUTRE règle ne désactive pas celle-ci', () => {
    const rule = baseRule()
    const gov = baseGovernance({ enabled: true })
    expect(resolveRuleActivation(rule, gov, [], new Set(['une_autre_regle']))).toBe(true)
  })
})

describe('selectApplicableMethodRules', () => {
  it('ne renvoie rien sur une intention sans recoupement (jamais tout le corpus)', () => {
    const result = selectApplicableMethodRules(METHOD_CORPUS_V1, { intentTokens: ['xyzzy_zorglub_inconnu'] })
    expect(result).toEqual([])
  })

  it('retrouve une règle dont le trigger recoupe l’intention', () => {
    const result = selectApplicableMethodRules(METHOD_CORPUS_V1, {
      intentTokens: ['plan', 'de', 'compte', 'hebdomadaire'],
    })
    expect(result.some(rule => rule.rule_id === 'plan_de_compte_hebdomadaire')).toBe(true)
  })

  it('ne renvoie jamais une règle inactive (superseded exclue même si le trigger matche)', () => {
    const supersededRule = METHOD_CORPUS_V1.rules.find(rule => rule.category === 'superseded')
    expect(supersededRule).toBeDefined()
    const tokens = supersededRule!.trigger.split(' ')
    const result = selectApplicableMethodRules(METHOD_CORPUS_V1, { intentTokens: tokens })
    expect(result.some(rule => rule.rule_id === supersededRule!.rule_id)).toBe(false)
  })

  it('plafonne le nombre de règles renvoyées (topK)', () => {
    const result = selectApplicableMethodRules(METHOD_CORPUS_V1, {
      intentTokens: ['action', 'proprietaire', 'date', 'resultat', 'objection', 'ouverture', 'conversation'],
      topK: 2,
    })
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('filtre par secteur applicable quand la règle en nomme', () => {
    const scopedRule = baseRule({
      rule_id: 'scoped_sector_rule',
      trigger: 'banque reglementation',
      applicable_sectors: ['banque'],
    })
    const corpus = methodCorpusVersionSchema.parse({
      version: '9.9.9',
      released_at: '2026-09-28',
      rules: [scopedRule],
      governance: [baseGovernance({ rule_id: 'scoped_sector_rule' })],
      change_log: [
        {
          version: '9.9.9',
          released_at: '2026-09-28',
          summary: 't',
          rule_ids: ['scoped_sector_rule'],
          comparison_note: null,
        },
      ],
    })
    expect(selectApplicableMethodRules(corpus, { intentTokens: ['banque'], sector: 'industrie' })).toEqual([])
    expect(
      selectApplicableMethodRules(corpus, { intentTokens: ['banque'], sector: 'banque' }).map(rule => rule.rule_id),
    ).toEqual(['scoped_sector_rule'])
  })

  // BEL-SC-235 — NO-GO : le même levier que `resolveRuleActivation`, jusqu'au
  // sélecteur que le prompt injecte réellement.
  it('exclut une règle dont ce workspace a déjà observé un résultat contraire', () => {
    const result = selectApplicableMethodRules(METHOD_CORPUS_V1, {
      intentTokens: ['plan', 'de', 'compte', 'hebdomadaire'],
    })
    const matched = result.find(rule => rule.rule_id === 'plan_de_compte_hebdomadaire')
    expect(matched).toBeDefined()
    const filtered = selectApplicableMethodRules(METHOD_CORPUS_V1, {
      intentTokens: ['plan', 'de', 'compte', 'hebdomadaire'],
      workspaceContradictedRuleIds: new Set([matched!.rule_id]),
    })
    expect(filtered.some(rule => rule.rule_id === matched!.rule_id)).toBe(false)
  })
})
