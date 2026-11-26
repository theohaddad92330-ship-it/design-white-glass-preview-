import { deriveContactRelationBadge, type ContactRelationBadge, type ContactStatus } from '@bellum/contracts'
import type { FindOptionsWhere, Repository } from 'typeorm'
import type { ActivityEntity } from '../../database/entities/activity.entity'

/** Assez pour trancher « y a-t-il eu un échange ? » ; les plus récentes d'abord. */
const BADGE_ACTIVITY_WINDOW = 200

/**
 * Théo B C5.R2 / C1.N2 — le badge relationnel de la fiche : DÉRIVÉ des activités du contact (lecture seule,
 * bornée à l'espace dans la requête), la déclaration humaine (`user_status`) gagnant. La définition d'un
 * « échange » vit dans les contrats (`deriveContactRelationBadge`), jamais ici.
 * Sans dépôt `activities` (specs construisant le service à la main) : `null` — le champ est simplement absent.
 */
export async function readContactRelationBadge(
  activities: Repository<ActivityEntity> | undefined,
  scope: FindOptionsWhere<ActivityEntity>,
  contactId: string,
  declaredStatus: ContactStatus | null | undefined,
  now: Date = new Date(),
): Promise<ContactRelationBadge | null> {
  if (!activities) return null
  const rows = await activities.find({
    where: { ...scope, contact_id: contactId },
    select: ['id', 'kind', 'direction', 'occurred_at', 'verdict', 'call_outcome'],
    order: { occurred_at: 'DESC' },
    take: BADGE_ACTIVITY_WINDOW,
  })
  return deriveContactRelationBadge({
    activities: rows.map(row => ({
      id: row.id,
      kind: row.kind,
      direction:
        row.direction === 'inbound' || row.direction === 'outbound' || row.direction === 'internal'
          ? row.direction
          : null,
      occurredAt: row.occurred_at.toISOString(),
      verdict: row.verdict,
      outcome: row.call_outcome,
    })),
    declaredStatus,
    now,
  })
}
