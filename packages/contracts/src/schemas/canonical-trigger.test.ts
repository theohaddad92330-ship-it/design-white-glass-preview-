import { describe, expect, it } from 'vitest'

import { canonicalTriggerKindValues, isCanonicalTriggerKind } from './canonical-trigger.js'

describe('canonical-trigger (#2875, #2402.9)', () => {
  it('#3918.2 (lot M01, 09/10) — le registre porte les treize émetteurs migrés, vingt-neuf genres', () => {
    expect(canonicalTriggerKindValues).toEqual([
      'duplicate_pair_detected',
      'submission_stalled',
      'renewal_at_risk',
      'invoicing_blocked',
      'account_untouched',
      'rep_inactive',
      'credits_exhausted',
      'account_no_next_action',
      'project_no_decision',
      'need_without_shortlist',
      'timesheet_missing',
      'payment_overdue',
      'mission_without_end_date',
      'staffing_collision',
      'credit_low',
      'ao_publie',
      'timesheet_chase',
      'invoice_readiness_routine',
      'margin_alert',
      'reponse_positive',
      'signal_nouveau',
      'besoin_entrant',
      'deadline_ao',
      'changement_decideur',
      'referencement_detecte',
      'affaire_perdue',
      'affaire_dormante',
      'affaire_renouvellement',
      'contact_changement_poste',
    ])
  })

  it('reconnaît chaque genre migré', () => {
    for (const kind of canonicalTriggerKindValues) {
      expect(isCanonicalTriggerKind(kind)).toBe(true)
    }
  })

  it('refuse un genre hors de la liste fermée — jamais deviné pour l’occasion', () => {
    expect(isCanonicalTriggerKind('invented_kind')).toBe(false)
  })
})
