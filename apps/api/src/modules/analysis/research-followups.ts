import type { Logger } from '@nestjs/common'
import { buildHistoricalNeeds, type AnalysisResearchData } from '@bellum/contracts'
import { withoutHomonymResearchFacts } from '../accounts/research-homonym-facts'
import type { AnalysisPersistenceService } from './analysis.persistence'
import type { NeedProposalsService } from './need-proposals.service'
import type { CrmDealLinkPort } from './crm-deal-link-port'

/**
 * Lot 762 P4 — UN SEUL chemin pour ce qui suit une recherche persistée, partagé par l'ANALYSE complète
 * (`AnalysisWorker`) et l'ACTUALISATION (`AnalysisOnDemandService.runResearch`, donc « Actualiser »,
 * le refresh de la veille et le rattrapage de segment). Avant, l'actualisation n'appelait que
 * `ia.research` + `refreshResearch` : `historical_needs` restait périmé et aucune proposition de besoin
 * ne naissait des offres fraîchement lues. Une omission corrigée ici l'est pour les deux chemins.
 */

/** Garde-fou de collecte : ni signal ni angle d'un homonyme n'entre au dossier (LUDOVIC-D LC.2). */
export function guardResearchForPersistence(data: AnalysisResearchData): AnalysisResearchData {
  return withoutHomonymResearchFacts(data).data
}

/** Les offres détectées deviennent des besoins PROPOSÉS — jamais des besoins. Best-effort. */
export async function recordNeedProposalsFor(
  deps: {
    persistence: AnalysisPersistenceService
    needProposals?: NeedProposalsService
    logger: Pick<Logger, 'log' | 'warn'>
  },
  workspaceId: string | null,
  accountId: string,
): Promise<void> {
  if (!deps.needProposals || !workspaceId) return
  try {
    const rows = await deps.persistence.readJobSignals(accountId)
    if (rows.length === 0) return
    const written = await deps.needProposals.record(workspaceId, accountId, rows)
    if (written > 0) deps.logger.log(`${written} besoin(s) proposé(s) depuis les offres détectées`, { accountId })
  } catch (err) {
    deps.logger.warn('Propositions de besoins non enregistrées (non bloquant)', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * #4760 — nomme au dossier les besoins historiques (`raw_analysis.historical_needs`). Une couche absente
 * n'écrit rien ; une couche sans historique retire la clé périmée. Best-effort.
 */
export async function recordHistoricalNeedsFor(
  deps: { persistence: AnalysisPersistenceService; logger: Pick<Logger, 'log' | 'warn'> },
  accountId: string,
): Promise<void> {
  try {
    const read = await deps.persistence.readSignalLayers(accountId)
    if (read.historicalCount === null) return
    const block = buildHistoricalNeeds(read)
    await deps.persistence.saveHistoricalNeeds(accountId, block)
    if (block) deps.logger.log(`${block.total} besoin(s) historique(s) nommé(s) au dossier`, { accountId })
  } catch (err) {
    deps.logger.warn('Besoins historiques non lus (non bloquant)', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Lot 762 P5 — rejoue le rattachement deal CRM → compte de l'espace (id société, SIREN, domaine, puis nom
 * UNIVOQUE seulement ; ambigu ⇒ non rattaché). Sans CRM ni espace : rien. Best-effort (le lecteur avale).
 */
export async function linkCrmDealsFor(deps: { crmRead?: CrmDealLinkPort }, workspaceId: string | null): Promise<void> {
  if (!deps.crmRead || !workspaceId) return
  await deps.crmRead.linkDealsForWorkspace(workspaceId)
}
