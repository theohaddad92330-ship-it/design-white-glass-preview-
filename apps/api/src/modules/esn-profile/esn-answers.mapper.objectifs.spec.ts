import { mapRowToAnswers } from './esn-answers.mapper'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'

/**
 * #2052 (lot L19) — garde de non-régression sur le motif n°1 de ce dépôt :
 * « du code juste, calculé, testé, que personne n'appelle ». La colonne
 * existe (migration `1794204271853-EsnObjectifsNommes`) — sans cette
 * projection, la lecture d'un profil rendrait `undefined` pour tout le monde.
 */
describe('mapRowToAnswers — objectifs commerciaux NOMMÉS (#2052)', () => {
  const objective = {
    kind: 'meetings' as const,
    value: 15,
    unit: 'rendez-vous',
    period: 'monthly' as const,
    horizon: null,
    commitmentLevel: 'objective' as const,
    source: 'human' as const,
    observedAt: '2026-09-16T00:00:00.000Z',
    note: null,
  }

  it('projette la colonne `esn_objectives` vers `EsnAnswers`', () => {
    const row = { esn_objectives: [objective] } as unknown as EsnProfileEntity
    const answers = mapRowToAnswers(row)
    expect(answers.esn_objectives).toEqual([objective])
  })

  it("rend `[]` — jamais `undefined` ni un objectif inventé — quand aucune ligne n'existe", () => {
    const answers = mapRowToAnswers(null)
    expect(answers.esn_objectives).toEqual([])
  })
})
