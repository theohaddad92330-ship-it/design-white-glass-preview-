import { describe, expect, it } from 'vitest'
import type { AnalysisContext } from '@bellum/contracts'
import { angleOf, withAngle } from './angleField'

describe('angleField — la phrase d’angle vit dans le champ texte du preset', () => {
  it('écrit les notes d’un contexte libre', () => {
    const next = withAngle({ preset: 'free', notes: '' }, 'Placer deux profils Data')
    expect(next).toEqual({ preset: 'free', notes: 'Placer deux profils Data' })
    expect(angleOf(next)).toBe('Placer deux profils Data')
  })

  it('écrit dans le champ texte du preset sans toucher aux autres champs', () => {
    const base: AnalysisContext = { preset: 'incumbent', incumbentName: 'Sopraxis Consulting' }
    const next = withAngle(base, 'Où l’ESN en place est-elle fragile ?')
    expect(next).toMatchObject({
      preset: 'incumbent',
      incumbentName: 'Sopraxis Consulting',
      weakness: 'Où l’ESN en place est-elle fragile ?',
    })
  })

  it('lit une chaîne vide quand rien n’est posé', () => {
    expect(angleOf({ preset: 'strategic' })).toBe('')
  })
})
