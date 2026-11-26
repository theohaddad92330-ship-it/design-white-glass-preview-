import type { Job } from 'bullmq'
import { failure, success } from '@bellum/utils'
import { ContactEnrichmentWorker } from './contact-enrichment.worker'
import type { ContactEnrichmentJobData } from './contact-enrichment.queue'
import type { ContactsService } from './contacts.service'
import type { EmailEstimateService } from './email-estimate.service'

const JOB_DATA: ContactEnrichmentJobData = {
  contactId: 'c1',
  userId: 'user-1',
  first_name: 'Owen',
  last_name: 'Renard',
  organization_name: 'Dirigo',
}

function makeWorker(enrichContact: jest.Mock) {
  const contacts = { enrichContact } as unknown as ContactsService
  return new ContactEnrichmentWorker(contacts)
}

function makeJob(data: ContactEnrichmentJobData = JOB_DATA): Job<ContactEnrichmentJobData> {
  return { id: 'enrich:c1', data } as Job<ContactEnrichmentJobData>
}

describe('ContactEnrichmentWorker', () => {
  it('délègue au chemin EXISTANT (aucune logique dupliquée) et rend le contact enrichi', async () => {
    const enriched = { id: 'c1', email: 'owen@dirigo.fr', credits_remaining: 390 }
    const enrichContact = jest.fn().mockResolvedValue(success(enriched))

    const result = await makeWorker(enrichContact).process(makeJob())

    expect(enrichContact).toHaveBeenCalledWith('c1', 'user-1', {
      first_name: 'Owen',
      last_name: 'Renard',
      organization_name: 'Dirigo',
    })
    expect(result).toEqual({ ok: true, contact: enriched })
  })

  it('transmet `force` quand le commercial a assumé le coût', async () => {
    const enrichContact = jest.fn().mockResolvedValue(success({ id: 'c1' }))

    await makeWorker(enrichContact).process(makeJob({ ...JOB_DATA, force: true }))

    expect(enrichContact).toHaveBeenCalledWith('c1', 'user-1', expect.objectContaining({ force: true }))
  })

  // #2988 — le filtre par coordonnée doit traverser TOUT le pipeline : le
  // worker est le seul point qui connaît À LA FOIS les données du job et
  // `ContactsService.enrichContact` — sans ce relais, `only` resterait un
  // champ de schéma mort.
  it('#2988 — transmet `only` (email | phone) au chemin existant', async () => {
    const enrichContact = jest.fn().mockResolvedValue(success({ id: 'c1' }))

    await makeWorker(enrichContact).process(makeJob({ ...JOB_DATA, only: 'phone' }))

    expect(enrichContact).toHaveBeenCalledWith('c1', 'user-1', expect.objectContaining({ only: 'phone' }))
  })

  it('#2988 — sans `only` dans le job, ne transmet aucune clé `only` (comportement historique)', async () => {
    const enrichContact = jest.fn().mockResolvedValue(success({ id: 'c1' }))

    await makeWorker(enrichContact).process(makeJob())

    expect(enrichContact).toHaveBeenCalledWith('c1', 'user-1', {
      first_name: 'Owen',
      last_name: 'Renard',
      organization_name: 'Dirigo',
    })
  })

  it("n'envoie pas de `last_name` vide — c'est un filtre littéral côté fournisseur", async () => {
    const enrichContact = jest.fn().mockResolvedValue(success({ id: 'c1' }))
    const { last_name: _omitted, ...withoutLastName } = JOB_DATA

    await makeWorker(enrichContact).process(makeJob(withoutLastName))

    expect(enrichContact).toHaveBeenCalledWith('c1', 'user-1', {
      first_name: 'Owen',
      organization_name: 'Dirigo',
    })
  })

  it('un refus MÉTIER est une valeur de retour, pas une exception — BullMQ ne doit pas le retenter', async () => {
    const problem = {
      code: 'enrichment_unavailable' as const,
      message: 'indisponible',
      reason: 'rate_limited' as const,
    }
    const enrichContact = jest.fn().mockResolvedValue(failure(problem))

    const worker = makeWorker(enrichContact)
    // Ne lève PAS…
    const result = await worker.process(makeJob())

    // …et préserve le `code`/`reason` typé dont le client a besoin pour être honnête.
    expect(result).toEqual({ ok: false, failure: problem })
  })

  it('une panne inattendue remonte en exception (le job est marqué failed, pas « rien trouvé »)', async () => {
    const enrichContact = jest.fn().mockRejectedValue(new Error('redis down'))

    await expect(makeWorker(enrichContact).process(makeJob())).rejects.toThrow('redis down')
  })
})

