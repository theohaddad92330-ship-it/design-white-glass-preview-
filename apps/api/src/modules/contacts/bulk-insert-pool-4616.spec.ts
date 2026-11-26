import type { EntityManager } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import { ContactsService } from './contacts.service'

/**
 * #4616 — le pool PostgreSQL saturait (« timeout exceeded when trying to connect »). Cause lue dans le code :
 * `saveContacts` ouvre une transaction (UNE connexion tenue) et `bulkInsert` y lisait encore sur le pool
 * GLOBAL — l'espace actif, les empreintes effacées, la provenance de chaque fiche fusionnée. Chaque analyse
 * tenait donc une connexion en attendant une deuxième : à charge, toutes les places sont tenues par des
 * appelants qui attendent tous une place (attente circulaire), jusqu'au délai de 10 s du pool.
 *
 * La règle tenue ici : sous une transaction, `bulkInsert` ne prend AUCUNE autre connexion.
 */
describe('#4616 — bulkInsert sous transaction ne prend aucune deuxième connexion', () => {
  const existing = {
    id: 'c-1',
    account_id: 'acc-1',
    full_name: 'Alice Martin',
    title: null,
    email: null,
    phone: null,
    linkedin_url: null,
    photo_url: null,
    raw_data: null,
    deleted_at: null,
  } as unknown as ContactEntity

  function build() {
    // Le pool GLOBAL : tout appel sur lui sous transaction est le défaut.
    const globalPool = jest.fn(() => {
      throw new Error('deuxième connexion prise sous transaction')
    })
    const globalContacts = { find: globalPool, save: globalPool, insert: globalPool }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const personErasures = { find: jest.fn().mockResolvedValue([]) }
    const provenance = { currentSources: jest.fn().mockResolvedValue({}) }

    const txContacts = {
      find: jest.fn().mockResolvedValue([existing]),
      save: jest.fn(async (rows: unknown) => rows),
      create: jest.fn((row: unknown) => row),
    }
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ContactEntity) return txContacts
        return { insert: jest.fn().mockResolvedValue(undefined), save: jest.fn().mockResolvedValue([]) }
      }),
      transaction: jest.fn(async (run: (inner: unknown) => Promise<unknown>) => run(manager)),
    } as unknown as EntityManager

    const args: unknown[] = new Array(26).fill({})
    args[0] = globalContacts
    args[4] = workspaceContext
    args[9] = { find: globalPool, findOne: globalPool }
    for (let i = 15; i < 26; i++) args[i] = undefined
    args[17] = provenance
    args[21] = personErasures
    const service = new ContactsService(...(args as ConstructorParameters<typeof ContactsService>))
    return { service, manager, workspaceContext, personErasures, provenance, globalPool }
  }

  it("prepareBulkInsert lit l'espace et les empreintes AVANT la transaction", async () => {
    const { service, workspaceContext, personErasures } = build()
    personErasures.find.mockResolvedValue([{ fingerprints: [] }])
    const prepared = await service.prepareBulkInsert('user-1')
    expect(prepared.workspaceId).toBe('ws-1')
    expect(prepared.erased.size).toBe(0)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(personErasures.find).toHaveBeenCalledTimes(1)
  })

  it('préparé + manager : ni espace, ni empreintes, ni provenance relus sur le pool global', async () => {
    const { service, manager, workspaceContext, personErasures, provenance, globalPool } = build()
    const prepared = { workspaceId: 'ws-1', erased: new Set<string>() }
    await service.bulkInsert(
      'acc-1',
      'user-1',
      [{ fullName: 'Alice Martin', title: 'DSI', linkedinUrl: '', city: '', country: '', source: 'apollo' }],
      manager,
      prepared,
    )
    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(personErasures.find).not.toHaveBeenCalled()
    expect(globalPool).not.toHaveBeenCalled()
    // La fiche fusionnée lit sa provenance sur la connexion de la transaction.
    expect(provenance.currentSources).toHaveBeenCalledWith('contact', 'c-1', manager)
  })

  it('sans préparation (appelants hors transaction) : le chemin historique reste inchangé', async () => {
    const { service, manager, workspaceContext, personErasures } = build()
    await service.bulkInsert(
      'acc-1',
      'user-1',
      [{ fullName: 'Bob Durand', title: '', linkedinUrl: '', city: '', country: '', source: 'apollo' }],
      manager,
    )
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(personErasures.find).toHaveBeenCalledTimes(1)
  })
})

