import { Injectable, Logger } from '@nestjs/common'
import type { EnrichmentCoordinate, EnrichmentSourceAttempt, EnrichmentSourceOutcome } from '@bellum/contracts'
import { getPersonContactCache } from './person-contact-cache'
import { extractContact } from './tolerant-extract'
import type { CascadeField, CascadeLedger } from './enrichment-cascade'

/**
 * Les enrichisseurs de secours à API OFFICIELLE.
 *
 * Décision Louis du 03/08 : les 50 besoins « PRIO 2 » passent par des API
 * officielles et des imports de fichiers — **jamais par du scraping**. Ce
 * fichier est la moitié « API officielle » ; l'import de fichier vit dans
 * `csv-import.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Ce qui est livré, et ce qui ne l'est pas — délibérément
 * ─────────────────────────────────────────────────────────────────────────
 * Les méta-analyses citent quatre fournisseurs : Kaspr, Lusha, Hunter,
 * FullEnrich. Deux ont un contrat d'API **publiquement documenté et stable** —
 * Hunter et Lusha ; ils sont branchés sur leur contrat réel.
 *
 * Les deux autres publient leur documentation derrière un compte client. La
 * première version de ce fichier les refusait pour cette raison. **Arbitrage
 * Louis du 03/08 : les brancher quand même, en code DÉFENSIF.** Ce qui rend la
 * chose acceptable est que le risque bascule de côté : au lieu de deviner des
 * noms de champs — et de débiter un crédit pour une réponse mal lue — on ne
 * devine rien du tout. `tolerant-extract.ts` parcourt la réponse et ne retient
 * que ce qui EST une adresse ou un numéro, quelle que soit la clé qui le porte,
 * en écartant les valeurs marquées « devinées » et tout ce qu'on a envoyé
 * soi-même. Un contrat inconnu donne alors « ça ne trouve rien », jamais « ça
 * débite à tort ».
 *
 * L'URL et l'en-tête d'authentification restent surchargeables par variable
 * d'environnement, comme le paramètre de recherche de BoondManager : le jour où
 * l'opérateur a le contrat réel sous les yeux, il ajuste sans redéploiement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Discipline commune à tous les providers d'ici
 * ─────────────────────────────────────────────────────────────────────────
 * - **Sans clé, no-op STRICT** : aucun appel réseau, la cascade est inchangée.
 * - **Échec gracieux** : un timeout ou un 4xx rend `null`, le suivant tente.
 * - **Jamais de donnée inventée** : on ne rend que ce que le fournisseur a
 *   effectivement écrit. Pas d'email « probable », pas de format deviné.
 * - **Rien trouvé ⇒ rien débité.** Ces providers ne facturent pas eux-mêmes le
 *   crédit : c'est l'appelant qui ne débite que sur une information NOUVELLE.
 */

/** Ce qu'on sait donner à un enrichisseur pour qu'il cherche. */
type EnrichmentQuery = {
  firstName?: string
  lastName?: string
  /** Nom canonique de la société (pas le libellé d'entité brouillon). */
  organizationName?: string
  /** Domaine du compte — le signal le plus discriminant pour un email pro. */
  domain?: string
  linkedinUrl?: string
  /** CACHE-API (15/10) — l'espace qui demande : le cache d'une coordonnée achetée est PAR ESPACE.
   *  Absent = pas de cache (aucun appel ne le lit ni ne l'écrit). */
  workspaceId?: string
  /** #2988 — coordonnée demandée seule ; absent = comportement historique
   *  (email ET téléphone, premier fournisseur qui rend l'un des deux). */
  only?: EnrichmentCoordinate
  /** E1 (#3698) — ce que la fiche (ou un fournisseur précédent) a DÉJÀ : un
   *  fournisseur qui facture par coordonnée (FullEnrich) n'est interrogé que
   *  sur ce qui manque. Absent = rien n'est connu. */
  have?: { email?: boolean; phone?: boolean }
  /** E1 — une recherche asynchrone restée sans réponse au passage précédent :
   *  on la REPREND par son identifiant au lieu d'en payer une seconde. */
  asyncLookupId?: string
  /** #4106 — adresses plausibles du pattern (étape gratuite) : un e-mail rendu qui en fait
   *  partie est noté comme indice au journal interne. Jamais servi sans fournisseur. */
  emailCandidates?: readonly string[]
}

