/**
 * Détection de doublons dans le CRM — déclencheur n°17 des méta-analyses
 * (« détecter les doublons, pré-fusion, validation »).
 *
 * Deux décisions portent tout ce fichier.
 *
 * 1. **On propose, on ne fusionne jamais.** Le rapport écrit « pré-merge,
 *    validation » et c'est la seule forme acceptable : fusionner deux fiches
 *    est irréversible côté CRM, et un faux positif détruit l'historique d'un
 *    vrai client. Ce module rend des PAIRES avec leur raison ; l'humain tranche.
 * 2. **Chaque rapprochement porte sa raison.** « Doublon probable » sans motif
 *    ne se vérifie pas et ne se corrige pas. On dit « même adresse », « même
 *    nom chez la même société » ou « même nom, sociétés différentes » — et
 *    cette dernière n'est justement PAS un doublon, elle est écartée.
 */

type CrmRecord = {
  id: string
  name: string | null
  email: string | null
  company: string | null
}

/** Pourquoi deux fiches se ressemblent. L'ordre est celui de la confiance. */
type DuplicateReason = 'same_email' | 'same_name_same_company' | 'same_name_no_company'

export type DuplicatePair = {
  left: CrmRecord
  right: CrmRecord
  reason: DuplicateReason
  /** Confiance 0-1, affichée telle quelle : on ne masque pas l'incertitude. */
  confidence: number
}

/** Normalise un nom : sans accents, sans ponctuation, en minuscules. */
export function normalizeName(value: string | null): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Les formes juridiques qui n'identifient pas une société : « Société Générale
 * S.A. » et « Societe Generale » sont UNE entité. Retirées en FIN de nom seulement
 * et jamais jusqu'à vider le nom (« SA » seul reste « sa »). Un mot de plus qui
 * qualifie l'activité (« Services », « ADP ») n'en fait pas partie : « ACME » et
 * « ACME Services » restent deux comptes.
 */
const LEGAL_FORM_SUFFIXES: readonly (readonly string[])[] = [
  ['s', 'a', 's'],
  ['s', 'a', 'r', 'l'],
  ['s', 'a'],
  ['sas'],
  ['sasu'],
  ['sarl'],
  ['eurl'],
  ['sa'],
  ['se'],
  ['snc'],
  ['spa'],
  ['ag'],
  ['gmbh'],
  ['ltd'],
  ['plc'],
  ['inc'],
  ['llc'],
  ['nv'],
  ['bv'],
]

/**
 * La clé de comparaison de deux NOMS DE COMPTE (#3490) — plus large que
 * {@link normalizeName}, qui sert aussi aux contacts : compatibilité Unicode
 * (espace insécable, formes décomposées), ligatures (œ, æ, ß), « & » lu « et »,
 * apostrophes droites ou typographiques, forme juridique finale retirée.
 */
export function normalizeAccountName(value: string | null): string {
  if (!value) return ''
  const folded = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' et ')
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean)
  const suffix = LEGAL_FORM_SUFFIXES.find(
    candidate =>
      tokens.length > candidate.length &&
      candidate.every((part, index) => tokens[tokens.length - candidate.length + index] === part),
  )
  return (suffix ? tokens.slice(0, tokens.length - suffix.length) : tokens).join(' ')
}

/** Normalise une adresse ; `''` quand elle n'a pas la forme d'une adresse. */
export function normalizeEmail(value: string | null): string {
  if (!value) return ''
  const lowered = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered) ? lowered : ''
}

/**
 * Les paires probablement en double.
 *
 * L'adresse d'abord : c'est la seule clé qui vaut une quasi-certitude. Le nom
 * ensuite, mais **uniquement à société égale** — deux « Martin Dupont » chez
 * deux clients différents sont deux personnes, et les rapprocher serait la
 * pire erreur possible dans un CRM commercial.
 *
 * Une fiche sans nom NI adresse n'est comparée à rien : on ne rapproche pas
 * deux vides.
 */
export function findDuplicatePairs(records: CrmRecord[], limit = 25): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  const byEmail = new Map<string, CrmRecord[]>()
  const byNameCompany = new Map<string, CrmRecord[]>()

  for (const record of records) {
    const email = normalizeEmail(record.email)
    const name = normalizeName(record.name)
    if (email) {
      const bucket = byEmail.get(email)
      if (bucket) bucket.push(record)
      else byEmail.set(email, [record])
    }
    if (name) {
      const company = normalizeName(record.company)
      const key = `${name}|${company}`
      const bucket = byNameCompany.get(key)
      if (bucket) bucket.push(record)
      else byNameCompany.set(key, [record])
    }
  }

  const seen = new Set<string>()
  const pairKey = (a: CrmRecord, b: CrmRecord) => [a.id, b.id].sort().join('::')

  for (const group of byEmail.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const key = pairKey(group[i]!, group[j]!)
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push({ left: group[i]!, right: group[j]!, reason: 'same_email', confidence: 0.95 })
      }
    }
  }

  for (const [key, group] of byNameCompany) {
    const hasCompany = Boolean(key.split('|')[1])
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const id = pairKey(group[i]!, group[j]!)
        if (seen.has(id)) continue
        seen.add(id)
        pairs.push({
          left: group[i]!,
          right: group[j]!,
          // Sans société, deux homonymes ne sont PAS un doublon : la confiance
          // est basse et l'écran doit le montrer, pas l'arrondir.
          reason: hasCompany ? 'same_name_same_company' : 'same_name_no_company',
          confidence: hasCompany ? 0.75 : 0.35,
        })
      }
    }
  }

  return pairs.sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

