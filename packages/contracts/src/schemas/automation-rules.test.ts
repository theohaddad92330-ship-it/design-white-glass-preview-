import { describe, expect, it } from 'vitest'
import { creditCostOf } from '../billing/credit-weights.js'
import { canonicalTriggerKindValues } from './canonical-trigger.js'
import {
  AUTOMATION_ACTION_KINDS,
  AUTOMATION_OUTCOMES,
  AUTOMATION_RULE_LIMITS,
  AUTOMATION_SIGNAL_INTENT,
  AUTOMATION_SIGNALS,
  diffAutomationVersions,
  AUTOMATION_TRIAL_OUTCOMES,
  AUTOMATION_TRIAL_TARGETS,
  AUTOMATION_SIGNAL_SOURCES,
  AUTOMATION_TEMPLATES,
  automationCreditVerdict,
  automationPreparationCost,
  countAutomationFirings,
  createAutomationRuleRequestSchema,
  saveAutomationRuleDraftRequestSchema,
  signalPlaybook,
} from './automation-rules.js'
import { OUTREACH_INTENTS } from './outreach-canonical.js'
import { OUTREACH_PLAYBOOK_KEYS } from './outreach-playbooks.js'

/**
 * Lot L-D1 (#4167, épopée #4163) — les automatisations : « Quand [signal] → alors
 * [inscrire le contact dans la séquence X | préparer l'action Y] ».
 */

describe('les six signaux — aucun n’est inventé', () => {
  it('lit un corpus réel : six signaux, chacun avec sa source', () => {
    expect(AUTOMATION_SIGNALS).toHaveLength(6)
    for (const signal of AUTOMATION_SIGNALS) expect(AUTOMATION_SIGNAL_SOURCES[signal]).toBeDefined()
  })

  it('chaque signal pointe un ÉMETTEUR existant : un déclencheur canonique du registre, ou une lecture nommée', () => {
    for (const signal of AUTOMATION_SIGNALS) {
      const source = AUTOMATION_SIGNAL_SOURCES[signal]
      expect(source.emitter.length).toBeGreaterThan(10)
      if (source.type === 'trigger') {
        expect(canonicalTriggerKindValues as readonly string[]).toContain(source.kind)
      } else {
        expect(['untouched_accounts', 'ending_missions']).toContain(source.reader)
      }
    }
  })

  it('sait dire NON : un déclencheur hors registre ne passerait pas la garde ci-dessus', () => {
    expect(canonicalTriggerKindValues as readonly string[]).not.toContain('un_truc_maison')
  })

  it('« compte inactif » est la seule source qui porte un paramètre (N jours)', () => {
    expect(AUTOMATION_SIGNAL_SOURCES.inactive_account).toMatchObject({ type: 'reader', parameter: 'inactive_days' })
    expect(AUTOMATION_SIGNALS.filter(signal => 'parameter' in AUTOMATION_SIGNAL_SOURCES[signal])).toEqual([
      'inactive_account',
    ])
  })
})

describe('l’intention de chaque signal', () => {
  it('est toujours une intention de la liste fermée du modèle canonique', () => {
    for (const signal of AUTOMATION_SIGNALS) {
      expect(OUTREACH_INTENTS as readonly string[]).toContain(AUTOMATION_SIGNAL_INTENT[signal])
    }
  })
})

describe('les modèles d’automatisation — un par déclencheur, reliés aux huit modèles de séquence', () => {
  it('un modèle par signal, sans doublon', () => {
    expect(AUTOMATION_TEMPLATES.map(template => template.signal).sort()).toEqual([...AUTOMATION_SIGNALS].sort())
  })

  it('chaque modèle d’automatisation pointe un modèle de séquence du lot C', () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(OUTREACH_PLAYBOOK_KEYS as readonly string[]).toContain(template.playbook)
      expect(signalPlaybook(template.signal)).toBe(template.playbook)
    }
  })

  it('un modèle s’active éteint : rien ne tourne sans geste humain', () => {
    for (const template of AUTOMATION_TEMPLATES) expect(template.enabledByDefault).toBe(false)
  })

  it('le compte inactif propose un délai par défaut dans les bornes', () => {
    const inactive = AUTOMATION_TEMPLATES.find(template => template.signal === 'inactive_account')
    expect(inactive?.inactiveDays).toBeGreaterThanOrEqual(AUTOMATION_RULE_LIMITS.inactiveDaysMin)
    expect(inactive?.inactiveDays).toBeLessThanOrEqual(AUTOMATION_RULE_LIMITS.inactiveDaysMax)
  })
})

