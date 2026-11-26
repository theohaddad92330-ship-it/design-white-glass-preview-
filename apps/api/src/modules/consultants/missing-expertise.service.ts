import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  MISSING_EXPERTISE_THRESHOLDS,
  detectMissingExpertise,
  needStaffableRefusedSql,
  redactFinance,
  unaddressedRevenueCents,
  type MissingExpertiseReport,
  type RefusedNeed,
} from '@bellum/contracts'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { canonicalSkill } from './skill-referential'

type NeedRow = {
  id: string
  title: string | null
  skills: unknown
  stack: unknown
  refused_at: string | null
  target_tjm_cents: string | null
  start_on: string | null
  duration_months: number | string | null
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Les termes de compétence d'un besoin, quelle que soit la colonne qui les porte.
 *
 * Deux colonnes coexistent : `skills` (typée, `{ term, required, level }`) et
 * `stack` (tableau de texte, historique et toujours lue par le moteur de
 * matching). Les deux sont lues, parce qu'un besoin saisi avant la colonne
 * typée n'a que `stack` — n'en lire qu'une ferait manquer des refus, et un
 * détecteur qui rate un tiers de ses cas ne franchit jamais le seuil de trois.
 */
function rawTerms(row: NeedRow): string[] {
  const terms: string[] = []
  if (Array.isArray(row.skills)) {
    for (const item of row.skills) {
      if (item && typeof item === 'object' && 'term' in item) {
        const term = (item as { term: unknown }).term
        if (typeof term === 'string') terms.push(term)
      }
    }
  }
  if (Array.isArray(row.stack)) {
    for (const item of row.stack) if (typeof item === 'string') terms.push(item)
  }
  return terms
}

/**
 * LE DÉTECTEUR D'EXPERTISE MANQUANTE — PDF 4 §8.4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AXE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `CrmKpisService.overview()` rend déjà `unstaffableByReason` — un
 * `GROUP BY staffable_reason`. Les refus sont donc comptés par MOTIF et jamais
 * par COMPÉTENCE. « 47 besoins partis faute de profil » ne dit pas qui recruter ;
 * « trois partis sur Kubernetes » le dit.
 *
 * La canonicalisation se fait ICI et non dans le contrat, parce que le
 * référentiel d'alias vit dans l'API : il APPREND des alias qu'un admin
 * approuve. Le contrat, lui, reste pur et reçoit des compétences déjà
 * canoniques.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE MONTANT PASSE PAR `redactFinance` (D45)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un CA non adressé est construit à partir de `target_tjm_cents`, c'est-à-dire
 * d'un TJM VENDU. Le rédiger à la main ici rouvrirait la divergence que D45
 * vient de refermer — et `finance-redaction-single-path.spec.ts` le refuse.
 *
 * `revenueState` est posé AVANT la rédaction et ne passe pas par elle : sinon
 * « je n'ai pas le droit de voir » et « je ne sais pas le calculer » seraient
 * deux `null` indiscernables.
 */
@Injectable()
export class MissingExpertiseService {
  constructor(
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
  ) {}

  async forWorkspace(
    workspaceId: string,
    options: { canReadFinance: boolean; now?: Date },
  ): Promise<MissingExpertiseReport[]> {
    const now = options.now ?? new Date()
    const rows = await this.needs.manager.query<NeedRow[]>(
      // ⚠️ `needStaffableRefusedSql` plutôt qu'un `staffable = 'no'` écrit à la
      // main : la définition d'un besoin refusé vit dans le contrat (GA-62), et
      // une seconde copie divergerait le jour où un troisième verdict arrive.
      `SELECT n.id, n.title, n.skills, n.stack,
              COALESCE(n.staffable_decided_at, n.status_changed_at)::text AS refused_at,
              n.target_tjm_cents::text AS target_tjm_cents,
              n.start_on::text AS start_on,
              n.duration_months
         FROM project_needs n
        WHERE n.workspace_id = $1
          AND ${needStaffableRefusedSql('n.staffable')}`,
      [workspaceId],
    )

    const refused: RefusedNeed[] = rows.map(row => ({
      needId: row.id,
      title: row.title ?? '',
      // Un terme que le référentiel ne reconnaît pas est ÉCARTÉ, jamais gardé
      // tel quel : « k8s » et « kubernetes » compteraient alors séparément et
      // aucun des deux n'atteindrait jamais trois — l'inverse du but.
      canonicalSkills: [
        ...new Set(
          rawTerms(row)
            .map(canonicalSkill)
            .filter((skill): skill is string => skill !== null),
        ),
      ],
      refusedAt: row.refused_at,
      targetDayRateCents: toNumber(row.target_tjm_cents),
      startOn: row.start_on,
      durationMonths: toNumber(row.duration_months),
    }))

    const byId = new Map(refused.map(need => [need.needId, need]))

    return detectMissingExpertise(refused, now).map(found => {
      const revenue = unaddressedRevenueCents(
        found.needs.map(item => byId.get(item.needId)).filter((need): need is RefusedNeed => need !== undefined),
      )
      const revenueState: MissingExpertiseReport['revenueState'] = !options.canReadFinance
        ? 'hidden'
        : revenue.amountCents === null
          ? 'not_chiffrable'
          : 'measured'

      return redactFinance(
        {
          skill: found.skill,
          refusedCount: found.refusedCount,
          needs: found.needs,
          unaddressedRevenueCents: revenue.amountCents,
          cumulativeDayRateCents: revenue.cumulativeDayRateCents,
          revenueState,
          countedNeeds: revenue.countedNeeds,
          withoutRate: revenue.withoutRate,
          withoutDuration: revenue.withoutDuration,
        },
        options.canReadFinance,
      )
    })
  }

  /** La fenêtre appliquée, pour que l'écran l'annonce sans la redéclarer. */
  windowDays(): number {
    return MISSING_EXPERTISE_THRESHOLDS.windowDays
  }
}
