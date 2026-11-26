import { isFailure, success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { IaClient } from '../ia/ia.client'
import type { AnalysisPersistenceService } from './analysis.persistence'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { OrgGraphVersionService } from '../org-graph/org-graph.service'

/**
 * #2553 / #3740 — « importer mon organigramme, les mettre dans les contacts ».
 * La déclaration d'un document importé crée AUSSI les contacts — sur demande
 * (`createContacts`), jamais pour le formulaire ni le texte.
 */
const account = { id: 'acc-1', user_id: 'u-1', company_name: 'Kovéa', raw_analysis: {} } as unknown as AccountEntity

function build() {
  const contacts = {
    findByAccount: jest.fn().mockResolvedValue([]),
    importOrgChartPeople: jest.fn().mockResolvedValue({
      created: 1,
      contacts: [{ fullName: 'Jean Dupont', contactId: 'c-9', status: 'created' }],
    }),
  }
  const orgGraph = { declarePeople: jest.fn().mockResolvedValue({ graphVersion: 2, declared: 1, grafted: true }) }
  const service = new AnalysisOnDemandService(
    { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
    contacts as unknown as ContactsService,
    {} as IaClient,
    {} as AnalysisPersistenceService,
    {} as EsnProfileReader,
    undefined,
    undefined,
    undefined,
    undefined,
    orgGraph as unknown as OrgGraphVersionService,
  )
  return { service, contacts, orgGraph }
}

describe('AnalysisOnDemandService.declareOrgPeople — import en contacts', () => {
  it('createContacts : les contacts sont créés avec l’année du document et rendus à l’écran', async () => {
    const { service, contacts } = build()
    const result = await service.declareOrgPeople(
      'acc-1',
      'u-1',
      [{ fullName: 'Jean Dupont', title: 'DSI', documentDate: '2023-06-01' }],
      { createContacts: true },
    )
    if (isFailure(result)) throw new Error('succès attendu')
    expect(contacts.importOrgChartPeople).toHaveBeenCalledWith(
      'acc-1',
      'u-1',
      [expect.objectContaining({ fullName: 'Jean Dupont', title: 'DSI' })],
      '2023-06-01',
    )
    expect(result.output.contacts).toEqual([{ fullName: 'Jean Dupont', contactId: 'c-9', status: 'created' }])
  })

  it('sans createContacts : aucun contact créé (formulaire, texte), réponse inchangée', async () => {
    const { service, contacts } = build()
    const result = await service.declareOrgPeople('acc-1', 'u-1', [{ fullName: 'Jean Dupont' }])
    if (isFailure(result)) throw new Error('succès attendu')
    expect(contacts.importOrgChartPeople).not.toHaveBeenCalled()
    expect(result.output.contacts).toBeUndefined()
  })
})