/** Ce qu'un enrichisseur peut rendre. Tout est optionnel : on prend ce qui vient. */
type EnrichmentHit = {
  provider: 'hunter' | 'lusha' | 'kaspr' | 'fullenrich'
  email?: string
  phone?: string
  /** E1 — l'URL du profil professionnel, quand la source la rend. */
  linkedinUrl?: string
  /** LOT (15/10) DATA-A point 8 — la vérification de l'e-mail LUE chez la source (Hunter) ; absente = non mesurée. */
  emailStatus?: 'verified' | 'unverified'
}

/**
 * E1 (#3698) — ce que chaque source a répondu, par coordonnée (mesure de
 * couverture, état « introuvable chez N sources »), et la recherche asynchrone
 * à reprendre. Rempli par `enrich` quand l'appelant le fournit.
 */
export type EnrichmentReport = {
  attempts: EnrichmentSourceAttempt[]
  asyncLookup?: { id: string }
  /** #4106 — plafond de coût + journal INTERNE des essais. Absent = cascade non bornée (historique). */
  ledger?: CascadeLedger
}

const TIMEOUT_MS = 8000

const COORDINATES = ['email', 'phone'] as const

const KASPR_DEFAULT_URL = 'https://api.developers.kaspr.io/profile/linkedin'

/** Le slug public d'un profil LinkedIn (`/in/<slug>`), décodé, sans slash final
 *  ni paramètres ; `null` si l'URL n'en donne pas. */
function linkedinSlug(url: string | undefined): string | null {
  const match = /\/in\/([^/?#]+)/i.exec(url ?? '')
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1]).trim() || null
  } catch {
    return null
  }
}

/** E1 — un appel est-il parti, et a-t-il échoué (réseau, 4xx/5xx) ? Une source
 *  qui n'a pas été appelée ne compte pas ; une source en panne n'a rien dit. */
type Probe = { called?: boolean; failed: boolean; status?: number }

/** Réponse HTTP lue, ou `null` quand le réseau n'a rien rendu. */
async function requestJson(
  url: string,
  init: { method?: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown },
): Promise<{ ok: boolean; status: number; body: unknown } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    })
    let body: unknown = null
    try {
      body = (await res.json()) as unknown
    } catch {
      body = null
    }
    return { ok: res.ok, status: res.status, body }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = Number((process.env[name] ?? '').trim())
  return Number.isFinite(raw) && raw >= 0 && (process.env[name] ?? '').trim() !== '' ? raw : fallback
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** E1 — statuts FullEnrich qui disent « fini sans résultat exploitable » côté
 *  fournisseur (jamais « la personne est introuvable »). */
const FULLENRICH_FAILED = new Set(['CANCELED', 'CREDITS_INSUFFICIENT', 'RATE_LIMIT', 'UNKNOWN'])
/** E1 — seules ces adresses sont prises : `CATCH_ALL` est une adresse devinée,
 *  `INVALID` une adresse fausse (verrou de `tolerant-extract.ts`). */
const FULLENRICH_EMAIL_OK = new Set(['DELIVERABLE', 'HIGH_PROBABILITY'])

