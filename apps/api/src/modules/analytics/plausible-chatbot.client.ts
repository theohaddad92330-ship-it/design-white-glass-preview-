import { Injectable, Logger } from '@nestjs/common'
import type { ChatbotExperimentId, ChatbotExperimentInput } from '@bellum/contracts'

/**
 * Lecture Plausible pour le tunnel et les deux A/B du chatbot public —
 * chantier n°1 du §11 (rapport « Laura, chatbot commercial du site »,
 * 17/08/2026) : « les 14 événements sont ÉMIS et personne ne les lit ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PLAUSIBLE, ET PAS UNE SECONDE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le navigateur envoie déjà chaque événement à Plausible (`lib/analytics.ts` du
 * site, `trackChat`). Bâtir une seconde table côté Bellum pour recevoir la même
 * information EN DOUBLE ajouterait sa propre obligation de rétention RGPD pour
 * une donnée qui existe déjà ailleurs, tenue par l'outil déjà choisi comme
 * « mesure d'audience » (`agent_docs/env-reference.md`). L'API lit donc la
 * Stats API v1 de Plausible — un contrat REST public, stable et documenté
 * depuis 2021 (https://plausible.io/docs/stats-api), pas une intégration
 * devinée : c'est le même statut qu'un fournisseur comme Brave ou Serper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS CLÉ = NO-OP STRICT
 * ─────────────────────────────────────────────────────────────────────────────
 * `PLAUSIBLE_API_KEY` et `PLAUSIBLE_SITE_ID` sont lues directement sur
 * `process.env` — précédent `github-issue.service.ts` — plutôt que via le
 * schéma d'environnement partagé, pour ne pas faire d'une intégration
 * optionnelle et scopée un changement d'un contrat lu par tous les services.
 * Sans les DEUX, `isEnabled()` est faux et aucune requête ne part — la
 * vérification contre un compte Plausible réel reste à faire par l'opérateur
 * qui fournira la clé, comme pour tout fournisseur de ce registre.
 *
 * `PLAUSIBLE_API_URL` (défaut `https://plausible.io`) suit le même repli que
 * `NEXT_PUBLIC_PLAUSIBLE_SRC` côté site, pour une instance auto-hébergée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL APPEL POUR LE TUNNEL, CINQ POUR LES DEUX A/B
 * ─────────────────────────────────────────────────────────────────────────────
 * `property=event:name` renvoie en UNE requête le compte de TOUS les
 * événements personnalisés du site — c'est le tunnel entier. Chaque variante
 * d'expérience, elle, exige un `breakdown` par PROPRIÉTÉ (`event:props:*`)
 * filtré par nom d'événement : cinq requêtes pour les deux A/B (§9, `d'où le
 * commentaire détaillé sur chaque, plus bas`).
 */

/** Une ligne de réponse `breakdown` — la forme documentée de la Stats API v1 :
 *  `{ <propriété demandée>: <valeur>, visitors: N, events: N }`. */
type PlausibleBreakdownRow = Record<string, string | number>

/** `events` = occurrences totales, jamais des visiteurs uniques : plusieurs
 *  `pricing_answered` dans une même conversation sont des faits distincts, pas
 *  un doublon à dédupliquer. */
export function toCounts(rows: readonly PlausibleBreakdownRow[] | null, key: string): Record<string, number> | null {
  return toMetric(rows, key, 'events')
}

/**
 * `visitors` = visiteurs DISTINCTS, et c'est une grandeur différente — pas une
 * variante de présentation.
 *
 * Le seuil d'agrégation minimale de la doctrine `c64_analytique_produit` porte
 * sur les SESSIONS DISTINCTES, jamais sur les occurrences : dix clics d'une même
 * session restent une seule session, et c'est précisément le cas où une moyenne
 * ne parle que d'elle. Publier un taux sur `events` reviendrait à croire trois
 * personnes là où il y en a une.
 */
export function toVisitors(rows: readonly PlausibleBreakdownRow[] | null, key: string): Record<string, number> | null {
  return toMetric(rows, key, 'visitors')
}

function toMetric(
  rows: readonly PlausibleBreakdownRow[] | null,
  key: string,
  metric: 'events' | 'visitors',
): Record<string, number> | null {
  if (!rows) return null
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const label = row[key]
    const value = row[metric]
    if (typeof label === 'string' && typeof value === 'number') counts[label] = value
  }
  return counts
}

/** Somme deux tables de comptage — utilisé pour l'exposition du premier
 *  message, qui additionne `chat_opened` ET `chat_auto_opened` (§11, comme le
 *  fait déjà `CHATBOT_FUNNEL_EVENTS.opened` côté contrat). `null` seulement si
 *  les DEUX sources ont échoué. */
