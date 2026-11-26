import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { FramingDecisionEntity } from '../../database/entities/framing-decision.entity'
import type { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import { FramingService } from './framing.service'

// Théo O onboarding-relecture.N1/N2 — une décision par orientation, et la validation explicite du cadrage.

type Row = Record<string, unknown>

function fakeRepo<T extends object>(rows: T[]) {
  return {
    find: jest.fn(async ({ where }: { where: Row }) =>
      rows.filter(r => Object.entries(where).every(([k, v]) => (r as Row)[k] === v)),
    ),
    findOne: jest.fn(
      async ({ where }: { where: Row }) =>
        rows.find(r => Object.entries(where).every(([k, v]) => (r as Row)[k] === v)) ?? null,
    ),
    create: jest.fn((data: Partial<T>) => ({ ...data }) as T),
    save: jest.fn(async (entity: T) => {
      if (!rows.includes(entity)) rows.push(entity)
      return entity
    }),
  } as unknown as Repository<T> & { save: jest.Mock }
}

const USER = '0a3c1861-840d-4606-8324-5fbea19bafff'

function makeService(opts: { decisions?: FramingDecisionEntity[]; states?: UserOnboardingStateEntity[] } = {}) {
  const decisions = fakeRepo<FramingDecisionEntity>(opts.decisions ?? [])
  const states = fakeRepo<UserOnboardingStateEntity>(
    opts.states ?? [
      { user_id: USER, framing_validated_at: null, framing_validated_digest: null } as UserOnboardingStateEntity,
    ],
  )
  return { service: new FramingService(decisions, states), decisions, states }
}

describe('FramingService', () => {
  it('rend un état vide quand rien n’a été décidé ni validé — rien n’est inventé', async () => {
    const { service } = makeService()
    await expect(service.getState(USER)).resolves.toEqual({ decisions: {}, validated_at: null, validated_digest: null })
  })

  it('enregistre une décision par orientation et la relit', async () => {
    const { service } = makeService()
    const state = await service.saveDecision(USER, 'proof', 'retain')
    expect(state.decisions).toEqual({ proof: 'retain' })
  })

  it('redécider remplace : une seule ligne par orientation', async () => {
    const { service, decisions } = makeService()
    await service.saveDecision(USER, 'proof', 'retain')
    const state = await service.saveDecision(USER, 'proof', 'dismiss')
    expect(state.decisions).toEqual({ proof: 'dismiss' })
    expect(decisions.save).toHaveBeenCalledTimes(2)
    const rows = await decisions.find({ where: { user_id: USER } } as never)
    expect(rows).toHaveLength(1)
  })

  it('ne lit jamais la décision d’un autre utilisateur', async () => {
    const { service } = makeService({
      decisions: [
        {
          user_id: 'someone-else',
          strategy_key: 'proof',
          decision: 'retain',
          decided_at: new Date(),
        } as FramingDecisionEntity,
      ],
    })
    expect((await service.getState(USER)).decisions).toEqual({})
  })

  it('valide le cadrage : horodate et garde l’empreinte des réponses relues', async () => {
    const { service } = makeService()
    const state = await service.validate(USER, 'a'.repeat(64))
    expect(state.validated_digest).toBe('a'.repeat(64))
    expect(state.validated_at).not.toBeNull()
  })

  it('refuse de valider sans onboarding démarré', async () => {
    const { service } = makeService({ states: [] })
    await expect(service.validate(USER, 'a'.repeat(64))).rejects.toBeInstanceOf(NotFoundException)
  })
})
