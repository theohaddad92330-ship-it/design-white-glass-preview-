/**
 * #4928.5 — « Écarter les contacts de cette entité » : un geste qui MODIFIE de la donnée.
 *
 * Qui peut : tout siège avec `records:write` dans l'espace ACTIF (comme `:id/exclude`, un contact à la fois) ;
 * le cloisonnement existant n'est pas touché — le compte se lit borné à l'espace, et au périmètre BU de l'appelant.
 * On archive, on ne supprime pas : `excluded_at` + motif, réversible par `restoreContact`.
 */
import { ContactsService } from './contacts.service'
import { ContactsController } from './contacts.controller'

const contact = (id: string, entity: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  account_id: 'acc-1',
  workspace_id: 'ws-1',
  full_name: `P ${id}`,
  entity,
  excluded_at: null,
  deleted_at: null,
  ...extra,
})

function build(opts: { inScope?: boolean; account?: unknown; rows?: unknown[] } = {}) {
  const update = jest.fn().mockResolvedValue(undefined)
  const excludeContact = jest.fn().mockResolvedValue({ type: 'success', output: {} })
  const accounts = {
    findOne: jest.fn().mockResolvedValue('account' in opts ? opts.account : { id: 'acc-1', workspace_id: 'ws-1' }),
  }
  const find = jest.fn().mockResolvedValue(opts.rows ?? [])
  const service = Object.assign(Object.create(ContactsService.prototype), {
    workspaceContext: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) },
    accountIsInScope: jest.fn().mockResolvedValue(opts.inScope ?? true),
    accounts,
    contacts: { find, update },
    excludeContact,
    invalidateRecommendedPath: jest.fn(),
  }) as ContactsService
  return { service, update, excludeContact, accounts, find }
}

describe('#4928.5 — excludeEntityContacts', () => {
  it('écarte chaque contact rattaché à CETTE entité (noms normalisés), avec le motif, et pas les autres', async () => {
    const { service, excludeContact } = build({
      rows: [
        contact('a', 'Boulangerie Ange'),
        contact('b', ' boulangerie  ANGE '),
        contact('c', 'Boulanger SA'),
        contact('d', null),
      ],
    })
    const res = await service.excludeEntityContacts('acc-1', 'user-1', 'Boulangerie Ange', 'mauvaise entité')
    expect(res).toMatchObject({
      type: 'success',
      output: { account_id: 'acc-1', excluded: 2, contact_ids: ['a', 'b'] },
    })
    expect(excludeContact.mock.calls.map(call => call[0])).toEqual(['a', 'b'])
    expect(excludeContact.mock.calls[0][2]).toContain('mauvaise entité')
  })

  it('un contact déjà écarté n’est pas retouché (le motif humain d’origine reste)', async () => {
    const { service, excludeContact, find } = build({ rows: [] })
    await service.excludeEntityContacts('acc-1', 'user-1', 'Boulangerie Ange', 'x')
    expect(JSON.stringify(find.mock.calls[0][0].where)).toContain('excluded_at')
    expect(excludeContact).not.toHaveBeenCalled()
  })

  it('REFUS — compte d’un AUTRE espace : not_found, rien n’est lu ni écrit', async () => {
    const { service, excludeContact, find } = build({ account: null })
    const res = await service.excludeEntityContacts('acc-other', 'user-1', 'Boulangerie Ange', 'x')
    expect(res).toMatchObject({ type: 'failure', problem: { code: 'not_found' } })
    expect(find).not.toHaveBeenCalled()
    expect(excludeContact).not.toHaveBeenCalled()
  })

  it('REFUS — compte hors du périmètre BU de l’appelant : not_found, rien n’est écrit', async () => {
    const { service, excludeContact, find } = build({ inScope: false, rows: [contact('a', 'Boulangerie Ange')] })
    const res = await service.excludeEntityContacts('acc-1', 'user-1', 'Boulangerie Ange', 'x', {
      businessUnitIds: ['bu-2'],
    } as never)
    expect(res).toMatchObject({ type: 'failure', problem: { code: 'not_found' } })
    expect(find).not.toHaveBeenCalled()
    expect(excludeContact).not.toHaveBeenCalled()
  })

  it('REFUS — motif vide ou entité vide : invalid, rien n’est écrit (jamais « écarter tout le compte »)', async () => {
    const { service, excludeContact } = build({ rows: [contact('a', null), contact('b', '')] })
    expect(await service.excludeEntityContacts('acc-1', 'user-1', 'Ange', '   ')).toMatchObject({
      type: 'failure',
      problem: { code: 'invalid' },
    })
    expect(await service.excludeEntityContacts('acc-1', 'user-1', '  ', 'x')).toMatchObject({
      type: 'failure',
      problem: { code: 'invalid' },
    })
    expect(excludeContact).not.toHaveBeenCalled()
  })
})

