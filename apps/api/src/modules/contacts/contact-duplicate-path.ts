/**
 * Le chemin prioritaire ne montre jamais DEUX FOIS la même personne probable.
 *
 * DOCTRINE : on PROPOSE une fusion, on ne fusionne JAMAIS. Ici rien n'est fusionné ni supprimé : les fiches restent
 * toutes dans l'onglet Contacts (et le bandeau « doublon possible » les propose). Seul le classement du chemin
 * regroupe les fiches d'un même groupe de doublon PROBABLE (les paires de `proposeContactDuplicates`, fermées par
 * transitivité) et n'en garde qu'UNE : la fiche la plus complète, à égalité celle qui porte la persona la plus haute.
 * Une paire refusée par un humain (`rejectedPairs`) n'est jamais regroupée : la correction humaine gagne.
 */
import { proposeContactDuplicates } from './contact-duplicate-proposals'

export type PathDuplicateRow = {
  id: string
  account_id: string | null
  full_name: string | null
  email: string | null
  email_verified: boolean | null
  phone: string | null
  linkedin_url: string | null
  title: string | null
  decision_role: string | null
}

/** Plus petit = plus haute (décideur d'abord). Rôle inconnu : en dernier. */
const ROLE_ORDER = ['economic_buyer', 'decision_maker', 'sponsor', 'champion', 'technical', 'influencer', 'user']

const roleRank = (role: string | null): number => {
  const index = ROLE_ORDER.indexOf((role ?? '').toLowerCase())
  return index < 0 ? ROLE_ORDER.length : index
}

const completeness = (row: PathDuplicateRow): number =>
  [row.email, row.phone, row.linkedin_url, row.title].filter(value => (value ?? '').trim() !== '').length +
  (row.email_verified ? 1 : 0) +
  // Un nom complet l'emporte sur « Prénom N. » à contenu égal.
  Math.min((row.full_name ?? '').length, 60) / 100

/** Ids à RETIRER du chemin : toutes les fiches d'un groupe probable sauf la gardée. Lecture pure. */
export function duplicateIdsToHideFromPath(
  rows: readonly PathDuplicateRow[],
  rejectedPairs?: ReadonlySet<string>,
): Set<string> {
  const proposals = proposeContactDuplicates(
    rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      fullName: row.full_name,
      email: row.email,
      emailVerified: row.email_verified,
      phone: row.phone,
      linkedinUrl: row.linkedin_url,
      title: row.title,
    })),
    rejectedPairs ? { rejectedPairs } : {},
  )
  if (proposals.length === 0) return new Set()
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const up = parent.get(id) ?? id
    if (up === id) return id
    const root = find(up)
    parent.set(id, root)
    return root
  }
  for (const { leftId, rightId } of proposals) parent.set(find(leftId), find(rightId))
  const byId = new Map(rows.map(row => [row.id, row]))
  const groups = new Map<string, PathDuplicateRow[]>()
  for (const id of new Set(proposals.flatMap(p => [p.leftId, p.rightId]))) {
    const row = byId.get(id)
    if (!row) continue
    const root = find(id)
    const group = groups.get(root)
    if (group) group.push(row)
    else groups.set(root, [row])
  }
  const hidden = new Set<string>()
  for (const group of groups.values()) {
    const [keep] = [...group].sort(
      (a, b) =>
        completeness(b) - completeness(a) ||
        roleRank(a.decision_role) - roleRank(b.decision_role) ||
        a.id.localeCompare(b.id),
    )
    for (const row of group) if (row.id !== keep?.id) hidden.add(row.id)
  }
  return hidden
}
