import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * #2856 — une demande REPORTÉE sort de la file active jusqu'à sa date ; une
 * date passée la réveille d'elle-même (aucun job n'a à « remettre » la
 * demande : la date suffit, même règle que les pistes de qualification).
 * L'ordre du serveur est conservé dans chacune des deux listes.
 */
export function partitionSnoozed<T extends { snoozed_until?: string | null }>(
  items: readonly T[],
  now: Date,
): { active: T[]; snoozed: T[] } {
  const active: T[] = []
  const snoozed: T[] = []
  for (const item of items) {
    const until = item.snoozed_until ? new Date(item.snoozed_until).getTime() : Number.NaN
    if (Number.isFinite(until) && until > now.getTime()) snoozed.push(item)
    else active.push(item)
  }
  return { active, snoozed }
}

/**
 * #2856 — les reports PROPOSÉS : seulement ceux qui tombent avant l'expiration
 * (le serveur refuse les autres, et le CHECK SQL aussi). Aucun choix possible =
 * aucun bouton — on n'offre pas un geste qu'on sait refusé.
 */
export function snoozeChoices(expiresAt: string, now: Date): { key: 'tomorrow' | 'inThreeDays'; until: string }[] {
  const expiry = new Date(expiresAt).getTime()
  const presets = [
    { key: 'tomorrow' as const, days: 1 },
    { key: 'inThreeDays' as const, days: 3 },
  ]
  return presets
    .map(preset => ({ key: preset.key, at: now.getTime() + preset.days * DAY_MS }))
    .filter(choice => choice.at <= expiry)
    .map(choice => ({ key: choice.key, until: new Date(choice.at).toISOString() }))
}

/**
 * #2864 — les collègues à qui CONFIER une demande : les membres de l'espace
 * actif (la liste ne sort jamais de l'espace), hors soi-même et hors lecteurs
 * (qui ne peuvent rien trancher). Le serveur (`canAssign`) reste le juge : il
 * refuse aussi un non-responsable pour une validation responsable.
 */
export function assignableMembers(members: readonly WorkspaceMember[]): { value: string; label: string }[] {
  return members
    .filter(member => !member.isSelf && member.role !== 'viewer')
    .map(member => ({ value: member.userId, label: member.fullName || member.email || member.userId }))
}
