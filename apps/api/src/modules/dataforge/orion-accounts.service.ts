import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { dataforgeAccountAccessView, type DataforgeAccountAccess } from '@bellum/contracts'
import { DataforgeAccountStatusEntity } from '../../database/entities/dataforge-account-status.entity'

/**
 * Le texte qui doit accompagner TOUTE pénétrabilité affichée — avertissement 7
 * de la tâche : Jules et Pimkie sortaient à 84 et 76 avec une IT externalisée à
 * CGI par contrat de dix ans ; le score était haut PARCE QUE la donnée
 * manquait (494 des 620 comptes cibles ont une couverture ≤ 1 champ sur 24).
 */
export const ORION_PENETRABILITE_CAVEAT =
  'Ordre de passage, pas verdict — un score élevé sur une faible couverture ne dit qu’une chose : la donnée manque.'

/**
 * `penetrabilite` n'existe QUE groupée avec `couvertureTotale` et la mise en
 * garde — structurellement impossible à lire l'une sans l'autre. `null` quand
 * le pack n'a pas mesuré de score (jamais `0`).
 */
interface OrionPenetrabilite {
  score: number
  couvertureTotale: number | null
  caveat: string
}

/**
 * #2805 (#2291.3) — les critères d'une recherche DataForge comme SOURCE DE
 * CANDIDATS, jamais un lookup d'un compte déjà connu (`statusFor`/
 * `statusForSiren`, inchangés).
 */
interface OrionCandidateSearchCriteria {
  /** Défaut : les deux statuts CIBLE (voir `CANDIDATE_STATUT_CODES`) — un
   *  statut VERROUILLE_ ou EXCLU_ ne sort JAMAIS sans être nommé ici explicitement. */
  statutCodes?: string[]
  sector?: string
  minAccountPotentialScore?: number
  /** SIREN/SIRET déjà au portefeuille de l'espace — jamais proposés comme
   *  candidats. Un compte sans SIREN connu N'EST PAS exclu par cette liste :
   *  l'absence de preuve n'est pas une preuve d'appartenance. */
  excludeSirenSirets?: string[]
  /** Bornée à `CANDIDATE_SEARCH_MAX_RESULTS` — Découvrir n'est pas un export
   *  de masse. */
  limit?: number
}

/** Les deux seuls statuts qu'une recherche de CANDIDATS regarde sans qu'on le
 *  lui demande — les sept autres (`VERROUILLE_*`, `EXCLU_*`, `A_QUALIFIER`,
 *  `CANAL_PARTENAIRE`) exigent un `statutCodes` explicite. */
const CANDIDATE_STATUT_CODES = ['CIBLE_PRIORITAIRE', 'CIBLE_SECONDAIRE']
const CANDIDATE_SEARCH_DEFAULT_RESULTS = 25
const CANDIDATE_SEARCH_MAX_RESULTS = 100

export interface OrionAccountStatusView {
  sourceId: string
  entreprise: string | null
  /** #2805 (#2291.3) — le SIREN/SIRET du compte, quand le pack le porte.
   *  `searchCandidates` en a besoin pour devenir une source de CANDIDATS
   *  Découvrir : `DiscoverCandidate.siren` est OBLIGATOIRE (« pas de SIREN,
   *  pas de candidat », `discover.ts`) — un appelant qui ne verrait que
   *  `sourceId` (l'identifiant INTERNE `DF-XXXX`) ne pourrait construire
   *  aucun candidat. `null` quand le pack ne l'a jamais renseigné, jamais
   *  déduit du nom. */
  sirenSiret: string | null
  /** #1618 — porté pour la façade `AccountIntelligenceContext` : un candidat
   *  de plus dans la hiérarchie de confiance, jamais lu seul ailleurs. */
  sector: string | null
  /** #1618 — idem. */
  headquarters: string | null
  statutCode: string
  statutCible: string | null
  penetrabilite: OrionPenetrabilite | null
  priorityLevel: string | null
  accountPotentialScore: number | null
  dataConfidenceScore: number | null
  recommendedEntryPoint: string | null
  recommendedPersona: string | null
  recommendedStrategy: string | null
  nextAction: string | null
  mainRisk: string | null
  /** #1618 — `updated_at` en ISO : la DATE de provenance de cette vue entière,
   *  pour un appelant qui doit dater ce qu'il affiche (jamais deviné). */
  observedAt: string
  /**
   * Lot 776 — « on utilise tout, rien d'identifiant affiché » : accessibilité, barrières, route d'achat et priorité en
   * énumérations métier, relayées à Laura comme fait typé. `null` quand rien n'est établi. Jamais de code brut, de score nu
   * ni de donnée de personne.
   */
  access: DataforgeAccountAccess | null
  /** #3235 — `data_version` de la ligne : lu par la façade pour
   *  `dataforge_version` du versioning d'analyse. */
  dataVersion: string
}

/**
 * Le statut de sales-readiness ORION V12 — `10_COMPTES_MASTER.csv` ingéré.
 * Service AUTONOME (règle #7) : ne dépend que de son unique table partagée.
 *
 * `statusFor` est le SEUL point d'entrée qui lit `penetrabiliteScore` — la vue
 * qu'il rend rend impossible d'obtenir un score sans sa couverture. Gardé par
 * `apps/api/src/architecture/orion-penetrabilite-jamais-nue.spec.ts`.
 */
@Injectable()
export class OrionAccountsService {
  constructor(
    @InjectRepository(DataforgeAccountStatusEntity)
    private readonly statuses: Repository<DataforgeAccountStatusEntity>,
  ) {}

  async statusFor(sourceId: string): Promise<OrionAccountStatusView | null> {
    const row = await this.statuses.findOne({ where: { sourceId } })
    return row ? this.toView(row) : null
  }

