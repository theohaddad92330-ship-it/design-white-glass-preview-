import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { isFailure } from '@bellum/utils'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { CopilotAccountOrgChartDto } from './dto/copilot-bridge.dto'
import { projectOrgChart, type OrgChartProjection } from './org-chart-projection'

/**
 * LOT (15/10) DATA-B.4 — « Qui décide chez X ? » : Laura lit la MÊME carte que l'onglet Organigramme.
 *
 * `raw_analysis.org.orgGraph` existait, calculé et affiché, sans aucun appelant côté chat (le défaut du
 * dépôt : du code juste que personne n'appelle). Cette route le relaie — bornée par `projectOrgChart`, sans
 * les personnes écartées —, jamais un second calcul. Aucune lecture externe : le graphe est celui que
 * l'analyse a stocké (l'effacement RGPD d'une personne l'y a déjà purgée, c67).
 *
 * Contrôleur à part (même motif que `CopilotAccountVersioningController`) : l'ownership est revérifiée ICI
 * (`AccountsService.findOne` scopé `userId`), jamais une confiance transitive sur le secret interne.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotAccountOrgChartController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
  ) {}

  @Post('account/org-chart')
  async orgChart(@Body() dto: CopilotAccountOrgChartDto): Promise<OrgChartProjection | { error: string }> {
    const account = await this.accounts.findOne(dto.accountId, dto.userId)
    // Même réponse que le NO-GO ownership du reste du dépôt : jamais une erreur qui confirmerait qu'un
    // compte étranger existe.
    if (isFailure(account)) return { error: 'account_not_found' }
    const raw = (account.output as { raw_analysis?: Record<string, unknown> | null }).raw_analysis
    const contacts = await this.contacts.findByAccountForHttp(dto.accountId, dto.userId)
    const excludedNames = contacts.filter(c => c.excluded_at).map(c => c.full_name)
    return projectOrgChart(raw?.['org'], excludedNames)
  }
}
