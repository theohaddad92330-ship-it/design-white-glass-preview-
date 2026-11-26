import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  describeDiscoverOriginCriteriaFr,
  isDiscoverOriginCriteriaEmpty,
  type DiscoverOriginCriteria,
  type TargetTierLabel,
} from '@bellum/contracts'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'

/**
 * #3753.3 — ce que l'ESN a DIT de ce compte dans son ciblage, tel quel.
 * Fourni, NON VÉRIFIÉ : la phase 1 l'injecte étiqueté « hypothèses du vendeur »,
 * jamais comme un fait collecté.
 */
export type SellerHypothesesForRun = {
  tier_label: TargetTierLabel | null
  selection_reason: string | null
  addressable_issues: string | null
  upcoming_it_projects: string | null
  /** #3819 (lot RBB) — la raison calculée par Découvrir quand le compte en vient. */
  discover_origin_reason?: string | null
  /** #3819 (lot RBB) — les critères Découvrir, une ligne FR par axe posé. */
  discover_origin_criteria?: string[]
  /** #4646 — les compétences cherchées dans Découvrir : la collecte du compte est rejouée AVEC elles. */
  discover_origin_skills?: string[]
  /** #4646 — les offres que Découvrir affichait : recopiées dans le dossier, datées, jamais effacées par le rejeu. */
  discover_origin_offers?: NonNullable<DiscoverOriginCriteria['offers']>
}

/** #3819 — ce que Découvrir a dit de ce compte : sa raison et ses critères. */
type DiscoverOriginForRun = {
  reason: string | null | undefined
  criteria: DiscoverOriginCriteria | null | undefined
}

/**
 * #3819 (lot RBB, décision Louis 11/10) — la raison et les critères de
 * sélection Découvrir rejoignent les hypothèses du vendeur : c'est le ciblage
 * de l'ESN sur ce compte, fourni, NON VÉRIFIÉ — exactement le statut du bloc
 * « hypothèses du vendeur » de la phase 1. Sans origine Découvrir, l'entrée est
 * rendue telle quelle (prompt byte-identique).
 */
export function withDiscoverOrigin(
  hypotheses: SellerHypothesesForRun | undefined,
  origin: DiscoverOriginForRun | undefined,
): SellerHypothesesForRun | undefined {
  const reason = clean(origin?.reason)
  const criteria = isDiscoverOriginCriteriaEmpty(origin?.criteria)
    ? []
    : describeDiscoverOriginCriteriaFr(origin?.criteria)
  if (!reason && criteria.length === 0) return hypotheses
  return {
    ...(hypotheses ?? {
      tier_label: null,
      selection_reason: null,
      addressable_issues: null,
      upcoming_it_projects: null,
    }),
    ...(reason ? { discover_origin_reason: reason } : {}),
    ...(criteria.length > 0 ? { discover_origin_criteria: criteria } : {}),
    // #4646 — la forme STRUCTURÉE voyage à côté des lignes : l'IA ne reparse pas du français.
    ...(origin?.criteria?.skills?.length ? { discover_origin_skills: origin.criteria.skills } : {}),
    ...(origin?.criteria?.offers?.length ? { discover_origin_offers: origin.criteria.offers } : {}),
  }
}

/**
 * #4642 — le cadrage qu'une analyse lancée depuis une conversation avec Laura (`laura:` + `framed_by`) emporte :
 * ses critères tels quels, ou `undefined`. Une carte qui ne porte que la zone (#4432.3) n'est PAS un cadrage :
 * elle reste ce qu'elle était (ni persistée, ni transmise comme hypothèse).
 */
export function lauraFramingOf(
  suggestionId: string | undefined,
  criteria: DiscoverOriginCriteria | undefined,
): DiscoverOriginCriteria | undefined {
  if (!suggestionId?.startsWith('laura:') || criteria?.framed_by !== 'laura') return undefined
  return isDiscoverOriginCriteriaEmpty(criteria) ? undefined : criteria
}

/** #4642 — un cadrage Laura se remplace par le suivant ; des critères de Découvrir, jamais. */
export function canReplaceLauraFraming(existing: DiscoverOriginCriteria | null | undefined): boolean {
  return !existing || existing.framed_by === 'laura' || isDiscoverOriginCriteriaEmpty(existing)
}

/** #3819 — l'origine Découvrir PERSISTÉE d'un compte, ou `undefined`. */
export function discoverOriginOfAccount(account: {
  origin?: string | null
  discover_origin_reason?: string | null
  discover_origin_criteria?: DiscoverOriginCriteria | null
}): DiscoverOriginForRun | undefined {
  if (account.origin !== 'discover') return undefined
  return { reason: account.discover_origin_reason, criteria: account.discover_origin_criteria }
}

/**
 * Lit, pour un compte, son élément de liste cible le plus récent qui porte un
 * ciblage (tier, raison, problématiques ou projets IT).
 *
 * Même place que `AnalysisCheckpointReader` : un lecteur à repository, dans le
 * module d'analyse, sans service d'un autre module (GA-07). La table appartient
 * aux listes cibles ; on n'y lit que.
 *
 * `undefined` = rien d'honnête à dire (compte hors liste, élément sans ciblage,
 * espace inconnu, panne) : la clé ne part pas à l'IA et le prompt reste
 * byte-identique. Best-effort — une lecture qui échoue ne bloque jamais un run.
 */
@Injectable()
export class SellerHypothesesReader {
  private readonly logger = new Logger(SellerHypothesesReader.name)

  constructor(@InjectRepository(TargetListItemEntity) private readonly items: Repository<TargetListItemEntity>) {}

  async forAccount(
    accountId: string,
    workspaceId: string | null | undefined,
  ): Promise<SellerHypothesesForRun | undefined> {
    if (!workspaceId) return undefined
    try {
      const rows = await this.items.find({
        where: { account_id: accountId, workspace_id: workspaceId, removed_at: IsNull() },
        order: { updated_at: 'DESC' },
        take: 10,
      })
      for (const row of rows) {
        const addressable = clean(row.seller_hypotheses?.addressable_issues)
        const projects = clean(row.seller_hypotheses?.upcoming_it_projects)
        const reason = clean(row.selection_reason)
        const tier = row.tier_label ?? null
        if (tier || reason || addressable || projects) {
          return {
            tier_label: tier,
            selection_reason: reason,
            addressable_issues: addressable,
            upcoming_it_projects: projects,
          }
        }
      }
      return undefined
    } catch (error) {
      this.logger.warn('Seller hypotheses lookup failed — the run proceeds without them', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return undefined
    }
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}
