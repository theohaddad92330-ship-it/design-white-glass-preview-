import { describe, expect, it } from 'vitest'
import { ciblesStep } from './cibles'

/**
 * #2036.7 — « Permettre plusieurs zones avec priorité ». `geo_zones` était un
 * `multi` SANS `priority` (`questions.ts:287` au 15/09) : la sélection
 * portait déjà un ordre (l'ordre d'insertion), mais rien ne le LISAIT — même
 * constat que #2024.5 sur `target_sectors`, même mécanisme réutilisé
 * (`Question.priority`, `QuestionField.tsx`) : aucune nouvelle colonne,
 * aucun nouveau widget, juste le champ déjà servi par `target_sectors`
 * (`secteurs.ts:52`) posé ici aussi.
 */
describe('geo_zones — plusieurs zones, avec priorité (#2036.7)', () => {
  const question = ciblesStep.questions.find(q => q.key === 'geo_zones')
  if (!question || question.kind !== 'multi') throw new Error('geo_zones introuvable ou pas multi')

  it('porte un champ `priority` avec un seuil de relance', () => {
    expect(question.priority).toBeDefined()
    expect(question.priority?.nudgeAbove).toBeGreaterThanOrEqual(1)
  })

  it('reste un `multi` — la priorité ne change pas le type de widget', () => {
    expect(question.kind).toBe('multi')
  })
})

/**
 * #2036.2 (#2847) — remote accepté et déplacements, un axe DISTINCT de
 * `geo_zones` : mêmes valeurs de choix jamais fusionnées dans la même liste.
 */
describe('remote_and_travel_scope — un axe distinct de geo_zones (#2036.2)', () => {
  const question = ciblesStep.questions.find(q => q.key === 'remote_and_travel_scope')
  if (!question || question.kind !== 'multi') throw new Error('remote_and_travel_scope introuvable ou pas multi')

  it('porte ses propres choix, sans recouper ceux de `geo_zones`', () => {
    const geoZones = ciblesStep.questions.find(q => q.key === 'geo_zones')
    if (!geoZones || geoZones.kind !== 'multi') throw new Error('geo_zones introuvable ou pas multi')
    const geoValues = new Set(geoZones.choices.map(c => c.value))
    for (const choiceItem of question.choices) {
      expect(geoValues.has(choiceItem.value)).toBe(false)
    }
  })

  it('propose au moins le remote et le refus de déplacement', () => {
    const values = question.choices.map(c => c.value)
    expect(values).toContain('Remote accepté sans restriction')
    expect(values).toContain('Aucun déplacement possible')
  })
})

/**
 * #2036.8 (#2847) — la posture territoriale déclarée, un axe DISTINCT de
 * `geo_zones` et de `remote_and_travel_scope` : la capacité avérée ne se
 * confond jamais avec l'intention (doctrine #2036).
 */
describe('zone_capability_status — capacité avérée distincte de l’intention (#2036.8)', () => {
  const question = ciblesStep.questions.find(q => q.key === 'zone_capability_status')
  if (!question || question.kind !== 'multi') throw new Error('zone_capability_status introuvable ou pas multi')

  it('porte ses propres choix, sans recouper ceux de `geo_zones`', () => {
    const geoZones = ciblesStep.questions.find(q => q.key === 'geo_zones')
    if (!geoZones || geoZones.kind !== 'multi') throw new Error('geo_zones introuvable ou pas multi')
    const geoValues = new Set(geoZones.choices.map(c => c.value))
    for (const choiceItem of question.choices) {
      expect(geoValues.has(choiceItem.value)).toBe(false)
    }
  })

  it('distingue la capacité avérée de l’intention, jamais dans la même valeur', () => {
    const values = question.choices.map(c => c.value)
    expect(values).toContain('Je peux intervenir (capacité déjà avérée)')
    expect(values).toContain('Je souhaite développer ces zones (pas encore une capacité avérée)')
    expect(values.length).toBe(new Set(values).size)
  })
})
