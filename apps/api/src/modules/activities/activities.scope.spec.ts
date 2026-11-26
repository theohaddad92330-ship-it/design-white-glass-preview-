import { NotFoundException } from '@nestjs/common'
import { ActivitiesService } from './activities.service'

const WS_A = 'w0000000-0000-4000-8000-00000000000a'
const WS_B = 'w0000000-0000-4000-8000-00000000000b'
const USER_A = 'u0000000-0000-4000-8000-00000000000a'
const COMPTE_A = 'a0000000-0000-4000-8000-00000000000a'
const CONTACT_A = 'c0000000-0000-4000-8000-00000000000a'
const CONTACT_B = 'c0000000-0000-4000-8000-00000000000b'
const COMPTE_B = 'a0000000-0000-4000-8000-00000000000b'

/**
 * #2671 — LE SECOND JUMEAU : `resolveTargets` lisait le contact par
 * `findOne({ where: { id: contactId } })`, SANS borne d'espace, là où les
 * quatre autres modules qui lisent un contact par id portent la leur
 * (`account-entities.service.ts:380`, `reply-feedback.service.ts:95`,
 * `action-os.controller.ts:145`, `copilot-card.service.ts:1205`).
 *
 * Le seul contrôle de périmètre de la fonction porte sur le COMPTE
 * (`SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2`), et il ne
 * rattrape le contact que lorsque le compte en est DÉDUIT. Un client qui envoie
 * les deux — son propre `accountId` et le `contactId` d'une AUTRE ESN — garde
 * son compte (`accountId ?? contact.account_id`), passe le contrôle, et
 * l'activité s'écrit en pointant le contact du concurrent.
 *
 * Ce que ça donne, concrètement : un oracle d'existence sur les identifiants de
 * contacts de tout le parc (404 contre 201), et une ligne d'activité qui
 * référence durablement la donnée d'un autre espace.
 *
 * ⚠️ Un test existant disait déjà « refuse un contact d'un autre espace »
 * (`activities.service.spec.ts`) — il le simulait avec un dépôt qui rend `null`
 * QUELLE QUE SOIT la requête. Il prouvait donc le refus que le code ne savait
 * pas faire. Ici le dépôt HONORE son `where`, comme la vraie base.
 */
describe('ActivitiesService.log — cloisonnement du contact (#2671)', () => {
  type Contact = { id: string; account_id: string; workspace_id: string }

  function makeService(contacts: Contact[]) {
    const wheres: Record<string, unknown>[] = []
    const contactsRepo = {
      findOne: jest.fn(async (options: { where: Record<string, unknown> }) => {
        wheres.push(options.where)
        const trouve = contacts.find(contact =>
          Object.entries(options.where).every(
            ([cle, valeur]) => (contact as unknown as Record<string, unknown>)[cle] === valeur,
          ),
        )
        return trouve ?? null
      }),
    }
    const activities = {
      manager: {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
          // La vraie requête de périmètre du compte, honorée elle aussi : seul
          // un compte de l'espace de l'appelant répond.
          if (sql.includes('FROM accounts WHERE id')) {
            return params[0] === COMPTE_A && params[1] === WS_A ? [{ id: COMPTE_A }] : []
          }
          return []
        }),
      },
      save: jest.fn(async (entity: Record<string, unknown>) => ({ id: 'act-1', ...entity })),
      create: jest.fn((entity: Record<string, unknown>) => entity),
    }
    const participants = { find: jest.fn(async () => []) }
    const projects = { findOne: jest.fn(async () => null) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS_A })) }
    const dataSource = { query: jest.fn(async () => []) }
    const actionPlanItems = { createManual: jest.fn(async () => ({ id: 'plan-item-1' })) }
    const crm = { findContactRecord: jest.fn(async () => null), logActivity: jest.fn(async () => ({ id: 'x' })) }
    const service = new ActivitiesService(
      activities as never,
      participants as never,
      contactsRepo as never,
      projects as never,
      workspaceContext as never,
      dataSource as never,
      actionPlanItems as never,
      crm as never,
    )
    return { service, activities, contactsRepo, wheres }
  }

  it('refuse le contact d’une AUTRE ESN même quand le compte, lui, est le bon', async () => {
    // Le cas que le contrôle du compte ne voyait pas : les deux identifiants
    // sont fournis, donc le compte n'est plus DÉDUIT du contact.
    const { service, activities } = makeService([
      { id: CONTACT_A, account_id: COMPTE_A, workspace_id: WS_A },
      { id: CONTACT_B, account_id: COMPTE_B, workspace_id: WS_B },
    ])

    await expect(
      service.log(USER_A, {
        kind: 'call',
        direction: 'outbound',
        accountId: COMPTE_A,
        contactId: CONTACT_B,
        durationSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)

    // Rien n'a été écrit : pas d'activité qui pointe le contact du concurrent.
    expect(activities.save).not.toHaveBeenCalled()
  })

  it('la borne est DANS la lecture du contact, pas dans un contrôle posé après', async () => {
    const { service, wheres } = makeService([{ id: CONTACT_A, account_id: COMPTE_A, workspace_id: WS_A }])

    await expect(
      service.log(USER_A, { kind: 'call', direction: 'outbound', contactId: CONTACT_B, durationSeconds: null }),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(wheres).toEqual([{ id: CONTACT_B, workspace_id: WS_A }])
  })

  it('sait dire OUI — un contact de l’espace passe, et le compte s’en déduit toujours', async () => {
    const { service, activities } = makeService([{ id: CONTACT_A, account_id: COMPTE_A, workspace_id: WS_A }])

    await service.log(USER_A, { kind: 'call', direction: 'outbound', contactId: CONTACT_A, durationSeconds: 300 })

    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: COMPTE_A, contact_id: CONTACT_A, workspace_id: WS_A }),
    )
    expect(activities.save).toHaveBeenCalledTimes(1)
  })
})
