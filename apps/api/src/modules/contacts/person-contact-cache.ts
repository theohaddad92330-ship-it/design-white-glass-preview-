import { createHash } from 'node:crypto'
import { Logger } from '@nestjs/common'
import Redis from 'ioredis'

/**
 * CACHE-API (Louis 15/10/2026) — « un même appel n'est JAMAIS payé deux fois en 30 jours »,
 * pour les coordonnées ACHETÉES d'une personne (Hunter, Lusha, Kaspr, FullEnrich, Dropcontact).
 *
 * LA CLÉ EST LA PERSONNE : profil LinkedIn > nom + domaine (ou société). Jamais le run, jamais
 * l'utilisateur, jamais `only` / `have` (ce qu'on demande, pas qui on demande) : une réponse
 * déjà payée SERT toute question sur la même personne, filtrée à la lecture.
 *
 * COMMUN À TOUS LES ESPACES (Louis 15/10/2026 : « pour le cache je veux pas que ce soit sur le
 * user mais sur tout le monde, il ne doit pas y avoir de GA-43 dans ce cas » ; crédits TheirStack
 * épuisés en 5 jours). Aucun identifiant d'espace dans la clé : une même question n'est jamais
 * payée deux fois. Ce cache ne sert QUE l'appel fournisseur — il n'expose pas la fiche d'un
 * espace à un autre (corrections humaines, notes, statut restent dans l'espace). Garde :
 * `community-aggregation-kinds.spec.ts` (entrée « cache d'enrichissement commun »).
 *
 * REDIS SEUL, jamais de table durable : même arbitrage que `apollo.py` (lot 16) — on ne prolonge
 * pas la rétention d'une donnée personnelle pour économiser un crédit. TTL 30 j
 * (`CACHE_TTL_CONTACT_S`), un « rien trouvé » 2 j (`CACHE_TTL_CONTACT_EMPTY_S`), une panne
 * (réseau, 4xx/5xx, quota) n'est JAMAIS écrite.
 *
 * EFFACEMENT RGPD (c67) : `purgePerson` retire la personne de TOUS les espaces (le motif de clé
 * commence par son empreinte de nom / de profil), et l'appelant (`PersonErasureService`) l'invoque
 * dans le geste. Une personne effacée n'est donc jamais resservie ; et `preflightEnrichment` la
 * refuse de toute façon avant d'arriver ici.
 */

const DAY_S = 24 * 3600
const KEY_PREFIX = 'pcache:contact:v2'
/** v1 (par espace) : jamais relu, mais l'effacement RGPD (c67) le purge tant qu'il n'a pas expiré. */
const LEGACY_KEY_PREFIX = 'pcache:contact:v1'

function seconds(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export function contactCacheTtlSeconds(): number {
  return seconds('CACHE_TTL_CONTACT_S', 30 * DAY_S)
}

export function contactCacheEmptyTtlSeconds(): number {
  return seconds('CACHE_TTL_CONTACT_EMPTY_S', 2 * DAY_S)
}

interface PersonCacheStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  /** Supprime les clés qui correspondent au motif glob ; rend le nombre supprimé. */
  deleteMatching(pattern: string): Promise<number>
  deleteKeys(keys: readonly string[]): Promise<number>
}

