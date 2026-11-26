import type { Repository } from 'typeorm'
import type { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { AccountFeedbackService } from './account-feedback.service'

/**
 * #2076.13 — « ce retour enrichit le workspace ET la recette produit ».
 *
 * La recette produit ne lit que les retours dont la LIGNE porte
 * `generalized_only` (GA-47). Tant que `create()` écrivait toujours
 * `tenant_private`, le réglage d'espace `offer_portfolio.privacy.feedback_reuse`
 * ne servait à rien : aucun retour ne pouvait jamais atteindre la recette. La
 * ligne recopie désormais la portée de l'espace AU MOMENT du retour.
 */
function feedbackRepo() {
  const saved: Partial<AccountFeedbackEntity>[] = []
  const repo = {
    create: (row: Partial<AccountFeedbackEntity>) => row,
    save: async (row: Partial<AccountFeedbackEntity>) => {
      saved.push(row)
      return { ...row, id: '00000000-0000-4000-8000-000000000001', created_at: new Date('2026-09-23T10:00:00Z') }
    },
  } as unknown as Repository<AccountFeedbackEntity>
  return { repo, saved }
}

function profilesRepo(rowsByWorkspace: Record<string, unknown>) {
  const calls: unknown[] = []
  const repo = {
    findOne: async (options: { where: { workspace_id: string } }) => {
      calls.push(options.where)
      const portfolio = rowsByWorkspace[options.where.workspace_id]
      return portfolio === undefined ? null : ({ offer_portfolio: portfolio } as EsnProfileEntity)
    },
  } as unknown as Repository<EsnProfileEntity>
  return { repo, calls }
}

const args = (workspaceId: string | null) => ({
  accountId: 'acc-1',
  workspaceId,
  userId: 'user-1',
  target: 'global' as const,
  targetRef: '',
  verdict: 'juste' as const,
})

describe('#2076.13 — la ligne de retour recopie la portée de SON espace', () => {
  it('espace qui a ouvert la généralisation : la ligne porte generalized_only', async () => {
    const { repo, saved } = feedbackRepo()
    const profiles = profilesRepo({ 'ws-open': { privacy: { feedback_reuse: 'generalized_only' } } })
    const service = new AccountFeedbackService(repo, undefined, undefined, profiles.repo)
    await service.create(args('ws-open'))
    expect(saved[0]?.reuse_scope).toBe('generalized_only')
    // Lu sur la ligne CANONIQUE de l'espace du retour, jamais celle d'un autre.
    expect(profiles.calls[0]).toMatchObject({ workspace_id: 'ws-open', is_workspace_canonical: true })
  })

  it('sait dire NON — l’espace voisin ouvert ne rend pas public le retour d’un espace fermé', async () => {
    const { repo, saved } = feedbackRepo()
    const profiles = profilesRepo({
      'ws-open': { privacy: { feedback_reuse: 'generalized_only' } },
      'ws-closed': { privacy: { feedback_reuse: 'tenant_private' } },
    })
    const service = new AccountFeedbackService(repo, undefined, undefined, profiles.repo)
    await service.create(args('ws-closed'))
    expect(saved[0]?.reuse_scope).toBe('tenant_private')
  })

  it('aucun portefeuille, aucun espace, ou lecture en échec : la portée la plus fermée', async () => {
    const none = feedbackRepo()
    await new AccountFeedbackService(none.repo, undefined, undefined, profilesRepo({}).repo).create(args('ws-x'))
    expect(none.saved[0]?.reuse_scope).toBe('tenant_private')

    const noWorkspace = feedbackRepo()
    await new AccountFeedbackService(noWorkspace.repo, undefined, undefined, profilesRepo({}).repo).create(args(null))
    expect(noWorkspace.saved[0]?.reuse_scope).toBe('tenant_private')

    const broken = feedbackRepo()
    const failing = {
      findOne: async () => {
        throw new Error('db down')
      },
    } as unknown as Repository<EsnProfileEntity>
    await new AccountFeedbackService(broken.repo, undefined, undefined, failing).create(args('ws-open'))
    expect(broken.saved[0]?.reuse_scope).toBe('tenant_private')
  })
})
