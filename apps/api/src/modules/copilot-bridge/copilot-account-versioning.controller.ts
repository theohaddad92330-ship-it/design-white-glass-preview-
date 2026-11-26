import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import { isFailure } from '@bellum/utils'
import { withDataforgeVersion, type AnalysisVersioning } from '@bellum/contracts'
import { AccountIntelligenceContextService } from '../account-intelligence/account-intelligence-context.service'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AccountsService } from '../accounts/accounts.service'
import { AnalysisRunsService, type VerdictComparison, type VerdictRevision } from '../analysis/analysis-runs.service'
import { CopilotAccountVersioningDto } from './dto/copilot-bridge.dto'

/**
 * #3212.3/.4/.6 (épopée #3235) — le VERSIONING et la révision de verdict du
 * dernier dossier d'un compte, jusqu'au chat. `analysisVersioningSchema`
 * (#2318.5) vivait sur `analysis_runs` côté NestJS, jamais lu ni projeté par
 * `get_account_briefing` côté chat (`chat_tools.py`) — c'est exactement le
 * trou que ce pont bouche.
 *
 * Contrôleur À PART, même raison que ses jumeaux du module : ownership
 * revérifiée ICI (`AccountsService.findOne`, scopé `userId`) plutôt que de
 * faire confiance à l'appelant, même si le chat a déjà vérifié la sienne côté
 * Supabase avant d'appeler ce pont — deux vérifications indépendantes, jamais
 * une confiance transitive sur un secret interne partagé par tout le moteur IA.
 *
 * `analysis_runs` n'a pas de RLS (mirror `credit_ledger`) : c'est précisément
 * pour ça qu'aucun appelant IA ne le lit directement via Supabase, et que ce
 * pont existe.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotAccountVersioningController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly runs: AnalysisRunsService,
    // #3235 — `dataforge_version` ne se lit QUE par la façade (GA-281/GA-37).
    @Optional() private readonly intelligence?: AccountIntelligenceContextService,
  ) {}

  @Post('accounts/versioning')
  async versioning(@Body() dto: CopilotAccountVersioningDto): Promise<{
    versioning: AnalysisVersioning | null
    verdictRevision: VerdictRevision | null
    verdictComparison: VerdictComparison | null
  }> {
    const account = await this.accounts.findOne(dto.accountId, dto.userId)
    if (isFailure(account)) {
      // Même réponse que le NO-GO ownership du reste du dépôt : « rien à
      // lire », jamais une erreur qui confirmerait qu'un compte étranger existe.
      return { versioning: null, verdictRevision: null, verdictComparison: null }
    }

    // #3235 (recette 13/10) — le verdict COURANT du dossier, pour rattraper une dernière analyse sans instantané.
    const raw = (account.output as { raw_analysis?: Record<string, unknown> | null }).raw_analysis
    const plan = raw && typeof raw['plan'] === 'object' ? (raw['plan'] as Record<string, unknown> | null) : null
    const evaluation =
      plan && typeof plan['evaluation'] === 'object' ? (plan['evaluation'] as Record<string, unknown> | null) : null
    const currentVerdict = typeof evaluation?.['verdict'] === 'string' ? (evaluation['verdict'] as string) : null

    const [runs, verdictRevision, verdictComparison] = await Promise.all([
      this.runs.listForAccount(dto.accountId, 1),
      this.runs.explainVerdictChange(dto.accountId),
      this.runs.compareLastRuns(dto.accountId, currentVerdict),
    ])
    // #3235 — Laura lit « Pourquoi le verdict a changé ? » avec la version
    // DataForge qui décrit le compte, lue par la façade (jamais devinée).
    const workspaceId = account.output.workspace_id
    const dataforgeVersion =
      this.intelligence && workspaceId ? await this.intelligence.dataforgeVersionFor(dto.accountId, workspaceId) : null
    return {
      versioning: withDataforgeVersion(runs[0]?.versioning ?? null, dataforgeVersion),
      verdictRevision,
      verdictComparison,
    }
  }
}