/** Mémoire — tests, et repli sans Redis. */
export class MemoryPersonCacheStore implements PersonCacheStore {
  readonly entries = new Map<string, { value: string; expiresAt: number }>()

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key)
    if (!entry || entry.expiresAt <= Date.now()) return null
    return entry.value
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async deleteMatching(pattern: string): Promise<number> {
    const matcher = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    let removed = 0
    for (const key of [...this.entries.keys()]) {
      if (matcher.test(key)) {
        this.entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  async deleteKeys(keys: readonly string[]): Promise<number> {
    return keys.reduce((count, key) => count + (this.entries.delete(key) ? 1 : 0), 0)
  }
}

/** Redis (`REDIS_URL`, le même que la file) — paresseux ; sans URL ou en panne, aucun cache. */
class RedisPersonCacheStore implements PersonCacheStore {
  private client: Redis | null | undefined

  private redis(): Redis | null {
    if (this.client !== undefined) return this.client
    const url = (process.env['REDIS_URL'] ?? '').trim()
    if (!url) {
      this.client = null
      return null
    }
    this.client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
    this.client.on('error', () => undefined)
    return this.client
  }

  async get(key: string): Promise<string | null> {
    return (await this.redis()?.get(key)) ?? null
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis()?.set(key, value, 'EX', Math.max(1, Math.floor(ttlSeconds)))
  }

  async deleteMatching(pattern: string): Promise<number> {
    const client = this.redis()
    if (!client) return 0
    let removed = 0
    let cursor = '0'
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
      cursor = next
      if (keys.length > 0) removed += await client.del(...keys)
    } while (cursor !== '0')
    return removed
  }

  async deleteKeys(keys: readonly string[]): Promise<number> {
    const client = this.redis()
    return client && keys.length > 0 ? client.del(...keys) : 0
  }
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Minuscules, sans accents, lettres et chiffres seulement. */
function slug(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function domainOf(raw: string | undefined): string {
  return (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0] as string
}

/** Le slug public d'un profil `/in/<slug>`, en minuscules ; `null` sans profil exploitable. */
export function linkedinIdentity(url: string | undefined): string | null {
  const match = /\/in\/([^/?#]+)/i.exec(url ?? '')
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase() || null
  } catch {
    return null
  }
}

export type PersonRef = {
  firstName?: string
  lastName?: string
  organizationName?: string
  domain?: string
  linkedinUrl?: string
}

type Identities = { nameHash: string; linkedinHash: string | null; ids: string[] }

/** Les identités sous lesquelles on range / cherche une personne, de la plus forte à la plus faible. */
function identitiesOf(person: PersonRef): Identities | null {
  const first = slug(person.firstName)
  const last = slug(person.lastName)
  const linkedin = linkedinIdentity(person.linkedinUrl)
  const employer = domainOf(person.domain) || slug(person.organizationName)
  const nameHash = sha(`${first}|${last}`).slice(0, 32)
  const linkedinHash = linkedin ? sha(`li:${linkedin}`).slice(0, 32) : null
  const ids: string[] = []
  if (linkedinHash) ids.push(linkedinHash)
  if (first && last && employer) ids.push(sha(`no:${first}|${last}|${employer}`).slice(0, 32))
  return ids.length > 0 ? { nameHash, linkedinHash, ids } : null
}

function keyOf(identity: Identities, id: string): string {
  return `${KEY_PREFIX}:${identity.nameHash}:${identity.linkedinHash ?? '-'}:${id}`
}

type ContactCacheEntry = {
  provider?: string
  email?: string
  phone?: string
  linkedinUrl?: string
  /** Quand chaque coordonnée a été TROUVÉE (ms) — borne la vie d'une valeur, quoi qu'il arrive à la clé. */
  foundAt?: { email?: number; phone?: number }
  /** Quand une question SANS réponse a été posée aux fournisseurs (ms) — TTL court. */
  emptyAt?: { email?: number; phone?: number }
}

type ContactCacheCoordinate = 'email' | 'phone'

type ContactCacheLookup =
  | { settled: false }
  | {
      settled: true
      provider?: string
      email?: string
      phone?: string
      linkedinUrl?: string
    }

const logger = new Logger('PersonContactCache')

export class PersonContactCache {
  constructor(private readonly store: PersonCacheStore) {}

  /**
   * Les coordonnées DEMANDÉES sont-elles toutes déjà réglées (trouvées < 30 j, ou posées sans
   * réponse < 2 j) ? Alors la réponse vient d'ici, sans appel. Une seule non réglée ⇒ miss.
   */
  async lookup(
    person: PersonRef,
    wanted: readonly ContactCacheCoordinate[],
    now: number = Date.now(),
  ): Promise<ContactCacheLookup> {
    const identity = identitiesOf(person)
    if (!identity || wanted.length === 0) return { settled: false }
    try {
      for (const id of identity.ids) {
        const raw = await this.store.get(keyOf(identity, id))
        if (!raw) continue
        const entry = JSON.parse(raw) as ContactCacheEntry
        const ttl = contactCacheTtlSeconds() * 1000
        const emptyTtl = contactCacheEmptyTtlSeconds() * 1000
        const live = (coordinate: ContactCacheCoordinate): boolean =>
          (Boolean(entry[coordinate]) && now - (entry.foundAt?.[coordinate] ?? 0) < ttl) ||
          now - (entry.emptyAt?.[coordinate] ?? 0) < emptyTtl
        if (!wanted.every(live)) continue
        const found = (coordinate: ContactCacheCoordinate): string | undefined =>
          wanted.includes(coordinate) && now - (entry.foundAt?.[coordinate] ?? 0) < ttl ? entry[coordinate] : undefined
        const email = found('email')
        const phone = found('phone')
        return {
          settled: true,
          ...(entry.provider ? { provider: entry.provider } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(entry.linkedinUrl ? { linkedinUrl: entry.linkedinUrl } : {}),
        }
      }
    } catch (error) {
      logger.debug(`lecture du cache impossible (${(error as Error).message}) — appel en direct`)
    }
    return { settled: false }
  }

  /**
   * Range ce que les fournisseurs ont répondu. `answered` = les coordonnées dont TOUS les
   * fournisseurs interrogés ont répondu sans erreur ; une coordonnée en panne n'est pas écrite.
   */
  async remember(
    person: PersonRef,
    result: { provider?: string; email?: string; phone?: string; linkedinUrl?: string },
    answered: readonly ContactCacheCoordinate[],
    now: number = Date.now(),
  ): Promise<void> {
    const identity = identitiesOf(person)
    if (!identity) return
    try {
      for (const id of identity.ids) {
        const key = keyOf(identity, id)
        const previous = (JSON.parse((await this.store.get(key)) ?? 'null') as ContactCacheEntry | null) ?? {}
        const ttl = contactCacheTtlSeconds() * 1000
        const next: ContactCacheEntry = {
          ...previous,
          foundAt: { ...previous.foundAt },
          emptyAt: { ...previous.emptyAt },
        }
        let changed = false
        for (const coordinate of ['email', 'phone'] as const) {
          const value = result[coordinate]
          if (value) {
            next[coordinate] = value
            next.foundAt = { ...next.foundAt, [coordinate]: now }
            if (result.provider) next.provider = result.provider
            changed = true
          } else if (
            answered.includes(coordinate) &&
            !(previous[coordinate] && now - (previous.foundAt?.[coordinate] ?? 0) < ttl)
          ) {
            next.emptyAt = { ...next.emptyAt, [coordinate]: now }
            changed = true
          }
        }
        if (result.linkedinUrl && !next.linkedinUrl) {
          next.linkedinUrl = result.linkedinUrl
          changed = true
        }
        if (!changed) continue
        const lives = (['email', 'phone'] as const).flatMap(coordinate => {
          const found = next[coordinate] ? (next.foundAt?.[coordinate] ?? 0) + ttl : 0
          const empty = (next.emptyAt?.[coordinate] ?? 0) + contactCacheEmptyTtlSeconds() * 1000
          return [found, empty]
        })
        const expiresAt = Math.max(...lives, next.linkedinUrl ? now + ttl : 0)
        await this.store.set(key, JSON.stringify(next), Math.max(1, Math.ceil((expiresAt - now) / 1000)))
      }
    } catch (error) {
      logger.debug(`écriture du cache impossible (${(error as Error).message}) — ignorée`)
    }
  }

  /**
   * Une réponse fournisseur ENTIÈRE (Dropcontact rend un enregistrement, pas seulement un e-mail),
   * rangée sous la même clé de personne + le nom de la famille.
   * `found: false` = « rien trouvé », TTL court. Mêmes règles : 30 j, commun, purgée à l'effacement.
   */
  async lookupRecord<T>(
    family: string,
    person: PersonRef,
    now: number = Date.now(),
  ): Promise<{ settled: false } | { settled: true; value: T | null }> {
    const identity = identitiesOf(person)
    if (!identity) return { settled: false }
    try {
      for (const id of identity.ids) {
        const raw = await this.store.get(`${keyOf(identity, id)}:rec:${family}`)
        if (!raw) continue
        const entry = JSON.parse(raw) as { at: number; found: boolean; value?: T }
        const ttl = (entry.found ? contactCacheTtlSeconds() : contactCacheEmptyTtlSeconds()) * 1000
        if (now - entry.at >= ttl) continue
        return { settled: true, value: entry.found ? (entry.value ?? null) : null }
      }
    } catch (error) {
      logger.debug(`lecture du cache impossible (${(error as Error).message}) — appel en direct`)
    }
    return { settled: false }
  }

  /** Range une réponse entière (`value` null = « rien trouvé » SANS erreur). Une panne : n'appeler pas. */
  async rememberRecord<T>(family: string, person: PersonRef, value: T | null, now: number = Date.now()): Promise<void> {
    const identity = identitiesOf(person)
    if (!identity) return
    const ttlSeconds = value === null ? contactCacheEmptyTtlSeconds() : contactCacheTtlSeconds()
    try {
      const payload = JSON.stringify({ at: now, found: value !== null, ...(value !== null ? { value } : {}) })
      for (const id of identity.ids) {
        await this.store.set(`${keyOf(identity, id)}:rec:${family}`, payload, ttlSeconds)
      }
    } catch (error) {
      logger.debug(`écriture du cache impossible (${(error as Error).message}) — ignorée`)
    }
  }

  /**
   * Effacement RGPD (c67) : retire la personne du cache commun (et du v1 d'avant), par son nom (toute clé qui
   * commence par l'empreinte du nom) et par son profil LinkedIn. Meilleur effort, jamais bloquant.
   */
  async purgePerson(person: PersonRef): Promise<number> {
    const first = slug(person.firstName)
    const last = slug(person.lastName)
    const linkedin = linkedinIdentity(person.linkedinUrl)
    if (!(first && last) && !linkedin) return 0
    try {
      let removed = 0
      if (first && last)
        for (const prefix of [KEY_PREFIX, LEGACY_KEY_PREFIX])
          removed += await this.store.deleteMatching(`${prefix}:${sha(`${first}|${last}`).slice(0, 32)}:*`)
      if (linkedin)
        for (const prefix of [KEY_PREFIX, LEGACY_KEY_PREFIX])
          removed += await this.store.deleteMatching(`${prefix}:*:${sha(`li:${linkedin}`).slice(0, 32)}:*`)
      // LOT (15/10) DATA-A point 5 — la recherche de personnes Apollo (IA, `apollo:search:*`) est rangée par
      // ORGANISATION : une personne effacée peut figurer dans n'importe quelle liste, on purge donc en bloc.
      removed += await this.store.deleteMatching('apollo:search:*')
      return removed
    } catch (error) {
      logger.warn(`purge du cache d'enrichissement impossible (${(error as Error).message})`)
      return 0
    }
  }

  /**
   * Les clés du cache de contact côté IA (`apollo.py`, `salesql.py` — Redis, sans espace).
   * Même dérivation que Python : `sha256(basis)` avec `basis` en minuscules.
   */
  static iaKeys(person: PersonRef & { apolloId?: string }): string[] {
    const keys: string[] = []
    const lower = (text: string): string => text.trim().toLowerCase()
    const linkedin = linkedinIdentity(person.linkedinUrl)
    const liBasis = linkedin ? `li:linkedin.com/in/${linkedin}` : null
    if (person.apolloId?.trim()) keys.push(`apollo:enrich:${sha(`id:${lower(person.apolloId)}`)}`)
    if (liBasis) keys.push(`apollo:enrich:${sha(liBasis)}`, `salesql:enrich:${sha(liBasis)}`)
    const first = (person.firstName ?? '').trim()
    const last = (person.lastName ?? '').trim()
    if (first && last) {
      if (person.organizationName?.trim()) {
        keys.push(`apollo:enrich:${sha(lower(`no:${first}|${last}|${person.organizationName}`))}`)
        keys.push(`salesql:enrich:${sha(lower(`no:${first}|${last}|${person.organizationName}`))}`)
      }
      if (person.domain?.trim()) keys.push(`salesql:enrich:${sha(lower(`no:${first}|${last}|${person.domain}`))}`)
    }
    return [...new Set(keys)]
  }

  async purgeIaKeys(person: PersonRef & { apolloId?: string }): Promise<number> {
    try {
      return await this.store.deleteKeys(PersonContactCache.iaKeys(person))
    } catch {
      return 0
    }
  }
}

let current: PersonContactCache | null = null

/** Le cache de contact du processus (Redis `REDIS_URL`). */
export function getPersonContactCache(): PersonContactCache {
  current ??= new PersonContactCache(new RedisPersonCacheStore())
  return current
}

/** Tests : remplace le magasin (ou `null` pour revenir à Redis). */
export function setPersonContactCacheStore(store: PersonCacheStore | null): void {
  current = store ? new PersonContactCache(store) : null
}
