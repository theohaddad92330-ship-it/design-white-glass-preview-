import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_FEEDBACK_TARGETS,
  ACCOUNT_FEEDBACK_VERDICTS,
  accountFeedbackItemSchema,
  createAccountFeedbackSchema,
} from './account-feedback.js'

const validBody = {
  target: 'play' as const,
  targetRef: 'Play VINCI Energies — angle cyber',
  verdict: 'inutile' as const,
  note: 'Hors sujet : ce périmètre est déjà couvert par un concurrent.',
}

describe('account-feedback contracts', () => {
  it('parses a valid feedback body', () => {
    expect(createAccountFeedbackSchema.parse(validBody)).toEqual(validBody)
  })

  it('defaults targetRef to empty and tolerates a missing note', () => {
    const parsed = createAccountFeedbackSchema.parse({ target: 'global', verdict: 'utile' })
    expect(parsed.targetRef).toBe('')
    expect(parsed.note).toBeUndefined()
  })

  it('rejects unknown targets and verdicts', () => {
    expect(createAccountFeedbackSchema.safeParse({ ...validBody, target: 'plan' }).success).toBe(false)
    expect(createAccountFeedbackSchema.safeParse({ ...validBody, verdict: 'bof' }).success).toBe(false)
  })

  it('bounds targetRef and note (prompt-injection / payload abuse guard)', () => {
    expect(createAccountFeedbackSchema.safeParse({ ...validBody, targetRef: 'x'.repeat(301) }).success).toBe(false)
    expect(createAccountFeedbackSchema.safeParse({ ...validBody, note: 'x'.repeat(1001) }).success).toBe(false)
  })

  it('exposes the canonical target/verdict vocabularies', () => {
    expect(ACCOUNT_FEEDBACK_TARGETS).toEqual(['play', 'contact', 'signal', 'section', 'global'])
    // #2076.9-.13 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
    // §1, reco appliquée) : « juste »/« partiel »/« manquant » sont un verdict
    // de JUSTESSE (la première preuve sur un compte déjà connu), un axe
    // différent de « utile »/« inutile » (utilité) — même enum PARTAGÉ (GA-26,
    // un vocabulaire vit à un seul endroit), ajouté EN FIN (GA-08). « faux »
    // coïncide déjà et n'est pas dupliqué.
    expect(ACCOUNT_FEEDBACK_VERDICTS).toEqual(['utile', 'inutile', 'faux', 'obsolete', 'juste', 'partiel', 'manquant'])
  })

  it('parses a stored feedback item (wire shape of GET /accounts/:id/feedback)', () => {
    const item = {
      id: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
      target: 'contact',
      targetRef: 'Jean Dupont',
      verdict: 'obsolete',
      note: "N'est plus dans l'entreprise depuis mars.",
      createdAt: '2026-07-16T08:00:00.000Z',
    }
    expect(accountFeedbackItemSchema.parse(item)).toEqual(item)
  })
})
