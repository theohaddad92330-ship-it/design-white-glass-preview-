import type { Job, Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import { failure, isSuccess, success } from '@bellum/utils'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactEnrichmentService } from './contact-enrichment.service'
import type { ContactEnrichmentJobData } from './contact-enrichment.queue'
import { ContactEnrichmentWorker } from './contact-enrichment.worker'
import type { ContactsService } from './contacts.service'

/**
 * #1931 L2 (I3) — la réservation posée au clic d'une carte de Laura est SOLDÉE
 * par le worker, dans la même exécution que le débit.
 *
 * Sans cela : onglet fermé = crédit compté deux fois (réservé + débité) jusqu'à
 * l'expiration de la réservation. Le bouton « Enrichir » de l'écran, lui, ne
 * réserve rien — son chemin reste exactement celui d'avant.
 */

const DATA: ContactEnrichmentJobData = {
  contactId: 'c1',
  userId: 'user-1',
  first_name: 'Owen',
  organization_name: 'Dirigo',
  reservationReference: 'card_turn_0',
  reservationWorkspaceId: 'ws-1',
}

function worker(enrichContact: jest.Mock, withSettler = true) {
  const settler = { settle: jest.fn().mockResolvedValue(undefined) }
  const instance = new ContactEnrichmentWorker(
    { enrichContact } as unknown as ContactsService,
    withSettler ? settler : undefined,
  )
  return { instance, settler }
}

const job = (data: ContactEnrichmentJobData = DATA) => ({ id: 'enrich-c1', data }) as Job<ContactEnrichmentJobData>

describe('ContactEnrichmentWorker — solde la réservation au moment où il observe le débit', () => {
  it('TROUVÉ (débit observé) : réservation CONSOMMÉE', async () => {
    const { instance, settler } = worker(jest.fn().mockResolvedValue(success({ id: 'c1', credits_debited: 1 })))
    await instance.process(job())
    expect(settler.settle).toHaveBeenCalledWith('ws-1', 'card_turn_0', 'consumed')
  })

  it('RIEN TROUVÉ (0 débité) : réservation LIBÉRÉE — jamais consommée d’office', async () => {
    const { instance, settler } = worker(jest.fn().mockResolvedValue(success({ id: 'c1', credits_debited: 0 })))
    await instance.process(job())
    expect(settler.settle).toHaveBeenCalledWith('ws-1', 'card_turn_0', 'released')
  })

  it('REFUS métier (course perdue, fournisseur indisponible) : libérée', async () => {
    const { instance, settler } = worker(
      jest.fn().mockResolvedValue(failure({ code: 'insufficient_credits', message: 'Épuisés.' })),
    )
    await instance.process(job())
    expect(settler.settle).toHaveBeenCalledWith('ws-1', 'card_turn_0', 'released')
  })

  it('PANNE (exception avant tout débit) : libérée, et la panne remonte à BullMQ', async () => {
    const { instance, settler } = worker(jest.fn().mockRejectedValue(new Error('redis down')))
    await expect(instance.process(job())).rejects.toThrow('redis down')
    expect(settler.settle).toHaveBeenCalledWith('ws-1', 'card_turn_0', 'released')
  })

  it('le bouton de l’écran (aucune référence) ne touche à aucune réservation', async () => {
    const { referenceLess, ...rest } = { referenceLess: true, ...DATA }
    void referenceLess
    const { reservationReference: _none, reservationWorkspaceId: _noWorkspace, ...data } = rest
    const { instance, settler } = worker(jest.fn().mockResolvedValue(success({ id: 'c1', credits_debited: 1 })))
    await instance.process(job(data))
    expect(settler.settle).not.toHaveBeenCalled()
  })

  it('R4 — une référence SANS son espace ne se solde pas : jamais un solde tous espaces confondus, elle expirera', async () => {
    const { reservationWorkspaceId: _noWorkspace, ...data } = DATA
    const { instance, settler } = worker(jest.fn().mockResolvedValue(success({ id: 'c1', credits_debited: 1 })))
    await instance.process(job(data))
    expect(settler.settle).not.toHaveBeenCalled()
  })

  it('un solde qui échoue n’efface pas un enrichissement payé (la réservation expirera d’elle-même)', async () => {
    const { instance, settler } = worker(jest.fn().mockResolvedValue(success({ id: 'c1', credits_debited: 1 })))
    settler.settle.mockRejectedValueOnce(new Error('db down'))
    await expect(instance.process(job())).resolves.toMatchObject({ ok: true })
  })
})

