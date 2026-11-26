import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { AccountFeedbackService, assembleFeedbackDirectives, DIRECTIVE_MAX_CHARS } from './account-feedback.service'

function row(partial: Partial<AccountFeedbackEntity>): AccountFeedbackEntity {
  return {
    id: 'fb-1',
    account_id: 'acc-1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    target: 'play',
    target_ref: 'Play cyber VINCI Energies',
    verdict: 'inutile',
    note: null,
    created_at: new Date('2026-07-16T08:00:00.000Z'),
    ...partial,
  } as AccountFeedbackEntity
}

describe('assembleFeedbackDirectives (assembleur déterministe — pas de LLM)', () => {
  it('returns an empty string when there is no feedback', () => {
    expect(assembleFeedbackDirectives([])).toBe('')
  })

  it('cites each feedback verbatim: target, ref, verdict directive, note and date', () => {
    const out = assembleFeedbackDirectives([
      row({
        target: 'contact',
        target_ref: 'Jean Dupont',
        verdict: 'obsolete',
        note: "N'est plus dans l'entreprise depuis mars.",
        created_at: new Date('2026-07-10T10:00:00.000Z'),
      }),
    ])
    expect(out).toBe(
      "- [contact] « Jean Dupont » signalé OBSOLÈTE par l'utilisateur — ne pas le réutiliser tel quel" +
        " — retour cité : « N'est plus dans l'entreprise depuis mars. » (2026-07-10)",
    )
  })

  it('renders one deterministic directive per verdict', () => {
    const verdicts = ['utile', 'inutile', 'faux', 'obsolete'] as const
    const out = assembleFeedbackDirectives(
      verdicts.map((verdict, i) => row({ id: `fb-${i}`, verdict, target_ref: `ref-${i}` })),
    )
    expect(out).toContain('jugé UTILE')
    expect(out).toContain('jugé INUTILE / hors sujet')
    expect(out).toContain('signalé FAUX')
    expect(out).toContain('signalé OBSOLÈTE')
  })

  // #2076.9-.12 — « Première preuve sur une situation connue » : trois
  // verdicts neufs (juste/partiel/manquant), même assembleur déterministe.
  it('renders one deterministic directive per NEW analysis-accuracy verdict', () => {
    const verdicts = ['juste', 'partiel', 'manquant'] as const
    const out = assembleFeedbackDirectives(
      verdicts.map((verdict, i) => row({ id: `fb-acc-${i}`, target: 'global', verdict, target_ref: '' })),
    )
    expect(out).toContain('jugée JUSTE')
    expect(out).toContain('jugée PARTIELLE')
    expect(out).toContain('signalée INCOMPLÈTE')
  })

  it('omits the « ref » part for a global feedback without targetRef', () => {
    const out = assembleFeedbackDirectives([row({ target: 'global', target_ref: '', verdict: 'utile' })])
    expect(out).toContain('- [dossier] jugé UTILE')
    expect(out).not.toContain('«  »')
  })

  it('sorts newest first and dedupes identical (target, ref, verdict) keeping the latest', () => {
    const out = assembleFeedbackDirectives([
      row({ id: 'old', note: 'ancien retour', created_at: new Date('2026-07-01T00:00:00.000Z') }),
      row({ id: 'new', note: 'retour récent', created_at: new Date('2026-07-15T00:00:00.000Z') }),
      row({
        id: 'other',
        target: 'signal',
        target_ref: 'Levée de fonds 2021',
        verdict: 'faux',
        created_at: new Date('2026-07-08T00:00:00.000Z'),
      }),
    ])
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('retour récent')
    expect(out).not.toContain('ancien retour')
    expect(lines[1]).toContain('Levée de fonds 2021')
  })

  it('caps the number of lines and the total char budget', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      row({
        id: `fb-${i}`,
        target_ref: `Play ${i} — ${'x'.repeat(120)}`,
        note: 'n'.repeat(300),
        created_at: new Date(Date.UTC(2026, 6, 1, 0, 0, i)),
      }),
    )
    const out = assembleFeedbackDirectives(many)
    expect(out.split('\n').length).toBeLessThanOrEqual(20)
    expect(out.length).toBeLessThanOrEqual(DIRECTIVE_MAX_CHARS)
    // Note snippets are bounded (they are quoted verbatim in a prompt).
    expect(out).not.toContain('n'.repeat(201))
  })

  it('is deterministic: same rows in any order → same output', () => {
    const rows = [
      row({ id: 'a', target_ref: 'Play A', created_at: new Date('2026-07-01T00:00:00.000Z') }),
      row({
        id: 'b',
        target: 'contact',
        target_ref: 'Contact B',
        verdict: 'obsolete',
        created_at: new Date('2026-07-02T00:00:00.000Z'),
      }),
      row({
        id: 'c',
        target: 'signal',
        target_ref: 'Signal C',
        verdict: 'faux',
        created_at: new Date('2026-07-03T00:00:00.000Z'),
      }),
    ]
    const forward = assembleFeedbackDirectives(rows)
    const reversed = assembleFeedbackDirectives([...rows].reverse())
    expect(forward).toBe(reversed)
  })
})

