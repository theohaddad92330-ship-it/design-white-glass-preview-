import type { InverseMatch } from '@bellum/contracts'

type InverseEntry = InverseMatch['needs'][number]

/**
 * Théo C talents-comptes.N1 — l'état de relation d'un compte, tel qu'on peut le
 * MESURER depuis le rapprochement inversé : un besoin enregistré fait « need »,
 * un rapprochement sans identifiant de besoin reste « to_qualify ». « Signal »
 * et « mission en cours » ne se devinent pas d'ici — ils ne sont jamais posés.
 */
type AccountForTalentState = 'need' | 'to_qualify'

export type AccountForTalent = {
  /** Clé stable de ligne : l'id du compte, sinon son nom, sinon le besoin. */
  key: string
  /** 1-based — le rang affiché « 01 ». */
  rank: number
  accountId: string | null
  accountName: string | null
  /** Le besoin le mieux aligné du compte. */
  role: string
  location: string | null
  needCount: number
  state: AccountForTalentState
  /** Compétences du besoin que le profil porte aussi — jamais inventées. */
  commonSkills: string[]
  /** Faits du compte déjà connus (affaires, missions) : on ne relance pas à froid. */
  hasRelation: boolean
}

/**
 * Théo C talents-comptes.R2 — UN classement de comptes (et non une liste de
 * besoins) : les besoins d'un même compte se replient sur une ligne, portée par
 * le besoin le mieux aligné. Aucun score n'est exposé ici : le rang est expliqué
 * par la carte « Pourquoi ces rapprochements ? », jamais par une note nue.
 */
export function groupNeedsByAccount(
  entries: readonly InverseEntry[],
  talentTerms: readonly string[],
): AccountForTalent[] {
  const terms = new Set(talentTerms.map(term => term.trim().toLowerCase()).filter(Boolean))
  const groups = new Map<string, InverseEntry[]>()
  entries.forEach((entry, index) => {
    const { need } = entry
    const key =
      need.accountId ??
      (need.accountName ? `name:${need.accountName.trim().toLowerCase()}` : `need:${need.needId ?? index}`)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  })

  return [...groups.entries()]
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => b.result.pushableScore - a.result.pushableScore)
      const best = sorted[0]
      return { key, group, best }
    })
    .filter((row): row is { key: string; group: InverseEntry[]; best: InverseEntry } => row.best !== undefined)
    .sort((a, b) => b.best.result.pushableScore - a.best.result.pushableScore)
    .map(({ key, group, best }, index) => ({
      key,
      rank: index + 1,
      accountId: best.need.accountId ?? null,
      accountName: best.need.accountName,
      role: best.need.role,
      location: best.need.location,
      needCount: group.length,
      state: best.need.needId ? ('need' as const) : ('to_qualify' as const),
      commonSkills: (best.need.skills ?? [])
        .filter(skill => terms.has(skill.label.trim().toLowerCase()) || terms.has(skill.term.trim().toLowerCase()))
        .map(skill => skill.label),
      hasRelation: group.some(entry => (entry.need.clientHistory?.length ?? 0) > 0),
    }))
}