// #4119 — un worker qui MEURT (job « stalled » : redéploiement, OOM) ne passe ni par le `try` ni par le
// `catch` de `process` : seul `failed` est émis. Sans ce filet, le règlement manqué attendait l'expiration
// à 30 min. `settle` est gardé par `state: 'reserved'` : un second règlement est un no-op, jamais deux.
describe('ContactEnrichmentWorker — #4119 règlement filet quand le worker est perdu', () => {
  it('job perdu (stalled) : la réservation est LIBÉRÉE par `failed`, sans attendre les 30 min', async () => {
    const { instance, settler } = worker(jest.fn())
    await instance.onFailed(job(), new Error('job stalled more than allowable limit'))
    expect(settler.settle).toHaveBeenCalledTimes(1)
    expect(settler.settle).toHaveBeenCalledWith('ws-1', 'card_turn_0', 'released')
  })

  it('le bouton de l’écran (aucune référence) : `failed` ne touche à aucune réservation', async () => {
    const { reservationReference: _r, reservationWorkspaceId: _w, ...data } = DATA
    const { instance, settler } = worker(jest.fn())
    await instance.onFailed(job(data), new Error('boom'))
    expect(settler.settle).not.toHaveBeenCalled()
  })

  it('un solde filet qui échoue ne fait pas lever le gestionnaire d’événement', async () => {
    const { instance, settler } = worker(jest.fn())
    settler.settle.mockRejectedValueOnce(new Error('db down'))
    await expect(instance.onFailed(job(), new Error('stalled'))).resolves.toBeUndefined()
  })

  it('panne dans `process` : libérée par le `catch`, puis `failed` rejoue un solde SANS effet (idempotent côté base)', async () => {
    const { instance, settler } = worker(jest.fn().mockRejectedValue(new Error('redis down')))
    await expect(instance.process(job())).rejects.toThrow('redis down')
    await instance.onFailed(job(), new Error('redis down'))
    // Deux appels au port, le même résultat demandé : la garde `state: 'reserved'` en fait un no-op.
    expect(settler.settle.mock.calls.every(call => call[2] === 'released')).toBe(true)
  })
})

describe('ContactEnrichmentService.enqueueWithReservation — la référence voyage avec le job', () => {
  function service(existing: { state: string; data?: ContactEnrichmentJobData } | null) {
    const updateData = jest.fn().mockResolvedValue(undefined)
    const queue = {
      getJob: jest.fn(async () =>
        existing
          ? {
              ...existing,
              data: existing.data ?? DATA,
              getState: async () => existing.state,
              remove: jest.fn(),
              updateData,
            }
          : null,
      ),
      add: jest.fn().mockResolvedValue({ id: 'enrich-c1' }),
    }
    const contacts = {
      preflightEnrichment: jest.fn().mockResolvedValue({ type: 'success', output: { id: 'c1' } }),
    } as unknown as ContactsService
    const instance = new ContactEnrichmentService(
      queue as unknown as Queue,
      { findOne: jest.fn() } as unknown as Repository<ContactEntity>,
      contacts,
      {} as WorkspaceContextService,
    )
    return { instance, queue, updateData }
  }

  it('un job NEUF porte la référence', async () => {
    const { instance, queue } = service(null)
    const accepted = await instance.enqueueWithReservation(
      'c1',
      'user-1',
      { first_name: 'Owen', organization_name: 'Dirigo' },
      { reservationReference: 'card_turn_0', reservationWorkspaceId: 'ws-1' },
    )
    expect(isSuccess(accepted) && accepted.output.reservation_attached).toBe(true)
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      reservationReference: 'card_turn_0',
      reservationWorkspaceId: 'ws-1',
    })
  })

  it('un job encore EN FILE reçoit la référence (le worker lit ses données au démarrage)', async () => {
    const { instance, updateData } = service({ state: 'waiting' })
    const accepted = await instance.enqueueWithReservation(
      'c1',
      'user-1',
      { first_name: 'Owen', organization_name: 'Dirigo' },
      { reservationReference: 'card_turn_0', reservationWorkspaceId: 'ws-1' },
    )
    expect(isSuccess(accepted) && accepted.output.reservation_attached).toBe(true)
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({ reservationReference: 'card_turn_0', reservationWorkspaceId: 'ws-1' }),
    )
  })

  it('un job DÉJÀ ACTIF ne la recevra pas — et l’appelant le sait', async () => {
    const { instance, updateData } = service({ state: 'active' })
    const accepted = await instance.enqueueWithReservation(
      'c1',
      'user-1',
      { first_name: 'Owen', organization_name: 'Dirigo' },
      { reservationReference: 'card_turn_0', reservationWorkspaceId: 'ws-1' },
    )
    expect(isSuccess(accepted) && accepted.output.reservation_attached).toBe(false)
    expect(updateData).not.toHaveBeenCalled()
  })

  it('R4 — une référence sans son espace n’est PAS attachée : le worker ne pourrait pas la solder dans le bon espace', async () => {
    const { instance, queue } = service(null)
    const accepted = await instance.enqueueWithReservation(
      'c1',
      'user-1',
      { first_name: 'Owen', organization_name: 'Dirigo' },
      { reservationReference: 'card_turn_0' },
    )
    expect(isSuccess(accepted) && accepted.output.reservation_attached).toBe(false)
    expect(queue.add.mock.calls[0][1]).not.toHaveProperty('reservationReference')
  })

  it('le 202 du bouton de l’écran reste IDENTIQUE — aucun champ de réservation ne fuit', async () => {
    const { instance } = service(null)
    const accepted = await instance.enqueue('c1', 'user-1', { first_name: 'Owen', organization_name: 'Dirigo' })
    expect(isSuccess(accepted) && accepted.output).toEqual({ job_id: 'enrich-c1', state: 'queued' })
  })
})
