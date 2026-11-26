import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import type { ResetLinkTtlKey } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminIdentityService, type IdentityMergeResult } from './admin-identity.service'
import {
  AdminUsersService,
  type AdminCreditsResult,
  type AdminUserBanResult,
  type AdminUserDetail,
  type AdminUsersAuthStates,
} from './admin-users.service'
import { DeleteUserDto } from './dto/delete-user.dto'
import { GenerateResetLinkDto } from './dto/generate-reset-link.dto'
import { GrantCreditsDto } from './dto/grant-credits.dto'
import { MergeIdentitiesDto } from './dto/merge-identities.dto'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * Per-user backoffice management API — the powerful, auth-mutating half of the
 * admin surface (detail / suspend / delete / reset-link / credit grants).
 * Consumed server-side by the standalone `dashboard-manager` (Next.js) app,
 * which proxies these routes with the shared internal secret so it never reaches
 * the browser. Shares the `internal/admin` prefix with {@link InternalAdminController}
 * (the read-only directory) but is kept in its own controller/service pair so the
 * destructive operations stay isolated. Cross-tenant by design — the guard is the
 * only thing standing between this and the whole auth store. It must never be
 * removed.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly identities: AdminIdentityService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * La fiche d'un utilisateur, AVEC l'espace qu'il voit réellement.
   *
   * ⚠️ L'espace actif est résolu ICI, par `WorkspaceContextService` — LA
   * résolution du produit. Deux raisons, et la seconde compte autant :
   *  · la console doit montrer ce que l'utilisateur voit, jamais une seconde
   *    lecture qui pourrait en diverger (c'est la multiplication de ces copies
   *    qui a causé #1671-bis : quatre implémentations, deux qui sautaient
   *    l'étape du choix d'espace) ;
   *  · GA-07 interdit à un SERVICE d'importer celui d'un voisin et désigne le
   *    contrôleur comme la couche où un geste traverse deux domaines.
   *
   * Fail-soft : `resolveActiveWorkspace` lève pour un utilisateur sans aucun
   * espace. Une console qui rend 500 sur un cas limite ne sert plus à
   * diagnostiquer — on rend `null`, et aucune ligne n'est marquée.
   */
  /**
   * L'état d'authentification de tous les comptes, pour l'annuaire (#1664).
   *
   * ⚠️ LE CHEMIN N'EST PAS `users/auth-states`, ET C'EST DÉLIBÉRÉ. Ce
   * contrôleur porte `@Get('users/:userId')`, et deux contrôleurs partagent le
   * préfixe `internal/admin` : une route littérale sous `users/` dépendrait
   * alors de l'ordre de déclaration ET de l'ordre d'enregistrement des modules
   * pour ne pas être capturée par le paramètre. Un segment de premier niveau ne
   * peut être capturé par personne — c'est un piège déjà payé dans ce dépôt.
   */
  @Get('users-auth-states')
  listAuthStates(): Promise<AdminUsersAuthStates> {
    return this.users.listAuthStates()
  }

  @Get('users/:userId')
  async getUserDetail(@Param('userId') userId: string): Promise<AdminUserDetail> {
    const activeWorkspaceId = await this.workspaceContext
      .resolveActiveWorkspace(userId)
      .then(active => active.workspaceId)
      .catch(() => null)
    return this.users.getUserDetail(userId, activeWorkspaceId)
  }

  @Post('users/:userId/suspend')
  suspendUser(@Param('userId') userId: string): Promise<AdminUserBanResult> {
    return this.users.suspendUser(userId)
  }

  @Post('users/:userId/unsuspend')
  unsuspendUser(@Param('userId') userId: string): Promise<AdminUserBanResult> {
    return this.users.unsuspendUser(userId)
  }

  /**
   * Irréversible : le corps DOIT porter la confirmation exacte (#1664.2). La
   * décision "quoi supprimer" ne change pas — `AdminUsersService.deleteUser`
   * est intact — seule une porte s'ajoute devant : `DeleteUserDto` (Zod, via
   * le pipe global) refuse une requête sans `confirm: "SUPPRIMER"` avant même
   * d'atteindre cette méthode, donc avant que le service ne soit appelé.
   */
  @Delete('users/:userId')
  deleteUser(@Param('userId') userId: string, @Body() _dto: DeleteUserDto): Promise<{ deleted: true; userId: string }> {
    return this.users.deleteUser(userId)
  }

  /**
   * Le lien de réinitialisation, avec sa durée de vie CHOISIE (défaut 48 h).
   *
   * `ttl` est une clé d'une liste fermée, pas un nombre de minutes : un opérateur
   * qui saisirait « 999999 » obtiendrait un lien que Supabase refusera de toute
   * façon, et la réponse dit déjà l'échéance réellement accordée.
   */
  @Post('users/:userId/reset-link')
  resetLink(
    @Param('userId') userId: string,
    @Body() dto: GenerateResetLinkDto,
  ): Promise<{ link: string; email: string; expiresAt: string; ttl: ResetLinkTtlKey; clamped: boolean }> {
    return this.users.generateResetLink(userId, dto.ttl)
  }

  @Post('users/:userId/credits')
  grantCredits(@Param('userId') userId: string, @Body() dto: GrantCreditsDto): Promise<AdminCreditsResult> {
    return this.users.grantCredits(userId, { accounts: dto.accounts, enrichment: dto.enrichment, reason: dto.reason })
  }

  /* ------------------------------------------------------------------ */
  /*  Doublons d'identité (IDENT-01)                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Les comptes qui sont probablement la même personne, avec la RAISON de chaque
   * rapprochement et sa confiance. Lecture seule : rien n'est fusionné ici.
   */
  @Get('identities/duplicates')
  findDuplicates(
    @Query('minConfidence') minConfidence?: string,
    @Query('limit') limit?: string,
  ): Promise<{ pairs: unknown[]; scanned: number }> {
    return this.identities.findDuplicates({
      minConfidence: minConfidence ? Number(minConfidence) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  /**
   * Fusion CONTRÔLÉE : l'opérateur désigne lui-même le compte à garder et celui
   * à absorber, la détection ne fait que proposer. Aucun compte
   * d'authentification n'est supprimé — voir {@link AdminIdentityService}.
   */
  @Post('identities/merge')
  mergeIdentities(@Body() dto: MergeIdentitiesDto): Promise<IdentityMergeResult> {
    return this.identities.mergeIdentities(dto.keep_user_id, dto.absorb_user_id)
  }
}
