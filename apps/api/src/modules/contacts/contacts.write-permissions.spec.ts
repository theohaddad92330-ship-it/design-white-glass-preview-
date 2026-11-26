import 'reflect-metadata'
import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { can } from '@bellum/contracts'
import type { WorkspaceRole } from '@bellum/contracts'
import { ContactsController } from './contacts.controller'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2084.24 — TROIS ÉCRITURES DE CONTACT QUI N'AVAIENT PAS DE SIÈGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS une fuite entre espaces ni entre unités opérationnelles :
 * `updateStatus`, `updateNote` et `setHidden` sont bornées par `user_id` dans
 * `contacts.service.ts`, et la revue de sécurité du 20/09/2026 l'a vérifié
 * ligne à ligne. Personne ne pouvait atteindre le contact d'un autre.
 *
 * Ce que ces trois routes laissaient passer est un SIÈGE : `viewer` — dont le
 * contrat dit « strictly read-only … refused on every mutation » — changeait le
 * statut commercial d'un contact, écrivait sa note et le masquait. Le guard de
 * permissions est FAIL-OPEN par conception (une route non annotée passe
 * intacte, pour ne pas fermer l'immense majorité des lectures), donc l'absence
 * d'annotation n'est pas un oubli neutre : c'est une route ouverte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX FAMILLES DE CAS, ET PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * · La MÉTADONNÉE, par nom de méthode : elle dit que la bonne méthode porte la
 *   bonne permission. Un `grep` sur le fichier passerait au vert grâce aux neuf
 *   décorateurs déjà présents ailleurs, sans rien prouver sur ces trois-là.
 * · Le REFUS, en exerçant le VRAI guard contre la VRAIE matrice de rôles. Une
 *   annotation est une intention ; ce que voit un client est un 403. C'est le
 *   refus qui compte : les cas « passe » ci-dessous seraient verts même sans
 *   annotation, ce sont les témoins et non la preuve.
 */

const WS = 'ws-1'
const USER = 'user-1'

/** Les trois routes et le droit qu'elles doivent exiger. */
const ECRITURES = [
  ['updateStatus', 'records:write'],
  ['updateNote', 'records:write'],
  ['setHidden', 'records:write'],
] as const

const handlerOf = (method: string) => (ContactsController.prototype as unknown as Record<string, () => unknown>)[method]

describe('#2084.24 — les trois écritures de contact déclarent leur permission', () => {
  it.each(ECRITURES)('%s exige %s', (method, permission) => {
    const handler = handlerOf(method)
    expect(typeof handler).toBe('function')
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toEqual([permission])
  })

  it('la garde sait dire NON — une méthode inventée n’existe pas sur le contrôleur', () => {
    expect(handlerOf('updateStatutQuiNexistePas')).toBeUndefined()
  })

  it('ne garde PAS les lectures — voir les contacts de son équipe reste ouvert', () => {
    for (const method of ['findByAccount', 'findOne']) {
      const handler = handlerOf(method)
      if (typeof handler !== 'function') continue
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler as object)).toBeUndefined()
    }
  })
})

describe('#2084.24 — un `viewer` est REFUSÉ sur les trois, par le vrai guard', () => {
  let guard: WorkspacePermissionGuard
  let workspaces: MockRepository<WorkspaceEntity>
  let members: MockRepository<WorkspaceMemberEntity>

  /**
   * Un contexte d'exécution dont `getHandler()` rend la VRAIE méthode du
   * contrôleur : le guard lit donc la métadonnée réellement posée, pas une
   * permission qu'on lui souffle. Retirer le décorateur fait tomber ces cas.
   */
  const execContext = (method: string): ExecutionContext =>
    ({
      getHandler: () => handlerOf(method),
      getClass: () => ContactsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: USER } }) }),
    }) as unknown as ExecutionContext

  const asRole = (role: WorkspaceRole) => {
    workspaces.findOne.mockResolvedValue(null) // ne possède rien → on retombe sur l'appartenance
    members.findOne.mockResolvedValue({ workspace_id: WS, user_id: USER, role } as WorkspaceMemberEntity)
  }

  beforeEach(() => {
    workspaces = createMockRepository<WorkspaceEntity>()
    members = createMockRepository<WorkspaceMemberEntity>()
    const context = new WorkspaceContextService(workspaces as never, members as never, createMockRepository() as never)
    guard = new WorkspacePermissionGuard(new Reflector(), context)
  })

  it.each(ECRITURES)('%s refuse un `viewer` (403)', async method => {
    asRole('viewer')

    await expect(guard.canActivate(execContext(method))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each(ECRITURES)('%s refuse aussi `finance`, qui n’écrit aucune fiche', async method => {
    asRole('finance')

    await expect(guard.canActivate(execContext(method))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each(ECRITURES)('%s laisse passer le commercial — la garde ne borne pas ce qu’elle ne vise pas', async method => {
    // Témoin, pas preuve : sans annotation ce cas serait vert aussi. Il est là
    // pour attraper le débordement inverse — une permission trop serrée qui
    // fermerait le geste quotidien de ceux qui doivent le faire.
    asRole('sales')

    await expect(guard.canActivate(execContext(method))).resolves.toBe(true)
  })

  it('le droit choisi ferme EXACTEMENT les sièges qu’on voulait fermer', () => {
    expect(can('viewer', [], 'records:write')).toBe(false)
    expect(can('finance', [], 'records:write')).toBe(false)
    expect(can('tech_admin', [], 'records:write')).toBe(false)
    for (const role of ['owner', 'admin', 'sales', 'sales_ops', 'member'] as const) {
      expect(can(role, [], 'records:write')).toBe(true)
    }
  })
})
