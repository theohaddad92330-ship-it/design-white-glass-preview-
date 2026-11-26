import { describe, expect, it } from 'vitest'
import { requiredAnswerGaps, TEMPS1_REQUIRED_KEYS, type EsnAnswers } from './onboarding.js'
import { UNKNOWN_ANSWER_LABELS } from './onboarding-unknown-answers.js'

function full(): EsnAnswers {
  const answers: Record<string, unknown> = {}
  for (const key of TEMPS1_REQUIRED_KEYS) answers[key] = 'renseigné'
  for (const key of ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones'])
    answers[key] = ['valeur']
  return answers as EsnAnswers
}

// #4875.1 / #4875.2 — UNE règle pour « qu'est-ce qui bloque l'ouverture de l'espace », partagée par la
// porte serveur et l'écran de relecture (GA-26).
describe('requiredAnswerGaps — #4875', () => {
  it('rien ne manque ⇒ aucune ligne (GA-18/GA-19)', () => {
    expect(requiredAnswerGaps(full(), {})).toEqual([])
  })

  it('« Je ne sais pas encore » sur une clé liste est un état NOMMÉ : ni une liste vide, ni une absence', () => {
    const answers = { ...full(), geo_zones: [] } as EsnAnswers
    const gaps = requiredAnswerGaps(answers, { statuses: { geo_zones: 'not_yet_known' } })
    expect(gaps).toEqual([{ key: 'geo_zones', declared: 'not_yet_known' }])
  })

  it('sait dire NON : une liste vide SANS statut déclaré reste une absence (declared: null)', () => {
    const answers = { ...full(), geo_zones: [] } as EsnAnswers
    expect(requiredAnswerGaps(answers, {})).toEqual([{ key: 'geo_zones', declared: null }])
  })

  it('n’invente aucune valeur : la déclaration ne remplit pas la clé (le cadrage ne passe pas complet)', () => {
    const answers = { ...full(), target_sectors: [] } as EsnAnswers
    expect(requiredAnswerGaps(answers, { statuses: { target_sectors: 'not_yet_known' } })).toHaveLength(1)
  })

  it('un statut périmé ne l’emporte JAMAIS sur une vraie réponse', () => {
    expect(requiredAnswerGaps(full(), { statuses: { geo_zones: 'not_yet_known' } })).toEqual([])
  })

  it('une clé texte répondue « Je ne sais pas encore » reste une réponse déclarée (tranché 31/10)', () => {
    const answers = { ...full(), positioning: UNKNOWN_ANSWER_LABELS.not_yet_known } as EsnAnswers
    expect(requiredAnswerGaps(answers, {})).toEqual([])
  })

  it('un membre qui attend son administrateur ne se voit nommer que ses clés personnelles', () => {
    const answers = { ...full(), esn_name: '' } as EsnAnswers
    expect(requiredAnswerGaps(answers, { awaitingCompanyAdmin: true })).toEqual([])
    expect(requiredAnswerGaps(answers, {}).map(g => g.key)).toEqual(['esn_name'])
  })
})
