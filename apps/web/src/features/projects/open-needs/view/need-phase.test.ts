import type { Chain, ChainDerivation } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { overtakenPhaseLabel } from './need-phase'

const step = (position: number, fr: string) => ({
  position,
  label: { fr, en: fr },
  actor: 'user',
  outsideTool: false,
})
const chain = {
  key: 'sourcing_matching',
  steps: [step(1, 'Besoin ouvert'), step(2, 'Critères posés'), step(3, 'Matching lancé'), step(4, 'Profils retenus')],
  gates: [],
} as unknown as Chain
const at = (position: number) => ({ kind: 'at', position }) as unknown as ChainDerivation

describe('overtakenPhaseLabel — une seule phase sur la fiche (#3348)', () => {
  it('« Matching à lancer » déclaré mais parcours au-delà du matching : l’étape du parcours parle', () => {
    expect(overtakenPhaseLabel('to_match', chain, at(4), 'fr')).toBe('Profils retenus')
  })
  it('statut déclaré non contredit : null (le statut vaut)', () => {
    expect(overtakenPhaseLabel('to_match', chain, at(3), 'fr')).toBeNull()
    expect(overtakenPhaseLabel('to_match', chain, at(2), 'fr')).toBeNull()
  })
  it('un statut déjà avancé n’est jamais remplacé', () => {
    expect(overtakenPhaseLabel('interview', chain, at(4), 'fr')).toBeNull()
  })
  it('parcours indéterminé ou absent : null, jamais une étape inventée', () => {
    expect(
      overtakenPhaseLabel('to_match', chain, { kind: 'undetermined' } as unknown as ChainDerivation, 'fr'),
    ).toBeNull()
    expect(overtakenPhaseLabel('to_match', undefined, undefined, 'fr')).toBeNull()
  })
})