describe('AccountFeedbackService', () => {
  let repo: MockRepository<AccountFeedbackEntity>
  let service: AccountFeedbackService

  beforeEach(() => {
    repo = createMockRepository<AccountFeedbackEntity>()
    service = new AccountFeedbackService(repo as never)
  })

  it('create stamps identity from the caller (JWT/workspace), never the body', async () => {
    repo.save.mockImplementation(async (e: Partial<AccountFeedbackEntity>) => ({
      ...e,
      id: 'fb-9',
      created_at: new Date('2026-07-16T08:00:00.000Z'),
    }))
    const item = await service.create({
      accountId: 'acc-1',
      workspaceId: 'ws-1',
      userId: 'u-1',
      target: 'play',
      targetRef: '  Play cyber  ',
      verdict: 'inutile',
      note: undefined,
    })
    expect(repo.create).toHaveBeenCalledWith({
      account_id: 'acc-1',
      workspace_id: 'ws-1',
      user_id: 'u-1',
      target: 'play',
      target_ref: 'Play cyber',
      verdict: 'inutile',
      note: null,
      // La portée la plus fermée, écrite au site d'écriture et non laissée au
      // défaut SQL : un retour ne se réutilise que sur décision (GA-47).
      reuse_scope: 'tenant_private',
    })
    expect(item).toEqual({
      id: 'fb-9',
      target: 'play',
      targetRef: 'Play cyber',
      verdict: 'inutile',
      note: null,
      createdAt: '2026-07-16T08:00:00.000Z',
    })
  })

  it('listForAccount scopes by account AND workspace (never another team)', async () => {
    repo.find.mockResolvedValue([row({})])
    const items = await service.listForAccount('acc-1', 'ws-1')
    expect(repo.find).toHaveBeenCalledWith({
      where: { account_id: 'acc-1', workspace_id: 'ws-1' },
      order: { created_at: 'DESC' },
      take: 200,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.targetRef).toBe('Play cyber VINCI Energies')
  })

  it('directivesFor gathers the workspace memory for the company (re-run = new account row, same company)', async () => {
    repo._qb.getMany.mockResolvedValue([row({ verdict: 'faux', target: 'signal', target_ref: 'Budget IT 12M€' })])
    const directives = await service.directivesFor({
      accountId: 'acc-2',
      workspaceId: 'ws-1',
      companyName: 'VINCI',
    })
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('f')
    expect(repo._qb.innerJoin).toHaveBeenCalled()
    expect(repo._qb.where).toHaveBeenCalledWith('f.workspace_id = :ws', { ws: 'ws-1' })
    expect(repo._qb.andWhere).toHaveBeenCalledWith('LOWER(a.company_name) = LOWER(:name)', { name: 'VINCI' })
    expect(directives).toContain('Budget IT 12M€')
    expect(directives).toContain('signalé FAUX')
  })

  it('directivesFor falls back to the account scope when the workspace is unknown', async () => {
    repo._qb.getMany.mockResolvedValue([])
    await service.directivesFor({ accountId: 'acc-3', workspaceId: null, companyName: 'VINCI' })
    expect(repo._qb.where).toHaveBeenCalledWith('f.account_id = :id', { id: 'acc-3' })
  })

  it('directivesFor degrades to an empty block on store failure (never blocks a run)', async () => {
    repo._qb.getMany.mockRejectedValue(new Error('db down'))
    await expect(
      service.directivesFor({ accountId: 'acc-1', workspaceId: 'ws-1', companyName: 'VINCI' }),
    ).resolves.toBe('')
  })
})
