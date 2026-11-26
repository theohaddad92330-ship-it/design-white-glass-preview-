/**
 * ContactStopService — « ne me contactez plus » arrête vraiment.
 *
 * Ce qui est vérifié ici, et pourquoi chaque point compte :
 *  - un `do_not_call` déclaré au terme de la motion d'appel à froid POSE
 *    l'arrêt — c'est le premier appelant de production d'`outcomeStopsMotion`,
 *    qui n'en avait aucun ;
 *  - une issue qui n'arrête PAS sa motion est refusée en le disant : un arrêt
 *    inventé est aussi coûteux qu'une insistance ;
 *  - poser l'arrêt RETIRE LE MOYEN — l'adresse part à la liste de suppression,
 *    sinon les huit chemins d'envoi d'e-mail restent ouverts sur la personne ;
 *  - l'échec de cette suppression ne fait pas perdre l'arrêt, mais il est CRIÉ.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { SuppressionService } from '../mailer/suppression.service'
import { ContactStopService } from './contact-stop.service'

const WORKSPACE = 'ws-1'
const CONTACT = 'c1'
const USER = 'u1'

const contact = { id: CONTACT, workspace_id: WORKSPACE, email: 'jean@corp.fr' } as unknown as ContactEntity

function build(overrides: { contact?: ContactEntity | null; stored?: Partial<ContactStopEntity> | null } = {}) {
  const execute = jest.fn().mockResolvedValue(undefined)
  const values = jest.fn().mockReturnValue({ orIgnore: () => ({ execute }) })
  const stops = {
    createQueryBuilder: jest.fn().mockReturnValue({ insert: () => ({ values }) }),
    findOne: jest
      .fn()
      .mockResolvedValue(
        overrides.stored === undefined
          ? { created_at: new Date('2026-08-30T09:00:00.000Z'), motion: 'cold_call_qualification' }
          : overrides.stored,
      ),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
  }
  const contacts = {
    findOne: jest.fn().mockResolvedValue(overrides.contact === undefined ? contact : overrides.contact),
  }
  const suppression = { suppress: jest.fn().mockResolvedValue(undefined) }
  const service = new ContactStopService(
    stops as never,
    contacts as never,
    suppression as unknown as SuppressionService,
  )
  return { service, stops, contacts, suppression, values }
}

describe('ContactStopService.record', () => {
  it('POSE l’arrêt sur une issue qui arrête réellement sa motion', async () => {
    const { service, values } = build()

    const verdict = await service.record({
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      declaredBy: USER,
      motion: 'cold_call_qualification',
      outcome: 'do_not_call',
      note: 'Demandé au téléphone.',
    })

    expect(verdict.reason).toBe('do_not_call')
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE,
        contact_id: CONTACT,
        reason: 'do_not_call',
        motion: 'cold_call_qualification',
        declared_by: USER,
      }),
    )
  })

  it('RETIRE LE MOYEN — l’adresse part à la liste de suppression', async () => {
    // Un garde-fou qui se contente de ne plus proposer l'envoi, alors qu'un
    // autre chemin peut encore atteindre la personne, n'est pas un garde-fou.
    const { service, suppression } = build()

    await service.record({
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      declaredBy: USER,
      motion: 'cold_call_qualification',
      outcome: 'do_not_call',
    })

    expect(suppression.suppress).toHaveBeenCalledWith(WORKSPACE, 'jean@corp.fr', 'do_not_call')
  })

  it('un contact SANS adresse ne fait aucun appel à la liste de suppression', async () => {
    // Rien à supprimer, donc rien à inventer : une adresse vide ne s'écrit pas.
    const { service, suppression } = build({ contact: { ...contact, email: null } as unknown as ContactEntity })

    await service.record({
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      declaredBy: USER,
      motion: 'cold_call_qualification',
      outcome: 'do_not_call',
    })

    expect(suppression.suppress).not.toHaveBeenCalled()
  })

  it('REFUSE une issue qui n’arrête pas sa motion', async () => {
    // `voicemail` est une issue de l'appel à froid, ce n'est pas un arrêt.
    const { service, values } = build()

    await expect(
      service.record({
        workspaceId: WORKSPACE,
        contactId: CONTACT,
        declaredBy: USER,
        motion: 'cold_call_qualification',
        outcome: 'voicemail',
      }),
    ).rejects.toThrow(BadRequestException)
    expect(values).not.toHaveBeenCalled()
  })

  it('REFUSE un arrêt de motion qui ne porte pas sur la PERSONNE', async () => {
    // `mission_end_confirmed` arrête le suivi de mission ; il ne dit rien de la
    // personne. Le verser dans un arrêt de contact ferait taire un client dont
    // la mission vient simplement de se terminer.
    const { service } = build()

    await expect(
      service.record({
        workspaceId: WORKSPACE,
        contactId: CONTACT,
        declaredBy: USER,
        motion: 'mission_follow_up',
        outcome: 'mission_end_confirmed',
      }),
    ).rejects.toThrow(/n'arrête pas la motion|ne s’arrête|arrête/)
  })

  it('REFUSE une raison inconnue plutôt que de l’inscrire', async () => {
    const { service } = build()
    await expect(
      service.record({
        workspaceId: WORKSPACE,
        contactId: CONTACT,
        declaredBy: USER,
        reason: 'trop_occupe' as never,
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('DIT qu’un contact est introuvable plutôt que d’écrire dans le vide', async () => {
    const { service } = build({ contact: null })
    await expect(
      service.record({ workspaceId: WORKSPACE, contactId: CONTACT, declaredBy: USER, reason: 'do_not_call' }),
    ).rejects.toThrow(NotFoundException)
  })

  it('un échec de suppression ne perd pas l’arrêt', async () => {
    // L'arrêt est déjà posé quand on arrive là : le défaire punirait la
    // personne pour une panne de notre côté. La porte « personne » ferme déjà
    // les chemins qui connaissent un `contact_id`.
    const { service, suppression } = build()
    suppression.suppress.mockRejectedValueOnce(new Error('base indisponible'))

    const verdict = await service.record({
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      declaredBy: USER,
      reason: 'do_not_call',
    })
    expect(verdict.reason).toBe('do_not_call')
  })
})

describe('ContactStopService — la lecture que consultent les chemins', () => {
  it('rend `null` quand personne n’a rien demandé', async () => {
    const { service } = build({ stored: null })
    expect(await service.verdict(WORKSPACE, CONTACT)).toBeNull()
  })

  it('rend un ensemble VIDE, jamais « on ne sait pas », sur une liste vide', async () => {
    const { service, stops } = build()
    expect(await service.stoppedAmong(WORKSPACE, [])).toEqual(new Set())
    // Aucune requête : une liste vide ne se demande pas à la base.
    expect(stops.find).not.toHaveBeenCalled()
  })

  it('interroge la base UNE fois pour tout un lot', async () => {
    const { service, stops } = build()
    stops.find.mockResolvedValueOnce([{ contact_id: 'c2' }])
    const stopped = await service.stoppedAmong(WORKSPACE, ['c1', 'c2', 'c2'])
    expect(stopped).toEqual(new Set(['c2']))
    expect(stops.find).toHaveBeenCalledTimes(1)
  })
})
