import { PlanItemContactBackfillService } from './plan-item-contact-backfill.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { Repository } from 'typeorm'

/**
 * #4521.1 — rattrapage CIBLÉ des étapes de plan ouvertes sans contact (doctrine #2543). Un contact n'est rattaché
 * que SANS AMBIGUÏTÉ ; un `contact_id` posé n'est jamais remplacé ; rejouer n'écrit rien de plus.
 */
const WS = 'ws-1'
const OTHER_WS = 'ws-2'

type Row = {
  id: string
  account_id: string
  label: string
  done: boolean
  execution_status: string
  contact_id: string | null
}

function step(id: string, account_id: string, label: string, overrides: Partial<Row> = {}): Row {
  return { id, account_id, label, done: false, execution_status: 'todo', contact_id: null, ...overrides }
}
const contact = (id: string, account_id: string, full_name: string) => ({ id, account_id, full_name })

describe('PlanItemContactBackfillService — #4521.1', () => {
  let service: PlanItemContactBackfillService
  let items: MockRepository<ActionPlanItemEntity>
  let accounts: MockRepository<AccountEntity>
  let contacts: MockRepository<ContactEntity>
  let rows: Row[]
  let book: Array<ReturnType<typeof contact>>
  let accountRows: Array<{ id: string; workspace_id: string }>

  const inIds = (value: unknown): string[] => (value as { _value: string[] })._value

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    accounts = createMockRepository<AccountEntity>()
    contacts = createMockRepository<ContactEntity>()
    accountRows = [
      { id: 'acc-1', workspace_id: WS },
      { id: 'acc-2', workspace_id: WS },
      { id: 'acc-3', workspace_id: WS },
      { id: 'acc-other', workspace_id: OTHER_WS },
    ]
    book = [
      contact('c-solo', 'acc-1', 'Muriel Kumpflen'),
      contact('c-a', 'acc-2', 'Paul Durand'),
      contact('c-b', 'acc-2', 'Anne Martin'),
      contact('c-x', 'acc-other', 'Eve Autre'),
    ]
    rows = [
      step('s-solo', 'acc-1', 'Envoyer un email J1 au DG'),
      step('s-named', 'acc-2', 'Relancer Anne Martin (DSI) par e-mail'),
      step('s-accent', 'acc-2', 'Appeler paul DURAND'),
      step('s-ambiguous', 'acc-2', 'Envoyer un email J1 au DG'),
      step('s-none', 'acc-3', 'Envoyer un email J1 au DG'),
      step('s-kept', 'acc-2', 'Relancer Anne Martin', { contact_id: 'c-a' }),
      step('s-done', 'acc-1', 'Envoyer un email', { done: true, execution_status: 'done' }),
      step('s-foreign', 'acc-other', 'Relancer Eve Autre'),
    ]
    accounts.find.mockImplementation(async (opts: { where: { workspace_id: string } }) =>
      accountRows.filter(a => a.workspace_id === opts.where.workspace_id),
    )
    contacts.find.mockImplementation(async (opts: { where: { account_id: unknown } }) =>
      book.filter(c => inIds(opts.where.account_id).includes(c.account_id)),
    )
    items.find.mockImplementation(async (opts: { where: { account_id: unknown } }) =>
      rows.filter(
        r =>
          inIds(opts.where.account_id).includes(r.account_id) &&
          !r.done &&
          r.execution_status !== 'obsolete' &&
          r.contact_id === null,
      ),
    )
    items.count.mockImplementation(
      async (opts: { where: { account_id: unknown } }) =>
        rows.filter(r => inIds(opts.where.account_id).includes(r.account_id) && !r.done && r.contact_id !== null)
          .length,
    )
    items.update.mockImplementation(
      async (criteria: { id: string; account_id: unknown }, patch: { contact_id: string }) => {
        const row = rows.find(r => r.id === criteria.id && inIds(criteria.account_id).includes(r.account_id))
        if (!row || row.contact_id !== null) return { affected: 0 }
        row.contact_id = patch.contact_id
        return { affected: 1 }
      },
    )
    // Les doubles de `test-utils` ne portent pas les 33 membres de `Repository` (target, metadata,
    // hasId…) : le motif du dépôt est le cast au point d'injection, pas un mock qui les imite tous.
    service = new PlanItemContactBackfillService(
      items as unknown as Repository<ActionPlanItemEntity>,
      accounts as unknown as Repository<AccountEntity>,
      contacts as unknown as Repository<ContactEntity>,
    )
  })

  it('simulation : rend les compteurs et n’écrit RIEN', async () => {
    const result = await service.run(WS, { dryRun: true })
    expect(result).toEqual({ dryRun: true, examined: 5, attached: 3, ambiguous: 2, alreadyAttached: 1 })
    expect(items.update).not.toHaveBeenCalled()
    expect(rows.find(r => r.id === 's-solo')?.contact_id).toBeNull()
  })

  it('rattache le contact unique du compte, ou celui dont le nom complet figure dans le libellé', async () => {
    await service.run(WS, { dryRun: false })
    expect(rows.find(r => r.id === 's-solo')?.contact_id).toBe('c-solo')
    expect(rows.find(r => r.id === 's-named')?.contact_id).toBe('c-b')
    expect(rows.find(r => r.id === 's-accent')?.contact_id).toBe('c-a')
  })

  it('un compte à deux contacts sans nom dans le libellé reste intact ; un compte sans contact aussi', async () => {
    await service.run(WS, { dryRun: false })
    expect(rows.find(r => r.id === 's-ambiguous')?.contact_id).toBeNull()
    expect(rows.find(r => r.id === 's-none')?.contact_id).toBeNull()
  })

  it('n’écrase JAMAIS un contact_id déjà posé, et ne touche ni les étapes closes ni un autre espace', async () => {
    await service.run(WS, { dryRun: false })
    expect(rows.find(r => r.id === 's-kept')?.contact_id).toBe('c-a')
    expect(rows.find(r => r.id === 's-done')?.contact_id).toBeNull()
    expect(rows.find(r => r.id === 's-foreign')?.contact_id).toBeNull()
  })

  it('rejouer deux fois n’écrit rien de plus', async () => {
    await service.run(WS, { dryRun: false })
    const writes = items.update.mock.calls.length
    const second = await service.run(WS, { dryRun: false })
    expect(items.update.mock.calls.length).toBe(writes)
    expect(second).toMatchObject({ attached: 0, ambiguous: 2, alreadyAttached: 4 })
  })

  it('chaque écriture est bornée à l’espace (comptes de l’espace) et à contact_id NULL', async () => {
    await service.run(WS, { dryRun: false })
    for (const [criteria] of items.update.mock.calls) {
      expect(inIds((criteria as { account_id: unknown }).account_id)).not.toContain('acc-other')
      expect(Object.keys(criteria as object)).toEqual(expect.arrayContaining(['id', 'account_id', 'contact_id']))
    }
  })

  it('un espace sans compte : zéro partout, aucune lecture de contacts', async () => {
    const result = await service.run('ws-vide', { dryRun: false })
    expect(result).toEqual({ dryRun: false, examined: 0, attached: 0, ambiguous: 0, alreadyAttached: 0 })
    expect(contacts.find).not.toHaveBeenCalled()
  })
})
