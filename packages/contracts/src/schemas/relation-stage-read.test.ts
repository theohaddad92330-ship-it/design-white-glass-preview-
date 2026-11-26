import { describe, expect, it } from 'vitest'

import { relationStagesBySirenRequestSchema, relationStagesBySirenResponseSchema } from './relation-stage-read.js'

/**
 * #4289.12 — le contrat partagé apps/ia ↔ apps/api du STADE DE RELATION par SIREN. Il doit savoir dire NON :
 * un stade hors liste fermée, un SIREN mal formé, un pool trop grand.
 */
describe('#4289.12 — stade de relation par SIREN (contrat ia ↔ api)', () => {
  it('accepte un pool de SIREN et une réponse en liste fermée', () => {
    expect(
      relationStagesBySirenRequestSchema.safeParse({
        userId: '7f1c0c1e-3a43-4b8e-9d55-2d5b8f0a1c11',
        sirens: ['552081317'],
      }).success,
    ).toBe(true)
    expect(
      relationStagesBySirenResponseSchema.safeParse({
        bySiren: { '552081317': { relationStage: 'client_actif', source: 'missions' } },
      }).success,
    ).toBe(true)
  })

  it('NON : un stade hors liste fermée (« client ») ne passe pas', () => {
    expect(
      relationStagesBySirenResponseSchema.safeParse({
        bySiren: { '552081317': { relationStage: 'client', source: 'saisi' } },
      }).success,
    ).toBe(false)
  })

  it('NON : un SIREN mal formé ou un pool de plus de 20 SIREN', () => {
    const userId = '7f1c0c1e-3a43-4b8e-9d55-2d5b8f0a1c11'
    expect(relationStagesBySirenRequestSchema.safeParse({ userId, sirens: ['55208131'] }).success).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => String(100000000 + i))
    expect(relationStagesBySirenRequestSchema.safeParse({ userId, sirens: many }).success).toBe(false)
  })

  it('NON : une source inventée (« crm ») — seuls la saisie et les missions fondent un stade', () => {
    expect(
      relationStagesBySirenResponseSchema.safeParse({
        bySiren: { '552081317': { relationStage: 'client_actif', source: 'crm' } },
      }).success,
    ).toBe(false)
  })
})