import { normalizeSiren } from './crm-deal-account-link'

/** Un compte, réduit à ce qui sert à le rapprocher. */
type AccountRecord = { id: string; name: string | null }

type AccountDuplicatePair = {
  left: AccountRecord
  right: AccountRecord
  reason: 'same_name'
  confidence: number
}

/**
 * Les comptes qui portent LE MÊME NOM à l'accent, à la casse ou à la
 * ponctuation près (#3490 : « Société Générale » / « Societe Generale »).
 *
 * Égalité STRICTE du nom normalisé, jamais « contient » : « ACME » et
 * « ACME Services » (ou « KLESIA » et « KLESIA ADP ») sont très souvent deux
 * entités réelles chez un client, et les proposer serait un faux positif.
 * Une paire se PROPOSE, elle ne se fusionne jamais ; deux noms vides ne se
 * rapprochent pas.
 */
export function findAccountDuplicatePairs(records: AccountRecord[], limit = 25): AccountDuplicatePair[] {
  const byName = new Map<string, AccountRecord[]>()
  for (const record of records) {
    const name = normalizeAccountName(record.name)
    if (!name) continue
    const bucket = byName.get(name)
    if (bucket) bucket.push(record)
    else byName.set(name, [record])
  }
  const pairs: AccountDuplicatePair[] = []
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        pairs.push({ left: group[i]!, right: group[j]!, reason: 'same_name', confidence: 0.85 })
      }
    }
  }
  return pairs.slice(0, limit)
}

/**
 * #4016 L6 (15/10/2026) — les comptes qui portent LE MÊME SIREN (neuf chiffres,
 * espaces tolérés). C'est la SEULE clé de compte assez certaine pour fusionner
 * sans clic : un SIREN identifie une personne morale. Un SIREN absent ou illisible
 * n'est pas une clé, jamais un « vide égal vide ».
 */
export function findSameSirenAccountPairs(
  records: Array<AccountRecord & { siren?: string | null }>,
  limit = 1000,
): Array<{ left: AccountRecord; right: AccountRecord; siren: string }> {
  const bySiren = new Map<string, Array<AccountRecord & { siren?: string | null }>>()
  for (const record of records) {
    const siren = normalizeSiren(record.siren)
    if (!siren) continue
    const bucket = bySiren.get(siren)
    if (bucket) bucket.push(record)
    else bySiren.set(siren, [record])
  }
  const pairs: Array<{ left: AccountRecord; right: AccountRecord; siren: string }> = []
  for (const [siren, group] of bySiren) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) pairs.push({ left: group[i]!, right: group[j]!, siren })
    }
  }
  return pairs.slice(0, limit)
}

/** Une fiche à laquelle il manque de quoi travailler (hygiène, déclencheur n°24). */
export type IncompleteRecord = { record: CrmRecord; missing: Array<'email' | 'company' | 'name'> }

/**
 * Les fiches incomplètes.
 *
 * On ne signale que ce qui EMPÊCHE de travailler : sans adresse on ne peut pas
 * écrire, sans société on ne peut pas rattacher, sans nom on ne peut pas
 * s'adresser à quelqu'un. Le reste des propriétés d'un CRM est l'affaire de son
 * propriétaire, pas la nôtre.
 */
export function findIncompleteRecords(records: CrmRecord[], limit = 50): IncompleteRecord[] {
  const out: IncompleteRecord[] = []
  for (const record of records) {
    const missing: Array<'email' | 'company' | 'name'> = []
    if (!normalizeEmail(record.email)) missing.push('email')
    if (!normalizeName(record.company)) missing.push('company')
    if (!normalizeName(record.name)) missing.push('name')
    if (missing.length) out.push({ record, missing })
    if (out.length >= limit) break
  }
  return out
}

type SetAsideStatus = 'archived' | 'merged'
type AccountWithState = AccountRecord & { setAside: SetAsideStatus | null }
type SetAsideSide = { id: string; name: string; status: 'active' | SetAsideStatus }
type SetAsideAccountPair = { left: SetAsideSide; right: SetAsideSide }

/**
 * #3490 (Y22) — les paires de même nom dont AU MOINS UN compte est archivé ou rattaché.
 *
 * Elles ne se PROPOSENT jamais (proposer de rattacher ce qui l'est déjà ferait revenir un
 * doublon réglé) mais se DISENT : sans elles, « Société Générale » / « Societe Generale »
 * manquait à la liste sans que l'écran en donne la raison. Même clé de comparaison que
 * {@link findAccountDuplicatePairs} (égalité stricte du nom normalisé, jamais « contient »).
 * Deux comptes actifs ne sont pas une paire écartée : ils se proposent par ailleurs.
 */
export function findSetAsideAccountPairs(records: AccountWithState[], limit = 25): SetAsideAccountPair[] {
  const byName = new Map<string, AccountWithState[]>()
  for (const record of records) {
    const key = normalizeAccountName(record.name)
    if (!key) continue
    const bucket = byName.get(key)
    if (bucket) bucket.push(record)
    else byName.set(key, [record])
  }
  const side = (record: AccountWithState): SetAsideSide => ({
    id: record.id,
    name: record.name ?? '',
    status: record.setAside ?? 'active',
  })
  const pairs: SetAsideAccountPair[] = []
  for (const group of byName.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i]!
        const right = group[j]!
        if (!left.setAside && !right.setAside) continue
        pairs.push({ left: side(left), right: side(right) })
      }
    }
  }
  return pairs.slice(0, limit)
}