describe('#4616 — ProvenanceService.currentSources suit la connexion qu’on lui passe', () => {
  it('avec un manager, lit sur lui et jamais sur le dépôt global', async () => {
    const globalFind = jest.fn()
    const txFind = jest.fn().mockResolvedValue([{ field: 'title', source: 'human' }])
    const manager = { getRepository: jest.fn(() => ({ find: txFind })) } as unknown as EntityManager
    const service = new ProvenanceService({ find: globalFind } as never, {} as never)
    expect(await service.currentSources('contact', 'c-1', manager)).toEqual({ title: 'human' })
    expect(manager.getRepository).toHaveBeenCalledWith(FieldProvenanceEntity)
    expect(globalFind).not.toHaveBeenCalled()
  })
})

/**
 * #4616 (jumeau, 27/10) — la phase 3 (`saveEnrichment` → `applyEnrichment`) tient elle aussi sa transaction,
 * et y faisait encore DEUX choses sur le pool global : lire la provenance de chaque contact, puis l'écrire —
 * `ProvenanceService.commit` ouvrait sa PROPRE transaction (une deuxième connexion tenue en même temps que la
 * première, et une provenance qui survivait au rollback de l'écriture qu'elle décrit).
 */
describe('#4616 — applyEnrichment sous transaction ne prend aucune deuxième connexion', () => {
  const target = {
    id: 'c-9',
    account_id: 'acc-1',
    workspace_id: 'ws-1',
    full_name: 'Alice Martin',
    title: null,
    email: null,
    phone: null,
    linkedin_url: null,
    raw_data: null,
    excluded_at: null,
    identity_confirmed_at: null,
    lifecycle_state: null,
  } as unknown as ContactEntity

  function build() {
    const globalPool = jest.fn(() => {
      throw new Error('deuxième connexion prise sous transaction')
    })
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(target),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    const txContacts = { createQueryBuilder: jest.fn(() => qb), update: jest.fn().mockResolvedValue(undefined) }
    const manager = {
      getRepository: jest.fn(() => txContacts),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager
    const provenance = {
      currentSources: jest.fn().mockResolvedValue({}),
      commit: jest.fn().mockResolvedValue(undefined),
    }
    const args: unknown[] = new Array(26).fill({})
    args[0] = { createQueryBuilder: globalPool, update: globalPool }
    for (let i = 15; i < 26; i++) args[i] = undefined
    args[17] = provenance
    const service = new ContactsService(...(args as ConstructorParameters<typeof ContactsService>))
    return { service, manager, provenance, globalPool }
  }

  it('lit ET écrit la provenance sur la connexion de la transaction', async () => {
    const { service, manager, provenance, globalPool } = build()
    const matched = await service.applyEnrichment(
      'acc-1',
      [{ fullName: 'Alice Martin', title: 'DSI', role: 'decideur', priority: 1 } as never],
      manager,
    )
    expect(matched).toBe(1)
    expect(globalPool).not.toHaveBeenCalled()
    expect(provenance.currentSources).toHaveBeenCalledWith('contact', 'c-9', manager)
    expect(provenance.commit).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'c-9' }), manager)
  })
})

describe('#4616 — ProvenanceService.commit écrit sur la connexion qu’on lui passe', () => {
  const params = {
    workspaceId: 'ws-1',
    entityType: 'contact' as const,
    entityId: 'c-1',
    source: 'pipeline' as const,
    actorId: null,
    changes: [{ field: 'title', oldValue: null, newValue: 'DSI' }],
  }

  it('avec un manager : écrit sur lui, sans ouvrir de transaction sur le dépôt global', async () => {
    const globalTransaction = jest.fn()
    const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager
    const service = new ProvenanceService({ manager: { transaction: globalTransaction } } as never, {} as never)
    await service.commit(params, manager)
    expect(globalTransaction).not.toHaveBeenCalled()
    expect(manager.query).toHaveBeenCalledTimes(2)
  })

  it('sans manager : le chemin historique (sa propre transaction) reste inchangé', async () => {
    const inner = { query: jest.fn().mockResolvedValue([]) }
    const globalTransaction = jest.fn(async (run: (m: unknown) => Promise<unknown>) => run(inner))
    const service = new ProvenanceService({ manager: { transaction: globalTransaction } } as never, {} as never)
    await service.commit(params)
    expect(globalTransaction).toHaveBeenCalledTimes(1)
    expect(inner.query).toHaveBeenCalledTimes(2)
  })
})
