/**
 * #2897 (#2091.36, #2091.37) — la bannière « BellumAI a été repensé ».
 *
 * Un compte dont l'onboarding s'est terminé AVANT la refonte de l'écran
 * Welcome (`WELCOME_REDESIGN_DATE`, ancrée sur l'entrée de changelog
 * `2026-07-21-onboarding-bienvenue` — voir `welcome-redesign.test.ts`) voit
 * la bannière, fermable, mémorisée côté serveur.
 */
import { WELCOME_REDESIGN_DATE } from '@bellum/contracts'
import { assertSuccess } from '@bellum/utils'
import type { Repository } from 'typeorm'
import type { EsnProfileService } from '../esn-profile/esn-profile.service'
import type { OnboardingStageDefinitionEntity } from '../../database/entities/onboarding-stage-definition.entity'
import type { UserOnboardingStateEntity } from '../../database/entities/user-onboarding-state.entity'
import type { UserOnboardingTransitionEntity } from '../../database/entities/user-onboarding-transition.entity'
import { OnboardingService } from './onboarding.service'

const BEFORE_REDESIGN = new Date('2026-06-01T00:00:00.000Z')
const AFTER_REDESIGN = new Date('2026-08-01T00:00:00.000Z')

function makeStatesRepo(rows: UserOnboardingStateEntity[]) {
  return {
    findOne: jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    ),
    create: jest.fn((data: Partial<UserOnboardingStateEntity>) => ({ ...data }) as UserOnboardingStateEntity),
    save: jest.fn(async (entity: UserOnboardingStateEntity) => {
      const idx = rows.findIndex(r => r.user_id === entity.user_id)
      if (idx >= 0) rows[idx] = entity
      else rows.push(entity)
      return entity
    }),
  } as unknown as Repository<UserOnboardingStateEntity>
}

function makeStagesRepo() {
  const stages = [
    { id: 's1', code: 'company_info', title: 'Votre ESN', stage_order: 1, is_required: true },
  ] as OnboardingStageDefinitionEntity[]
  return { find: jest.fn(async () => stages) } as unknown as Repository<OnboardingStageDefinitionEntity>
}

/** Append-only, comme le vrai journal — `findOne` trie et prend le PREMIER
 *  (ASC) ou le DERNIER (DESC) résultat, jamais un ordre non spécifié. */
function makeTransitionsRepo(rows: UserOnboardingTransitionEntity[]) {
  return {
    findOne: jest.fn(
      async ({ where, order }: { where: Record<string, unknown>; order?: { created_at?: 'ASC' | 'DESC' } }) => {
        const matches = rows.filter(r => Object.entries(where).every(([k, v]) => (r as never)[k] === v))
        const sorted = [...matches].sort((a, b) =>
          order?.created_at === 'DESC'
            ? b.created_at.getTime() - a.created_at.getTime()
            : a.created_at.getTime() - b.created_at.getTime(),
        )
        return sorted[0] ?? null
      },
    ),
  } as unknown as Repository<UserOnboardingTransitionEntity>
}

function transition(userId: string, toStatus: string, createdAt: Date): UserOnboardingTransitionEntity {
  return {
    id: `t-${createdAt.getTime()}`,
    user_id: userId,
    from_status: 'in_progress',
    to_status: toStatus,
    reason: 'complete',
    created_at: createdAt,
  } as UserOnboardingTransitionEntity
}

function makeService(opts: { states?: UserOnboardingStateEntity[]; transitions?: UserOnboardingTransitionEntity[] }) {
  const states = makeStatesRepo(opts.states ?? [])
  const stages = makeStagesRepo()
  const transitions = makeTransitionsRepo(opts.transitions ?? [])
  const runs = { count: jest.fn(async () => 0) } as never
  const esnProfile = {} as EsnProfileService
  const service = new OnboardingService(states, stages, runs, transitions, esnProfile)
  return { service, states }
}

describe('OnboardingService.getRedesignBannerState (#2897, #2091.36)', () => {
  it('visible pour un compte dont la PREMIÈRE complétion précède la refonte', async () => {
    const { service } = makeService({ transitions: [transition('u1', 'completed', BEFORE_REDESIGN)] })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: true })
  })

  it('invisible pour un compte dont l’onboarding s’est terminé APRÈS la refonte', async () => {
    const { service } = makeService({ transitions: [transition('u1', 'completed', AFTER_REDESIGN)] })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })

  it('invisible : onboarding jamais terminé (aucune transition « completed »)', async () => {
    const { service } = makeService({ transitions: [] })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })

  it('invisible : déjà fermée par l’utilisateur, même si la complétion précède la refonte', async () => {
    const { service } = makeService({
      states: [{ user_id: 'u1', redesign_banner_dismissed_at: new Date('2026-09-01') } as UserOnboardingStateEntity],
      transitions: [transition('u1', 'completed', BEFORE_REDESIGN)],
    })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })

  it('la PREMIÈRE complétion décide, pas la plus récente — un refresh_required rejoué après la refonte ne cache pas la bannière', async () => {
    const { service } = makeService({
      transitions: [
        transition('u1', 'completed', BEFORE_REDESIGN),
        transition('u1', 'in_progress', new Date('2026-07-25')),
        transition('u1', 'completed', AFTER_REDESIGN),
      ],
    })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: true })
  })
})

describe('OnboardingService.dismissRedesignBanner (#2897)', () => {
  it('ferme définitivement — sans report — et la relecture rend visible:false', async () => {
    const { service, states } = makeService({ transitions: [transition('u1', 'completed', BEFORE_REDESIGN)] })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: true })

    const result = assertSuccess(await service.dismissRedesignBanner('u1'))
    expect(result).toEqual({ visible: false })
    expect(states.findOne).toHaveBeenCalled()

    // Rejouée, la fermeture reste stable (idempotente) — pas de second effet.
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })

  it('un problème de lecture dégrade à invisible, jamais une exception qui casserait le premier écran', async () => {
    const brokenStates = {
      findOne: jest.fn(async () => {
        throw new Error('boom')
      }),
    } as unknown as Repository<UserOnboardingStateEntity>
    const service = new OnboardingService(
      brokenStates,
      makeStagesRepo(),
      { count: jest.fn(async () => 0) } as never,
      makeTransitionsRepo([]),
      {} as EsnProfileService,
    )
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })
})

describe('WELCOME_REDESIGN_DATE (#2897) — le seuil transite bien au bon instant', () => {
  it('une complétion à la seconde EXACTE de la refonte ne montre pas la bannière (strictement AVANT, pas AVANT OU ÉGAL)', async () => {
    const { service } = makeService({
      transitions: [transition('u1', 'completed', new Date(WELCOME_REDESIGN_DATE))],
    })
    expect(await service.getRedesignBannerState('u1')).toEqual({ visible: false })
  })
})
