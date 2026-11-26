import { describe, expect, it } from 'vitest'
import {
  METHOD_CORPUS_V1,
  methodCorpusVersionSchema,
  methodRuleSchema,
  selectApplicableMethodRules,
  type MethodCorpusVersion,
  type MethodRule,
  type MethodRuleGovernance,
} from './method-corpus.js'

/**
 * #3382 (recette prod 30/09, reste « applicable_channels ») — une règle dit sur
 * QUELS canaux elle vaut. `[]` = tous (comme rôles/stades/secteurs). Une règle
 * réservée au téléphone ne remonte jamais pour un message LinkedIn : la
 * proximité de quelques mots ne décide pas silencieusement quelle règle gagne.
 */

const phoneOnly = METHOD_CORPUS_V1.rules.find(rule => rule.applicable_channels.length > 0)

function ruleFor(channels: MethodRule['applicable_channels']): MethodRule {
  const base = METHOD_CORPUS_V1.rules[0] as MethodRule
  return { ...base, rule_id: 'regle_canal', trigger: 'ouverture message', applicable_channels: channels }
}

function corpusWith(rule: MethodRule): MethodCorpusVersion {
  const governance: MethodRuleGovernance = {
    rule_id: rule.rule_id,
    owner: 'produit',
    feature_flag_key: null,
    enabled: true,
    disabled_reason: null,
    comparison_to_product_rules: 'keep',
    impact_metric_key: null,
  }
  return methodCorpusVersionSchema.parse({
    ...METHOD_CORPUS_V1,
    rules: [...METHOD_CORPUS_V1.rules, rule],
    governance: [...METHOD_CORPUS_V1.governance, governance],
  })
}

describe('applicable_channels (#3382)', () => {
  it('le schéma refuse un canal hors vocabulaire', () => {
    const invalid = { ...ruleFor([]), applicable_channels: ['fax'] }
    expect(methodRuleSchema.safeParse(invalid).success).toBe(false)
  })

  it('le schéma exige le champ (un champ absent est un trou de gouvernance)', () => {
    const { applicable_channels: _omitted, ...without } = ruleFor([])
    expect(methodRuleSchema.safeParse(without).success).toBe(false)
  })

  it('une règle réservée au téléphone ne remonte pas pour LinkedIn', () => {
    const corpus = corpusWith(ruleFor(['phone']))
    const onLinkedin = selectApplicableMethodRules(corpus, { intentTokens: ['ouverture'], channel: 'linkedin' })
    expect(onLinkedin.map(r => r.rule_id)).not.toContain('regle_canal')
    const onPhone = selectApplicableMethodRules(corpus, { intentTokens: ['ouverture'], channel: 'phone' })
    expect(onPhone.map(r => r.rule_id)).toContain('regle_canal')
  })

  it('une règle à canaux restreints ne remonte pas quand le canal est inconnu (jamais deviné)', () => {
    const corpus = corpusWith(ruleFor(['phone']))
    const noChannel = selectApplicableMethodRules(corpus, { intentTokens: ['ouverture'] })
    expect(noChannel.map(r => r.rule_id)).not.toContain('regle_canal')
  })

  it('une règle sans canal (`[]`) reste applicable partout, canal donné ou non', () => {
    const corpus = corpusWith(ruleFor([]))
    for (const channel of [undefined, 'email', 'linkedin'] as const) {
      const out = selectApplicableMethodRules(corpus, { intentTokens: ['ouverture'], channel })
      expect(out.map(r => r.rule_id)).toContain('regle_canal')
    }
  })

  it('le corpus courant porte au moins une règle à canal restreint (le champ est utilisé, pas décoratif)', () => {
    expect(phoneOnly).toBeDefined()
  })
})
