import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactEnrichmentService } from './contact-enrichment.service'
import type { ContactsService } from './contacts.service'

// #AM.39 (#4063) — l'index des enrichissements EN COURS d'un utilisateur : la liste /contacts et tous les chemins
// d'enrichissement lisent LE MÊME index, au lieu d'une sonde par fiche.
const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '99999999-9999-9999-9999-999999999999'
const job = (contactId: string, userId: string, only?: string) => ({
  data: { contactId, userId, ...(only ? { only } : {}) },
})

function build(jobs: unknown[]) {
  const getJobs = jest.fn(async () => jobs)
  const service = new ContactEnrichmentService(
    { getJobs } as unknown as Queue,
    {} as Repository<ContactEntity>,
    {} as ContactsService,
    {} as WorkspaceContextService,
  )
  return { service, getJobs }
}

describe('ContactEnrichmentService.inFlight — #AM.39', () => {
  it('rend les contacts de CET utilisateur dont un enrichissement attend ou tourne — jamais ceux d’un autre', async () => {
    const { service, getJobs } = build([job('c1', USER), job('c2', OTHER), job('c3', USER, 'phone'), job('c1', USER)])
    expect(await service.inFlight(USER)).toEqual([{ contactId: 'c1' }, { contactId: 'c3', only: 'phone' }])
    // Seuls les états « pas fini » sont lus, et la lecture est bornée.
    expect(getJobs).toHaveBeenCalledWith(['waiting', 'active', 'delayed', 'prioritized'], 0, expect.any(Number))
  })

  it('aucun job en vol : une liste vide, pas une erreur', async () => {
    expect(await build([]).service.inFlight(USER)).toEqual([])
  })
})
