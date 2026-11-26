import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { POOL_THRESHOLDS, TALENT_POOL_SEGMENTS, type PoolSegmentCount, type TalentPoolSegment } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'

/** Une ligne du pool : le strict nécessaire pour décider d'agir. */
type PoolEntry = {
  id: string
  fullName: string
  title: string | null
  /** Ce qui EXPLIQUE la présence dans ce segment — une date, un compte, un motif. */
  because: string
}

/**
 * Le pool de réactivation (PDF 3 §11).
 *
 * « Les profils que tu as déjà rencontrés. Voici ceux qu'il faut réveiller. »
 *
 * Chaque segment est une requête, et chaque requête rend la RAISON de la
 * présence — pas seulement le nom. Une liste de noms sans raison se referme
 * sans qu'on en fasse rien : « Yanis Berthier » n'appelle aucune action,
 * « libre le 12 septembre » en appelle une.
 *
 * Aucune requête ne remonte ce qu'on ne peut pas prouver : « n'est plus
 * intéressé » n'a pas de segment, parce que ça ne se lit nulle part.
 */
@Injectable()
export class TalentPoolService {
  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
  ) {}

  /** Les effectifs de chaque segment, pour l'écran d'accueil du pool. */
  async counts(workspaceId: string | null): Promise<PoolSegmentCount[]> {
    if (!workspaceId) return TALENT_POOL_SEGMENTS.map(segment => ({ segment, count: 0 }))
    const counts = await Promise.all(
      TALENT_POOL_SEGMENTS.map(async segment => ({
        segment,
        count: (await this.entries(workspaceId, segment, 500)).length,
      })),
    )
    return counts
  }

  async entries(workspaceId: string | null, segment: TalentPoolSegment, limit = 100): Promise<PoolEntry[]> {
    if (!workspaceId) return []
    const rows = await this.consultants.manager.query<
      { id: string; full_name: string; title: string | null; because: string | null }[]
    >(this.sqlFor(segment), [workspaceId, limit])
    return rows.map(row => ({
      id: row.id,
      fullName: row.full_name,
      title: row.title,
      because: row.because ?? '',
    }))
  }

  /**
   * La requête d'un segment.
   *
   * Écrites une par une plutôt que composées : chacune a sa propre notion de
   * « pourquoi cette personne est là », et une requête générique paramétrée
   * rendrait toutes les raisons identiques — donc inutiles.
   */
  private sqlFor(segment: TalentPoolSegment): string {
    switch (segment) {
      case 'soon_available':
        // Fin d'affectation proche : assez tôt pour préparer, assez tard pour
        // que ce soit vrai. Une affectation SANS date de fin n'y figure pas —
        // on n'invente pas une libération.
        return `
          SELECT c.id, c.full_name, c.title,
                 'libre le ' || max(ma.ends_on)::text AS because
            FROM consultants c
            JOIN mission_assignments ma ON ma.consultant_id = c.id
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             AND ma.ends_on IS NOT NULL
             AND ma.ends_on BETWEEN current_date AND current_date + ${POOL_THRESHOLDS.soonAvailableDays}
           GROUP BY c.id, c.full_name, c.title
           ORDER BY max(ma.ends_on)
           LIMIT $2`
      case 'dormant':
        return `
          SELECT c.id, c.full_name, c.title,
                 'dernier contact le ' || COALESCE(c.last_contact_at, c.created_at)::date::text AS because
            FROM consultants c
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             AND COALESCE(c.last_contact_at, c.created_at)
                 < now() - interval '${POOL_THRESHOLDS.dormantMonths} months'
           ORDER BY COALESCE(c.last_contact_at, c.created_at)
           LIMIT $2`
      case 'to_revalidate':
        // La fiche annonce une disponibilité et AUCUNE affectation ne la
        // confirme ni ne la contredit. Ce n'est pas une donnée fausse, c'est
        // une donnée non vérifiée — et c'est la ligne dont il faut appeler la
        // personne.
        return `
          SELECT c.id, c.full_name, c.title,
                 'la fiche annonce « ' || c.availability || ' », aucune affectation ne le confirme' AS because
            FROM consultants c
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             AND c.availability IN ('immediate', 'sous_1_mois', 'sous_3_mois')
             AND NOT EXISTS (SELECT 1 FROM mission_assignments ma WHERE ma.consultant_id = c.id)
           ORDER BY c.updated_at
           LIMIT $2`
      case 'never_submitted':
        return `
          SELECT c.id, c.full_name, c.title, 'jamais positionné' AS because
            FROM consultants c
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             AND c.review_status = 'qualified'
             AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id)
           ORDER BY c.created_at
           LIMIT $2`
      case 'recoverable_rejects':
        // Refusé pour un motif qui ne dit rien de la personne : « trop cher »
        // ou « pas disponible » se rejouent ailleurs, « compétences » non.
        return `
          SELECT DISTINCT ON (c.id) c.id, c.full_name, c.title,
                 'refusé chez ' || COALESCE(a.company_name, 'un client') || ' pour un motif non bloquant' AS because
            FROM consultants c
            JOIN submissions s ON s.consultant_id = c.id
            JOIN opportunities o ON o.id = s.project_id
            LEFT JOIN accounts a ON a.id = o.account_id
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             AND s.stage = 'rejected'
             AND s.outcome_reason IN ('price', 'availability', 'need_cancelled')
           ORDER BY c.id, s.closed_at DESC
           LIMIT $2`
      case 'rare_profiles':
        // Une compétence que moins de trois personnes portent : la perdre coûte
        // une capacité entière, pas un profil.
        return `
          SELECT DISTINCT ON (c.id) c.id, c.full_name, c.title,
                 'seul(e) à ' || rare.holders::text || ' sur « ' || rare.skill || ' »' AS because
            FROM consultants c
            JOIN consultant_skills cs ON cs.consultant_id = c.id
            JOIN (
              SELECT skill, count(DISTINCT consultant_id) AS holders
                FROM consultant_skills
               WHERE workspace_id = $1
               GROUP BY skill
              HAVING count(DISTINCT consultant_id) < ${POOL_THRESHOLDS.rareSkillHolders}
            ) rare ON rare.skill = cs.skill
           WHERE c.workspace_id = $1 AND c.archived_at IS NULL
           ORDER BY c.id, rare.holders
           LIMIT $2`
      case 'archived':
        return `
          SELECT c.id, c.full_name, c.title,
                 'archivé le ' || c.archived_at::date::text AS because
            FROM consultants c
           WHERE c.workspace_id = $1 AND c.archived_at IS NOT NULL
           ORDER BY c.archived_at DESC
           LIMIT $2`
    }
  }
}