describe('la validation d’une règle', () => {
  const base = { signal: 'tender', action_kind: 'enroll_sequence', playbook_key: 'tender' } as const

  it('accepte « inscrire dans la séquence X » avec un modèle de séquence', () => {
    expect(createAutomationRuleRequestSchema.safeParse(base).success).toBe(true)
  })

  it('refuse une inscription sans modèle de séquence', () => {
    expect(
      createAutomationRuleRequestSchema.safeParse({ signal: 'tender', action_kind: 'enroll_sequence' }).success,
    ).toBe(false)
  })

  it('refuse un modèle de séquence hors des huit', () => {
    expect(createAutomationRuleRequestSchema.safeParse({ ...base, playbook_key: 'inconnu' }).success).toBe(false)
  })

  it('accepte « préparer l’action Y » avec une action de la liste fermée', () => {
    const parsed = createAutomationRuleRequestSchema.safeParse({
      signal: 'new_decision_maker',
      action_kind: 'prepare_action',
      prepared_action: 'email_to_review',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse de mélanger les deux grammaires', () => {
    expect(
      createAutomationRuleRequestSchema.safeParse({
        ...base,
        prepared_action: 'email_to_review',
      }).success,
    ).toBe(false)
  })

  it('exige N jours pour « compte inactif », et le refuse ailleurs', () => {
    const inactive = { signal: 'inactive_account', action_kind: 'enroll_sequence', playbook_key: 'win_back' } as const
    expect(createAutomationRuleRequestSchema.safeParse(inactive).success).toBe(false)
    expect(createAutomationRuleRequestSchema.safeParse({ ...inactive, inactive_days: 45 }).success).toBe(true)
    expect(createAutomationRuleRequestSchema.safeParse({ ...inactive, inactive_days: 3 }).success).toBe(false)
    expect(createAutomationRuleRequestSchema.safeParse({ ...base, inactive_days: 45 }).success).toBe(false)
  })

  it('un plafond de crédits est un entier positif ou nul, jamais négatif', () => {
    expect(createAutomationRuleRequestSchema.safeParse({ ...base, credit_cap: 20 }).success).toBe(true)
    expect(createAutomationRuleRequestSchema.safeParse({ ...base, credit_cap: -1 }).success).toBe(false)
    expect(createAutomationRuleRequestSchema.safeParse({ ...base, credit_cap: 1.5 }).success).toBe(false)
  })

  it('les deux natures d’action sont fermées', () => {
    expect(AUTOMATION_ACTION_KINDS).toEqual(['enroll_sequence', 'prepare_action'])
  })
})

describe('le coût et le plafond de crédits', () => {
  it('le coût annoncé vient de la grille de crédits, jamais d’un chiffre écrit ici', () => {
    expect(automationPreparationCost()).toBe(creditCostOf('message_generation'))
  })

  it('sans plafond, rien ne bloque', () => {
    expect(automationCreditVerdict({ cap: null, spent: 999, cost: 5 })).toBe('allowed')
  })

  it('bloque quand la dépense du mois plus le coût dépasserait le plafond', () => {
    expect(automationCreditVerdict({ cap: 10, spent: 8, cost: 3 })).toBe('cap_reached')
    expect(automationCreditVerdict({ cap: 10, spent: 8, cost: 2 })).toBe('allowed')
  })

  it('une préparation gratuite passe toujours, même sous un plafond de zéro (rien n’est dépensé)', () => {
    expect(automationCreditVerdict({ cap: 0, spent: 0, cost: 0 })).toBe('allowed')
  })

  it('un plafond de zéro bloque une préparation payante', () => {
    expect(automationCreditVerdict({ cap: 0, spent: 0, cost: 1 })).toBe('cap_reached')
  })
})

describe('le compteur de déclenchements sur 30 jours', () => {
  const now = new Date('2026-10-14T08:00:00Z')
  const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000).toISOString()

  it('« non mesuré » (null) tant que la règle n’a jamais tourné — jamais 0', () => {
    expect(countAutomationFirings([], null, now)).toBeNull()
  })

  it('compte ce qui a RÉELLEMENT déclenché (inscrit ou préparé), dans les 30 jours', () => {
    const rows = [
      { outcome: 'enrolled', fired_at: day(1) },
      { outcome: 'prepared', fired_at: day(29) },
      { outcome: 'enrolled', fired_at: day(31) },
      { outcome: 'excluded', fired_at: day(2) },
      { outcome: 'failed', fired_at: day(2) },
    ] as const
    expect(countAutomationFirings(rows, day(0), now)).toBe(2)
  })

  it('0 est une vraie mesure une fois que la règle a tourné', () => {
    expect(countAutomationFirings([], day(0), now)).toBe(0)
  })

  it('les issues sont une liste fermée', () => {
    expect(AUTOMATION_OUTCOMES).toEqual(['enrolled', 'prepared', 'excluded', 'no_contact', 'failed', 'cap_reached'])
  })
})

// Théo C automations-editeur.N2/N3 — le brouillon d'une règle : une version à tester avant de l'activer.
describe('le brouillon d’une règle (éditeur)', () => {
  it('porte la même grammaire que la création : une inscription veut sa séquence', () => {
    expect(
      saveAutomationRuleDraftRequestSchema.safeParse({ signal: 'tender', action_kind: 'enroll_sequence' }).success,
    ).toBe(false)
    expect(
      saveAutomationRuleDraftRequestSchema.safeParse({
        signal: 'tender',
        action_kind: 'enroll_sequence',
        playbook_key: 'tender',
        name: '  Appel d’offres publié ',
      }),
    ).toMatchObject({ success: true, data: { name: 'Appel d’offres publié' } })
  })

  it('un nom vide n’existe pas : il se dit absent, pas vide', () => {
    expect(
      saveAutomationRuleDraftRequestSchema.safeParse({
        signal: 'mission_end',
        action_kind: 'prepare_action',
        prepared_action: 'call_to_make',
        name: '   ',
      }).success,
    ).toBe(false)
  })

  it('les issues d’un essai sont une liste fermée, miroir de la contrainte SQL', () => {
    expect(AUTOMATION_TRIAL_OUTCOMES).toEqual(['ok', 'failed'])
    expect(AUTOMATION_TRIAL_TARGETS).toEqual(['live', 'draft'])
  })
})

describe('#2399.7 — diffAutomationVersions : champ par champ, ce qui change et seulement ce qui change', () => {
  const live = {
    name: 'Fin de mission',
    signal: 'mission_end' as const,
    action_kind: 'prepare_action' as const,
    playbook_key: null,
    prepared_action: 'call_to_make' as const,
    inactive_days: null,
    credit_cap: null,
  }

  it('deux versions identiques ne montrent AUCUNE différence', () => {
    expect(diffAutomationVersions(live, { ...live })).toEqual([])
  })

  it('ne rend que les champs qui changent, avec l’avant et l’après', () => {
    const diff = diffAutomationVersions(live, { ...live, prepared_action: 'email_to_review', credit_cap: 40 })
    expect(diff).toEqual([
      { field: 'prepared_action', before: 'call_to_make', after: 'email_to_review' },
      { field: 'credit_cap', before: null, after: 40 },
    ])
  })

  it('un nom absent du brouillon ne compte pas comme un changement (il garde celui de la règle)', () => {
    expect(diffAutomationVersions(live, { ...live, name: null })).toEqual([])
  })

  it('undefined et null sont la même absence', () => {
    expect(diffAutomationVersions(live, { ...live, playbook_key: undefined })).toEqual([])
  })
})