function pick(node: unknown, path: string[]): unknown {
  let current: unknown = node
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** Un POST borné dans le temps, pour les fournisseurs dont on ne connaît pas le
 *  contrat. Toute anomalie rend `null` — jamais d'exception. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  probe?: Probe,
): Promise<unknown | null> {
  if (probe) probe.called = true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      if (probe) {
        probe.failed = true
        probe.status = res.status
      }
      return null
    }
    return (await res.json()) as unknown
  } catch {
    if (probe) probe.failed = true
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Un GET borné dans le temps. Toute anomalie rend `null` — jamais d'exception. */
async function getJson(url: string, headers: Record<string, string>, probe?: Probe): Promise<unknown | null> {
  if (probe) probe.called = true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) {
      if (probe) {
        probe.failed = true
        probe.status = res.status
      }
      return null
    }
    return (await res.json()) as unknown
  } catch {
    if (probe) probe.failed = true
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readString(node: unknown, path: string[]): string | null {
  let current: unknown = node
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

/**
 * Enrichisseurs de secours, essayés dans l'ordre après Apollo, SalesQL et
 * Dropcontact — donc uniquement quand personne n'a rien trouvé.
 */
@Injectable()
export class EnrichmentProviders {
  private readonly logger = new Logger(EnrichmentProviders.name)

  private hunterKey(): string {
    return (process.env['HUNTER_API_KEY'] ?? '').trim()
  }

  private lushaKey(): string {
    return (process.env['LUSHA_API_KEY'] ?? '').trim()
  }

  private kasprKey(): string {
    return (process.env['KASPR_API_KEY'] ?? '').trim()
  }

  private fullEnrichKey(): string {
    return (process.env['FULLENRICH_API_KEY'] ?? '').trim()
  }

  /** Au moins un fournisseur est-il configuré ? Sans ça, zéro appel réseau. */
  isEnabled(): boolean {
    return Boolean(this.hunterKey() || this.lushaKey() || this.kasprKey() || this.fullEnrichKey())
  }

  /**
   * Essaie les fournisseurs configurés, dans l'ordre, et fusionne au fil de
   * l'eau (présent-seulement) — la cascade CONTINUE tant que le téléphone
   * manque encore, elle ne s'arrête plus au premier qui rend un email.
   *
   * #3022 (retour bêta) : avant ce correctif, un `return hit` dès la première
   * réponse exploitable coupait court dès que Hunter rendait un email — hors
   * Hunter (Email Finder) ne rend JAMAIS de téléphone, si bien que Lusha
   * (« Lusha ensuite, parce qu'il rend aussi un téléphone quand il en a un »
   * — l'intention documentée juste en dessous) n'était en réalité jamais
   * atteint dès que Hunter matchait. Même bug de forme que la cascade
   * Apollo → SalesQL (`apollo.py`) et Dropcontact/`extraEnrichers`
   * (`contacts.service.ts`).
   *
   * Hunter d'abord : il ne facture que sur une recherche aboutie et son contrat
   * est le plus simple (un domaine + un nom). Lusha ensuite, parce qu'il rend
   * aussi un téléphone quand il en a un.
   *
   * #2988 — `only` restreint la question à une seule coordonnée, sur toute la
   * cascade : Hunter (Email Finder, jamais de téléphone) n'est même pas appelé
   * pour `only: 'phone'` — un vrai appel fournisseur évité, pas seulement une
   * facture non émise. Et un fournisseur qui ne rend QUE la coordonnée écartée
   * (Lusha ne trouve qu'un email alors qu'on demandait un téléphone, par
   * exemple) ne compte pas comme résolu (`answers`, réutilisé par `take`
   * ci-dessous) : ce n'est pas une réponse à la question posée, la cascade
   * continue vers le suivant plutôt que de le fusionner dans le résultat.
   */
  async enrich(query: EnrichmentQuery, report?: EnrichmentReport): Promise<EnrichmentHit | null> {
    if (!this.isEnabled()) return null
    // CACHE-API (Louis 15/10) — jamais deux fois le même appel payant en 30 jours : ce que la
    // cascade a déjà obtenu (ou n'a pas trouvé, 2 jours) pour CETTE personne (cache COMMUN à
    // tous les espaces, Louis 15/10) est rendu sans appel. `only` / `have` filtrent à la lecture, ils ne sont pas dans la clé.
    const wanted = COORDINATES.filter(c => (query.only ? query.only === c : true) && !query.have?.[c])
    const person = {
      firstName: query.firstName,
      lastName: query.lastName,
      organizationName: query.organizationName,
      domain: query.domain,
      linkedinUrl: query.linkedinUrl,
    }
    const cache = wanted.length > 0 ? getPersonContactCache() : null
    if (cache) {
      const cached = await cache.lookup(person, wanted)
      if (cached.settled) {
        this.logger.log('contact:enrich cache=hit payé=non')
        const { provider, email, phone, linkedinUrl } = cached
        return email || phone || linkedinUrl
          ? {
              provider: (provider ?? 'fullenrich') as EnrichmentHit['provider'],
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              ...(linkedinUrl ? { linkedinUrl } : {}),
            }
          : null
      }
      this.logger.log('contact:enrich cache=miss payé=oui')
    }
    const before = report?.attempts.length ?? 0
    const live = await this.enrichLive(query, report)
    if (cache) {
      // Une coordonnée « sans réponse » n'est écrite que si un fournisseur l'a VRAIMENT cherchée
      // sans erreur : une panne, un plafond atteint ou une sonde asynchrone restée ouverte ne
      // disent pas « rien trouvé ».
      const attempts = (report?.attempts ?? []).slice(before)
      const interrupted = Boolean(report?.asyncLookup) || Boolean(report?.ledger?.stopped)
      const answered = interrupted
        ? []
        : wanted.filter(
            c =>
              attempts.some(a => a.coordinate === c) &&
              !attempts.some(a => a.coordinate === c && a.outcome === 'error'),
          )
      await cache.remember(
        person,
        {
          ...(live?.provider ? { provider: live.provider } : {}),
          ...(live?.email ? { email: live.email } : {}),
          ...(live?.phone ? { phone: live.phone } : {}),
          ...(live?.linkedinUrl ? { linkedinUrl: live.linkedinUrl } : {}),
        },
        answered,
      )
    }
    return live
  }

  private async enrichLive(query: EnrichmentQuery, report?: EnrichmentReport): Promise<EnrichmentHit | null> {
    // LOT (15/10) DATA-A point 1 — une coordonnée DÉJÀ trouvée (`have`, ou rendue plus tôt par
    // Apollo) n'est jamais une réponse neuve : un fournisseur ne l'écrase pas et ne la fait pas
    // compter comme « résolue ».
    const answers = (hit: EnrichmentHit | null): hit is EnrichmentHit => {
      if (!hit) return false
      const email = Boolean(hit.email) && !query.have?.email
      const phone = Boolean(hit.phone) && !query.have?.phone
      if (query.only === 'email') return email
      if (query.only === 'phone') return phone
      return email || phone
    }
    // E1 — ce que chaque source a répondu, pour la mesure et l'état par
    // coordonnée. Une source qui n'a pas répondu (réseau, 4xx/5xx) est une
    // ERREUR, jamais un « introuvable ».
    const note = (
      provider: EnrichmentHit['provider'],
      coordinates: readonly ('email' | 'phone')[],
      hit: EnrichmentHit | null,
      failed: boolean,
    ): void => {
      for (const coordinate of coordinates) {
        const outcome: EnrichmentSourceOutcome = failed ? 'error' : hit?.[coordinate] ? 'found' : 'not_found'
        report?.attempts.push({ source: provider, coordinate, outcome })
      }
    }
    // LOT (15/10) DATA-A point 1 — le coût imputé (ledger) et les champs demandés excluent ce que
    // la fiche a déjà (`have`) : on ne facture pas, on ne redemande pas une coordonnée trouvée.
    const asked = (coordinates: readonly ('email' | 'phone')[]): ('email' | 'phone')[] =>
      coordinates.filter(coordinate => (query.only ? query.only === coordinate : true) && !query.have?.[coordinate])

    let merged: EnrichmentHit | null = null
    // Fusion présent-seulement : ne jamais écraser un champ déjà résolu par un
    // fournisseur précédent. Le label de provenance (`provider`) suit le
    // téléphone quand un second fournisseur vient de le trouver — c'est la
    // donnée que ce correctif fait remonter, et le seul champ qui manquait à
    // `merged` pour que la cascade s'arrête. `answers` (#2988) filtre D'ABORD :
    // un hit qui ne répond pas à LA QUESTION POSÉE (ex. Lusha ne rend qu'un
    // email alors qu'on demandait `only: 'phone'`) n'est jamais fusionné.
    // E1 — le profil professionnel voyage À CÔTÉ de la fusion : il n'est pas une
    // réponse à la question posée (e-mail / téléphone), mais il se garde dès
    // qu'une source le rend, même si elle n'a rien trouvé d'autre.
    let linkedin: { url: string; provider: EnrichmentHit['provider'] } | undefined
    const take = (hit: EnrichmentHit | null): void => {
      if (hit?.linkedinUrl && !linkedin) linkedin = { url: hit.linkedinUrl, provider: hit.provider }
      if (!answers(hit)) return
      const email = query.have?.email ? undefined : hit.email
      const phone = query.have?.phone ? undefined : hit.phone
      // Le statut suit l'adresse qu'il décrit : seulement quand CETTE source fournit l'e-mail retenu.
      const takesEmail = Boolean(email) && !merged?.email
      merged = merged
        ? {
            provider: phone ? hit.provider : merged.provider,
            email: merged.email ?? email,
            phone: merged.phone ?? phone,
            ...(merged.emailStatus ? { emailStatus: merged.emailStatus } : {}),
            ...(takesEmail && hit.emailStatus ? { emailStatus: hit.emailStatus } : {}),
          }
        : {
            provider: hit.provider,
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            ...(email && hit.emailStatus ? { emailStatus: hit.emailStatus } : {}),
          }
    }
    const withLinkedin = (result: EnrichmentHit | null): EnrichmentHit | null => {
      if (!linkedin) return result
      // Un profil seul (aucune coordonnée) se rend quand même : il se persiste
      // sans débit (champ gratuit), et c'est l'appelant qui en décide.
      return result
        ? { ...result, linkedinUrl: linkedin.url }
        : { provider: linkedin.provider, linkedinUrl: linkedin.url }
    }
    // Fonction plutôt qu'un `merged?.phone` en ligne : TypeScript rétrécit
    // `merged` (jamais réassigné dans LE FLOT direct de cette fonction, seulement
    // dans la fermeture `take`) jusqu'à `never` sur l'enchaînement optionnel
    // suivant un premier `if`, et refuse la lecture — un vrai repli, pas un bug
    // de logique ; passer par un appel de fonction régulière court-circuite le
    // rétrécissement.
    const hasPhone = (): boolean => Boolean(query.have?.phone || (merged && merged.phone))
    const hasEmail = (): boolean => Boolean(query.have?.email || (merged && merged.email))

    // #4106 — la coordonnée DEMANDÉE seule est-elle déjà trouvée ? Alors la cascade s'arrête
    // (champ trouvé → arrêt). Sans `only`, le comportement historique reste : on continue tant
    // que le téléphone manque.
    const satisfied = (): boolean => (query.only === 'email' ? hasEmail() : query.only === 'phone' ? hasPhone() : false)
    // #4106 — un fournisseur payant = une étape bornée : plafond vérifié AVANT l'appel, essai
    // journalisé APRÈS (hit / miss / erreur, coût). Une étape sans appel parti ne se journalise pas.
    const ledger = report?.ledger
    const leg = async (
      provider: 'hunter' | 'lusha' | 'kaspr',
      coordinates: readonly ('email' | 'phone')[],
      call: (probe: Probe) => Promise<EnrichmentHit | null>,
    ): Promise<void> => {
      // Le coût imputé est celui du/des champ(s) RÉELLEMENT demandé(s) (tarifs par champ, 13/10).
      const fields = asked(coordinates)
      if (ledger && !ledger.gate(provider, fields)) return
      const probe: Probe = { failed: false }
      const hit = await call(probe)
      if (probe.called) {
        note(provider, fields, hit, probe.failed)
        this.journal(
          ledger,
          provider,
          probe.failed ? 'error' : answers(hit) ? 'hit' : 'miss',
          hit,
          query,
          probe.status,
          fields,
        )
      }
      take(hit)
    }

    // LOT (15/10) DATA-A point 1 — Hunter ne rend QUE l'e-mail : inutile (et payant) s'il est déjà trouvé.
    if (this.hunterKey() && query.only !== 'phone' && !hasEmail() && !hasPhone() && !satisfied()) {
      await leg('hunter', ['email'], probe => this.hunter(query, probe))
    }
    if (this.lushaKey() && !hasPhone() && !satisfied()) {
      await leg('lusha', ['email', 'phone'], probe => this.lusha(query, probe))
    }
    // Kaspr passe après Hunter et Lusha, et seulement si le téléphone manque.
    // Contrat VÉRIFIÉ le 08/10/2026 (clé réelle) : exige le profil LinkedIn.
    if (this.kasprKey() && !hasPhone() && !satisfied()) {
      await leg('kaspr', ['email', 'phone'], probe => this.kaspr(query, probe))
    }
    // E1 (#3698, décision Louis 07/10) — FullEnrich sur son contrat PUBLIC,
    // interrogé si le téléphone OU l'e-mail manque encore, et seulement sur ce
    // qui manque (il facture par coordonnée trouvée).
    const missing = asked(['email', 'phone']).filter(coordinate => (coordinate === 'email' ? !hasEmail() : !hasPhone()))
    if (this.fullEnrichKey() && missing.length > 0 && !(ledger && !ledger.gate('fullenrich', missing))) {
      const before = report?.attempts.length ?? 0
      const hit = await this.fullEnrich(query, missing, report)
      const outcomes = (report?.attempts ?? []).slice(before).map(attempt => attempt.outcome)
      // Aucune tentative notée = aucun appel parti (entrées insuffisantes) : rien à journaliser.
      // `unknown` (sonde expirée) = on n'a pas fini de demander : ni hit ni échec facturé.
      if (outcomes.length > 0) {
        this.journal(
          ledger,
          'fullenrich',
          outcomes.includes('error') ? 'error' : answers(hit) ? 'hit' : 'miss',
          hit,
          query,
          undefined,
          missing,
        )
      }
      take(hit)
    }
    return withLinkedin(merged)
  }

  /** #4106 — une ligne du journal interne ; un 4xx de notre fait arrête la cascade ET se logue. */
  private journal(
    ledger: CascadeLedger | undefined,
    provider: EnrichmentHit['provider'],
    outcome: 'hit' | 'miss' | 'error',
    hit: EnrichmentHit | null,
    query: EnrichmentQuery,
    status?: number,
    fields?: readonly CascadeField[],
  ): void {
    if (!ledger) return
    const patternConfirmed =
      outcome === 'hit' &&
      Boolean(hit?.email) &&
      (query.emailCandidates ?? []).includes((hit?.email ?? '').trim().toLowerCase())
    ledger.record(provider, outcome, {
      ...(status !== undefined ? { status } : {}),
      patternConfirmed,
      ...(fields ? { fields } : {}),
    })
    if (ledger.stopped === 'client_error' && outcome === 'error') {
      this.logger.warn(`[#4106] cascade stopped: ${provider} refused the request (HTTP ${status ?? '?'})`)
    }
  }

  /**
   * E1 (07/10/2026, #3698) — FullEnrich, contrat PUBLIC vérifié sur
   * docs.fullenrich.com le 07/10 : ASYNCHRONE.
   *   POST {base}/contact/enrich/bulk  `{ name, data: [{ first_name, last_name,
   *        domain, company_name, linkedin_url, enrich_fields }] }` → `{ enrichment_id }`
   *   GET  {base}/contact/enrich/bulk/{id} → `{ status, data: [{ contact_info:
   *        { most_probable_work_email: { email, status }, most_probable_phone:
   *        { number } }, profile: { social_profiles: { professional_network: { url } } } }] }`
   * Auth `Authorization: Bearer <clé>` (mesuré en prod le 07/10 sur
   * `/api/v1/account/credits` → 200).
   *
   * SONDE BORNÉE plutôt que webhook : le job d'enrichissement tourne déjà en
   * file (BullMQ), il peut attendre `FULLENRICH_POLL_TIMEOUT_MS` (45 s par
   * défaut) sans tenir de requête HTTP. Au-delà, ce n'est PAS un échec
   * (doctrine : un timeout est `unknown`) : l'identifiant est rendu dans
   * `report.asyncLookup` et le passage suivant le REPREND (GET seul, aucun
   * nouveau POST — FullEnrich facturerait une seconde fois).
   *
   * Verrous de `tolerant-extract.ts` gardés : une adresse `CATCH_ALL`/`INVALID`
   * (devinée ou fausse) est refusée, et rien de ce qu'on a ENVOYÉ ne revient
   * comme résultat (écho).
   */
  private async fullEnrich(
    query: EnrichmentQuery,
    coordinates: ('email' | 'phone')[],
    report?: EnrichmentReport,
  ): Promise<EnrichmentHit | null> {
    const noteAll = (outcome: EnrichmentSourceOutcome): void => {
      for (const coordinate of coordinates) report?.attempts.push({ source: 'fullenrich', coordinate, outcome })
    }
    const base = ((process.env['FULLENRICH_API_URL'] ?? '').trim() || 'https://app.fullenrich.com/api/v2').replace(
      /\/+$/,
      '',
    )
    const headers = {
      [(process.env['FULLENRICH_AUTH_HEADER'] ?? '').trim() || 'Authorization']: `Bearer ${this.fullEnrichKey()}`,
    }
    const company = query.domain?.trim() || query.organizationName?.trim()
    const sent = [query.firstName, query.lastName, query.organizationName, query.domain, query.linkedinUrl]
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map(value => value.trim().toLowerCase())

    let id = query.asyncLookupId?.trim() || ''
    if (!id) {
      if (!query.firstName || !query.lastName || (!company && !query.linkedinUrl)) return null
      const started = await requestJson(`${base}/contact/enrich/bulk`, {
        method: 'POST',
        headers,
        body: {
          name: 'bellum-contact-enrichment',
          data: [
            {
              first_name: query.firstName,
              last_name: query.lastName,
              ...(query.domain ? { domain: query.domain } : {}),
              ...(query.organizationName ? { company_name: query.organizationName } : {}),
              ...(query.linkedinUrl ? { linkedin_url: query.linkedinUrl } : {}),
              enrich_fields: coordinates.map(coordinate =>
                coordinate === 'email' ? 'contact.work_emails' : 'contact.phones',
              ),
            },
          ],
        },
      })
      const startedId = started?.ok ? pick(started.body, ['enrichment_id']) : undefined
      if (typeof startedId !== 'string' || !startedId.trim()) {
        this.logger.warn(`[E1-couverture] fullenrich start failed (status ${started?.status ?? 'network'})`)
        noteAll('error')
        report?.ledger?.noteStatus(started?.status)
        return null
      }
      id = startedId.trim()
    }

    const interval = numberFromEnv('FULLENRICH_POLL_INTERVAL_MS', 3000)
    const deadline = Date.now() + numberFromEnv('FULLENRICH_POLL_TIMEOUT_MS', 45_000)
    let result: unknown = null
    for (;;) {
      const polled = await requestJson(`${base}/contact/enrich/bulk/${encodeURIComponent(id)}`, { headers })
      const status = polled?.ok ? pick(polled.body, ['status']) : undefined
      if (status === 'FINISHED') {
        result = polled?.body
        break
      }
      // 400 « not ready » / CREATED / IN_PROGRESS / réseau : on réessaie. Une
      // clé refusée ou un statut terminal d'échec, non.
      if (polled && (polled.status === 401 || polled.status === 403 || polled.status === 404)) {
        noteAll('error')
        report?.ledger?.noteStatus(polled.status)
        return null
      }
      if (typeof status === 'string' && FULLENRICH_FAILED.has(status)) {
        this.logger.warn(`[E1-couverture] fullenrich ended with ${status}`)
        noteAll('error')
        return null
      }
      if (Date.now() + interval > deadline) {
        if (report) report.asyncLookup = { id }
        noteAll('unknown')
        return null
      }
      await sleep(interval)
    }

    const rows = pick(result, ['data']) ?? pick(result, ['datas'])
    const row = Array.isArray(rows) ? (rows[0] as unknown) : undefined
    const info = pick(row, ['contact_info']) ?? pick(row, ['contact'])
    const emailNode = pick(info, ['most_probable_work_email']) ?? pick(info, ['most_probable_email'])
    const emailStatus = pick(emailNode, ['status'])
    const rawEmail = pick(emailNode, ['email'])
    const phoneNode = pick(info, ['most_probable_phone'])
    const firstPhone = Array.isArray(pick(info, ['phones'])) ? (pick(info, ['phones']) as unknown[])[0] : undefined
    const rawPhone = pick(phoneNode, ['number']) ?? (typeof phoneNode === 'string' ? phoneNode : undefined)
    const fallbackPhone = pick(firstPhone, ['number'])
    const rawLinkedin =
      pick(row, ['profile', 'social_profiles', 'professional_network', 'url']) ?? pick(row, ['profile', 'linkedin_url'])

    // Les verrous de la lecture tolérante, sur des valeurs DÉJÀ lues par leur
    // chemin documenté : la forme fait foi, l'écho est écarté.
    const emailCandidate =
      coordinates.includes('email') &&
      typeof rawEmail === 'string' &&
      (typeof emailStatus !== 'string' || FULLENRICH_EMAIL_OK.has(emailStatus))
        ? rawEmail
        : undefined
    const phoneCandidate = coordinates.includes('phone')
      ? typeof rawPhone === 'string'
        ? rawPhone
        : typeof fallbackPhone === 'string'
          ? fallbackPhone
          : undefined
      : undefined
    const found = extractContact(
      { ...(emailCandidate ? { email: emailCandidate } : {}), ...(phoneCandidate ? { phone: phoneCandidate } : {}) },
      { sent },
    )
    const linkedinUrl =
      typeof rawLinkedin === 'string' && rawLinkedin.trim() && !sent.includes(rawLinkedin.trim().toLowerCase())
        ? rawLinkedin.trim()
        : undefined

    for (const coordinate of coordinates) {
      report?.attempts.push({ source: 'fullenrich', coordinate, outcome: found[coordinate] ? 'found' : 'not_found' })
    }
    if (!found.email && !found.phone && !linkedinUrl) return null
    this.logger.log('Enrichment fallback resolved by fullenrich')
    return {
      provider: 'fullenrich',
      ...(found.email ? { email: found.email } : {}),
      ...(found.phone ? { phone: found.phone } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
    }
  }

  /**
   * Kaspr — contrat VÉRIFIÉ le 08/10/2026 avec la clé de production (l'ancienne
   * route `api.kaspr.io/api/v1/profile/search` répondait 404 « Route not found »).
   *   POST https://api.developers.kaspr.io/profile/linkedin
   *   Authorization: Bearer <clé> · accept-version: v2.0
   *   `{ id: <slug public LinkedIn>, name: "Prénom Nom" }`
   *   → `{ profile: { id, phones: [...], starryPhone, emails: [...] } }`
   *
   * Sans slug LinkedIn (`/in/<slug>`), on n'appelle pas. La réponse est lue par
   * la FORME (`extractContact`) sur `profile` seulement : un élément peut être
   * une chaîne ou un objet, et ce qu'on a envoyé en écho n'est jamais pris.
   */
  private async kaspr(query: EnrichmentQuery, probe?: Probe): Promise<EnrichmentHit | null> {
    if (!query.firstName || !query.lastName) return null
    const slug = linkedinSlug(query.linkedinUrl)
    if (!slug) return null

    const body = { id: slug, name: `${query.firstName} ${query.lastName}`.trim() }
    const scheme = (process.env['KASPR_AUTH_SCHEME'] ?? 'Bearer').trim()
    const payload = await postJson(
      (process.env['KASPR_API_URL'] ?? '').trim() || KASPR_DEFAULT_URL,
      {
        [(process.env['KASPR_AUTH_HEADER'] ?? '').trim() || 'Authorization']: scheme
          ? `${scheme} ${this.kasprKey()}`
          : this.kasprKey(),
        'accept-version': 'v2.0',
      },
      body,
      probe,
    )
    if (!payload) return null

    const found = extractContact(pick(payload, ['profile']), {
      expectedDomain: query.domain,
      sent: [body.id, body.name],
    })
    if (!found.email && !found.phone) return null

    this.logger.log('Enrichment fallback resolved by kaspr')
    return { provider: 'kaspr', ...found }
  }

  /**
   * Hunter — Email Finder.
   *
   * `GET https://api.hunter.io/v2/email-finder` avec `domain`, `first_name`,
   * `last_name`, `api_key` (documenté sur hunter.io/api-documentation).
   *
   * Sans DOMAINE, on n'appelle pas : Hunter cherche une adresse DANS un domaine,
   * et lui donner un nom de société à la place produit surtout des faux
   * positifs sur les homonymes.
   */
  private async hunter(query: EnrichmentQuery, probe?: Probe): Promise<EnrichmentHit | null> {
    const domain = query.domain?.trim()
    if (!domain || !query.firstName || !query.lastName) return null

    const url = new URL('https://api.hunter.io/v2/email-finder')
    url.searchParams.set('domain', domain)
    url.searchParams.set('first_name', query.firstName)
    url.searchParams.set('last_name', query.lastName)

    // LOT (15/10) DATA-A point 8 — la clé en EN-TÊTE (`X-API-KEY`), plus dans l'URL (qui finit dans les journaux).
    const payload = await getJson(url.toString(), { Accept: 'application/json', 'X-API-KEY': this.hunterKey() }, probe)
    if (!payload) return null

    const email = readString(payload, ['data', 'email'])
    if (!email) return null
    // LOT (15/10) DATA-A point 8 — la vérification que Hunter calcule est LUE : une adresse qu'il dit
    // invalide n'est jamais rendue ; « valid » = vérifiée ; tout le reste (accept_all, unknown…) = non
    // vérifiée. Absente de la réponse = pas de statut (confiance non mesurée), jamais deviné.
    const verification = readString(payload, ['data', 'verification', 'status'])?.toLowerCase()
    if (verification === 'invalid') return null
    this.logger.log('Enrichment fallback resolved by Hunter')
    return {
      provider: 'hunter',
      email,
      ...(verification
        ? { emailStatus: verification === 'valid' ? ('verified' as const) : ('unverified' as const) }
        : {}),
    }
  }

  /**
   * Lusha — Person API v2.
   *
   * `GET https://api.lusha.com/v2/person` avec `firstName`, `lastName` et
   * `companyDomain` (ou `companyName`), en-tête `api_key` (documenté sur
   * docs.lusha.com).
   *
   * On prend la PREMIÈRE adresse et le PREMIER téléphone rendus, sans les
   * classer : Lusha les ordonne déjà par confiance, et réordonner nous-mêmes
   * reviendrait à inventer un jugement qu'on n'a pas les moyens de porter.
   */
  private async lusha(query: EnrichmentQuery, probe?: Probe): Promise<EnrichmentHit | null> {
    if (!query.firstName || !query.lastName) return null
    const company = query.domain?.trim() || query.organizationName?.trim()
    if (!company) return null

    const url = new URL('https://api.lusha.com/v2/person')
    url.searchParams.set('firstName', query.firstName)
    url.searchParams.set('lastName', query.lastName)
    if (query.domain?.trim()) url.searchParams.set('companyDomain', query.domain.trim())
    else url.searchParams.set('companyName', company)

    const payload = await getJson(
      url.toString(),
      {
        Accept: 'application/json',
        api_key: this.lushaKey(),
      },
      probe,
    )
    if (!payload || typeof payload !== 'object') return null

    const data = (payload as Record<string, unknown>)['data'] ?? payload
    const emails = Array.isArray((data as Record<string, unknown>)?.['emailAddresses'])
      ? ((data as Record<string, unknown>)['emailAddresses'] as unknown[])
      : []
    const phones = Array.isArray((data as Record<string, unknown>)?.['phoneNumbers'])
      ? ((data as Record<string, unknown>)['phoneNumbers'] as unknown[])
      : []

    const email = emails.map(entry => readString(entry, ['email'])).find(Boolean) ?? undefined
    const phone = phones.map(entry => readString(entry, ['number'])).find(Boolean) ?? undefined
    if (!email && !phone) return null

    this.logger.log('Enrichment fallback resolved by Lusha')
    return { provider: 'lusha', ...(email ? { email } : {}), ...(phone ? { phone } : {}) }
  }
}
