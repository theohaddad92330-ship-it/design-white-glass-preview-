import { marketMatchKey } from '../market-memory/market-company-key'

/**
 * Capacité « Marchés locaux » (L1) — quels comptes de l'espace appartiennent à
 * une zone. Fonctions PURES : le service y passe des lignes déjà scopées à
 * l'espace, jamais d'autre.
 *
 * Trois liens, du plus fort au plus faible, UN seul rendu par compte :
 * - `headquarters` : le siège tombe dans la zone ;
 * - `site` : un site connu du compte y est ;
 * - `named_in_brief` : le nom normalisé du compte figure dans le brief (clients,
 *   membres de groupes, ESN). Lien FAIBLE (rapprochement par nom, voir
 *   `market-company-key.ts`) : il se nomme tel quel, jamais présenté comme un site.
 */

export type ZoneGeo = {
  scope: 'france' | 'suisse'
  departments: string[]
  cantons: string[]
  cities: string[]
}

type ZoneAccountMatch = 'site' | 'headquarters' | 'named_in_brief'
export type LinkedAccount = { account_id: string; name: string; match: ZoneAccountMatch }

type AccountRow = { id: string; name: string; headquarters: string | null }
type SiteRow = { account_id: string; city: string | null; postal_code: string | null }
type BriefNames = {
  clients?: { name: string }[]
  groups?: { members: { name: string }[] }[]
  esn?: { name: string }[]
}

const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Département d'un code postal français ; `null` pour tout ce qui n'est pas à 5 chiffres. */
export const departmentFromPostalCode = (postal: string): string | null => {
  const digits = postal.trim()
  if (!/^\d{5}$/.test(digits)) return null
  const prefix = digits.slice(0, 2)
  if (prefix === '20') return Number(digits.slice(0, 3)) <= 201 ? '2A' : '2B'
  if (prefix === '97' || prefix === '98') return digits.slice(0, 3)
  return prefix
}

/** Tous les départements qu'un texte libre laisse lire : codes postaux et « (59) ». */
const departmentsIn = (text: string): string[] => {
  const out: string[] = []
  for (const m of text.matchAll(/(?<!\d)\d{5}(?!\d)/g)) {
    const dep = departmentFromPostalCode(m[0])
    if (dep) out.push(dep)
  }
  for (const m of text.matchAll(/\((\d{2,3}|2[AB])\)/g)) out.push(m[1]!)
  return out
}

const containsWord = (haystack: string, needle: string): boolean => {
  const n = fold(needle)
  return n.length > 0 && ` ${fold(haystack)} `.includes(` ${n} `)
}

/** Ce texte (adresse, ville, « Lille (59) ») est-il dans la zone ? */
export const locationInZone = (text: string | null | undefined, zone: ZoneGeo): boolean => {
  if (!text || text.trim() === '') return false
  if (zone.cities.some(city => containsWord(text, city))) return true
  if (zone.scope === 'france') {
    const wanted = new Set(zone.departments)
    return departmentsIn(text).some(dep => wanted.has(dep))
  }
  // Suisse : le sigle de canton s'écrit en MAJUSCULES (« 1003 Renens VD ») ; en minuscules « de » ou « be » sont des mots.
  return zone.cantons.some(canton => new RegExp(`(?<![A-Za-z])${canton}(?![A-Za-z])`).test(text))
}

const namedKeys = (brief: BriefNames | null | undefined): Set<string> => {
  const names = [
    ...(brief?.clients ?? []).map(c => c.name),
    ...(brief?.groups ?? []).flatMap(g => g.members.map(m => m.name)),
    ...(brief?.esn ?? []).map(e => e.name),
  ]
  return new Set(names.map(marketMatchKey).filter(key => key !== ''))
}

export const linkAccountsToZone = (input: {
  zone: ZoneGeo
  accounts: AccountRow[]
  sites: SiteRow[]
  brief: BriefNames | null | undefined
}): LinkedAccount[] => {
  const { zone, accounts, sites, brief } = input
  const siteAccounts = new Set(
    sites
      .filter(site => locationInZone(`${site.postal_code ?? ''} ${site.city ?? ''}`, zone))
      .map(site => site.account_id),
  )
  const keys = namedKeys(brief)
  const out: LinkedAccount[] = []
  for (const account of accounts) {
    const link = (match: ZoneAccountMatch): number => out.push({ account_id: account.id, name: account.name, match })
    if (locationInZone(account.headquarters, zone)) link('headquarters')
    else if (siteAccounts.has(account.id)) link('site')
    else if (keys.has(marketMatchKey(account.name)) && marketMatchKey(account.name) !== '') link('named_in_brief')
  }
  return out
}
