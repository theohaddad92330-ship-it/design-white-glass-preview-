import { ConflictException, NotFoundException } from '@nestjs/common'
import { CrmImportService } from './crm-import.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const EVENT_AT = new Date('2026-10-14T04:55:00.000Z')

/**
 * #4189.9 — « Garder la valeur du CRM » : un geste utilisateur (porte auto-approuvée) qui fait
 * remplacer NOTRE valeur par celle du CRM, tracé dans l'historique de la fiche. Une correction
 * humaine POSTÉRIEURE au passage n'est jamais réécrasée.
 */
function build(opts: { event?: Record<string, unknown> | null; detailed?: Record<string, unknown> } = {}) {
  const event =
    opts.event === undefined
      ? {
          id: 'e1',
          workspace_id: WORKSPACE,
          entity_type: 'contact',
          internal_id: CONTACT,
          action: 'conflict',
          created_at: EVENT_AT,
          proposal: { email: { bellum: 'corrige@acme.fr', crm: 'autre@crm.fr' } },
        }
      : opts.event
  const events = { findOne: jest.fn(async () => event), update: jest.fn(async () => ({ affected: 1 })) }
  const contacts = {
    update: jest.fn(async () => ({ affected: 1 })),
    findOne: jest.fn(async () => ({ email: 'corrige@acme.fr', full_name: 'A B' })),
  }
  const accounts = {
    update: jest.fn(async () => ({ affected: 1 })),
    findOne: jest.fn(async () => ({ company_name: 'Acme' })),
  }
  const provenance = {
    currentSourcesDetailed: jest.fn(async () => opts.detailed ?? {}),
    commit: jest.fn(async () => undefined),
  }
  const service = new CrmImportService(
    {} as never,
    {} as never,
    events as never,
    contacts as never,
    accounts as never,
    { resolveActiveWorkspace: async () => ({ workspaceId: WORKSPACE }) } as never,
    provenance as never,
  )
  return { service, events, contacts, accounts, provenance }
}

describe('CrmImportService.keepCrmValue (#4189.9)', () => {
  it('la valeur du CRM remplace la nôtre, tracée en source humaine avec l’ancienne valeur', async () => {
    const { service, contacts, provenance } = build()
    await service.keepCrmValue(USER, { eventId: 'e1', field: 'email' })
    expect(contacts.update).toHaveBeenCalledWith({ id: CONTACT }, { email: 'autre@crm.fr' })
    expect(provenance.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE,
        entityType: 'contact',
        entityId: CONTACT,
        source: 'human',
        actorId: USER,
        changes: [{ field: 'email', oldValue: 'corrige@acme.fr', newValue: 'autre@crm.fr' }],
      }),
    )
  })

  it('sur une société, le champ est le nom', async () => {
    const { service, accounts } = build({
      event: {
        id: 'e2',
        workspace_id: WORKSPACE,
        entity_type: 'account',
        internal_id: ACCOUNT,
        action: 'conflict',
        created_at: EVENT_AT,
        proposal: { company_name: { bellum: 'Acme', crm: 'Acme SAS' } },
      },
    })
    await service.keepCrmValue(USER, { eventId: 'e2', field: 'company_name' })
    expect(accounts.update).toHaveBeenCalledWith({ id: ACCOUNT }, { company_name: 'Acme SAS' })
  })

  it('⚠️ SAIT DIRE NON — une correction humaine POSTÉRIEURE au passage n’est jamais réécrasée', async () => {
    const { service, contacts, provenance } = build({
      detailed: { email: { source: 'human', observedAt: '2026-10-15T09:00:00.000Z' } },
    })
    await expect(service.keepCrmValue(USER, { eventId: 'e1', field: 'email' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(contacts.update).not.toHaveBeenCalled()
    expect(provenance.commit).not.toHaveBeenCalled()
  })

  it('une correction humaine ANTÉRIEURE au passage (celle que le conflit protège) n’empêche pas le geste', async () => {
    const { service, contacts } = build({
      detailed: { email: { source: 'human', observedAt: '2026-10-01T09:00:00.000Z' } },
    })
    await service.keepCrmValue(USER, { eventId: 'e1', field: 'email' })
    expect(contacts.update).toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — un champ qui n’est pas dans la proposition est refusé', async () => {
    const { service, contacts } = build()
    await expect(service.keepCrmValue(USER, { eventId: 'e1', field: 'full_name' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — un conflit inconnu ou d’un autre espace est refusé', async () => {
    const { service, contacts } = build({ event: null })
    await expect(service.keepCrmValue(USER, { eventId: 'x', field: 'email' })).rejects.toBeInstanceOf(NotFoundException)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — un CRM qui n’annonce aucune valeur n’efface jamais la nôtre', async () => {
    const { service, contacts } = build({
      event: {
        id: 'e1',
        workspace_id: WORKSPACE,
        entity_type: 'contact',
        internal_id: CONTACT,
        action: 'conflict',
        created_at: EVENT_AT,
        proposal: { email: { bellum: 'corrige@acme.fr', crm: null } },
      },
    })
    await expect(service.keepCrmValue(USER, { eventId: 'e1', field: 'email' })).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(contacts.update).not.toHaveBeenCalled()
  })
})

/**
 * Théo D settings-integrations.N3 — « Bellum » dans l'onglet À relire : un choix qui se RETIENT. Sans trace, le même
 * écart reviendrait à chaque passage ; avec elle, il sort de la liste. Rien n'est écrit sur la fiche : la valeur
 * gardée est déjà celle de Bellum.
 */
describe('CrmImportService.keepBellumValue (Théo D settings-integrations.N3)', () => {
  it('retient le choix sur l’écart et n’écrit rien sur la fiche', async () => {
    const { service, events, contacts, accounts, provenance } = build()
    await service.keepBellumValue(USER, { eventId: 'e1', field: 'email' })
    expect(events.update).toHaveBeenCalledWith({ id: 'e1' }, { kept_fields: ['email'] })
    expect(contacts.update).not.toHaveBeenCalled()
    expect(accounts.update).not.toHaveBeenCalled()
    expect(provenance.commit).not.toHaveBeenCalled()
  })

  it('ne perd pas un choix déjà retenu sur un autre champ du même écart', async () => {
    const { service, events } = build({
      event: {
        id: 'e1',
        workspace_id: WORKSPACE,
        entity_type: 'contact',
        internal_id: CONTACT,
        action: 'conflict',
        created_at: EVENT_AT,
        kept_fields: ['full_name'],
        proposal: {
          email: { bellum: 'a', crm: 'b' },
          full_name: { bellum: 'c', crm: 'd' },
        },
      },
    })
    await service.keepBellumValue(USER, { eventId: 'e1', field: 'email' })
    expect(events.update).toHaveBeenCalledWith({ id: 'e1' }, { kept_fields: ['full_name', 'email'] })
  })

  it('⚠️ SAIT DIRE NON — un écart qui n’existe plus (ou un champ absent de la proposition) est refusé', async () => {
    await expect(
      build({ event: null }).service.keepBellumValue(USER, { eventId: 'x', field: 'email' }),
    ).rejects.toThrow(NotFoundException)
    await expect(build().service.keepBellumValue(USER, { eventId: 'e1', field: 'phone' })).rejects.toThrow(
      NotFoundException,
    )
  })
})
