import { Injectable } from '@nestjs/common'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import {
  ORG_FRESHNESS_STALE_AFTER_DAYS,
  orgGraphSchema,
  orgRevalidationQueue,
  type OrgRevalidationTarget,
} from '@bellum/contracts'
import { OrgEnrichmentPlannerService, type OrgEnrichmentFailure } from './org-enrichment-planner.service'

/**
 * Ce que la file rend. `graphReadable: false` dit qu'on n'a PAS pu lire le
 * graphe — distinct d'une file vide, qui dit qu'il n'y a rien à revérifier.
 * Les confondre ferait afficher « tout est à jour » sur un dossier illisible.
 */
type OrgFreshnessQueue = {
  graphReadable: boolean
  staleAfterDays: number
  /** Le plus ancien d'abord. Vide ET lisible = tout est frais. */
  targets: OrgRevalidationTarget[]
  /**
   * Combien de personnes / relations sont périmées, et combien n'ont jamais été
   * vérifiées. Deux comptes distincts : ils ne se soignent pas pareil.
   *
   * `null` quand le graphe est illisible — jamais `0`, qui se lirait « rien à
   * revérifier » sur un dossier qu'on n'a pas su ouvrir.
   */
  stale: number | null
  neverVerified: number | null
}

/**
 * La file de revérification de l'organigramme d'un dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DÉRIVÉE, ET PAS STOCKÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une file persistée aurait DEUX propriétaires — la table et le graphe — et
 * divergerait au premier lien vérifié dont personne ne dépile la ligne. Le
 * dépôt a déjà payé ce motif plusieurs fois (« une dérivation vit à un seul
 * endroit »). Recalculée à chaque lecture, la file ne peut pas mentir : si le
 * graphe dit qu'un lien a été vérifié hier, il n'est pas dans la file, point.
 *
 * Elle ne coûte rien : zéro appel IA, zéro crédit, un seul `SELECT` du dossier
 * déjà scopé par utilisateur.
 *
 * ⚠️ Un graphe ILLISIBLE (dossier antérieur au contrat, blob tronqué) rend
 * `graphReadable: false` et AUCUN chiffre — surtout pas « 0 à revérifier », qui
 * se lirait « tout est à jour ». « Cassé » et « rien à faire » se ressemblent à
 * l'écran, et c'est exactement le défaut qu'on refuse de reproduire.
 */
@Injectable()
export class OrgFreshnessService {
  constructor(private readonly planner: OrgEnrichmentPlannerService) {}

  async queueFor(accountId: string, userId: string): Promise<Result<OrgFreshnessQueue, OrgEnrichmentFailure>> {
    const accountResult = await this.planner.resolveAccount(accountId, userId)
    if (isFailure(accountResult)) return failure(accountResult.problem)

    const raw = accountResult.output.raw_analysis as Record<string, unknown> | null | undefined
    const org = raw?.['org'] as Record<string, unknown> | undefined
    const parsed = orgGraphSchema.safeParse(org?.['orgGraph'])
    if (!parsed.success) {
      return success({
        graphReadable: false,
        staleAfterDays: ORG_FRESHNESS_STALE_AFTER_DAYS,
        targets: [],
        stale: null,
        neverVerified: null,
      })
    }

    const targets = orgRevalidationQueue(parsed.data, new Date())
    return success({
      graphReadable: true,
      staleAfterDays: ORG_FRESHNESS_STALE_AFTER_DAYS,
      targets,
      stale: targets.filter(target => target.freshness.state === 'stale').length,
      neverVerified: targets.filter(target => target.freshness.state === 'never_verified').length,
    })
  }
}
