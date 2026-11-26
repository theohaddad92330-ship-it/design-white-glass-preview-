import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, UNKNOWN_ANSWER_LABELS, isPersonalAnswerKey } from '@bellum/contracts'
import type { OnboardingAnswers } from '@/stores/onboardingStore'
import { missingEssentials } from './missing-essentials'
import { TEMPS1_CATALOGUE_SUBSTEPS } from './questions'

const answers = (partial: OnboardingAnswers): OnboardingAnswers => partial

/** Toutes les clés exigées remplies — le point de départ de « rien ne manque ». */
function allFilled(): OnboardingAnswers {
  const full: OnboardingAnswers = {}
  for (const key of TEMPS1_REQUIRED_KEYS) full[key] = 'renseigné'
  return full
}

/** La sous-étape du CATALOGUE qui pose `key`, telle que le lot la lit (#2626.1). */
function substepOf(key: string): { stage: string; slug: string } {
  const step = TEMPS1_CATALOGUE_SUBSTEPS.find(s => s.questions.some(q => (q.key as string) === key))
  if (!step) throw new Error(`aucune sous-étape ne pose ${key}`)
  return { stage: step.stageCode, slug: step.slug }
}

describe('#4817 — les réponses essentielles manquantes se NOMMENT et se relient', () => {
  it('nomme chaque clé exigée sans réponse, dans l’ordre du contrat', () => {
    const missing = missingEssentials(answers({}), { awaitingCompanyAdmin: false })
    expect(missing.map(m => m.key)).toEqual([...TEMPS1_REQUIRED_KEYS])
  })

  it('porte le libellé de la question et la sous-étape qui la pose — jamais le nom de colonne nu', () => {
    const missing = missingEssentials(answers({ esn_name: 'Verhelia' }), { awaitingCompanyAdmin: false })
    expect(missing.map(m => m.key)).not.toContain('esn_name')
    for (const entry of missing) {
      expect(entry.labelKey).toBeTruthy()
      expect(entry.labelKey).not.toBe(entry.key)
      expect(entry.target).toEqual(substepOf(entry.key))
    }
  })

  it('tout rempli ⇒ AUCUNE ligne : pas de blocage quand rien ne manque (GA-18)', () => {
    expect(missingEssentials(allFilled(), { awaitingCompanyAdmin: false })).toEqual([])
  })

  it('une réponse vide ou un tableau vide ne compte pas comme répondue', () => {
    const partial = allFilled()
    partial.positioning = '   '
    partial.geo_zones = []
    const missing = missingEssentials(partial, { awaitingCompanyAdmin: false })
    expect(missing.map(m => m.key)).toEqual(['positioning', 'geo_zones'])
  })

  // #4875.2 (tranché 31/10, #4875.1) — « Je ne sais pas encore » est ACCEPTÉ sur une clé exigée et PERSISTÉ
  // comme statut : c'est une réponse déclarée, pas un manque. Ce test suit la même porte que le serveur
  // (`isAnswerFilled`), donc il vaut pour les deux côtés.
  it('#4875.2 — « Je ne sais pas encore » sur une clé exigée est une réponse, pas un manque', () => {
    const partial = allFilled()
    partial.positioning = UNKNOWN_ANSWER_LABELS.not_yet_known
    partial.esn_name = UNKNOWN_ANSWER_LABELS.not_yet_known
    expect(missingEssentials(partial, { awaitingCompanyAdmin: false })).toEqual([])
  })

  it('#4875.2 — sait dire NON : un vide sans statut déclaré reste un manque', () => {
    const partial = allFilled()
    partial.positioning = UNKNOWN_ANSWER_LABELS.not_yet_known
    partial.main_sales_pain = ''
    expect(missingEssentials(partial, { awaitingCompanyAdmin: false }).map(m => m.key)).toEqual(['main_sales_pain'])
  })

  it('garde #4158.12 — un membre qui attend son administrateur n’est tenu qu’à ses clés PERSONNELLES', () => {
    const missing = missingEssentials(answers({}), { awaitingCompanyAdmin: true })
    expect(missing.length).toBeGreaterThan(0)
    expect(missing.every(m => isPersonalAnswerKey(m.key))).toBe(true)
    expect(missing.map(m => m.key)).toEqual(TEMPS1_REQUIRED_KEYS.filter(isPersonalAnswerKey))
  })

  it('un état non chargé ne fabrique pas de réponses : les dix clés restent à poser', () => {
    expect(missingEssentials(undefined, { awaitingCompanyAdmin: false }).map(m => m.key)).toEqual([
      ...TEMPS1_REQUIRED_KEYS,
    ])
  })

  it('garde de couverture — les DIX clés exigées sont localisables dans le catalogue, sinon ce test dit NON', () => {
    const orphans = missingEssentials(answers({}), { awaitingCompanyAdmin: false }).filter(
      m => m.target === null || m.labelKey === null,
    )
    expect(orphans.map(m => m.key)).toEqual([])
  })
})

// #4875.1 — « Je ne sais pas encore » sur une clé LISTE : un état nommé, jamais une valeur inventée.
describe('#4875 — l’état « Je ne sais pas encore » d’une clé liste se nomme', () => {
  it('une liste vide déclarée inconnue reste un manque ET porte sa raison', () => {
    const partial = allFilled()
    partial.geo_zones = []
    const missing = missingEssentials(partial, {
      awaitingCompanyAdmin: false,
      statuses: { geo_zones: 'not_yet_known' },
    })
    expect(missing.map(m => [m.key, m.declared])).toEqual([['geo_zones', 'not_yet_known']])
  })

  it('sait dire NON : sans statut déclaré la même liste vide est un oubli (declared: null)', () => {
    const partial = allFilled()
    partial.geo_zones = []
    const missing = missingEssentials(partial, { awaitingCompanyAdmin: false })
    expect(missing.map(m => [m.key, m.declared])).toEqual([['geo_zones', null]])
  })
})
