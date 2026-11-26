import type { TargetList } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatDate } from '@/lib/locale'

/**
 * #2156.63/.67 (GA-26) — un responsable qui a quitté l'espace reste NOMMÉ,
 * jamais effacé. `TargetListCard` et `TargetListsTable` affichent la MÊME
 * liste sous deux mises en page : la dérivation vit ici une seule fois.
 */
export function getTargetListOwnerLabel(
  list: Pick<TargetList, 'owner_user_id'>,
  members: WorkspaceMember[],
  t: TFunction<'targets'>,
): string {
  const owner = members.find(member => member.userId === list.owner_user_id)
  return list.owner_user_id == null ? t('owner.none') : (owner?.fullName ?? owner?.email ?? t('owner.unknown'))
}

/**
 * #2156.65/.67 (GA-26) — la fraîcheur de la LISTE est celle de son élément le
 * plus récemment revérifié. Aucun élément vivant revérifié → jamais, pas « 0 ».
 */
export function getTargetListFreshnessValue(list: Pick<TargetList, 'items'>, t: TFunction<'targets'>): string {
  const freshestRefresh = list.items
    .filter(item => item.removed_at == null && item.refreshed_at != null)
    .map(item => item.refreshed_at as string)
    .sort()
    .at(-1)
  return freshestRefresh ? (formatDate(freshestRefresh) ?? t('list.neverRefreshed')) : t('list.neverRefreshed')
}
