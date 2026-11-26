import { success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisController } from './analysis.controller'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { IaClient } from '../ia/ia.client'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'

/** #4072.1 — la frontière contrôleur↔service de `POST :accountId/org-people/from-documents`. */
const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }
const account = {
  id: 'acc-1',
  user_id: 'u-1',
  workspace_id: 'ws-1',
  company_name: 'Sanofi',
} as unknown as AccountEntity

function buildController() {
  const ia = {
    orgDocumentPeople: jest.fn().mockResolvedValue({
      data: { people: [{ fullName: 'Marie Durand', documentDate: '2023-03-12' }], documents_read: 1, truncated: false },
    }),
  }
  const onDemand = new AnalysisOnDemandService(
    { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
    {} as ContactsService,
    ia as unknown as IaClient,
    {} as AnalysisPersistenceService, // aucune écriture : on PROPOSE
    { getAnswers: jest.fn(), resolveProfileData: jest.fn() } as unknown as EsnProfileReader,
    undefined,
    { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as unknown as WorkspaceContextService,
  )
  const stub = {} as never
  const controller = new AnalysisController(stub, onDemand, stub, stub, stub, stub, stub, stub, stub, stub, stub)
  return { controller, ia }
}

describe('AnalysisController.proposeOrgPeopleFromDocuments — intégration (#4072.1)', () => {
  it("la route appelle la lecture des documents de l'espace et rend une PROPOSITION datée", async () => {
    const { controller, ia } = buildController()
    const result = await controller.proposeOrgPeopleFromDocuments('acc-1', USER)
    expect(ia.orgDocumentPeople).toHaveBeenCalledWith({ userId: 'u-1', workspaceId: 'ws-1', accountId: 'acc-1' })
    expect(result).toMatchObject({
      people: [{ fullName: 'Marie Durand', documentDate: '2023-03-12' }],
      documentsRead: 1,
    })
  })
})
