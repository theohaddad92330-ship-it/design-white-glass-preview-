import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  AdminOpsService,
  type AdminMethodCorpusGovernanceReport,
  type AdminMigrationsReport,
  type AdminModelRoutingReport,
  type AdminPromptRegistryDiffReport,
  type AdminPromptRegistryReport,
  type AdminRightsMatrixReport,
  type AdminRouteMigrationReport,
  type AdminSystemHealth,
  type AdminUsageReport,
} from './admin-ops.service'
import { DeclareModelRoutingEvalDto } from './dto/declare-model-routing-eval.dto'

/**
 * Operator observability API — cost/usage analytics + system health for the
 * standalone `dashboard-manager` (Next.js). Sibling of {@link
 * InternalAdminController}: same `internal/admin` prefix, same
 * `InternalSecretGuard`. Everything is cross-tenant by design (the operator
 * manages ALL users/workspaces), so the guard is the only thing between this and
 * the whole database. It must never be removed.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get('usage')
  getUsage(): Promise<AdminUsageReport> {
    return this.ops.getUsage()
  }

  @Get('health')
  getHealth(): Promise<AdminSystemHealth> {
    return this.ops.getHealth()
  }

  /** #2445.11 — statut migrations (appliquées / en attente), lecture seule. */
  @Get('migrations')
  getMigrations(): Promise<AdminMigrationsReport> {
    return this.ops.getMigrations()
  }

  /** #2445.2 — politique de routage modèle par capacité, lecture seule. */
  @Get('model-routing')
  getModelRouting(): Promise<AdminModelRoutingReport> {
    return this.ops.getModelRouting()
  }

  /** #2975 / #2440.82 — pose ou corrige la déclaration qu'UNE destination de
   *  routage a été réévaluée. `declaredBy` vient de la session back-office
   *  (résolue par l'appelant Next.js), jamais du navigateur directement. */
  @Post('model-routing/evals')
  declareModelRoutingEval(@Body() body: DeclareModelRoutingEvalDto): Promise<{ ok: boolean }> {
    return this.ops.declareModelRoutingEval(body.destinationKey, body.declaredBy, body.note ?? null)
  }

  /** #2445.1 — registre de prompts (liste + version), lecture seule. */
  @Get('prompt-registry')
  getPromptRegistry(): Promise<AdminPromptRegistryReport> {
    return this.ops.getPromptRegistry()
  }

  /** #2445.1 — diff d'un prompt entre deux refs git + commande de rollback
   *  (jamais exécutée), lecture seule. */
  @Get('prompt-registry/:name/diff')
  getPromptRegistryDiff(
    @Param('name') name: string,
    @Query('refA') refA: string,
    @Query('refB') refB?: string,
  ): Promise<AdminPromptRegistryDiffReport> {
    return this.ops.getPromptRegistryDiff(name, refA, refB)
  }

  /** #2445.4 — matrice des droits par outil (lecture/proposition/dépense), lecture seule. */
  @Get('rights-matrix')
  getRightsMatrix(): Promise<AdminRightsMatrixReport> {
    return this.ops.getRightsMatrix()
  }

  /** #3274.5 — gouvernance du corpus méthode (owner, état, verdict d'audit,
   *  identifiants réellement branchés au retrieval IA), lecture seule. */
  @Get('method-corpus-governance')
  getMethodCorpusGovernance(): Promise<AdminMethodCorpusGovernanceReport> {
    return this.ops.getMethodCorpusGovernance()
  }

  /**
   * #2958 — registre de migration de routes (#2154.3), conditions NO-GO/GO
   * (#2154.31/.32), rollback (#2154.7), coexistence (#2154.8) et
   * non-régression (#2154.9). Lecture seule.
   */
  @Get('route-migration')
  getRouteMigration(): AdminRouteMigrationReport {
    return this.ops.getRouteMigration()
  }
}
