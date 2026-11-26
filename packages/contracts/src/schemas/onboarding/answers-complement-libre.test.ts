import { describe, expect, it } from 'vitest'
import { COMPLEMENT_LIBRE_ANSWER_FIELDS, readUncoveredActivityNote } from './answers-complement-libre.js'
import { esnAnswersSchema } from '../onboarding.js'

/**
 * #2060.1-.8, #2060.10 — « Y a-t-il quelque chose d'important sur ton
 * activité que mes questions n'ont pas couvert ? », la question ouverte qui
 * TERMINE le parcours, avec ses huit amorces.
 */
describe('COMPLEMENT_LIBRE_ANSWER_FIELDS — uncovered_activity_note', () => {
  it('est un champ texte libre, facultatif, jamais requis', () => {
    const parsed = COMPLEMENT_LIBRE_ANSWER_FIELDS.uncovered_activity_note.safeParse(undefined)
    expect(parsed.success).toBe(true)
  })

  it('accepte le texte tel quel, verbatim — sans le découper', () => {
    const texte = "Mon associé part dans 6 mois, je n'ai pas encore de plan B."
    const parsed = COMPLEMENT_LIBRE_ANSWER_FIELDS.uncovered_activity_note.parse(texte)
    expect(parsed).toBe(texte)
  })

  it('la clé fait partie du contrat EsnAnswers (l’appelant réel)', () => {
    expect('uncovered_activity_note' in esnAnswersSchema.shape).toBe(true)
  })
})

describe('readUncoveredActivityNote — « non mesuré » n’est jamais « 0 » (GA-18/GA-19)', () => {
  it('rend `null` quand rien n’a été écrit, jamais une chaîne vide', () => {
    expect(readUncoveredActivityNote({})).toBeNull()
    expect(readUncoveredActivityNote({ uncovered_activity_note: '' })).toBeNull()
    expect(readUncoveredActivityNote({ uncovered_activity_note: '   ' })).toBeNull()
  })

  it('rogne les espaces et rend le texte tel quel sinon', () => {
    expect(readUncoveredActivityNote({ uncovered_activity_note: '  du texte  ' })).toBe('du texte')
  })
})
