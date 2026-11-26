import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { saveExpensePolicySchema } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ExpensePoliciesService } from './expense-policies.service'

class SaveExpensePolicyDto extends createZodDto(saveExpensePolicySchema) {}

/**
 * LE BARÈME DE FRAIS — le réglage (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN CONTRÔLEUR SÉPARÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * `expenses/reports` porte des DOSSIERS ; celui-ci porte un RÉGLAGE. Les mettre
 * ensemble aurait mis sous le même préfixe deux objets de durée de vie
 * opposée — une note vit quelques semaines, un barème des années — et surtout
 * deux droits différents : déposer une note demande `records:write`, écrire le
 * barème est une décision financière.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DROIT
 * ─────────────────────────────────────────────────────────────────────────────
 * **Lire** (`finance:read` OU `records:write`) : le barème explique POURQUOI une
 * note est « non vérifiée ». Le cacher à qui fait avancer la file lui laisserait
 * un verdict sans raison, donc ignoré.
 *
 * **Écrire** (`finance:write`) : un plafond décide de ce qu'on rembourse. C'est
 * le même poids que valider une note, et le même droit.
 */
@Controller('expenses/policies')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ExpensePoliciesController {
  constructor(
    private readonly policies: ExpensePoliciesService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** Un seul endroit résout l'espace — le service n'a pas à connaître le module
   *  Workspace (règle §3.2, garde GA-07). */
  private async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  @Get()
  @RequirePermission('finance:read', 'records:write')
  async board(@CurrentUser() user: CurrentUserPayload) {
    return this.policies.board(await this.workspaceOf(user.userId))
  }

  /**
   * ENREGISTRE une révision du barème, à sa date d'effet.
   *
   * `PUT` et non `POST` : le corps décrit l'ÉTAT du barème à cette date, et
   * ré-envoyer le même corps ne crée pas une seconde révision — il corrige la
   * première. C'est ce qui rend le geste rejouable après un timeout.
   */
  @Put()
  @RequirePermission('finance:write')
  async save(@CurrentUser() user: CurrentUserPayload, @Body() body: SaveExpensePolicyDto) {
    return this.policies.save(await this.workspaceOf(user.userId), body)
  }
}
