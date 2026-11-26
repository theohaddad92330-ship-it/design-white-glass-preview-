import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { WorkspaceRole } from '@bellum/contracts'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { DocumentsController } from '../documents/documents.controller'
import { ConsultantsController } from '../consultants/consultants.controller'
import { IaProxyController } from '../ia-proxy/ia-proxy.controller'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { WorkspaceMemberPermissionEntity } from '../../database/entities/workspace-member-permission.entity'
import type { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2081.14 — AJUSTEMENT. DÉCISION Louis 19/09/2026 : le PDF du compte, les
 * dossiers de compétences (docx, pdf) et le deck (pptx) sont des LIVRABLES
 * COMMERCIAUX, pas des exports de données — ils redeviennent permis à tous,
 * même sous la règle d'espace « qui peut exporter » réservée aux
 * administrateurs. Le reste du lot H2 reste tenu : contacts.xlsx et l'export
 * d'un fil de chat restent réservés.
 *
 * Exercé contre le VRAI `WorkspacePermissionGuard`, le VRAI `Reflector` (donc
 * la VRAIE métadonnée posée par `@DataExit()` sur les méthodes réelles des
 * contrôleurs), et le VRAI `WorkspaceContextService` — ce que ces tests
 * mesurent est la réponse qu'un client recevrait (200 ou 403).
 */
const WS = 'ws-1'
const USER = 'user-1'

describe('#2081.14 — livrables commerciaux permis sous la règle « administrateurs »', () => {
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>
  let grants: MockRepository<WorkspaceMemberPermissionEntity>
  let rules: MockRepository<WorkspaceRulesEntity>
  let context: WorkspaceContextService
  let guard: WorkspacePermissionGuard

  const execContext = (handler: (...args: never[]) => unknown, klass: object): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => klass,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null)
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
    grants.find.mockResolvedValue([] as never)
  }

  const exportReservedToAdmins = () =>
    rules.findOne.mockResolvedValue({
      workspace_id: WS,
      business_unit_accounts_visibility: 'shared',
      export_policy: 'admins',
    } as WorkspaceRulesEntity)

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    grants = createMockRepository<WorkspaceMemberPermissionEntity>()
    rules = createMockRepository<WorkspaceRulesEntity>()
    context = new WorkspaceContextService(
      workspaces as never,
      members as never,
      createMockRepository() as never,
      grants as never,
      rules as never,
    )
    guard = new WorkspacePermissionGuard(new Reflector(), context)
    asRole('sales')
    exportReservedToAdmins()
  })

  it('le PDF du compte reste téléchargeable par un commercial — livrable commercial, pas une sortie de données', async () => {
    await expect(
      guard.canActivate(execContext(DocumentsController.prototype.accountDossierPdf, DocumentsController)),
    ).resolves.toBe(true)
  })

  it('le dossier de compte en Word reste téléchargeable par un commercial', async () => {
    await expect(
      guard.canActivate(execContext(DocumentsController.prototype.accountDossier, DocumentsController)),
    ).resolves.toBe(true)
  })

  it('un dossier de compétences (Word) reste téléchargeable par un commercial', async () => {
    await expect(
      guard.canActivate(execContext(ConsultantsController.prototype.downloadCvDocx, ConsultantsController)),
    ).resolves.toBe(true)
  })

  it('un dossier de compétences (PDF) reste téléchargeable par un commercial', async () => {
    await expect(
      guard.canActivate(execContext(ConsultantsController.prototype.downloadCvPdf, ConsultantsController)),
    ).resolves.toBe(true)
  })

  // #2081.14 — livrable commercial, décision Louis 19/09 : le même dossier en présentation.
  it('le deck du compte (pptx) reste téléchargeable par un commercial — même dossier, en présentation', async () => {
    await expect(
      guard.canActivate(execContext(DocumentsController.prototype.accountDeck, DocumentsController)),
    ).resolves.toBe(true)
  })

  it('contacts.xlsx reste refusé — sortie de données, pas un livrable', async () => {
    await expect(
      guard.canActivate(execContext(DocumentsController.prototype.contactsWorkbook, DocumentsController)),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it("l'export d'un fil de chat reste refusé", async () => {
    await expect(
      guard.canActivate(execContext(IaProxyController.prototype.exportChatThreadPdf, IaProxyController)),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
