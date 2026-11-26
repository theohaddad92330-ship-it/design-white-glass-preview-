import type { AutomationRuleView } from '@bellum/contracts'
import { saveAutomationRuleDraftRequestSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { formOfRule, requestOfForm, ruleToolsOf, type RuleForm } from './ruleDraft'

// Théo C automations-editeur.R1/R2/A1/A2/N5 — le formulaire « Régler », en trois groupes Quand / Quoi / Combien.

const rule = (over: Partial<AutomationRuleView> = {}): AutomationRuleView => ({
  id: 'r1',
  signal: 'mission_end',
  action_kind: 'prepare_action',
  playbook_key: null,
  prepared_action: 'call_to_make',
  inactive_days: null,
  enabled: true,
  credit_cap: null,
  credit_cost: 0,
  firings_30d: null,
  skipped_30d: null,
  credits_spent_30d: null,
  last_run_at: null,
  template_key: null,
  created_at: '2026-10-01T00:00:00Z',
  name: 'Une fin de mission approche',
  version: 1,
  draft: null,
  ...over,
})

describe('formOfRule', () => {
  it('reprend la règle qui tourne quand elle n’a pas de brouillon', () => {
    expect(formOfRule(rule())).toMatchObject({
      name: 'Une fin de mission approche',
      signal: 'mission_end',
      result: 'call_to_make',
      inactiveDays: '',
      creditCap: '',
    })
  })

  it('reprend le BROUILLON quand il existe : c’est lui que l’éditeur ouvre', () => {
    const form = formOfRule(
      rule({
        draft: {
          name: 'Fin de mission (e-mail)',
          signal: 'mission_end',
          action_kind: 'prepare_action',
          playbook_key: null,
          prepared_action: 'email_to_review',
          inactive_days: null,
          credit_cap: 12,
          tested: false,
        },
      }),
    )
    expect(form).toMatchObject({ name: 'Fin de mission (e-mail)', result: 'email_to_review', creditCap: '12' })
  })

  it('une règle jamais nommée s’ouvre sur un nom vide, pas sur un nom inventé', () => {
    expect(formOfRule(rule({ name: null })).name).toBe('')
  })

  it('une inscription en séquence garde sa séquence', () => {
    const form = formOfRule(rule({ action_kind: 'enroll_sequence', playbook_key: 'tender', prepared_action: null }))
    expect(form).toMatchObject({ result: 'enroll_sequence', playbook: 'tender' })
  })
})

describe('requestOfForm', () => {
  const base: RuleForm = {
    name: '  Appel d’offres  ',
    signal: 'tender',
    result: 'email_to_review',
    playbook: 'tender',
    inactiveDays: '',
    creditCap: '',
  }

  it('produit une requête que le contrat accepte, nom rogné', () => {
    const request = requestOfForm(base)
    expect(saveAutomationRuleDraftRequestSchema.safeParse(request).success).toBe(true)
    expect(request).toMatchObject({
      name: 'Appel d’offres',
      action_kind: 'prepare_action',
      prepared_action: 'email_to_review',
    })
  })

  it('un e-mail à relire n’emporte pas de séquence ; une inscription n’emporte pas d’action préparée', () => {
    expect(requestOfForm(base).playbook_key).toBeNull()
    const enroll = requestOfForm({ ...base, result: 'enroll_sequence' })
    expect(enroll).toMatchObject({ action_kind: 'enroll_sequence', playbook_key: 'tender', prepared_action: null })
  })

  it('seul « compte inactif » porte un délai ; les autres signaux n’en envoient pas', () => {
    expect(requestOfForm({ ...base, inactiveDays: '45' }).inactive_days).toBeNull()
    const inactive = requestOfForm({ ...base, signal: 'inactive_account', inactiveDays: '45' })
    expect(inactive.inactive_days).toBe(45)
    expect(saveAutomationRuleDraftRequestSchema.safeParse(inactive).success).toBe(true)
  })

  it('« compte inactif » sans délai saisi reprend le délai du modèle (60 jours), jamais 0', () => {
    expect(requestOfForm({ ...base, signal: 'inactive_account', inactiveDays: '' }).inactive_days).toBe(60)
  })

  it('un plafond vide veut dire « aucun » (null), un plafond saisi est un entier', () => {
    expect(requestOfForm(base).credit_cap).toBeNull()
    expect(requestOfForm({ ...base, creditCap: '30' }).credit_cap).toBe(30)
  })

  it('un nom vide n’est pas envoyé (null) : la règle se lira à sa phrase', () => {
    expect(requestOfForm({ ...base, name: '   ' }).name).toBeNull()
  })

  it('la séquence par défaut d’un signal est celle de son modèle, quand rien n’est choisi', () => {
    expect(requestOfForm({ ...base, signal: 'hiring', result: 'enroll_sequence', playbook: null }).playbook_key).toBe(
      'hiring_signal',
    )
  })
})

describe('ruleToolsOf (Théo C automations-editeur.N5)', () => {
  it('une fin de mission se lit dans l’ATS du client', () => {
    expect(ruleToolsOf('mission_end', 'call_to_make')).toEqual(['ats'])
  })

  it('un e-mail à relire demande aussi la messagerie', () => {
    expect(ruleToolsOf('mission_end', 'email_to_review')).toEqual(['mailbox', 'ats'])
  })

  it('les signaux de l’espace se lisent dans l’espace, rien d’autre à brancher', () => {
    expect(ruleToolsOf('hiring', 'enroll_sequence')).toEqual(['workspace'])
    expect(ruleToolsOf('inactive_account', 'call_to_make')).toEqual(['workspace'])
  })
})
