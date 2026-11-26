import { ESN_ANSWER_OPTIONS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { freinStep } from './frein'

/**
 * #3385.3 (beta #3385, retour bêta du 30/09/2026) — les six formulations
 * stratégiques demandées par le retour manquaient : le catalogue existant de
 * `main_sales_pain` ne parlait que du geste tactique d'un commercial de
 * terrain (cibler, identifier, personnaliser…), jamais des sujets d'un
 * dirigeant ou d'un directeur d'agence (marge, dépendance à quelques
 * personnes, disponibilité des profils, visibilité sur ce qui marche).
 *
 * Additif : les neuf formulations existantes restent à l'identique (aucune
 * réponse déjà donnée ne devient orpheline), les six nouvelles s'ajoutent en
 * fin de liste.
 */
describe('frein — les six nouvelles formulations stratégiques (#3385.3)', () => {
  const question = freinStep.questions.find(q => q.key === 'main_sales_pain')
  if (!question || question.kind !== 'single') throw new Error('main_sales_pain introuvable ou pas single')

  const NEW_STRATEGIC_PAINS = [
    'Je manque de comptes qualifiés',
    "Mes comptes sont ouverts mais ne s'étendent pas",
    'Je manque de profils quand un besoin arrive',
    'Mes marges se dégradent',
    "Toute l'activité dépend de quelques personnes",
    'Je manque de visibilité sur ce qui fonctionne',
  ]

  it('porte les neuf formulations historiques ET les six nouvelles (additif, rien retiré)', () => {
    expect(question.choices).toHaveLength(15)
  })

  it.each(NEW_STRATEGIC_PAINS)('« %s » fait partie des choix', pain => {
    expect(question.choices.map(c => c.value)).toContain(pain)
  })

  it('les valeurs restent uniques', () => {
    const values = question.choices.map(c => c.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('le catalogue UI reste synchronisé avec ESN_ANSWER_OPTIONS.main_sales_pain (anti-drift)', () => {
    expect(question.choices.map(c => c.value)).toEqual(ESN_ANSWER_OPTIONS.main_sales_pain)
  })
})
