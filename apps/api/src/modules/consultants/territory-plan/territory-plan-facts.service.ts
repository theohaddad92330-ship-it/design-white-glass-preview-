import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { needStillOpenSql } from '@bellum/contracts'
import type { MatchAxis, MatchBucket, MatchFlagKind, MatchResult } from '@bellum/contracts'
import { BusinessUnitService } from '../../business-unit/business-unit.service'
import { businessUnitScopeClause } from '../../accounts/business-unit-scope.clause'
import { MatchingService } from '../matching/matching.service'
import { evaluateCandidate } from '../matching/engine'

/**
 * #2337 — LE TERRAIN DE JEU MULTI-TALENTS : les FAITS, jamais le plan.
 *
 * « J'ai trois consultants disponibles, construis-moi le terrain de jeu. » Le
 * matching INVERSE (`InverseMatchingService`) répond déjà pour UN talent ; il
 * n'existait rien pour en lire plusieurs d'un coup et voir les COMPTES qu'ils
 * partagent. Ce service ne fait que rassembler, par compte, ce que le moteur
 * EXISTANT (`evaluateCandidate`, treize axes, mêmes poids d'espace) dit de
 * chaque talent sur chaque besoin ouvert. La fusion, le talent d'entrée, les
 * collisions et la borne de capacité sont COMPILÉS côté service IA
 * (`apps/ia/app/services/compilers/territory_planner.py`) — un seul endroit
 * pour la règle (GA-26).
 *
 * ⚠️ TROIS CHOSES QU'IL NE FAIT PAS, À DESSEIN
 *  - Il n'ÉCRIT RIEN. `InverseMatchingService.matchTalent` journalise un run
 *    (`match_runs`) : c'est pour cela que ce service ne l'appelle pas et refait
 *    la boucle — une lecture de conversation ne laisse aucune ligne en base,
 *    « rien n'écrit seul ».
 *  - Il ne lit AUCUN critère protégé : `MatchCandidate` n'en porte aucun, et
 *    l'identité (nom, titre) est rattachée APRÈS le calcul (`identitiesFor`,
 *    même motif que la garde GA-06).
 *  - Il ne calcule AUCUN score neuf. Le rang d'un compte (décision Louis
 *    18/09) prolonge la grille EXISTANTE `account_fit_score_25`, lue telle que
 *    l'analyse l'a posée (`raw_analysis.plan.evaluation`) ; absente, elle reste
 *    `null` — « non évalué », jamais 0.
 *
 * Portée : l'ESPACE (besoins, comptes, vivier) ET le périmètre de BU de celui
 * qui demande (`BusinessUnitService.scopeFor`, même clause que `/accounts`).
 */

/** Au-delà de quatre, ce n'est plus un terrain de jeu commun mais un annuaire. */
export const TERRITORY_PLAN_MAX_TALENTS = 4
/** Même borne que le matching inverse : au-delà, ce n'est plus une liste qu'on lit. */
const MAX_OPEN_NEEDS = 200

type TalentEvaluation = {
  consultantId: string
  bucket: MatchBucket
  correspondenceScore: number
  pushableScore: number
  matchedSkills: string[]
  /** Les axes que le moteur n'a PAS pu évaluer — nommés, jamais comptés 0. */
  notEvaluatedAxes: MatchAxis[]
  flags: MatchFlagKind[]
  availabilityDetail: string | null
  evidenceDetail: string | null
}

type TerritoryNeedFacts = {
  needId: string
  title: string
  location: string | null
  ownerId: string | null
  ownerName: string | null
  contactId: string | null
  evaluations: TalentEvaluation[]
}

type TerritoryAccountFacts = {
  accountId: string
  accountName: string
  /** `account_fit_score_25` tel que l'analyse l'a posé, ou `null` (non évalué). */
  fitScore25: number | null
  fitVerdict: string | null
  /** Les talents DÉJÀ positionnés sur un besoin de ce compte (table `submissions`). */
  presentedConsultantIds: string[]
  needs: TerritoryNeedFacts[]
}

