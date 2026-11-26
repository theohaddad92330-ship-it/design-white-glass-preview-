import { isFailure, success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import type { AccountsService } from '../accounts/accounts.service'
import type { ContactsService } from '../contacts/contacts.service'
import type { IaClient } from '../ia/ia.client'
import type { AnalysisPersistenceService } from './analysis.persistence'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #4072.1 — l'organigramme lit les organigrammes PRÉSENTS dans les documents
 * de l'espace. L'IA extrait (aucun modèle), l'API PROPOSE : aucune écriture ici,
 * la validation passe par `declareOrgPeople`.
 */
const account = {
  id: 'acc-1',
  user_id: 'u-1',
  workspace_id: 'ws-1',
  company_name: 'Sanofi',
} as unknown as AccountEntity

function build(envelope: unknown, reject?: Error, demo = false, company = 'Sanofi') {
  const ia = {
    orgDocumentPeople: reject ? jest.fn().mockRejectedValue(reject) : jest.fn().mockResolvedValue(envelope),
  }
  const service = new AnalysisOnDemandService(
    {
      findOne: jest.fn().mockResolvedValue(success({ ...account, company_name: company })),
    } as unknown as AccountsService,
    {} as ContactsService,
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService,
    { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    undefined,
    { isDemoWorkspace: jest.fn().mockResolvedValue(demo) } as unknown as WorkspaceContextService,
  )
  return { service, ia }
}

describe('AnalysisOnDemandService.proposeOrgPeopleFromDocuments', () => {
  it("demande à l'IA les documents du demandeur, dans SON espace et pour CE compte", async () => {
    const { service, ia } = build({ data: { people: [], documents_read: 0, truncated: false } })
    await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
    expect(ia.orgDocumentPeople).toHaveBeenCalledWith({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'acc-1' })
  })

  it('rend les personnes écrites, datées du DOCUMENT, avec le N+1 seulement quand il est écrit', async () => {
    const { service } = build({
      data: {
        people: [
          {
            fullName: 'Marie Durand',
            title: 'DSI',
            documentDate: '2023-03-12',
            date_basis: 'document',
            source: 'Orga',
          },
          { fullName: 'Jean Petit', managerName: 'Marie Durand', documentDate: '2023-03-12' },
        ],
        documents_read: 1,
        truncated: false,
      },
    })
    const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
    if (isFailure(result)) throw new Error('succès attendu')
    expect(result.output.people).toEqual([
      { fullName: 'Marie Durand', title: 'DSI', documentDate: '2023-03-12' },
      { fullName: 'Jean Petit', managerName: 'Marie Durand', documentDate: '2023-03-12' },
    ])
    expect(result.output.documentsRead).toBe(1)
    expect(result.output.truncated).toBe(false)
  })

  it("NON : une date qui n'est pas AAAA-MM-JJ ne passe pas (la déclaration serait refusée)", async () => {
    const { service } = build({ data: { people: [{ fullName: 'Marie Durand', documentDate: 'mars 2023' }] } })
    const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
    if (isFailure(result)) throw new Error('succès attendu')
    expect(result.output.people).toEqual([{ fullName: 'Marie Durand' }])
  })

  it('une IA en panne est un échec NOMMÉ, pas « aucun organigramme »', async () => {
    const { service } = build(undefined, new Error('boom'))
    const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
    expect(isFailure(result)).toBe(true)
  })

  // #4072.7 — recette R46 : en démo le bouton finissait en toast « HTTP request failed ».
  describe('espace de démonstration (#4072.7)', () => {
    it("n'appelle JAMAIS l'IA et rend la proposition datée du document semé, même si l'IA est en panne", async () => {
      const { service, ia } = build(undefined, new Error('HTTP request failed'), true, 'Société Générale')
      const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
      if (isFailure(result)) throw new Error('succès attendu')
      expect(ia.orgDocumentPeople).not.toHaveBeenCalled()
      expect(result.output.documentsRead).toBe(1)
      expect(result.output.people.map(person => person.fullName)).toContain('Pierre Palmieri')
      expect(result.output.people.every(person => person.documentDate === '2026-03-12')).toBe(true)
    })

    it('un compte sans organigramme déposé : « aucun organigramme (0 lu) », jamais une personne inventée', async () => {
      const { service } = build(undefined, new Error('HTTP request failed'), true, 'Groupe BPCE')
      const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
      if (isFailure(result)) throw new Error('succès attendu')
      expect(result.output).toEqual({ people: [], documentsRead: 0, truncated: false })
    })

    it('hors démo, la lecture réelle passe toujours par l’IA', async () => {
      const { service, ia } = build({ data: { people: [], documents_read: 2 } }, undefined, false, 'Société Générale')
      const result = await service.proposeOrgPeopleFromDocuments('acc-1', 'u-1')
      if (isFailure(result)) throw new Error('succès attendu')
      expect(ia.orgDocumentPeople).toHaveBeenCalledTimes(1)
      expect(result.output.documentsRead).toBe(2)
    })
  })
})
