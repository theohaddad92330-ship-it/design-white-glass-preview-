import type { Brand } from '@bellum/contracts'
import { Body, Controller, Get, Headers, Patch, UseGuards } from '@nestjs/common'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from './require-permission.decorator'
import { UpdateWorkspaceBrandDto } from './workspace-brand.dto'
import { WorkspaceBrandService, type DocumentIdentity } from './workspace-brand.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'

/**
 * LA MARQUE — un contrôleur à part, et la raison tient en une route.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS DANS `WorkspaceController`
 * ─────────────────────────────────────────────────────────────────────────
 * Celui-ci porte `@UseGuards(JwtGuard)` au niveau de la CLASSE : toutes ses
 * routes exigent un jeton. Or la marque doit être lisible **avant toute
 * authentification** — c'est l'écran de connexion qui en a le plus besoin, et
 * c'est précisément le premier écran que les clients d'un client voient.
 *
 * Y glisser une exception ferait sauter la garde de classe pour tout le
 * contrôleur, ou obligerait à un `@Public()` que rien ne rend visible en
 * lisant l'entête. Un contrôleur séparé DIT que la porte publique existe, et
 * la borne à une seule route.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE LA ROUTE PUBLIQUE PEUT RENDRE, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 * Un nom, un nom de copilote, une URL de logo, une couleur. **Jamais** un
 * identifiant d'espace, un nombre de comptes, une raison sociale, un statut
 * d'abonnement. Quelqu'un qui balaie les domaines n'apprend que ce qu'il
 * verrait en ouvrant la page dans son navigateur — c'est le seuil, et
 * `WorkspaceBrandService.getForDomain` le tient en ne lisant que ces champs.
 *
 * Un domaine inconnu rend la marque du PRODUIT, jamais une 404 : une 404
 * dirait à qui balaie quels domaines sont pris, et l'écran de connexion doit
 * s'afficher de toute façon.
 */
@Controller()
export class BrandController {
  constructor(private readonly brand: WorkspaceBrandService) {}

  /**
   * `GET /brand` — la marque servie sur cet hôte. **Publique.**
   *
   * L'hôte est lu dans l'en-tête, donc fourni par le client. Ce n'est pas un
   * problème de confiance ici : le pire qu'un client puisse faire en mentant
   * sur son `Host` est de s'afficher la marque d'un autre — la même qu'il
   * verrait en tapant l'adresse. Aucune donnée ne dépend de cette valeur.
   */
  @Get('brand')
  @WorkspaceRead()
  getPublicBrand(@Headers('host') host: string | undefined): Promise<Brand> {
    return this.brand.getForDomain(host)
  }

  /** `GET /workspaces/brand` — la marque de l'espace actif. Tout membre la lit. */
  @Get('workspaces/brand')
  @WorkspaceRead()
  @UseGuards(JwtGuard)
  getBrand(@CurrentUser() user: CurrentUserPayload): Promise<Brand> {
    return this.brand.getForUser(user.userId)
  }

  /**
   * `GET /workspaces/brand/documents` — la signature proposée et le pied de document de l'espace actif (Théo D
   * settings-espace.N5). Authentifiée, jamais publique : contrairement à la marque, ces textes (coordonnées d'un
   * commercial, mention légale) n'ont aucune raison de se lire avant la connexion.
   */
  @Get('workspaces/brand/documents')
  @WorkspaceRead()
  @UseGuards(JwtGuard)
  getDocumentIdentity(@CurrentUser() user: CurrentUserPayload): Promise<DocumentIdentity> {
    return this.brand.getDocumentIdentityForUser(user.userId)
  }

  /**
   * `PATCH /workspaces/brand` — enregistre la marque.
   *
   * `integrations:manage` : c'est le droit d'administrer ce que l'espace
   * expose au monde, la même famille que brancher un connecteur. Le service
   * exige en plus le rôle propriétaire ou administrateur — un réglage qui
   * change ce que TOUTE l'équipe et tous ses clients voient ne se prend pas
   * depuis un siège de membre.
   */
  @Patch('workspaces/brand')
  @RequirePermission('integrations:manage')
  @UseGuards(JwtGuard, WorkspacePermissionGuard)
  updateBrand(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateWorkspaceBrandDto): Promise<Brand> {
    return this.brand.update(user.userId, dto)
  }
}