type TerritoryTalentFacts = {
  consultantId: string
  fullName: string
  title: string | null
  zones: string[]
  freeFrom: string | null
  /** `null` = aucun besoin ouvert n'a permis de lire la fiche : inconnu, jamais deviné. */
  declaredAvailability: string | null
}

type TerritoryPlanFacts = {
  talents: TerritoryTalentFacts[]
  /** Demandés mais absents de cet espace : nommés, jamais ignorés en silence. */
  unknownTalentIds: string[]
  accounts: TerritoryAccountFacts[]
  evaluatedNeeds: number
  truncated: boolean
}

type OpenNeedRow = {
  id: string
  title: string | null
  location: string | null
  account_id: string
  account_name: string | null
  owner_id: string | null
  owner_name: string | null
  contact_id: string | null
  fit_score: string | null
  fit_verdict: string | null
}

@Injectable()
export class TerritoryPlanFactsService {
  constructor(
    private readonly matching: MatchingService,
    private readonly businessUnits: BusinessUnitService,
    private readonly dataSource: DataSource,
  ) {}

  async collect(
    consultantIds: readonly string[],
    workspaceId: string | null,
    userId: string,
    options: { now?: Date } = {},
  ): Promise<TerritoryPlanFacts> {
    const requested = [...new Set(consultantIds.map(id => id.trim()).filter(Boolean))].slice(
      0,
      TERRITORY_PLAN_MAX_TALENTS,
    )
    const identities = await this.matching.identitiesFor(requested, workspaceId, userId)
    const known = requested.filter(id => identities.has(id))
    const unknownTalentIds = requested.filter(id => !identities.has(id))
    if (known.length === 0) {
      return { talents: [], unknownTalentIds, accounts: [], evaluatedNeeds: 0, truncated: false }
    }

    const now = options.now ?? new Date()
    const { weights, threshold } = await this.matching.weightsFor(workspaceId)
    const rows = await this.openNeeds(workspaceId, userId)

    const talents = new Map<string, TerritoryTalentFacts>()
    const accounts = new Map<string, TerritoryAccountFacts>()
    let evaluatedNeeds = 0

    for (const row of rows) {
      const need = await this.matching.loadNeed(row.id, workspaceId)
      if (!need) continue
      // Le candidat est rechargé PAR BESOIN : « déjà en mission ici » et
      // l'historique client dépendent du compte (même raison que le matching inverse).
      const candidates = await this.matching.loadCandidates(workspaceId, userId, need, known)
      evaluatedNeeds += 1
      const evaluations: TalentEvaluation[] = []
      for (const candidate of candidates) {
        if (!talents.has(candidate.consultantId)) {
          const identity = identities.get(candidate.consultantId)
          talents.set(candidate.consultantId, {
            consultantId: candidate.consultantId,
            fullName: identity?.fullName ?? '',
            title: identity?.title ?? null,
            zones: candidate.zones,
            freeFrom: candidate.freeFrom,
            declaredAvailability: candidate.declaredAvailability,
          })
        }
        const result = evaluateCandidate(need, candidate, { weights, threshold, canReadFinance: false, now })
        evaluations.push(toEvaluation(result))
      }

      const account = accounts.get(row.account_id) ?? {
        accountId: row.account_id,
        accountName: row.account_name ?? '',
        fitScore25: readFitScore(row.fit_score),
        fitVerdict: row.fit_verdict?.trim() || null,
        presentedConsultantIds: [],
        needs: [],
      }
      account.needs.push({
        needId: row.id,
        title: row.title ?? need.role,
        location: row.location,
        ownerId: row.owner_id,
        ownerName: row.owner_name?.trim() || null,
        contactId: row.contact_id,
        evaluations,
      })
      accounts.set(row.account_id, account)
    }

    // Un talent qu'aucun besoin ouvert n'a permis de lire garde son identité ;
    // sa zone et sa disponibilité restent INCONNUES, jamais devinées.
    for (const id of known) {
      if (talents.has(id)) continue
      const identity = identities.get(id)
      talents.set(id, {
        consultantId: id,
        fullName: identity?.fullName ?? '',
        title: identity?.title ?? null,
        zones: [],
        freeFrom: null,
        declaredAvailability: null,
      })
    }

    const presented = await this.presentedOn([...accounts.keys()], known, workspaceId)
    for (const [accountId, ids] of presented) {
      const account = accounts.get(accountId)
      if (account) account.presentedConsultantIds = ids
    }

    return {
      talents: known.map(id => talents.get(id)).filter((talent): talent is TerritoryTalentFacts => !!talent),
      unknownTalentIds,
      accounts: [...accounts.values()],
      evaluatedNeeds,
      truncated: rows.length >= MAX_OPEN_NEEDS,
    }
  }