describe('#4928.5 — la route est gardée', () => {
  it('POST account/:accountId/exclude-entity exige records:write (un lecteur est refusé)', () => {
    const handler = ContactsController.prototype.excludeEntity
    expect(handler).toBeDefined()
    const keys = Reflect.getMetadataKeys(handler)
    const permissions = keys.map(key => Reflect.getMetadata(key, handler))
    expect(JSON.stringify(permissions)).toContain('records:write')
    expect(Reflect.getMetadata('path', handler)).toBe('account/:accountId/exclude-entity')
  })
})

describe('#4928.5 — restoreEntityContacts (le geste inverse)', () => {
  const excluded = (id: string, entity: string | null, reason: string) =>
    contact(id, entity, { excluded_at: new Date(), exclusion_reason: reason })

  it('réintègre les contacts écartés AVEC l’entité, et pas ceux écartés à la main pour un autre motif', async () => {
    const { service, restoreContact } = buildRestore({
      rows: [
        excluded('a', 'Boulangerie Ange', 'entité écartée (Boulangerie Ange) : mauvaise entité'),
        excluded('b', 'Boulangerie Ange', 'a quitté l’entreprise'),
        excluded('c', 'Boulanger SA', 'entité écartée (Boulanger SA) : x'),
      ],
    })
    const res = await service.restoreEntityContacts('acc-1', 'user-1', 'Boulangerie Ange')
    expect(res).toMatchObject({ type: 'success', output: { restored: 1, contact_ids: ['a'] } })
    expect(restoreContact.mock.calls.map(call => call[0])).toEqual(['a'])
  })

  it('REFUS — compte d’un AUTRE espace : not_found, rien n’est lu ni réintégré', async () => {
    const { service, restoreContact, find } = buildRestore({ account: null })
    const res = await service.restoreEntityContacts('acc-other', 'user-1', 'Ange')
    expect(res).toMatchObject({ type: 'failure', problem: { code: 'not_found' } })
    expect(find).not.toHaveBeenCalled()
    expect(restoreContact).not.toHaveBeenCalled()
  })

  it('REFUS — hors du périmètre BU, ou entité vide : rien n’est réintégré', async () => {
    const out = buildRestore({ inScope: false })
    expect(
      await out.service.restoreEntityContacts('acc-1', 'user-1', 'Ange', { businessUnitIds: ['bu-2'] } as never),
    ).toMatchObject({ type: 'failure', problem: { code: 'not_found' } })
    const empty = buildRestore({})
    expect(await empty.service.restoreEntityContacts('acc-1', 'user-1', '  ')).toMatchObject({
      type: 'failure',
      problem: { code: 'invalid' },
    })
    expect(out.restoreContact).not.toHaveBeenCalled()
    expect(empty.restoreContact).not.toHaveBeenCalled()
  })

  it('POST account/:accountId/restore-entity exige records:write (un lecteur est refusé)', () => {
    const handler = ContactsController.prototype.restoreEntity
    expect(handler).toBeDefined()
    const permissions = Reflect.getMetadataKeys(handler).map(key => Reflect.getMetadata(key, handler))
    expect(JSON.stringify(permissions)).toContain('records:write')
    expect(Reflect.getMetadata('path', handler)).toBe('account/:accountId/restore-entity')
  })
})

function buildRestore(opts: { inScope?: boolean; account?: unknown; rows?: unknown[] }) {
  const { service, find } = build(opts)
  const restoreContact = jest.fn().mockResolvedValue({ type: 'success', output: {} })
  Object.assign(service, { restoreContact })
  return { service, find, restoreContact }
}
