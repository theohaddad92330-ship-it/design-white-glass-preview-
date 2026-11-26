import { BadRequestException } from '@nestjs/common'
import { consultantUpsertSchema } from '@bellum/contracts'
import { ConsultantsService, MANAGER_NOT_SELF_MESSAGE } from './consultants.service'

/**
 * #2195.12 — LE MANAGER D'UN CONSULTANT SE SAISIT, IL NE SE DEVINE PAS.
 *
 * Décision de Louis du 16/09/2026 : « manager » = le responsable HIÉRARCHIQUE
 * du consultant — ni le référent client (c'est un contact), ni le référent
 * commercial (c'est `owner_id`). Il se saisit sur la fiche, s'affiche seulement
 * quand il est renseigné, et son absence reste une absence.
 *
 * Ce que cette garde tient, et qu'aucun autre test ne tient :
 *  1. `null` reste `null` — aucun repli deviné (BU, propriétaire) ne le
 *     remplace. C'est le défaut que la décision nomme en toutes lettres ;
 *  2. un champ ABSENT de l'upsert n'écrase rien (mise à jour partielle) ;
 *  3. personne n'est son propre manager, et l'utilisateur lit une PHRASE
 *     plutôt qu'une violation de `CHECK` remontée en 500.
 */

function serviceWith(row: Record<string, unknown>) {
  const saved: Record<string, unknown>[] = []
  const repo = {
    save: async (entity: Record<string, unknown>) => {
      saved.push({ ...entity })
      return entity
    },
    find: async () => [],
  }
  const service = new ConsultantsService(
    repo as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  )
  ;(service as unknown as { findScoped: () => Promise<unknown> }).findScoped = async () => row
  ;(service as unknown as { toWire: (r: unknown) => unknown }).toWire = (r: unknown) => r
  return { service, saved }
}

function rowWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Nadia Berger',
    engagement_kind: 'salarie',
    partner_account_id: null,
    manager_id: null,
    ...overrides,
  }
}

describe('#2195.12 — le manager du consultant', () => {
  it('s’écrit quand il est saisi', async () => {
    const managerId = '22222222-2222-4222-8222-222222222222'
    const { service, saved } = serviceWith(rowWith())
    await service.update('11111111-1111-4111-8111-111111111111', 'ws', 'u', {
      full_name: 'Nadia Berger',
      manager_id: managerId,
    })
    expect(saved[0]?.['manager_id']).toBe(managerId)
  })

  it('se RETIRE avec `null`, et « non renseigné » le reste', async () => {
    // Le geste inverse compte autant : une correction humaine gagne toujours,
    // et un manager posé par erreur doit pouvoir se défaire — sinon la seule
    // sortie serait d'en désigner un autre, c'est-à-dire d'affirmer un fait de
    // plus pour en effacer un.
    const { service, saved } = serviceWith(rowWith({ manager_id: '22222222-2222-4222-8222-222222222222' }))
    await service.update('11111111-1111-4111-8111-111111111111', 'ws', 'u', {
      full_name: 'Nadia Berger',
      manager_id: null,
    })
    expect(saved[0]?.['manager_id']).toBeNull()
  })

  it('n’est JAMAIS deviné : un upsert qui n’en parle pas n’écrase rien', async () => {
    const managerId = '22222222-2222-4222-8222-222222222222'
    const { service, saved } = serviceWith(rowWith({ manager_id: managerId }))
    await service.update('11111111-1111-4111-8111-111111111111', 'ws', 'u', { full_name: 'Nadia Berger' })
    expect(saved[0]?.['manager_id']).toBe(managerId)
  })

  it('refuse qu’une personne soit son propre manager, avec une PHRASE', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const { service } = serviceWith(rowWith())
    await expect(service.update(id, 'ws', 'u', { full_name: 'Nadia Berger', manager_id: id })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(service.update(id, 'ws', 'u', { full_name: 'Nadia Berger', manager_id: id })).rejects.toThrow(
      MANAGER_NOT_SELF_MESSAGE,
    )
  })

  it('le contrat n’accepte qu’un identifiant, jamais un nom libre', async () => {
    // Un champ texte aurait produit « Jean-Luc », « JL M. » et « jl.martin » sur
    // trois fiches du même manager, donc zéro regroupement possible.
    expect(consultantUpsertSchema.shape.manager_id.safeParse('Jean-Luc Martin').success).toBe(false)
    expect(consultantUpsertSchema.shape.manager_id.safeParse('22222222-2222-4222-8222-222222222222').success).toBe(true)
    expect(consultantUpsertSchema.shape.manager_id.safeParse(null).success).toBe(true)
  })
})

/**
 * #4559 (cas 1) — UN MANAGER D'UN AUTRE ESPACE EST REFUSÉ, ET RIEN N'EST STOCKÉ.
 *
 * `manager_id` est un identifiant ÉTRANGER à la ligne : stocké tel quel, il
 * faisait ressortir le `full_name` d'une fiche d'un autre espace. Le test
 * prouve le REFUS (écriture) et le filtre de relecture, pas le chemin heureux.
 */
describe('#4559 — manager_id d’un autre espace', () => {
  const foreignManager = '33333333-3333-4333-8333-333333333333'
  const ownId = '11111111-1111-4111-8111-111111111111'

  function serviceScopedTo(visibleIds: string[]) {
    const saved: Record<string, unknown>[] = []
    const finds: Record<string, unknown>[] = []
    const repo = {
      save: async (entity: Record<string, unknown>) => {
        saved.push({ ...entity })
        return entity
      },
      create: (entity: Record<string, unknown>) => entity,
      manager: { query: async () => [], findOne: async () => null, find: async () => [] },
      find: async (options: Record<string, unknown>) => {
        finds.push(options)
        return []
      },
    }
    const service = new ConsultantsService(
      repo as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    )
    const internals = service as unknown as {
      findScoped: (id: string) => Promise<unknown>
      toWire: (r: unknown) => unknown
      seedSkills: () => Promise<void>
    }
    internals.findScoped = async (id: string) =>
      id === ownId ? rowWith() : visibleIds.includes(id) ? rowWith({ id }) : null
    internals.toWire = (r: unknown) => r
    internals.seedSkills = async () => undefined
    return { service, saved, finds }
  }

  it('refuse à la MISE À JOUR un manager hors de l’espace, sans rien stocker', async () => {
    const { service, saved } = serviceScopedTo([])
    await expect(
      service.update(ownId, 'ws', 'u', { full_name: 'Nadia Berger', manager_id: foreignManager }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(saved).toHaveLength(0)
  })

  it('refuse à la CRÉATION un manager hors de l’espace, sans rien stocker', async () => {
    const { service, saved } = serviceScopedTo([])
    await expect(
      service.create('ws', 'u', { full_name: 'Nadia Berger', manager_id: foreignManager }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(saved).toHaveLength(0)
  })

  it('la relecture des noms pose le filtre d’espace DANS la requête', async () => {
    const { service, finds } = serviceScopedTo([])
    const rows = [rowWith({ manager_id: foreignManager, workspace_id: 'ws', user_id: 'u' })]
    await (service as unknown as { managerNamesOf: (r: unknown) => Promise<unknown> }).managerNamesOf(rows)
    expect(JSON.stringify(finds[0]?.['where'])).toContain('workspace_id')
  })
})
