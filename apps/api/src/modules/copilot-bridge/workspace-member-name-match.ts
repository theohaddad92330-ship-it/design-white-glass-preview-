/**
 * #3094 — RETROUVER UN MEMBRE DE L'ESPACE PAR SON NOM, tapé en texte libre
 * dans le chat (« qui s'occupe de X ? », « quels sont les comptes de
 * <membre> ? »). Laura ne connaît un collègue que par ce que l'utilisateur
 * tape — jamais un identifiant — donc la résolution doit dire quand elle est
 * SÛRE, quand elle ne trouve PERSONNE, et quand plusieurs collègues
 * pourraient répondre au même prénom : un mauvais choix silencieux
 * attribuerait le portefeuille d'un collègue à un autre.
 */
type WorkspaceMemberNameMatch = { userId: string; fullName: string }

type WorkspaceMemberNameMatchResult =
  | { kind: 'found'; member: WorkspaceMemberNameMatch }
  | { kind: 'not_found' }
  | { kind: 'ambiguous'; candidates: readonly string[] }

const normalize = (value: string): string => value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Exact (nom complet) d'abord ; à défaut, un préfixe sur un mot entier
 * (« Bedros » retrouve « Bedros Astourian »), pour ne matcher jamais un nom
 * qui commence pareil sans être le même mot (« Bedro » ne retrouve rien).
 */
export function matchWorkspaceMemberByName(
  members: readonly WorkspaceMemberNameMatch[],
  rawName: string,
): WorkspaceMemberNameMatchResult {
  const needle = normalize(rawName)
  if (!needle) return { kind: 'not_found' }

  const exact = members.filter(member => normalize(member.fullName) === needle)
  if (exact.length === 1) return { kind: 'found', member: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact.map(member => member.fullName) }

  const prefixed = members.filter(
    member => normalize(member.fullName).startsWith(`${needle} `) || normalize(member.fullName) === needle,
  )
  if (prefixed.length === 1) return { kind: 'found', member: prefixed[0] }
  if (prefixed.length > 1) return { kind: 'ambiguous', candidates: prefixed.map(member => member.fullName) }

  return { kind: 'not_found' }
}
