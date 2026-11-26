import type { AwardedContract, RegistryAnnouncement } from '@bellum/contracts'

/** Une ligne de la carte des marchés attribués, quelle que soit la lecture qui l'a trouvée. */
type AwardedRow = {
  title: string
  /** ISO `AAAA-MM-JJ` de notification, ou `null` quand l'analyse ne l'a pas lue. */
  date: string | null
  winner: string | null
  buyer: string | null
  /** Le compte est le TITULAIRE (il a remporté le marché), pas l'acheteur. */
  won: boolean
  amount: number | null
  url: string | null
}

/**
 * #3915.decp — la carte des marchés montre ceux que l'analyse a figés
 * (`awarded_contracts`) ET ceux que la veille relit en continu par SIREN
 * (`/accounts/:id/registry-announcements`, source `decp`). Le même marché lu
 * des deux côtés (même objet, même jour) n'est qu'UNE ligne ; un marché sans
 * objet ne dit rien. Le plus récent d'abord ; un marché non daté passe après.
 */
export function mergeAwardedContracts(
  frozen: readonly AwardedContract[] | undefined,
  registry: readonly RegistryAnnouncement[] | undefined,
): AwardedRow[] {
  const rows: AwardedRow[] = []
  const seen = new Set<string>()
  const keyOf = (title: string, date: string | null) => `${title.toLowerCase()}|${date ?? ''}`
  for (const a of registry ?? []) {
    if (a.source !== 'decp' || (a.kind !== 'award' && a.kind !== 'award_won')) continue
    const title = a.type?.trim()
    if (!title) continue
    const won = a.kind === 'award_won'
    const counterpart = a.counterpart?.trim() || null
    seen.add(keyOf(title, a.date))
    rows.push({
      title,
      date: a.date,
      winner: won ? null : counterpart,
      buyer: won ? counterpart : null,
      won,
      amount: null,
      url: a.url,
    })
  }
  for (const c of frozen ?? []) {
    const title = c?.title?.trim()
    if (!title) continue
    const date = c.notified_date?.trim().slice(0, 10) || null
    if (seen.has(keyOf(title, date))) continue
    seen.add(keyOf(title, date))
    rows.push({
      title,
      date,
      winner: c.winner ?? null,
      buyer: c.buyer ?? null,
      won: false,
      amount: c.amount ?? null,
      url: c.url ?? null,
    })
  }
  return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
