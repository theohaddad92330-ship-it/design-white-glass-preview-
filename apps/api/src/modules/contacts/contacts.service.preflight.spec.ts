/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — `ContactsService.preflight`
 * assemble les lectures (contact, compte, homonymes, journal des champs) et rend le
 * contrôle compilé. Chaque lecture qui échoue se NOMME illisible — jamais « rien ».
 */
import { detectFieldConflict, type ConflictedField } from '@bellum/contracts'
import { isFailure, isSuccess } from '@bellum/utils'
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'

const build = () => {
  const contacts = createMockRepository()
  const accounts = createMockRepository()
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    accounts as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  return { service, contacts, accounts }
}

const CONTACT = {
  id: 'c-1',
  full_name: 'Siège technique',
  title: 'Directeur technique — entité numérique voyageurs',
  entity: 'SNCF Connect & Tech',
  source: 'ai_generated',
  raw_data: null,
  account_id: 'acc-1',
  hidden: false,
  excluded_at: null,
  lifecycle_state: null,
  recommendation_authorized_reason: null,
}

const SCOPED: ConflictedField = (() => {
  const conflict = detectFieldConflict({
    field: 'title',
    incomingValue: 'Directeur technique — entité numérique voyageurs',
    incomingSource: 'pipeline',
    incomingAt: '2026-10-05T10:00:00.000Z',
    currentValue: 'Directeur technique',
    currentSource: 'pipeline',
    currentObservedAt: '2026-09-21T10:00:00.000Z',
    incomingScope: 'Filiales',
    currentScope: 'Groupe entier',
  })
  if (!conflict) throw new Error('fixture')
  return conflict
})()

describe('ContactsService.preflight — #3219', () => {
  it('un contact introuvable dans l’espace rend `not_found`', async () => {
    const { service, contacts } = build()
    contacts.findOne.mockResolvedValue(null)
    const result = await service.preflight('c-x', 'u-1', { action: null, readConflicts: jest.fn() })
    expect(isFailure(result) && result.problem?.code).toBe('not_found')
  })

  it('assemble la différence de portée, et lit le périmètre sur la cartographie du compte', async () => {
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(CONTACT)
    contacts.find.mockResolvedValue([CONTACT])
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      company_name: 'SNCF',
      raw_analysis: { entities_exhaustive: [{ name: 'SNCF Connect & Tech', relevance: 'core' }] },
    })
    const readConflicts = jest.fn().mockResolvedValue([SCOPED])

    const result = await service.preflight('c-1', 'u-1', { action: 'prepare_message', readConflicts })

    expect(readConflicts).toHaveBeenCalledWith('ws-1', 'c-1')
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.action).toBe('prepare_message')
    expect(result.output.items.map(item => item.kind)).toEqual(['scope_difference'])
    expect(result.output.unknowns).toEqual([])
  })

  it('sait dire NON — journal ET compte illisibles : deux sections nommées, jamais « rien à signaler »', async () => {
    const { service, contacts, accounts } = build()
    contacts.findOne.mockResolvedValue(CONTACT)
    contacts.find.mockResolvedValue([CONTACT])
    accounts.findOne.mockRejectedValue(new Error('db down'))
    const readConflicts = jest.fn().mockRejectedValue(new Error('audit down'))

    const result = await service.preflight('c-1', 'u-1', { action: null, readConflicts })

    if (!isSuccess(result)) throw new Error('attendu: succès')
    expect(result.output.status).toBe('incomplete')
    expect(result.output.unknowns).toEqual([
      { section: 'field_conflicts', reason: 'unreadable' },
      { section: 'account_scope', reason: 'unreadable' },
    ])
  })
})
