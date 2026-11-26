import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { isRequiredAnswerKey, missingAnswerLinks, missingKeysOf } from './required-answers'

describe('required-answers (#4817 / #4818)', () => {
  it('chaque clé exigée par la porte se relie à une sous-étape du catalogue (aucune orpheline)', () => {
    const links = missingAnswerLinks([...TEMPS1_REQUIRED_KEYS])
    expect(links.map(l => l.key)).toEqual([...TEMPS1_REQUIRED_KEYS])
    for (const link of links) {
      expect(link.labelKey, link.key).toBeTruthy()
      expect(link.labelKey).not.toBe(link.key)
      expect(link.stageCode).toBeTruthy()
      expect(link.slug).toBeTruthy()
    }
  })

  it('une clé inconnue du catalogue ne fait aucune ligne', () => {
    expect(missingAnswerLinks(['esn_name', 'clé_inventée']).map(l => l.key)).toEqual(['esn_name'])
    expect(missingAnswerLinks([])).toEqual([])
  })

  it('#4818 — exigée ou facultative : la source est TEMPS1_REQUIRED_KEYS', () => {
    expect(isRequiredAnswerKey('esn_name')).toBe(true)
    expect(isRequiredAnswerKey('geo_zones')).toBe(true)
    expect(isRequiredAnswerKey('une_question_facultative')).toBe(false)
  })

  it('missingKeysOf lit les clés nommées par le refus « incomplete »', () => {
    const err = new ApiError('Réponses manquantes : a', 400, 'incomplete', { missing: ['esn_name', 'geo_zones'] })
    expect(missingKeysOf(err)).toEqual(['esn_name', 'geo_zones'])
  })

  it('sait dire NON : un 503, une transition illégale ou une erreur réseau ne sont pas des réponses manquantes', () => {
    expect(missingKeysOf(new ApiError('boom', 503, 'save_failed', { missing: ['esn_name'] }))).toBeNull()
    expect(missingKeysOf(new ApiError('x', 400, undefined, {}))).toBeNull()
    expect(missingKeysOf(new ApiError('x', 400, 'incomplete', {}))).toBeNull()
    expect(missingKeysOf(new Error('Failed to fetch'))).toBeNull()
  })
})