/**
 * #4016 L4.1 — l'APPELANT de l'e-mail estimé. Une estimation que personne
 * n'appelle est le défaut n°1 du dépôt : elle part ICI, quand la cascade
 * payante n'a pas trouvé d'adresse.
 */
describe('ContactEnrichmentWorker — e-mail estimé quand la cascade n’en trouve pas', () => {
  function withEstimate(enrichContact: jest.Mock, estimateFor: jest.Mock) {
    const contacts = { enrichContact } as unknown as ContactsService
    return new ContactEnrichmentWorker(contacts, undefined, { estimateFor } as unknown as EmailEstimateService)
  }

  it('aucune adresse trouvée ⇒ l’estimation part, et le contact rendu la porte', async () => {
    const enrichContact = jest.fn().mockResolvedValue(success({ id: 'c1', workspace_id: 'ws-1', email: null }))
    const estimateFor = jest.fn().mockResolvedValue({
      kind: 'estimated',
      email: 'owen.renard@dirigo.fr',
      verifiedAt: '2026-10-11T10:00:00.000Z',
      pattern: 'first.last',
    })
    const result = await withEstimate(enrichContact, estimateFor).process(makeJob())
    expect(estimateFor).toHaveBeenCalledWith('ws-1', 'c1')
    expect(result).toEqual({ ok: true, contact: { id: 'c1', workspace_id: 'ws-1', email: 'owen.renard@dirigo.fr' } })
  })

  it('rien de neuf chez les fournisseurs ⇒ l’estimation part aussi', async () => {
    const problem = { code: 'enrichment_unchanged' as const, message: 'rien de neuf' }
    const estimateFor = jest.fn().mockResolvedValue({ kind: 'skipped', reason: 'no_pattern' })
    const result = await withEstimate(jest.fn().mockResolvedValue(failure(problem)), estimateFor).process(
      makeJob({ ...JOB_DATA, reservationWorkspaceId: 'ws-1', reservationReference: 'r-1' }),
    )
    expect(estimateFor).toHaveBeenCalledWith('ws-1', 'c1')
    expect(result).toEqual({ ok: false, failure: problem })
  })

  it('sait dire NON : une adresse trouvée, ou une recherche du seul téléphone, ne déclenche rien', async () => {
    const estimateFor = jest.fn()
    await withEstimate(jest.fn().mockResolvedValue(success({ id: 'c1', email: 'o@d.fr' })), estimateFor).process(
      makeJob(),
    )
    await withEstimate(jest.fn().mockResolvedValue(success({ id: 'c1', email: null })), estimateFor).process(
      makeJob({ ...JOB_DATA, only: 'phone' }),
    )
    expect(estimateFor).not.toHaveBeenCalled()
  })

  it('sait dire NON : sans borne d’espace connue, l’estimation ne part pas (#2671.5)', async () => {
    const estimateFor = jest.fn()
    const problem = { code: 'enrichment_unchanged' as const, message: 'rien de neuf' }
    await withEstimate(jest.fn().mockResolvedValue(failure(problem)), estimateFor).process(makeJob())
    expect(estimateFor).not.toHaveBeenCalled()
  })

  it('une estimation qui lève ne casse pas l’enrichissement payé', async () => {
    const estimateFor = jest.fn().mockRejectedValue(new Error('dns down'))
    const result = await withEstimate(
      jest.fn().mockResolvedValue(success({ id: 'c1', workspace_id: 'ws-1', email: null })),
      estimateFor,
    ).process(makeJob())
    expect(result).toEqual({ ok: true, contact: { id: 'c1', workspace_id: 'ws-1', email: null } })
  })
})
