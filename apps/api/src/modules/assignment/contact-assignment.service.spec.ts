import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ContactAssignmentService } from './contact-assignment.service'

/**
 * Attribution en masse d'une SÉLECTION de contacts. Les règles d'autorisation
 * sont celles du portefeuille compte ({@link AccountAssignmentService}) — lues
 * dans la matrice RBAC, jamais dans des chaînes de rôle — avec une différence
 * assumée : une sélection est un lot, donc une ligne qu'un commercial n'a pas le
 * droit de bouger est IGNORÉE (et rapportée) plutôt que de faire échouer les
 * neuf autres. Une violation catégorique (attribuer à quelqu'un d'autre) reste,
 * elle, un refus franc.
 */
describe('ContactAssignmentService', () => {
  let contacts: { find: jest.Mock; update: jest.Mock }
  let workspaceContext: { resolveActiveWorkspace: jest.Mock; getMembership: jest.Mock; isDemoWorkspace: jest.Mock }
  let service: ContactAssignmentService

  const contact = (id: string, assigned_to: string | null = null) => ({ id, workspace_id: 'ws-1', assigned_to })

  const asRole = (role: string, userId = 'u-manager') => {
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1', role })
    return userId
  }

  beforeEach(() => {
    contacts = {
      find: jest.fn().mockResolvedValue([contact('c-1'), contact('c-2')]),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
    }
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      getMembership: jest.fn().mockResolvedValue({ user_id: 'u-rep', role: 'sales' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    service = new ContactAssignmentService(
      contacts as never,
      workspaceContext as unknown as WorkspaceContextService,
      {} as never,
      {} as never,
      {} as never,
    )
  })

  // #2160.9 — la salle de démonstration n'a qu'un seul occupant (`DEMO_OWNER`) :
  // attribuer ou retirer n'y a aucun sens et écrirait pour de vrai dans le
  // jeu de démo partagé. Même doctrine que le signalement (`feedback.controller.ts`)
  // et le dépôt RAG (`rag.controller.ts`) : le refus vient AVANT toute lecture.
  it('refuses to write in a demo workspace, before any read', async () => {
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)

    await expect(service.assignMany('u-visitor', ['c-1'], 'u-rep')).rejects.toBeInstanceOf(BadRequestException)
    expect(contacts.find).not.toHaveBeenCalled()
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('refuses a release in a demo workspace too', async () => {
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)

    await expect(service.assignMany('u-visitor', ['c-1'], null)).rejects.toBeInstanceOf(BadRequestException)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('lets a manager assign the whole selection to another member', async () => {
    const result = await service.assignMany(asRole('owner'), ['c-1', 'c-2'], 'u-rep')

    expect(result).toEqual({ assigned_to: 'u-rep', assigned: ['c-1', 'c-2'], skipped: [] })
    expect(contacts.update).toHaveBeenCalledWith({ id: expect.anything() }, { assigned_to: 'u-rep' })
  })

  it('lets a manager release the whole selection back to the unassigned queue', async () => {
    contacts.find.mockResolvedValue([contact('c-1', 'u-rep'), contact('c-2', 'u-other')])

    const result = await service.assignMany(asRole('admin'), ['c-1', 'c-2'], null)

    expect(result).toEqual({ assigned_to: null, assigned: ['c-1', 'c-2'], skipped: [] })
  })

  // La matrice accorde `team:manage` à sales_ops ; l'ancienne garde manager le
  // refuse. L'attribution suit la matrice (même choix que le portefeuille).
  it('treats sales_ops as a manager because the matrix grants it team:manage', async () => {
    await expect(service.assignMany(asRole('sales_ops'), ['c-1'], 'u-rep')).resolves.toMatchObject({
      assigned: ['c-1'],
    })
  })

  it('lets a rep claim the unassigned contacts of their selection', async () => {
    const result = await service.assignMany(asRole('sales', 'u-rep'), ['c-1', 'c-2'], 'u-rep')

    expect(result.assigned).toEqual(['c-1', 'c-2'])
    expect(result.skipped).toEqual([])
  })

  // Le cœur du « retour honnête » : le lot passe, la ligne interdite est
  // rapportée — pas d'échec silencieux, pas d'échec global non plus.
  it("skips (never steals) a colleague's contact when a rep claims a selection", async () => {
    contacts.find.mockResolvedValue([contact('c-1'), contact('c-2', 'u-other')])

    const result = await service.assignMany(asRole('sales', 'u-rep'), ['c-1', 'c-2'], 'u-rep')

    expect(result).toEqual({ assigned_to: 'u-rep', assigned: ['c-1'], skipped: ['c-2'] })
    expect(contacts.update).toHaveBeenCalledWith({ id: expect.anything() }, { assigned_to: 'u-rep' })
  })

  it('refuses outright a rep assigning the selection to somebody else', async () => {
    await expect(service.assignMany(asRole('sales', 'u-rep'), ['c-1'], 'u-other')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('lets a rep release only the contacts they hold', async () => {
    contacts.find.mockResolvedValue([contact('c-1', 'u-rep'), contact('c-2', 'u-other')])

    const result = await service.assignMany(asRole('sales', 'u-rep'), ['c-1', 'c-2'], null)

    expect(result).toEqual({ assigned_to: null, assigned: ['c-1'], skipped: ['c-2'] })
  })

  // `viewer` ne détient aucune permission, `tech_admin` ne gère que les
  // intégrations : ni l'un ni l'autre ne porte de portefeuille commercial.
  it.each(['viewer', 'tech_admin'])('refuses %s outright', async role => {
    await expect(service.assignMany(asRole(role, 'u-x'), ['c-1'], 'u-x')).rejects.toBeInstanceOf(ForbiddenException)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('refuses assigning to someone who is not a member of the workspace', async () => {
    workspaceContext.getMembership.mockResolvedValue(null)

    await expect(service.assignMany(asRole('owner'), ['c-1'], 'stranger')).rejects.toBeInstanceOf(BadRequestException)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('does not check membership when releasing (null target)', async () => {
    contacts.find.mockResolvedValue([contact('c-1', 'u-rep')])

    await service.assignMany(asRole('owner'), ['c-1'], null)

    expect(workspaceContext.getMembership).not.toHaveBeenCalled()
  })

  // Le scoping workspace EST la barrière de sécurité : l'API tourne en BYPASSRLS.
  it('scopes the lookup by workspace, never by id alone', async () => {
    await service.assignMany(asRole('owner'), ['c-1', 'c-2'], 'u-rep')

    expect(contacts.find).toHaveBeenCalledWith({
      where: { id: expect.anything(), workspace_id: 'ws-1' },
      select: ['id', 'assigned_to'],
    })
  })

  it('404s when NOTHING in the selection belongs to the caller workspace, without writing', async () => {
    contacts.find.mockResolvedValue([])

    await expect(service.assignMany(asRole('owner'), ['c-other-ws'], 'u-rep')).rejects.toBeInstanceOf(NotFoundException)
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('reports ids outside the workspace as skipped when part of the selection resolves', async () => {
    contacts.find.mockResolvedValue([contact('c-1')])

    const result = await service.assignMany(asRole('owner'), ['c-1', 'c-other-ws'], 'u-rep')

    expect(result).toEqual({ assigned_to: 'u-rep', assigned: ['c-1'], skipped: ['c-other-ws'] })
  })

  it('writes nothing when every line of the selection is skipped', async () => {
    contacts.find.mockResolvedValue([contact('c-1', 'u-other')])

    const result = await service.assignMany(asRole('sales', 'u-rep'), ['c-1'], 'u-rep')

    expect(result).toEqual({ assigned_to: 'u-rep', assigned: [], skipped: ['c-1'] })
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('deduplicates a selection that repeats the same id', async () => {
    contacts.find.mockResolvedValue([contact('c-1')])

    const result = await service.assignMany(asRole('owner'), ['c-1', 'c-1'], 'u-rep')

    expect(result.assigned).toEqual(['c-1'])
    expect(result.skipped).toEqual([])
  })
})
