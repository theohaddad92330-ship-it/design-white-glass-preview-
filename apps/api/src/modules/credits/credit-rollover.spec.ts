import type { ConfigService } from '@nestjs/config'
import { CreditsService } from './credits.service'
import type { StripeService } from '../stripe/stripe.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { PlanCatalogService } from './plan-catalog.service'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Le report des crédits — ce que la carte de tarifs promet depuis le 16/08 :
 * « crédits non utilisés reportables sur 30 jours ».
 *
 * Ces tests défendent trois choses, par ordre d'importance : un report EXPIRÉ ne
 * se dépense pas (sinon l'écran affiche un solde que la garde de consommation
 * refuse au clic suivant), un report valide s'ajoute vraiment à la capacité, et
 * le renouvellement ne reporte QUE le quota du palier — ni une recharge achetée
 * pour un cycle précis, ni un report précédent, faute de quoi les crédits
 * s'empileraient de mois en mois.
 */

const mockConfig = {
  get: (key: string) => (key === 'frontendUrl' ? 'http://localhost:5173' : ''),
} as unknown as ConfigService

describe('report des crédits sur 30 jours', () => {
  let service: CreditsService
  let repo: MockRepository<SubscriptionEntity>

  beforeEach(() => {
    repo = createMockRepository<SubscriptionEntity>()
    const workspacesRepo = createMockRepository<WorkspaceEntity>()
    const membersRepo = createMockRepository<WorkspaceMemberEntity>()
    membersRepo.count.mockResolvedValue(1)
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as WorkspaceContextService

    service = new CreditsService(
      mockConfig,
      {} as unknown as StripeService,
      repo as never,
      createMockRepository<CreditLedgerEntity>() as never,
      createMockRepository<AccountEntity>() as never,
      workspacesRepo as never,
      membersRepo as never,
      createMockRepository<StripeEventEntity>() as never,
      createMockRepository<CreditReservationEntity>() as never,
      workspaceContext,
      // Catalogue réel sur un repo vide → défauts embarqués (Growth : 250).
      new PlanCatalogService(createMockRepository<PlanDefinitionEntity>() as never),
    )
  })

  const row = (extra: Record<string, unknown>) =>
    ({
      user_id: 'u1',
      plan: 'growth',
      accounts_limit: 250,
      accounts_used: 250,
      topup_analyses: 0,
      extra_seats: 0,
      billing_mode: 'stripe',
      period_start: new Date(),
      ...extra,
    }) as unknown as SubscriptionEntity

  it('un report VALIDE s’ajoute au solde et se montre à part', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86_400_000)
    repo.findOne.mockResolvedValue(row({ rollover_credits: 40, rollover_expires_at: expiresAt }))

    const credits = await service.getCredits('u1')

    expect(credits.credits_remaining).toBe(40)
    expect(credits.rollover_credits).toBe(40)
    expect(credits.rollover_expires_at).toBe(expiresAt.toISOString())
  })

  it('un report EXPIRÉ ne vaut plus rien — et ne s’affiche plus', async () => {
    repo.findOne.mockResolvedValue(
      row({ rollover_credits: 40, rollover_expires_at: new Date(Date.now() - 86_400_000) }),
    )

    const credits = await service.getCredits('u1')

    expect(credits.credits_remaining).toBe(0)
    expect(credits.rollover_credits).toBe(0)
    expect(credits.rollover_expires_at).toBeNull()
  })

  it('une date de report illisible se lit « aucun report », jamais « report éternel »', async () => {
    repo.findOne.mockResolvedValue(row({ rollover_credits: 40, rollover_expires_at: 'pas une date' }))

    const credits = await service.getCredits('u1')

    expect(credits.rollover_credits).toBe(0)
  })

  it('le renouvellement reporte le reliquat du palier, borné au nominal', async () => {
    repo._qb.execute.mockResolvedValue({ affected: 0, raw: [] })

    await service.resetElapsedMonthlyQuotas()

    const sets = repo._qb.set.mock.calls.map(call => call[0] as Record<string, () => string>)
    const expressions = sets.map(set => set['rollover_credits']?.()).filter(Boolean)

    // `LEAST(accounts_limit, quota)` : un opérateur qui a accordé plus que le
    // nominal (geste commercial) ne fait pas reporter son geste mois après mois.
    expect(expressions).toContain('GREATEST(LEAST(accounts_limit, 250) - accounts_used, 0)')
    expect(sets.every(set => set['rollover_expires_at']?.().includes('30 days'))).toBe(true)
  })

  /**
   * 05/10/2026 — le pré-contrôle d'enrichissement lisait une ligne PROJETÉE
   * (`select`) sans les colonnes du report : quota du mois consommé (251/250),
   * 66 crédits reportés valides, et pourtant « momentanément indisponible ».
   * Le mock projette la ligne sur le `select` demandé, comme le ferait la base.
   */
  describe('pré-contrôle d’enrichissement', () => {
    const projected = (full: SubscriptionEntity) =>
      repo.findOne.mockImplementation(async (opts: { select?: string[] }) => {
        if (!opts?.select) return full
        const out: Record<string, unknown> = {}
        for (const key of opts.select) out[key] = (full as unknown as Record<string, unknown>)[key]
        return out as unknown as SubscriptionEntity
      })

    it('quota du mois consommé mais report VALIDE : l’enrichissement reste permis', async () => {
      const expiresAt = new Date(Date.now() + 10 * 86_400_000)
      projected(row({ accounts_used: 251, rollover_credits: 66, rollover_expires_at: expiresAt }))

      await expect(service.hasEnrichmentCredit('u1')).resolves.toBe(true)
    })

    it('quota consommé et report EXPIRÉ : l’enrichissement est refusé', async () => {
      const expiredAt = new Date(Date.now() - 86_400_000)
      projected(row({ accounts_used: 251, rollover_credits: 66, rollover_expires_at: expiredAt }))

      await expect(service.hasEnrichmentCredit('u1')).resolves.toBe(false)
    })
  })
})
