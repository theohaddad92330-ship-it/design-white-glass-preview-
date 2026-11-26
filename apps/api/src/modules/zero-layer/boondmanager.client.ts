import { dispatchFailureOutcome, type DispatchFailureOutcome } from '@bellum/contracts'
import type { BoondManagerConfig } from './boondmanager-config'
import { BoondCallGate, retryDelayMs, sharedBoondCallGate, tierFor, type GateClock } from './boond-call-gate'
import { buildActionBody, type BoondActionInput } from './boond-action-body'
import { parseDictionary, refuseTypeOf, type BoondDictionary } from './boond-dictionary'
import { requiredScopeFor, scopeRefusal, UndeclaredBoondRouteError } from './boond-scopes'
import type { ZeroLayerFinding } from './zero-layer-format'

/**
 * Client de lecture de l'ATS BoondManager (annexe méthodo p8 — « ATS,
 * BondManager »).
 *
 * LECTURE SEULE, et volontairement minimal : la couche zéro n'a besoin que d'une
 * réponse, « ce compte est-il déjà connu de notre ATS, et à quoi est-il
 * rattaché ». On ne synchronise rien, on n'écrit rien.
 *
 * ── Parsing tolérant, et pourquoi ────────────────────────────────────────────
 * La forme exacte des réponses BoondManager n'est pas publique. Plutôt que de
 * coder en dur une structure devinée — qui casserait au premier écart — le
 * client explore la réponse et retient les objets porteurs d'un identifiant et
 * d'un libellé, quelle que soit la profondeur (`data[].attributes.name`,
 * `data[].name`, `rows[]`…). Une réponse inattendue rend donc une liste vide,
 * jamais une exception ni une donnée déformée.
 *
 * Et surtout : le filtrage final se fait CÔTÉ CLIENT sur le libellé rendu. Si le
 * paramètre de recherche est ignoré par le serveur, la couverture baisse (on ne
 * voit que la première page) mais on ne rattache JAMAIS au compte une société qui
 * n'a rien à voir.
 */

/** Bornes — une page suffit pour répondre « connu / inconnu ». */
const PAGE_SIZE = 30
const REQUEST_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 3

/**
 * L'issue d'une écriture ERP, HONNÊTE sur ce qui est su.
 *
 * `outcome` ne porte de sens que sur un échec : `failed` — le distant a
 * répondu (ou n'a jamais été joignable), rejouable sans risque ; `unknown` —
 * la requête est partie et la réponse n'est pas revenue, on ne SAIT PAS si
 * l'ERP a appliqué l'écriture. Calculé par `dispatchFailureOutcome`
 * (`@bellum/contracts`), jamais redeviné localement.
 */
export type BoondManagerWriteOutcome =
  { ok: true; detail: string } | { ok: false; detail: string; outcome: DispatchFailureOutcome }

const DECLARATION_REFUSED =
  "BoondManager refuse cette route : l'application n'a pas les droits déclarés pour y accéder (501). Refus de déclaration, pas une panne — rien n'est retenté."
const CIRCUIT_OPEN = "L'instance BoondManager de cet espace ne répond plus : appels suspendus un court instant."

type Json = Record<string, unknown>

