import type { ConfigService } from '@nestjs/config'
import { CreditsService } from './credits.service'
import { PlanCatalogService } from './plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'

const mockConfig = {
  get: (key: string) => {
    if (key === 'stripeSecretKey') return 'sk_test_fake'
    if (key === 'frontendUrl') return 'http://localhost:5173'
    return ''
  },
} as unknown as ConfigService

const mockStripe = {} as unknown as StripeService

function makeService() {
  const repo = createMockRepository<SubscriptionEntity>()
  const ledgerRepo = createMockRepository<CreditLedgerEntity>()
  const accountsRepo = createMockRepository<AccountEntity>()
  const workspacesRepo = createMockRepository<WorkspaceEntity>()
  const membersRepo = createMockRepository<WorkspaceMemberEntity>()
  const stripeEventsRepo = createMockRepository<StripeEventEntity>()
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as WorkspaceContextService
  const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
  return new CreditsService(
    mockConfig,
    mockStripe,
    repo as never,
    ledgerRepo as never,
    accountsRepo as never,
    workspacesRepo as never,
    membersRepo as never,
    stripeEventsRepo as never,
    createMockRepository<CreditReservationEntity>() as never,
    workspaceContext,
    planCatalog,
  )
}

describe('CreditsModule', () => {
  it('returns plan config', async () => {
    const service = makeService()
    const plans = await service.getPlanConfig()
    // Zéro depuis le 02/09/2026 : `trial` est l'état verrouillé, plus un essai.
    expect(plans.trial.accounts_limit).toBe(0)
    expect(plans.starter.price).toBe(11900)
    expect(plans.team.price).toBe(25900)
    expect(plans.growth.price).toBe(19900)
  })

  it('checks canAnalyze correctly', () => {
    const service = makeService()
    expect(service.canAnalyze(2, 3)).toBe(true)
    expect(service.canAnalyze(3, 3)).toBe(false)
    expect(service.canAnalyze(0, 999999)).toBe(true)
  })
})
