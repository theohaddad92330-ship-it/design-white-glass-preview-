import type { ClarificationOption } from './ContextDisclosure'

type OptionGroup = { question?: string; options?: ClarificationOption[] }

const labelOf = (option: ClarificationOption): string => (typeof option === 'string' ? option : option.label)

/** Insensible à la casse, aux espaces, aux apostrophes typographiques et à la ponctuation finale. */
const key = (option: ClarificationOption): string =>
  labelOf(option)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?…:;,]+$/, '')

/**
 * R10B-FIX.4 — chaque libellé de bouton n'est offert qu'UNE fois sous une réponse.
 *
 * La carte de clarification et les groupes de précisions (`reply_options`) peuvent porter les
 * mêmes réponses (E-mail / Message LinkedIn / Script d'appel sous une carte contact) : les rendre
 * toutes deux les montrait en double. `shown` = ce que la clarification offre déjà ; un groupe
 * qui n'a plus aucune option disparaît (pas de rangée vide).
 */
export function dedupeReplyOptionGroups<G extends OptionGroup>(
  groups: readonly G[],
  shown: readonly ClarificationOption[],
): G[] {
  const seen = new Set(shown.map(key))
  const out: G[] = []
  for (const group of groups) {
    const options = (group.options ?? []).filter(option => {
      const k = key(option)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (options.length > 0) out.push({ ...group, options })
  }
  return out
}