function isJson(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Première chaîne non vide parmi `keys`, en surface ou sous `attributes`. */
function pickString(node: Json, keys: string[]): string {
  const attributes = isJson(node['attributes']) ? (node['attributes'] as Json) : null
  for (const key of keys) {
    const direct = node[key]
    if (typeof direct === 'string' && direct.trim()) return direct.trim()
    const nested = attributes?.[key]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }
  return ''
}

/**
 * Aplatit une réponse en une liste d'enregistrements exploitables.
 *
 * Traverse `data`, `rows`, `items` et les tableaux imbriqués sur une profondeur
 * bornée : assez pour absorber les variantes de forme, trop court pour partir en
 * exploration récursive d'une réponse hostile.
 */
function harvest(payload: unknown, depth = 0): Json[] {
  if (depth > 3) return []
  if (Array.isArray(payload)) return payload.filter(isJson)
  if (!isJson(payload)) return []

  const out: Json[] = []
  for (const key of ['data', 'rows', 'items', 'results']) {
    const branch = payload[key]
    if (branch !== undefined) out.push(...harvest(branch, depth + 1))
  }
  // Un objet unique qui porte déjà un identifiant est un enregistrement.
  if (out.length === 0 && (payload['id'] !== undefined || isJson(payload['attributes']))) out.push(payload)
  return out
}

/** Dépendances injectables (tests) : passerelle, horloge, hasard, réseau. */
type BoondClientDeps = { gate?: BoondCallGate; sleep?: GateClock['sleep']; random?: () => number }

/** L'issue d'UN appel sortant. Un seul chemin les produit tous. */
type BoondCallResult =
  | { kind: 'ok'; status: number; text: string }
  | { kind: 'http'; status: number; text: string }
  /** 501 « This application does not have the rights to access this route » : refus de DÉCLARATION, jamais retenté. */
  | { kind: 'declaration_refused'; text: string }
  | { kind: 'refused'; message: string }
  | { kind: 'circuit_open' }
  /** Requête partie, pas de réponse : on ne SAIT PAS. Arrête la reprise. */
  | { kind: 'unknown'; error: unknown }
  | { kind: 'unreachable'; error: unknown }

export class BoondManagerClient {
  private readonly gate: BoondCallGate
  private readonly sleep: GateClock['sleep']
  private readonly random: () => number
  private readonly warnings = new Set<string>()

  constructor(
    private readonly config: BoondManagerConfig,
    deps: BoondClientDeps = {},
  ) {
    this.gate = deps.gate ?? sharedBoondCallGate
    this.sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
    this.random = deps.random ?? Math.random
  }

  private get key(): string {
    return this.config.connectionKey ?? this.config.baseUrl
  }

  /** `meta.warnings` rendus par Boond (ex. `appOauthRedirection`) : à remonter à l'écran, pas à avaler. */
  get responseWarnings(): string[] {
    return [...this.warnings]
  }

  /** Nombre d'appels sortis POUR CETTE connexion (jamais sommé entre espaces, GA-43). */
  get callCount(): number {
    return this.gate.callCount(this.key)
  }

  /** `null` = la capacité est disponible ; sinon le message qui nomme le scope absent. Aucun appel réseau. */
  refusalFor(method: string, path: string): string | null {
    return scopeRefusal(this.config.grantedScopes, requiredScopeFor(method, path))
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Encoding': 'gzip' }
    if (this.config.accessToken) {
      // #4688 — OAuth2 : jeton d'accès temporaire, rendu par Boond avec son `expires_in`.
      headers['Authorization'] = `Bearer ${this.config.accessToken}`
    }
    if (this.config.userToken) {
      // Jeton utilisateur en HTTP Basic — la forme documentée par l'éditeur.
      headers['Authorization'] = `Basic ${Buffer.from(`${this.config.userToken}:`).toString('base64')}`
    }
    if (this.config.clientToken && this.config.clientKey) {
      headers['X-Jwt-Client-Boondmanager'] = this.config.clientToken
      headers['X-Jwt-App-Boondmanager'] = this.config.clientKey
    }
    return headers
  }

  /**
   * LE chemin sortant — lectures et écritures y passent toutes (#4693).
   *
   * Dans l'ordre : scope déclaré et accordé (refus AVANT le réseau), coupe-circuit de la connexion, limiteur de la
   * connexion, timeout explicite, puis classement. `Retry-After` est respecté à la seconde ; sinon back-off 1/2/4 s avec
   * jitter, plafonné à {@link MAX_ATTEMPTS}. Une écriture n'est rejouée que sur 429 (refusée avant traitement) : sur un
   * timeout, `unknown` ARRÊTE la reprise — rejouer un POST risque un doublon.
   */
  private async call(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    params: Record<string, string>,
    body?: Record<string, unknown>,
  ): Promise<BoondCallResult> {
    const refusal = this.refusalFor(method, path)
    if (refusal) return { kind: 'refused', message: refusal }
    if (this.gate.isOpen(this.key)) return { kind: 'circuit_open' }

    const url = new URL(`${this.config.baseUrl}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const tier = tierFor(path)

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await this.gate.acquire(this.key, tier)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let retryAfter: number | null = null
      try {
        const res = await fetch(url.toString(), {
          method,
          headers: body ? { ...this.headers(), 'Content-Type': 'application/json' } : this.headers(),
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        })
        const text = await res.text().catch(() => '')
        if (res.ok) {
          this.gate.recordSuccess(this.key)
          this.collectWarnings(text)
          return { kind: 'ok', status: res.status, text }
        }
        if (res.status === 501) return { kind: 'declaration_refused', text }
        if (res.status === 429) {
          const header = Number(res.headers?.get?.('Retry-After'))
          retryAfter = Number.isFinite(header) && header >= 0 ? header : null
        } else if (res.status >= 500 && method === 'GET') {
          this.gate.recordFailure(this.key)
        } else {
          return { kind: 'http', status: res.status, text }
        }
        if (attempt === MAX_ATTEMPTS - 1) return { kind: 'http', status: res.status, text }
      } catch (error) {
        this.gate.recordFailure(this.key)
        const outcome = dispatchFailureOutcome(error)
        if (outcome === 'unknown' || method !== 'GET' || attempt === MAX_ATTEMPTS - 1) {
          return outcome === 'unknown' ? { kind: 'unknown', error } : { kind: 'unreachable', error }
        }
      } finally {
        clearTimeout(timer)
      }
      await this.sleep(retryDelayMs(attempt, retryAfter, this.random))
    }
    return { kind: 'unreachable', error: new Error('Plafond de tentatives atteint') }
  }

  private collectWarnings(text: string): void {
    try {
      const meta = (JSON.parse(text) as { meta?: { warnings?: unknown } }).meta
      if (Array.isArray(meta?.warnings)) {
        for (const w of meta.warnings) {
          const label = isJson(w) ? pickString(w, ['code', 'type', 'detail']) : typeof w === 'string' ? w : ''
          if (label) this.warnings.add(label)
        }
      }
    } catch {
      /* corps non JSON : rien à remonter */
    }
  }

  /** GET borné. Toute anomalie (refus, statut, JSON, réseau, délai) rend `null` : la couche zéro dégrade, elle ne bloque pas. */
  private async get(path: string, params: Record<string, string>): Promise<unknown | null> {
    const result = await this.call('GET', path, params)
    if (result.kind !== 'ok') return null
    try {
      return JSON.parse(result.text) as unknown
    } catch {
      return null
    }
  }

  /** Le dictionnaire de l'instance (Tier 2). `null` si illisible : aucun repli deviné. */
  async fetchDictionary(language: 'fr' | 'en' | 'es' = 'fr'): Promise<BoondDictionary | null> {
    return parseDictionary(await this.get('/application/dictionary', { language }))
  }

  /** La sonde de connexion : « qui suis-je et quels droits ai-je ? » — Tier 1, bien moins cher qu'une liste. */
  async probeCurrentUser(): Promise<boolean> {
    return (await this.get('/application/current-user', {})) !== null
  }

  /**
   * Crée une action typée sur une fiche contact : le `typeOf` doit exister dans le dictionnaire de l'instance pour
   * CETTE entité, sinon refus AVANT tout appel réseau. Aucun identifiant n'est jamais deviné. Le corps est l'enveloppe
   * JSON:API prouvée (`buildActionBody`), plus jamais un objet plat (#4692).
   */
  async createAction(
    dict: BoondDictionary | null,
    input: Omit<BoondActionInput, 'timezone'>,
  ): Promise<BoondManagerWriteOutcome> {
    const refusal = refuseTypeOf(dict, 'contact', input.typeOf)
    if (refusal) return { ok: false, detail: refusal.message, outcome: 'failed' }
    const timezone = dict?.timezone
    if (!timezone) {
      return {
        ok: false,
        detail: "Le fuseau de l'instance BoondManager n'est pas lisible au dictionnaire : action refusée.",
        outcome: 'failed',
      }
    }
    let body: Record<string, unknown>
    try {
      body = buildActionBody({ ...input, timezone })
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : 'Corps d’action invalide',
        outcome: 'failed',
      }
    }
    return this.create('/actions', body)
  }

  /** Identifiant Boond de l'utilisateur de la connexion (responsable principal d'une action) ; `null` si illisible. */
  async fetchCurrentUserId(): Promise<string | null> {
    const payload = await this.get('/application/current-user', {})
    const id = payload === null ? undefined : harvest(payload)[0]?.['id']
    return typeof id === 'string' || typeof id === 'number' ? String(id) : null
  }

  /**
   * Crée une ressource — POST vers la COLLECTION (`/deliveries`, jamais
   * `/deliveries/{id}` : la ressource n'existe pas encore).
   *
   * Non idempotent par nature : rejouer un `create()` après une issue
   * `unknown` RISQUE un doublon. C'est exactement pour ça que corriger une
   * ressource EXISTANTE passe par {@link update}, jamais par ici.
   */
  async create(path: string, body: Record<string, unknown>): Promise<BoondManagerWriteOutcome> {
    return this.send('POST', path, body)
  }

  /**
   * Corrige une ressource EXISTANTE — PATCH vers `path/{id}`.
   *
   * ⚠️ Le défaut que cette méthode répare : `write()` était `POST` en dur vers
   * une collection, quel que soit le geste — un `update_tjm` (censé CORRIGER
   * une mission) créait donc un doublon dans l'ERP au lieu de la corriger.
   *
   * **Sans identifiant, ce n'est pas une mise à jour, c'est une création
   * déguisée** : refusé ici, avant tout appel réseau, jamais silencieusement
   * transformé en POST. Et parce que PATCH cible une ressource précise, rejouer
   * la même correction après une issue `unknown` (voir {@link send}) ne double
   * jamais l'enregistrement — c'est la raison même de distinguer les deux
   * verbes plutôt que de tout poster.
   */
  async update(path: string, resourceId: string, body: Record<string, unknown>): Promise<BoondManagerWriteOutcome> {
    const id = resourceId.trim()
    if (!id) {
      return {
        ok: false,
        detail: 'Identifiant de ressource manquant — la correction est refusée, jamais transformée en création.',
        outcome: 'failed',
      }
    }
    return this.send('PATCH', `${path}/${encodeURIComponent(id)}`, body)
  }

  /**
   * L'appel réel, commun à {@link create} et {@link update}.
   *
   * Arbitrage Louis du 03/08 : l'écriture est autorisée, mais après
   * approbation explicite d'un responsable. Le garde-fou vit chez l'appelant
   * (`AtsWriteService`) ; ici, une seule chose compte : **contrairement aux
   * lectures, on ne masque RIEN**.
   *
   * Les lectures de la couche zéro rendent `null` sur anomalie, parce qu'un ERP
   * indisponible ne doit pas faire tomber une analyse. Pour une écriture, cette
   * indulgence serait un mensonge : « on a essayé et ça n'est pas passé » est une
   * information, « rien ne s'est passé » n'en est pas une. Le message de l'ERP
   * remonte donc tel quel, jusqu'à la trace de la demande.
   *
   * Et un timeout n'est pas un échec : la seule question est de savoir si la
   * requête a pu PARTIR. Une connexion jamais établie est `failed` (rejouable) ;
   * une requête partie sans réponse — abandon en vol, socket coupé — est
   * `unknown`, classé par le classificateur du dépôt (`dispatchFailureOutcome`)
   * plutôt que redeviné ici.
   *
   * ⚠️ Les chemins de ressources sont ceux VÉRIFIÉS en lecture. Le verbe et le
   * corps attendus par l'éditeur en écriture ne sont pas publics : à valider sur
   * une instance réelle avant d'ouvrir la fonctionnalité à un client.
   */
  private async send(
    method: 'POST' | 'PATCH',
    path: string,
    body: Record<string, unknown>,
  ): Promise<BoondManagerWriteOutcome> {
    let result: BoondCallResult
    try {
      result = await this.call(method, path, {}, body)
    } catch (error) {
      if (!(error instanceof UndeclaredBoondRouteError)) throw error
      return { ok: false, detail: error.message, outcome: 'failed' }
    }
    switch (result.kind) {
      case 'ok':
        return { ok: true, detail: result.text.slice(0, 500) || 'Écriture acceptée par l’ERP.' }
      case 'http':
        // Le distant a RÉPONDU, fût-ce pour refuser : `failed`, rejouable.
        return { ok: false, detail: result.text.slice(0, 500) || `HTTP ${result.status}`, outcome: 'failed' }
      case 'declaration_refused':
        return { ok: false, detail: DECLARATION_REFUSED, outcome: 'failed' }
      case 'refused':
        return { ok: false, detail: result.message, outcome: 'failed' }
      case 'circuit_open':
        return { ok: false, detail: CIRCUIT_OPEN, outcome: 'failed' }
      case 'unknown':
      case 'unreachable':
        return {
          ok: false,
          detail: result.error instanceof Error ? result.error.message : 'Appel impossible',
          outcome: dispatchFailureOutcome(result.error),
        }
    }
  }

  /**
   * Liste brute d'une ressource — la porte d'entrée du module ATS.
   *
   * `harvest` sait déjà retrouver des enregistrements dans les formes variées
   * que rend l'ERP (racine, `data`, `rows`, `items`, `results`). On le réutilise
   * plutôt que d'écrire un second parseur qui divergerait du premier.
   *
   * Rend `[]` (jamais `null`) sur anomalie : l'appelant distingue « pas
   * connecté » (il ne nous appelle pas) de « rien à dire » (liste vide).
   */
  async listRecords(path: string, maxResults: number = PAGE_SIZE): Promise<Record<string, unknown>[]> {
    const payload = await this.get(path, { maxResults: String(maxResults) })
    if (payload === null) return []
    return harvest(payload)
  }

  /**
   * Les sociétés de l'ATS dont le libellé correspond à `term`.
   *
   * Le refiltrage local est ce qui rend le connecteur sûr : même si le serveur
   * ignore le paramètre de recherche, seule une société dont le nom contient
   * réellement le terme (ou l'inverse) est retenue.
   */
  async findCompanies(term: string): Promise<{ id: string; name: string }[]> {
    const payload = await this.get('/companies', {
      [this.config.searchParam]: term,
      maxResults: String(PAGE_SIZE),
    })
    if (payload === null) return []

    const needle = term.toLowerCase()
    const out: { id: string; name: string }[] = []
    for (const node of harvest(payload)) {
      const id = typeof node['id'] === 'string' || typeof node['id'] === 'number' ? String(node['id']) : ''
      const name = pickString(node, ['name', 'companyName', 'corporateName', 'title'])
      if (!id || !name) continue
      const haystack = name.toLowerCase()
      if (!haystack.includes(needle) && !needle.includes(haystack)) continue
      out.push({ id, name })
    }
    return out
  }

  /**
   * Ce qui est rattaché à une société dans l'ATS : les affaires et les profils
   * déjà positionnés (« CV envoyés » de la p8 — la trace la plus parlante pour un
   * commercial, parce qu'elle dit qu'on a DÉJÀ proposé quelqu'un à ce client).
   */
  async describeCompany(companyId: string, companyName: string): Promise<ZeroLayerFinding[]> {
    const [opportunities, positionings] = await Promise.all([
      this.get('/opportunities', { company: companyId, maxResults: '10' }),
      this.get('/positionings', { company: companyId, maxResults: '10' }),
    ])

    const findings: ZeroLayerFinding[] = [{ title: `Société connue de l'ATS : ${companyName}` }]

    for (const node of harvest(opportunities)) {
      const label = pickString(node, ['title', 'name', 'reference'])
      if (!label) continue
      findings.push({
        title: `Affaire : ${label}`,
        date: pickString(node, ['creationDate', 'updateDate', 'startDate']) || null,
        detail: pickString(node, ['state', 'status']) || null,
      })
    }

    for (const node of harvest(positionings)) {
      const label = pickString(node, ['title', 'name', 'reference'])
      if (!label) continue
      findings.push({
        title: `Profil déjà positionné : ${label}`,
        date: pickString(node, ['creationDate', 'updateDate']) || null,
        detail: pickString(node, ['state', 'status']) || null,
      })
    }

    return findings
  }
}
