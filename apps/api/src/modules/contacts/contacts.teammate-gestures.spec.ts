import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

/**
 * #4731 (suite du lot A, PR #4769) — UN COÉQUIPIER AGIT SUR UN CONTACT QU'UN AUTRE A RAMENÉ.
 *
 * `AccountsService` a été ouvert à l'espace ; ce service portait la MÊME barrière : ses gestes d'écriture lisaient
 * `WHERE id = ? AND user_id = <appelant>` — un filtre de PROPRIÉTÉ, pas de droit. Le coéquipier voyait le contact
 * (les lectures passent par l'espace) et son geste répondait « introuvable ». Doctrine c76 : le rôle change l'ordre,
 * jamais le contenu — a fortiori pas « qui a lancé l'analyse ».
 *
 * Le dépôt ci-dessous applique RÉELLEMENT les filtres `where` : un filtre de propriété oublié échoue ici, comme un
 * filtre d'espace retiré (un autre espace reste refusé).
 */
type Row = Record<string, unknown>

const USERS: Record<string, string> = { 'user-a': 'ws-1', 'user-b': 'ws-1', 'user-c': 'ws-2' }

function build() {
  const row: Row = {
    id: 'c-1',
    user_id: 'user-a',
    workspace_id: 'ws-1',
    account_id: null,
    deleted_at: null,
    full_name: 'Jeanne Martin',
    excluded_at: null,
    exclusion_reason: null,
    hidden: false,
    user_status: null,
    note: null,
    email_message: null,
    email: 'jeanne@example.test',
  }
  /**
   * TypeORM, tel qu'il se comporte vraiment : un `where` TABLEAU est un OU, et une
   * valeur peut être un `FindOperator` (`IsNull()`, `In([…])`) plutôt qu'une valeur
   * brute. La barrière de #4731 est précisément un OU de deux clauses — un mock qui
   * ne lit qu'un objet unique ne matche JAMAIS et fait échouer les six gestes en
   * accusant le code. Un opérateur non simulé lève : ce dépôt dit NON bruyamment
   * plutôt que de rendre un faux « introuvable ».
   */
  const valueMatches = (actual: unknown, expected: unknown): boolean => {
    const op = expected as { _type?: unknown; _value?: unknown } | null
    if (op && typeof op === 'object' && typeof op._type === 'string') {
      if (op._type === 'isNull') return actual === null || actual === undefined
      if (op._type === 'in') return Array.isArray(op._value) && op._value.includes(actual)
      throw new Error(`opérateur TypeORM non simulé dans ce dépôt : ${op._type}`)
    }
    return actual === expected
  }
  const matchesOne = (r: Row, where: Row) => Object.entries(where).every(([k, v]) => valueMatches(r[k], v))
  const matches = (r: Row, where: Row | Row[]) =>
    Array.isArray(where) ? where.some(clause => matchesOne(r, clause)) : matchesOne(r, where)
  const repo = createMockRepository<never>()
  repo.findOne.mockImplementation((async (opts: { where: Row | Row[] }) =>
    matches(row, opts.where) ? row : null) as never)
  repo.save.mockImplementation((async (entity: Row) => Object.assign(row, entity)) as never)
  repo.update.mockImplementation((async (where: Row | Row[], patch: Row) => {
    if (!matches(row, where)) return { affected: 0 }
    Object.assign(row, patch)
    return { affected: 1 }
  }) as never)
  ;(repo as unknown as { manager: unknown }).manager = { query: jest.fn().mockResolvedValue([[], 0]) }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: USERS[userId], role: 'member' })),
  }
  const args: unknown[] = new Array(15).fill({})
  args[0] = repo
  args[4] = workspaceContext
  args[7] = { get: () => undefined }
  const service = new ContactsService(...(args as ConstructorParameters<typeof ContactsService>))
  return { service, row }
}

function failureCode(result: { type: string; problem?: unknown }): string | null {
  return result.type === 'failure' ? (result.problem as { code: string }).code : null
}

describe('#4731 — les gestes sur un contact sont ouverts à tout l’espace', () => {
  it('un coéquipier change le statut', async () => {
    const { service, row } = build()
    const result = await service.updateStatus('c-1', 'user-b', 'contacted')
    expect(result.type).toBe('success')
    expect(row.user_status).toBe('contacted')
  })

  it('un coéquipier pose une note', async () => {
    const { service, row } = build()
    const result = await service.updateNote('c-1', 'user-b', 'à rappeler jeudi')
    expect(result.type).toBe('success')
    expect(row.note).toBe('à rappeler jeudi')
  })

  it('un coéquipier rédige (enregistre le brouillon du message)', async () => {
    const { service } = build()
    const result = await service.saveEmailDraft('c-1', 'user-b', { subject: 'Bonjour', body: 'Texte' } as never)
    expect(result.type).toBe('success')
  })

  it('un coéquipier prépare le message', async () => {
    const { service } = build()
    const result = await service.prepareEmail('c-1', 'user-b')
    expect(failureCode(result)).not.toBe('not_found')
  })

  it('un coéquipier confirme l’identité, masque, écarte puis réintègre', async () => {
    const { service, row } = build()
    expect((await service.confirmIdentity('c-1', 'user-b')).type).toBe('success')
    expect((await service.setHidden('c-1', 'user-b', true)).type).toBe('success')
    expect(row.hidden).toBe(true)
    expect((await service.excludeContact('c-1', 'user-b', 'a quitté')).type).toBe('success')
    expect(row.excluded_at).toBeInstanceOf(Date)
    expect((await service.restoreContact('c-1', 'user-b')).type).toBe('success')
    expect(row.excluded_at).toBeNull()
  })

  it('le pré-contrôle d’enrichissement trouve le contact d’un coéquipier', async () => {
    const { service } = build()
    const result = await service.preflightEnrichment('c-1', 'user-b', { free: true })
    expect(failureCode(result)).not.toBe('not_found')
  })

  it('un utilisateur d’un AUTRE espace reste refusé, sans écriture', async () => {
    const { service, row } = build()
    for (const result of [
      await service.updateStatus('c-1', 'user-c', 'contacted'),
      await service.updateNote('c-1', 'user-c', 'x'),
      await service.confirmIdentity('c-1', 'user-c'),
      await service.setHidden('c-1', 'user-c', true),
      await service.excludeContact('c-1', 'user-c', 'x'),
      await service.restoreContact('c-1', 'user-c'),
      await service.preflightEnrichment('c-1', 'user-c', { free: true }),
    ]) {
      expect(failureCode(result)).toBe('not_found')
    }
    expect(row.note).toBeNull()
    expect(row.hidden).toBe(false)
  })
})
