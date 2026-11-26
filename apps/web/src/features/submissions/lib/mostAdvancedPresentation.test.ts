import type { Submission } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { mostAdvancedPresentation } from './mostAdvancedPresentation'

const at = (id: string, stage: Submission['stage']) => ({ id, stage }) as Submission

describe('mostAdvancedPresentation', () => {
  it('prend la plus avancée : retenue avant entretien avant présentée avant présélection', () => {
    const items = [at('a', 'shortlisted'), at('b', 'interview'), at('c', 'submitted'), at('d', 'accepted')]
    expect(mostAdvancedPresentation(items)?.id).toBe('d')
    expect(mostAdvancedPresentation(items.slice(0, 3))?.id).toBe('b')
  })

  it('ne retient une sortie qu’à défaut de présentation vivante', () => {
    expect(mostAdvancedPresentation([at('x', 'rejected'), at('y', 'shortlisted')])?.id).toBe('y')
    expect(mostAdvancedPresentation([at('x', 'rejected')])?.id).toBe('x')
  })

  it('rend null quand l’affaire n’a aucune présentation', () => {
    expect(mostAdvancedPresentation([])).toBeNull()
  })
})