  /** Les besoins ouverts de l'espace, bornés au périmètre de BU du demandeur. */
  private async openNeeds(workspaceId: string | null, userId: string): Promise<OpenNeedRow[]> {
    const scope = workspaceId ? await this.businessUnits.scopeFor(workspaceId, userId) : null
    const ids = scope?.businessUnitIds ?? []
    // `$3` porte la liste des unités, et n'est passé QUE si la clause le lit :
    // un paramètre non référencé fait échouer Postgres (type indéterminable).
    const buClause = businessUnitScopeClause(scope, 'a.business_unit_id', 'SELECT unnest($3::uuid[])')
    return this.dataSource.query<OpenNeedRow[]>(
      `SELECT n.id, n.title, n.location, n.account_id, a.company_name AS account_name,
              n.owner_id, NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS owner_name,
              n.contact_id,
              a.raw_analysis->'plan'->'evaluation'->>'score' AS fit_score,
              a.raw_analysis->'plan'->'evaluation'->>'verdict' AS fit_verdict
         FROM project_needs n
         JOIN accounts a ON a.id = n.account_id
         LEFT JOIN opportunities o ON o.id = n.project_id
         LEFT JOIN profiles p ON p.user_id = n.owner_id
        WHERE ${needStillOpenSql('n.status')}
          AND (($1::uuid IS NOT NULL AND (n.workspace_id = $1 OR o.workspace_id = $1 OR a.workspace_id = $1))
               OR ($1::uuid IS NULL AND a.user_id = $2))
          ${buClause ? `AND ${buClause}` : ''}
        ORDER BY n.updated_at DESC
        LIMIT ${MAX_OPEN_NEEDS}`,
      ids.length > 0 ? [workspaceId, userId, [...ids]] : [workspaceId, userId],
    )
  }

  /** « Consultant déjà présenté » : un positionnement existe sur un besoin du compte. */
  private async presentedOn(
    accountIds: readonly string[],
    consultantIds: readonly string[],
    workspaceId: string | null,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>()
    if (accountIds.length === 0) return out
    const rows = await this.dataSource.query<{ account_id: string; consultant_id: string }[]>(
      `SELECT DISTINCT n.account_id, s.consultant_id
         FROM submissions s
         JOIN project_needs n ON n.id = s.need_id
        WHERE n.account_id = ANY($1::uuid[])
          AND s.consultant_id = ANY($2::uuid[])
          AND ($3::uuid IS NULL OR s.workspace_id = $3)`,
      [[...accountIds], [...consultantIds], workspaceId],
    )
    for (const row of rows) out.set(row.account_id, [...(out.get(row.account_id) ?? []), row.consultant_id])
    return out
  }
}

function toEvaluation(result: MatchResult): TalentEvaluation {
  const detailOf = (axis: MatchAxis) => result.axes.find(entry => entry.axis === axis)?.detail?.trim() || null
  return {
    consultantId: result.consultantId,
    bucket: result.bucket,
    correspondenceScore: result.correspondenceScore,
    pushableScore: result.pushableScore,
    matchedSkills: result.skills.filter(skill => skill.status === 'matched').map(skill => skill.label),
    notEvaluatedAxes: result.axes.filter(axis => axis.score === null).map(axis => axis.axis),
    flags: result.flags.map(flag => flag.kind),
    availabilityDetail: detailOf('availability'),
    evidenceDetail: detailOf('evidence_quality'),
  }
}

/** Une note /25 lisible, ou `null` — jamais une valeur de remplissage. */
function readFitScore(value: string | null): number | null {
  if (value === null || !/^\d{1,2}$/.test(value.trim())) return null
  const score = Number(value.trim())
  return score >= 0 && score <= 25 ? score : null
}
