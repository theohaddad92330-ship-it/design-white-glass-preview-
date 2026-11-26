import { NotFoundException } from '@nestjs/common'
import { accountFactsBriefSchema } from '@bellum/contracts'
import { AccountFactsController } from './account-facts.controller'

const ACCOUNT = '33333333-3333-4333-8333-333333333333'

// #4072.3
describe('AccountFactsController — la fiche de préparation de RDV', () => {
  const build = (read: unknown) => {
    const facts = { forAccount: jest.fn(async () => read), knownPeople: jest.fn(async () => read) }
    const workspace = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'member' })) }
    return { controller: new AccountFactsController(facts as never, workspace as never), facts }
  }

  it('range les faits du lecteur unique en fiche, pour l’espace actif et le demandeur', async () => {
    const { controller, facts } = build({
      asOf: '2026-10-12T08:00:00.000Z',
      facts: [
        { date: '2025-01-01', kind: 'deal_won', label: 'TMA', weight: 1, ageDays: 400 },
        { date: '2026-09-02', kind: 'exchange', label: 'Appel reçu', weight: 1, ageDays: 40 },
      ],
    })
    const brief = await controller.brief({ userId: 'u1' } as never, ACCOUNT)
    expect(accountFactsBriefSchema.safeParse(brief).success).toBe(true)
    expect(brief.deals).toHaveLength(1)
    expect(brief.exchanges).toHaveLength(1)
    expect(facts.forAccount).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'u1', accountId: ACCOUNT })
  })

  it('un compte hors de l’espace répond 404, jamais une fiche vide', async () => {
    const { controller } = build(null)
    await expect(controller.brief({ userId: 'u1' } as never, ACCOUNT)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('#4072.1 — les personnes connues : lues pour l’espace actif, 404 hors espace', async () => {
    const { controller, facts } = build({ people: [{ fullName: 'Hélène Garreau', reasons: ['crm'], lastDate: null }] })
    expect((await controller.knownPeople({ userId: 'u1' } as never, ACCOUNT)).people).toHaveLength(1)
    expect(facts.knownPeople).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: ACCOUNT })
    await expect(build(null).controller.knownPeople({ userId: 'u1' } as never, ACCOUNT)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