  /**
   * #1618 — le point d'entrée de la façade `AccountIntelligenceContext` :
   * résoudre le statut ORION d'un compte Bellum par SIREN, jamais par nom
   * (doctrine tome 2).
   *
   * ⚠️ `sirenSiret` n'est PAS un index unique — le pack V10 partage déjà ce
   * défaut sur `dataforge_accounts.siren` (voir `dataforge.service.ts`,
   * `DataforgeSirenPriors`), et rien ne garantit que V12 y échappe. Sur
   * PLUSIEURS lignes, on ne devine pas laquelle choisir : `null`, comme sur
   * aucune ligne. Une lecture ambiguë et une lecture absente ne se distinguent
   * pas ICI parce qu'aucun appelant n'a aujourd'hui besoin de le savoir — la
   * façade traite les deux comme « DataForge ne dit rien », jamais comme une
   * panne.
   */
  async statusForSiren(siren: string): Promise<OrionAccountStatusView | null> {
    const rows = await this.statuses.find({ where: { sirenSiret: siren } })
    if (rows.length !== 1) return null
    return this.toView(rows[0] as DataforgeAccountStatusEntity)
  }

  /**
   * #2805 (#2291.3) — DataForge comme SOURCE DE CANDIDATS. `statusFor` /
   * `statusForSiren` répondent à « que sait-on de CE compte, déjà connu ? » ;
   * celle-ci répond à « quels comptes du référentiel ORION ressemblent à ce
   * qu'on cherche ? » — la méthode de requête par critères dont l'absence
   * bloquait #2291.3 (voir le corps de l'épopée #2805).
   *
   * Ne branche PAS encore Découvrir (`apps/ia`, `/discover/registry`) : ceci
   * est le seul appelant réel aujourd'hui — `DataforgeCandidatesController`.
   * Combiner ces résultats dans les 9 sources de candidats de Découvrir
   * (mapper vers `DiscoverCandidate`, scorer, fusionner) reste une tranche
   * distincte, plus lourde, non traitée ici.
   */
  async searchCandidates(criteria: OrionCandidateSearchCriteria = {}): Promise<OrionAccountStatusView[]> {
    const statutCodes = criteria.statutCodes?.length ? criteria.statutCodes : CANDIDATE_STATUT_CODES
    const limit = Math.min(
      Math.max(criteria.limit ?? CANDIDATE_SEARCH_DEFAULT_RESULTS, 1),
      CANDIDATE_SEARCH_MAX_RESULTS,
    )

    const qb = this.statuses
      .createQueryBuilder('status')
      .where('status.statut_code IN (:...statutCodes)', { statutCodes })

    if (criteria.sector) {
      qb.andWhere('status.sector = :sector', { sector: criteria.sector })
    }
    if (typeof criteria.minAccountPotentialScore === 'number') {
      qb.andWhere('status.account_potential_score >= :minScore', { minScore: criteria.minAccountPotentialScore })
    }
    if (criteria.excludeSirenSirets?.length) {
      // `NOT IN` seul exclurait aussi les lignes SANS siren connu (NULL NOT IN
      // (...) n'est jamais vrai en SQL) — l'absence de preuve n'est pas une
      // preuve d'appartenance au portefeuille.
      qb.andWhere('(status.siren_siret IS NULL OR status.siren_siret NOT IN (:...excludedSirens))', {
        excludedSirens: criteria.excludeSirenSirets,
      })
    }

    qb.orderBy('status.account_potential_score', 'DESC', 'NULLS LAST').take(limit)

    const rows = await qb.getMany()
    return rows.map(row => this.toView(row))
  }

  private toView(row: DataforgeAccountStatusEntity): OrionAccountStatusView {
    return {
      sourceId: row.sourceId,
      entreprise: row.entreprise,
      sirenSiret: row.sirenSiret,
      sector: row.sector,
      headquarters: row.headquarters,
      statutCode: row.statutCode,
      statutCible: row.statutCible,
      penetrabilite:
        row.penetrabiliteScore === null
          ? null
          : {
              score: row.penetrabiliteScore,
              couvertureTotale: row.couvertureTotale,
              caveat: ORION_PENETRABILITE_CAVEAT,
            },
      priorityLevel: row.priorityLevel,
      accountPotentialScore: row.accountPotentialScore,
      dataConfidenceScore: row.dataConfidenceScore,
      recommendedEntryPoint: row.recommendedEntryPoint,
      recommendedPersona: row.recommendedPersona,
      recommendedStrategy: row.recommendedStrategy,
      nextAction: row.nextAction,
      mainRisk: row.mainRisk,
      observedAt: row.updatedAt.toISOString(),
      access: dataforgeAccountAccessView({
        salesAccessibilityLevel: row.salesAccessibilityLevel ?? null,
        barrierePlateforme: row.barrierePlateforme === true,
        barrierePublique: row.barrierePublique === true,
        referencingProcessFound: row.referencingProcessFound ?? null,
        supplierPortal: row.supplierPortal ?? null,
        priorityLevel: row.priorityLevel ?? null,
        observedAt: row.updatedAt.toISOString(),
      }),
      dataVersion: row.dataVersion,
    }
  }

  /** La couverture pour le back-office : combien ingérés, répartition par statut. */
  async coverage(): Promise<{ accounts: number; byStatutCode: Record<string, number> }> {
    const accounts = await this.statuses.count()
    const rows = await this.statuses.query(
      `SELECT statut_code AS "statutCode", count(*)::int AS n FROM dataforge_account_statuses GROUP BY 1`,
    )
    return {
      accounts,
      byStatutCode: Object.fromEntries(
        (rows as { statutCode: string; n: number }[]).map(row => [row.statutCode, row.n]),
      ),
    }
  }
}
