import type { SelectQueryBuilder } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'

/**
 * Le prédicat de cloisonnement d'un consultant, à UN SEUL endroit.
 *
 * Un consultant appartient à un espace, OU — le roll-out `workspace_id` n'étant
 * pas terminé (`consultant.entity.ts`) — n'a pas encore d'espace mais appartient
 * à un utilisateur. La règle : on voit une fiche de SON espace, ou une fiche
 * sans espace qui est la SIENNE. Jamais la fiche sans espace d'un AUTRE.
 *
 * ⚠️ Finding pentest #2 (HAUTE, cloisonnement). CV Studio ne passait pas par
 * cette règle : il faisait `findOne({ where: { id } })` puis une garde
 * `workspaceId && talent.workspace_id && talent.workspace_id !== workspaceId`
 * qui s'EFFONDRE quand `talent.workspace_id IS NULL` (le 3ᵉ terme est falsy) —
 * une fiche sans espace d'une autre ESN fuyait alors son `cv_text` complet. La
 * dérivation vivait à deux endroits et les deux ont divergé. Elle n'en a plus
 * qu'un : cette fonction, utilisée par `ConsultantsService.findScoped` ET par
 * `CvStudioService`.
 */
export function applyConsultantScope(
  qb: SelectQueryBuilder<ConsultantEntity>,
  alias: string,
  workspaceId: string | null,
  userId: string,
): SelectQueryBuilder<ConsultantEntity> {
  if (workspaceId) {
    return qb.andWhere(
      `(${alias}.workspace_id = :workspaceId OR (${alias}.workspace_id IS NULL AND ${alias}.user_id = :userId))`,
      { workspaceId, userId },
    )
  }
  return qb.andWhere(`${alias}.user_id = :userId`, { userId })
}
