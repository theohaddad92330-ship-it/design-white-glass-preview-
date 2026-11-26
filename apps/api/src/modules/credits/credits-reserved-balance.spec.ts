import type { ConfigService } from '@nestjs/config'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'
import { CreditsService } from './credits.service'
import { PlanCatalogService } from './plan-catalog.service'

/**
 * LE SOLDE ANNONCÉ TIENT COMPTE DE CE QUI EST EN VOL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT — et ce qu'ils NE prouvent pas
 * ─────────────────────────────────────────────────────────────────────────────
 * Le double débit au LEDGER était déjà empêché : `consumeEnrichmentCredit` et
 * `consumeAnalysisSlot` débitent par un UPDATE gardé (`accounts_used + coût <=
 * plafond`), si bien que deux gestes simultanés ne peuvent pas passer tous les
 * deux — un seul voit `affected: 1`.
 *
 * Ce qui n'était PAS empêché, c'est la double PROMESSE : le même crédit était
 * annoncé disponible à deux gestes à la fois, parce que `GET /credits` ignorait
 * les réservations en cours. Le commercial lançait un run de vingt contacts sur
 * un solde annoncé de vingt, alors qu'un run précédent en avait déjà engagé
 * vingt — et le second s'arrêtait au troisième contact, après avoir écrit dans
 * le CRM. C'est exactement le comportement que la réservation existait pour
 * supprimer, et que personne ne lisait.
 *
 * Ces tests mesurent donc la promesse, pas le débit : le crédit engagé sort du
 * solde annoncé, et il y revient dès que la promesse est soldée ou périmée.
 */

const mockConfig = {
  get: (key: string) => {
    if (key === 'stripeSecretKey') return 'sk_test_fake'
    if (key === 'frontendUrl') return 'http://localhost:5173'
    return ''
  },
} as unknown as ConfigService

/** Une ligne de réservation telle que la table la porte. */
function reservation(over: Partial<CreditReservationEntity> = {}): CreditReservationEntity {
  return {
    id: 'res-1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    kind: 'enrichment',
    amount: 8,
    state: 'reserved',
    reference: 'corr-1',
    expires_at: new Date(Date.now() + 60_000),
    settled_at: null,
    created_at: new Date(),
    ...over,
  } as CreditReservationEntity
}

function build(options: { isDemo?: boolean } = {}) {
  const repo = createMockRepository<SubscriptionEntity>()
  const ledgerRepo = createMockRepository<CreditLedgerEntity>()
  const accountsRepo = createMockRepository<AccountEntity>()
  const workspacesRepo = createMockRepository<WorkspaceEntity>()
  const membersRepo = createMockRepository<WorkspaceMemberEntity>()
  const stripeEventsRepo = createMockRepository<StripeEventEntity>()
  const reservationsRepo = createMockRepository<CreditReservationEntity>()
  workspacesRepo.findOne.mockResolvedValue({ id: 'ws-1', owner_user_id: 'owner-1', is_demo: options.isDemo === true })
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  } as unknown as WorkspaceContextService
  const planCatalog = new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never)
  const service = new CreditsService(
    mockConfig,
    {} as unknown as StripeService,
    repo as never,
    ledgerRepo as never,
    accountsRepo as never,
    workspacesRepo as never,
    membersRepo as never,
    stripeEventsRepo as never,
    reservationsRepo as never,
    workspaceContext,
    planCatalog,
  )
  return { service, repo, reservationsRepo }
}

/** Un pool de 20 crédits sur 100 : vingt actions encore possibles. */
const POOL_OF_20 = {
  user_id: 'owner-1',
  plan: 'growth',
  accounts_limit: 100,
  accounts_used: 80,
  topup_analyses: 0,
  period_start: new Date(),
}

describe('GET /credits — un crédit engagé n’est plus promis une seconde fois', () => {
  it('sans réservation, le solde est celui du pool — chemin byte-identique', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([])

    const credits = await service.getCredits('owner-1')
    expect(credits.credits_remaining).toBe(20)
    expect(credits.credits_reserved).toBe(0)
    expect(credits.enrichment_credits).toBe(20)
  })

  it('UN RUN EN VOL RETIRE SES CRÉDITS DU SOLDE ANNONCÉ — le second run n’est pas invité à les dépenser', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([reservation({ amount: 20 })])

    const credits = await service.getCredits('owner-1')
    expect(credits.credits_reserved).toBe(20)
    expect(credits.credits_remaining).toBe(0)
    // L'alias historique suit : un consommateur pas encore migré lit le MÊME
    // solde honnête, pas l'ancien chiffre optimiste.
    expect(credits.enrichment_credits).toBe(0)
  })

  it('n’annonce jamais un solde NÉGATIF — un dépassement se lit « 0 »', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([reservation({ amount: 50 })])

    expect((await service.getCredits('owner-1')).credits_remaining).toBe(0)
  })

  it('une réservation PÉRIMÉE ne gèle rien — un run mort depuis une heure ne coûte pas la journée', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([reservation({ amount: 20, expires_at: new Date(Date.now() - 1_000) })])

    const credits = await service.getCredits('owner-1')
    expect(credits.credits_reserved).toBe(0)
    expect(credits.credits_remaining).toBe(20)
  })

  it('deux lignes pour LA MÊME référence ne gèlent pas le double — un rejeu de file n’invente pas un manque', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([
      reservation({ id: 'a', amount: 20 }),
      reservation({ id: 'b', amount: 20 }),
    ])

    const credits = await service.getCredits('owner-1')
    expect(credits.credits_reserved).toBe(20)
    expect(credits.credits_remaining).toBe(0)
  })

  it('ne lit QUE les réservations de l’espace, et QUE celles encore réservées', async () => {
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue(POOL_OF_20)
    reservationsRepo.find.mockResolvedValue([])

    await service.getCredits('owner-1')
    expect(reservationsRepo.find).toHaveBeenCalledWith({ where: { workspace_id: 'ws-1', state: 'reserved' } })
  })

  it('l’annonce « bientôt à court » reste celle du CYCLE, pas celle de l’instant', async () => {
    // D5 mesure la part CONSOMMÉE du cycle. Si une réservation la faisait
    // basculer, le bandeau s'allumerait pendant un run et s'éteindrait juste
    // après — et la notification `credit_low`, elle, dit autre chose.
    const { service, repo, reservationsRepo } = build()
    repo.findOne.mockResolvedValue({ ...POOL_OF_20, accounts_used: 10 })
    reservationsRepo.find.mockResolvedValue([reservation({ amount: 90 })])

    const credits = await service.getCredits('owner-1')
    expect(credits.credits_remaining).toBe(0)
    expect(credits.credits_low).toBe(false)
  })

  it('une salle de DÉMONSTRATION n’interroge même pas la table — aucun crédit n’y est débité', async () => {
    const { service, repo, reservationsRepo } = build({ isDemo: true })
    repo.findOne.mockResolvedValue(POOL_OF_20)

    const credits = await service.getCredits('visitor-1')
    expect(credits.credits_reserved).toBe(0)
    expect(reservationsRepo.find).not.toHaveBeenCalled()
  })
})