export function mergeCounts(
  a: Record<string, number> | null,
  b: Record<string, number> | null,
): Record<string, number> | null {
  if (!a && !b) return null
  const merged: Record<string, number> = { ...(a ?? {}) }
  for (const [key, value] of Object.entries(b ?? {})) merged[key] = (merged[key] ?? 0) + value
  return merged
}

/**
 * Le délai d'attente d'un appel, en millisecondes.
 *
 * Huit secondes : la valeur qui vivait dans le constructeur. Une variable
 * illisible ou absurde retombe dessus plutôt que de faire échouer le démarrage
 * — un réglage d'observabilité ne prive jamais le produit de son API.
 */
function readTimeoutMs(): number {
  const raw = Number(process.env['PLAUSIBLE_TIMEOUT_MS'])
  return Number.isFinite(raw) && raw > 0 ? raw : 8_000
}

@Injectable()
export class PlausibleChatbotClient {
  private readonly logger = new Logger(PlausibleChatbotClient.name)
  private readonly apiKey: string
  private readonly siteId: string
  private readonly apiUrl: string
  private readonly requestTimeoutMs: number

  /**
   * ⚠️ AUCUN paramètre, et c'est une correction, pas un choix de style.
   *
   * Ce constructeur prenait `options: { requestTimeoutMs?: number } = {}`. Nest
   * voit un paramètre sur une classe `@Injectable()` et cherche à l'INJECTER :
   * un type objet anonyme ne porte aucun jeton, `dependencies[0]` vaut `null`,
   * et l'application refuse de démarrer —
   *
   *     Nest can't resolve dependencies of the PlausibleChatbotClient (?).
   *
   * Mesuré le 01/09/2026 sur le déploiement de prévisualisation de la PR #1292 :
   * « 6/6 replicas never became healthy ». La valeur par défaut `= {}` ne
   * change rien : TypeScript émet quand même `design:paramtypes = [Object]`.
   *
   * Le paramètre était par ailleurs MORT — cinq constructions dans les tests,
   * toutes sans argument. Un paramètre déclaré que personne ne passe, qui coûte
   * le démarrage de l'API : le réglage vit donc là où vivent déjà les trois
   * autres, dans l'environnement.
   */
  constructor() {
    this.apiKey = process.env.PLAUSIBLE_API_KEY?.trim() ?? ''
    this.siteId = process.env.PLAUSIBLE_SITE_ID?.trim() ?? ''
    this.apiUrl = process.env.PLAUSIBLE_API_URL?.trim() || 'https://plausible.io'
    this.requestTimeoutMs = readTimeoutMs()
  }

  /** Les DEUX doivent être présentes : une clé sans site (ou l'inverse) ne
   *  forme aucune requête valide. */
  isEnabled(): boolean {
    return this.apiKey.length > 0 && this.siteId.length > 0
  }

  /**
   * Le tunnel entier (§9) — UNE requête, tous les événements, et les DEUX
   * grandeurs : occurrences (`events`) et visiteurs distincts (`visitors`).
   *
   * `sourceAvailable` distingue « pas de clé » / « Plausible n'a pas répondu »
   * de « ça a marché, et effectivement personne n'a rien déclenché ».
   *
   * ⚠️ Une seule requête pour les deux grandeurs, et ce n'est pas qu'une
   * économie : deux appels séparés auraient porté sur deux instants différents,
   * et un taux calculé sur un dénominateur d'une seconde plus tard n'est pas le
   * même taux. Cette méthode s'appelait `eventCounts` et ne rendait que les
   * occurrences ; le seuil d'agrégation minimale de #1659 a besoin des sessions
   * DISTINCTES, qui sont l'autre colonne de la même réponse.
   */
  async eventMeasurement(
    period: string,
  ): Promise<{ sourceAvailable: boolean; events: Record<string, number>; visitors: Record<string, number> }> {
    if (!this.isEnabled()) return { sourceAvailable: false, events: {}, visitors: {} }
    const rows = await this.breakdown('event:name', { period })
    const events = toCounts(rows, 'name')
    const visitors = toVisitors(rows, 'name')
    if (!events || !visitors) return { sourceAvailable: false, events: {}, visitors: {} }
    return { sourceAvailable: true, events, visitors }
  }

