import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { OdooConnectDto } from './dto/odoo.dto'
import { OdooService, type OdooConnectResult, type OdooStatus } from './odoo.service'

/**
 * Le connecteur Odoo.
 *
 * ⚠️ AUCUNE ROUTE PUBLIQUE ICI, et c'est la différence avec les quatre autres
 * CRM. HubSpot, Salesforce, Pipedrive et Attio exposent tous un `GET /callback`
 * non gardé : c'est une redirection de navigateur venue du fournisseur, qui ne
 * peut pas porter notre JWT — d'où le `state` signé qui l'authentifie à sa
 * place. Odoo ne passe par aucune redirection : la connexion est un POST de
 * l'application vers l'API. Il n'y a donc rien à signer, et pas une seule route
 * à laisser ouverte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX PERMISSIONS, ET NON UNE
 * ─────────────────────────────────────────────────────────────────────────
 * BRANCHER ou DÉBRANCHER une instance touche l'espace entier : c'est
 * `integrations:manage`. POUSSER un contact écrit une fiche chez le client :
 * c'est `records:write`. Les confondre donnerait à qui peut exporter un
 * contact le droit de débrancher le CRM de toute l'équipe — ou l'inverse,
 * refuserait un export à qui n'administre pas les intégrations.
 *
 * `GET /status` n'en porte AUCUNE, à dessein : lire l'état de son propre
 * espace n'est pas un privilège, et le refuser masquerait la carte à qui a le
 * droit de s'en servir.
 */
@Controller('odoo')
export class OdooController {
  constructor(private readonly odoo: OdooService) {}

  @Get('status')
  /* Lire l'état de son PROPRE espace n'est pas un privilège : `@WorkspaceRead`
     déclare la portée sans exiger de rôle. Le refuser masquerait la carte à qui
     a parfaitement le droit de s'en servir. */
  @WorkspaceRead()
  @UseGuards(JwtGuard)
  status(@CurrentUser() user: CurrentUserPayload): Promise<OdooStatus> {
    return this.odoo.getStatus(user.userId)
  }

  /**
   * Branche l'espace. Rend `{ ok: false, reason }` plutôt qu'un 4xx quand les
   * identifiants sont refusés : c'est une réponse de FORMULAIRE, pas une panne,
   * et l'écran doit pouvoir afficher la raison sous le champ fautif.
   */
  @Post('connect')
  @RequirePermission('integrations:manage')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  connect(@CurrentUser() user: CurrentUserPayload, @Body() dto: OdooConnectDto): Promise<OdooConnectResult> {
    return this.odoo.connect(user.userId, dto)
  }

  // #4186.1 — l'export de contact vers ce CRM passe désormais par la porte
  // commune : `POST /crm/push/contact` (`provider: 'odoo'`). Cette route
  // écrivait en direct, sans trace ni prévisualisation.

  @Delete()
  @RequirePermission('integrations:manage')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  disconnect(@CurrentUser() user: CurrentUserPayload): Promise<{ removed: boolean; warning: string }> {
    return this.odoo.disconnect(user.userId)
  }
}