  /**
   * Les visiteurs UNIQUES du site sur la période — l'entrée du tunnel de #1659.
   *
   * ⚠️ Ce n'est PAS `chat_widget_viewed`. Le widget n'est pas monté sur toutes
   * les pages ni pour tous les visiteurs ; le prendre pour « les visiteurs »
   * ferait démarrer le tunnel après la première déperdition, et un taux
   * d'ouverture de widget s'y lirait comme un taux de conversion du site.
   *
   * `aggregate` et non `breakdown` : la question n'a pas de dimension. `null`
   * quand la source n'a pas répondu — jamais zéro visiteur, ce qui serait la
   * seule lecture strictement impossible pour un site en ligne.
   */
  async siteVisitors(period: string): Promise<number | null> {
    if (!this.isEnabled()) return null
    const params = new URLSearchParams({ site_id: this.siteId, period, metrics: 'visitors' })
    const body = await this.getJson(`/api/v1/stats/aggregate?${params.toString()}`)
    const value = (body as { results?: { visitors?: { value?: unknown } } } | null)?.results?.visitors?.value
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  /**
   * Les comptages d'une expérience, par variante — chantier n°2 (§11, P1).
   *
   * `open_timing` : exposition = `chat_widget_viewed` (tout visiteur qui voit
   * le widget est affecté, qu'il finisse par voir une ouverture ou non — c'est
   * la même raison que documente `CHATBOT_EXPERIMENTS` côté contrat).
   * `first_message` : exposition = `chat_opened` + `chat_auto_opened`, les deux
   * façons d'ouvrir. Les deux expériences partagent le même succès :
   * `chat_first_reply`, la réponse du visiteur au premier message.
   */
  async experimentInput(id: ChatbotExperimentId, period: string): Promise<ChatbotExperimentInput> {
    if (!this.isEnabled()) return { sourceAvailable: false, exposures: {}, successes: {} }

    if (id === 'open_timing') {
      const [exposures, successes] = await Promise.all([
        this.variantCounts('chat_widget_viewed', 'openTimingVariant', period),
        this.variantCounts('chat_first_reply', 'openTimingVariant', period),
      ])
      if (!exposures || !successes) return { sourceAvailable: false, exposures: {}, successes: {} }
      return { sourceAvailable: true, exposures, successes }
    }

    const [opened, autoOpened, successes] = await Promise.all([
      this.variantCounts('chat_opened', 'firstMessageVariant', period),
      this.variantCounts('chat_auto_opened', 'firstMessageVariant', period),
      this.variantCounts('chat_first_reply', 'firstMessageVariant', period),
    ])
    // Les DEUX doivent avoir répondu : sommer un total connu avec un total
    // manquant-traité-comme-zéro sous-compterait l'exposition SANS le dire —
    // exactement le zéro silencieux que la doctrine du dépôt interdit.
    if (!opened || !autoOpened || !successes) return { sourceAvailable: false, exposures: {}, successes: {} }
    return { sourceAvailable: true, exposures: mergeCounts(opened, autoOpened) ?? {}, successes }
  }

  private async variantCounts(
    eventName: string,
    propKey: string,
    period: string,
  ): Promise<Record<string, number> | null> {
    const rows = await this.breakdown(`event:props:${propKey}`, { filters: `event:name==${eventName}`, period })
    return toCounts(rows, propKey)
  }

  /** Un seul `breakdown`, avec son timeout dur — un tableau de bord opérateur
   *  ne doit jamais geler parce que Plausible est lent. Ne lève jamais : une
   *  mesure ne casse jamais ce qu'elle observe. */
  private async breakdown(
    property: string,
    options: { filters?: string; period: string },
  ): Promise<PlausibleBreakdownRow[] | null> {
    const params = new URLSearchParams({
      site_id: this.siteId,
      period: options.period,
      property,
      metrics: 'events',
      limit: '100',
    })
    if (options.filters) params.set('filters', options.filters)

    const body = await this.getJson(`/api/v1/stats/breakdown?${params.toString()}`)
    const results = (body as { results?: PlausibleBreakdownRow[] } | null)?.results
    return Array.isArray(results) ? results : null
  }

  /**
   * Un appel Plausible, avec son timeout dur, ou `null`.
   *
   * Extrait de `breakdown` le 07/09/2026 pour que l'agrégat des visiteurs
   * (#1659) partage EXACTEMENT le même comportement d'échec : ne lève jamais,
   * journalise, et rend `null` plutôt qu'un objet vide qui se lirait comme une
   * mesure. Deux chemins d'appel qui divergeraient sur ce point feraient dire
   * « 0 visiteur » à l'un pendant que l'autre dirait « non mesuré ».
   */
  private async getJson(path: string): Promise<unknown> {
    let res: Response
    try {
      res = await fetch(`${this.apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
    } catch (error) {
      this.logger.warn('Plausible request error', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
    if (!res.ok) {
      this.logger.warn('Plausible non-ok response', { tags: { status: res.status, path } })
      return null
    }
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}
