import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { hashBehavioralSession } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ProductEventEntity } from '../../database/entities/product-event.entity'

/**
 * The product events we emit. A closed union (not a bare string) so a typo at an
 * emit site is a compile error and the overview aggregations stay in sync with
 * what's actually recorded. Not exported: call sites pass string literals, which
 * TS checks against this union via the `track` signature (knip flags a type
 * exported but only referenced in its own file).
 */
type ProductEventName =
  | 'onboarding_started'
  | 'onboarding_completed'
  // Temps 2 — le complément de profil, proposé après la première analyse.
  | 'onboarding_complement_completed'
  | 'analysis_started'
  | 'analysis_completed'
  | 'account_viewed'
  | 'contact_enriched'
  | 'export_performed'
  | 'message_sent'
  | 'credits_topup'
  | 'plan_changed'
  // Workspace audit events (journal d'activité — Théo p.21 P2). Same append-only
  // stream, read back workspace-scoped by WorkspaceActivityService behind the
  // `team:manage` RBAC gate. Properties carry type/target/date/actor only.
  | 'member_invited'
  | 'invitation_revoked'
  | 'member_removed'
  | 'member_role_changed'
  | 'integration_connected'
  | 'integration_disconnected'
  // La reprise d'un portefeuille par un autre membre (tome 8 §33, angle mort
  // n°2) — le geste le plus lourd de l'écran Équipe, et le seul dont on ait
  // besoin de retrouver l'auteur six mois plus tard.
  | 'portfolio_handed_over'
  // Des permissions accordées EN PROPRE à un membre, en plus de son rôle. La
  // seule modification de privilège que `member_role_changed` ne raconte pas :
  // elle déplace ce que quelqu'un peut faire sans que son rôle affiché ne
  // change, et ses effets ne se défont pas — ce qui a été lu l'a été.
  | 'member_permissions_changed'
  // #1639 — LA DÉMONSTRATION ÉCONOMIQUE DE LA MÉMOIRE MARCHÉ.
  //
  // `market_prefilter_used` porte les DEUX nombres du préfiltre en propriétés
  // (`market_candidates_before` / `_after`) plutôt que deux événements de plus :
  // ce sont les deux mesures d'un même geste, et deux lignes séparées dans un
  // journal append-only ne se rejoignent que par une jointure qu'on aurait dû
  // inventer. `paid_verification_triggered` est sa contrepartie — ce que
  // l'utilisateur a choisi de PAYER après avoir lu gratuitement.
  //
  // ⚠️ Ces deux-là comptent des candidats et des gestes, JAMAIS des euros, et
  // ils restent lus par espace : agréger un coût d'accès entre espaces serait
  // un échange d'informations tarifaires entre ESN concurrentes (GA-43).
  // Le cinquième compteur du retour, `paid_calls_avoided`, n'existe pas — la
  // raison est écrite dans `PAID_CALLS_AVOIDED_REFUSAL` (`@bellum/contracts`).
  | 'market_prefilter_used'
  | 'paid_verification_triggered'
  // #1682 — le traceur produit du front, apps/web/src/lib/product-tracker.ts.
  // Neuf événements à l'origine, DIX-NEUF depuis #1946, VINGT ET UN depuis
  // #2085, écrits exclusivement par `trackBehavioral()` ci-dessous — jamais
  // par `track()` : ce flux ne porte AUCUN identifiant de personne (voir
  // `BehavioralEventName` un peu plus bas).
  | 'screen_viewed'
  | 'screen_left'
  | 'tab_opened'
  | 'action_started'
  | 'action_completed'
  | 'action_abandoned'
  | 'filter_applied'
  | 'search_performed'
  | 'error_shown'
  // #1946 — « mesurer la VALEUR, pas le volume de messages » (décision Louis du
  // 14/09/2026, prise contre la recommandation, relecture juridique RGPD de
  // `c64_analytique_produit` toujours due). DIX formes de plus, AJOUTÉES À LA
  // FIN : `event_name` est une colonne `text` sans contrainte SQL, mais la
  // liste est recopiée par trois gardes et un ordre qui bouge se lit comme une
  // valeur perdue (GA-08).
  //
  // ⚠️ L'élargissement ne lève AUCUNE des cinq règles, et ce n'est PAS une
  // troisième exception nommée : il n'y en a que deux (#1946.22, #1949.23).
  | 'assistant_first_question_sent'
  | 'suggestion_clicked'
  | 'assistant_first_useful_result'
  | 'assistant_answer_judged'
  | 'assistant_redirect_followed'
  | 'prepared_action_stage'
  | 'draft_reused'
  | 'intervention_outcome'
  | 'memory_added'
  // #2085 (15/09/2026) — les frictions du parcours d'onboarding, à la fin
  // comme le reste (GA-08). Deux formes de plus, aucune des cinq règles
  // levée.
  | 'onboarding_prefill_reviewed'
  | 'onboarding_step_back'
  // #2775 — LA GÉNÉRATION DU PROFIL COMMERCIAL (l'écran `/onboarding/$id/generating`,
  // #2089.28-.36), à la fin comme le reste (GA-08). Avant ce lot, les deux
  // seuls signaux RÉELS du backend pour cet écran (`ProfileContextService.
  // triggerGeneration` / `persistSuccess`) n'étaient observables QUE par une
  // requête HTTP qui répond dès que le statut passe à `generating` — jamais
  // par un événement produit dédié. Trois formes, chacune posée au point où
  // le travail RÉEL commence/finit (jamais une phase synthétique) :
  //  · `onboarding_generation_started` — la génération part VRAIMENT (après
  //    les sauts d'idempotence/D9/doublon, jamais sur un déclenchement sauté).
  //  · `onboarding_generation_completed` — `persistSuccess` a RÉELLEMENT
  //    persisté la nouvelle révision (pas seulement reçu une réponse IA).
  //  · `onboarding_generation_failed` — l'échec RÉEL, avec l'étape en
  //    propriété (`stage: 'llm' | 'persist'`) : le modèle n'a jamais répondu,
  //    ou il a répondu mais la persistance a échoué — deux pannes distinctes.
  | 'onboarding_generation_started'
  | 'onboarding_generation_completed'
  | 'onboarding_generation_failed'
  // #2985 (26/09/2026) — le Meeting OS (#2319) : neuf formes de plus, à la fin
  // comme les précédentes (GA-08). Le front (`product-tracker.ts`) les émet
  // depuis le 26/09 ; la liste blanche d'ingestion (BEHAVIORAL_EVENT_NAMES
  // ci-dessous) s'arrêtait à `onboarding_step_back` jusqu'à ce lot — ces neuf
  // événements étaient donc écrits par le navigateur puis jetés en silence à
  // la réception (#2767, trouvé en passant le 28/09).
  | 'brief_generated'
  | 'brief_opened'
  | 'question_used'
  | 'notes_added'
  | 'summary_generated'
  | 'summary_approved'
  | 'actions_created'
  | 'followup_created'
  | 'false_association_corrected'
  // #2319.123 (29/09/2026) — `meeting_completed` : ajouté côté front
  // (`product-tracker.ts`) le même jour, jamais ajouté ICI — même trou que
  // les neuf du Meeting OS corrigé ce matin (#2767, lot R01), trouvé en
  // câblant #2108.49-.53 juste en dessous.
  | 'meeting_completed'
  // #2108.49-.53 (épopée #2767, 29/09/2026) — les cinq mesures du geste
  // accepter/reporter/rejeter/corriger sur une carte de priorité
  // (`product-tracker.ts`), câblées ce lot côté front. À la fin comme les
  // précédentes (GA-08).
  | 'priority_viewed'
  | 'priority_accepted'
  | 'priority_snoozed'
  | 'priority_rejected'
  | 'priority_corrected'
  // #2108.54 (épopée #2767, 30/09/2026) — une tâche cochée (`TaskList`,
  // `product-tracker.ts`). À la fin comme les précédentes (GA-08).
  | 'task_completed'
  // #2319.129/.130 (épopée #2985, 30/09/2026) — une écriture CRM composée par un
  // compte rendu, CONFIRMÉE par la personne (`ActionCenter`). À la fin (GA-08).
  | 'crm_writeback_confirmed'

type TrackOptions = {
  /** The acting user — the minimum needed to identify who. Required. */
  userId: string
  /** Team scope when known; null/omitted for user-level events (billing, onboarding). */
  workspaceId?: string | null
  /** Non-sensitive dimensions. Scrubbed of obviously-sensitive keys before insert. */
  properties?: Record<string, unknown>
  /** Optional client/session correlation id. */
  sessionId?: string | null
}

/** Property keys we never persist (defence-in-depth — emit sites shouldn't pass
 *  them, but a stray field must not leak PII/secrets into the analytics log). A
 *  key is dropped if its lowercased name CONTAINS any of these. */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'cookie',
  'email',
  'phone',
  'credential',
]

/** Bounds so a runaway property blob can't bloat a row. */
const MAX_PROPERTY_KEYS = 40
const MAX_STRING_LEN = 500

/**
 * Drop sensitive keys, cap string length, and bound the key count. Returns a
 * plain object safe to store. Non-object input collapses to `{}`.
 */
export function sanitizeProperties(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, unknown> = {}
  let kept = 0
  for (const [key, value] of Object.entries(input)) {
    if (kept >= MAX_PROPERTY_KEYS) break
    const lower = key.toLowerCase()
    if (SENSITIVE_KEY_FRAGMENTS.some(fragment => lower.includes(fragment))) continue
    out[key] = typeof value === 'string' && value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) : value
    kept += 1
  }
  return out
}

/**
 * #1682/#1681.4/#1946/#2085 — le sous-ensemble FERMÉ des 21 événements comportementaux du
 * traceur front. Exportée (contrairement à `ProductEventName` ci-dessus) parce
 * que `product-analytics.service.spec.ts` la vérifie directement, et que
 * `ingestBehavioralBatch()` s'en sert pour valider une charge qui vient du
 * NAVIGATEUR — une forme non fiable, contrairement aux appels de `track()` qui
 * viennent tous du code serveur.
 *
 * `satisfies readonly ProductEventName[]` : chaque valeur DOIT déjà exister
 * dans l'union ci-dessus — cette liste ne peut pas dériver silencieusement de
 * ce qu'elle est censée sous-ensembler.
 */
export const BEHAVIORAL_EVENT_NAMES = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
  // #1946 — à la FIN, dans l'ordre de l'union ci-dessus.
  'assistant_first_question_sent',
  'suggestion_clicked',
  'assistant_first_useful_result',
  'assistant_answer_judged',
  'assistant_redirect_followed',
  'prepared_action_stage',
  'draft_reused',
  'intervention_outcome',
  'memory_added',
  // #2085 — à la FIN, dans l'ordre de l'union ci-dessus (GA-08).
  'onboarding_prefill_reviewed',
  'onboarding_step_back',
  // #2985 — à la FIN, dans l'ordre de l'union ci-dessus (GA-08) : le Meeting
  // OS, jusqu'ici écrit par le navigateur et jeté en silence à la réception.
  'brief_generated',
  'brief_opened',
  'question_used',
  'notes_added',
  'summary_generated',
  'summary_approved',
  'actions_created',
  'followup_created',
  'false_association_corrected',
  // #2319.123 — trou du même jour que les neuf ci-dessus, voir l'union.
  'meeting_completed',
  // #2108.49-.53 — à la FIN, dans l'ordre de l'union ci-dessus (GA-08).
  'priority_viewed',
  'priority_accepted',
  'priority_snoozed',
  'priority_rejected',
  'priority_corrected',
  // #2108.54 — à la FIN, dans l'ordre de l'union ci-dessus (GA-08) : une
  // tâche cochée dans une liste de tâches.
  'task_completed',
  // #2319.129/.130 — à la FIN, dans l'ordre de l'union ci-dessus (GA-08).
  'crm_writeback_confirmed',
] as const satisfies readonly ProductEventName[]

// Non exportée (contrairement à la constante ci-dessus) : seul CE fichier en a
// besoin comme type. `sanitizeBehavioralProperties` et `trackBehavioral` sont
// exportées et la portent en paramètre, mais un appelant externe la passe par
// un littéral de chaîne — il n'a jamais besoin d'IMPORTER le nom du type pour
// que TypeScript le vérifie. L'exporter quand même ferait échouer `pnpm
// lint:exports:types` (knip) : un type exporté et consommé dans son seul
// fichier n'a pas de raison de l'être.
type BehavioralEventName = (typeof BEHAVIORAL_EVENT_NAMES)[number]

/**
 * #1682 — le cœur du lot : la forme AUTORISÉE des propriétés de chaque
 * événement comportemental, telle que l'issue #1681 l'a posée. Ce n'est PAS
 * une liste de clés interdites (comme {@link SENSITIVE_KEY_FRAGMENTS}
 * ci-dessus) : c'est une liste BLANCHE. Une clé absente d'ici est perdue quel
 * que soit son nom — `filterValue`, `value`, `q`, `search`… n'ont donc jamais
 * besoin d'être devinées et interdites une par une.
 *
 * Le principe qui a produit cette table, tel que #1681 l'écrit : jamais le
 * CONTENU d'un champ, jamais la VALEUR d'un filtre ou d'une recherche, jamais
 * les coordonnées d'un clic. `filter_applied` porte le NOM du filtre, jamais
 * ce qu'il vaut ; `search_performed` porte le NOMBRE de résultats, jamais la
 * requête.
 */
const BEHAVIORAL_EVENT_PROPERTY_KEYS: Readonly<Record<BehavioralEventName, readonly string[]>> = {
  screen_viewed: ['route', 'previousViewDurationMs', 'provenance'],
  screen_left: ['route', 'durationMs', 'leaveMode'],
  tab_opened: ['screen', 'tab'],
  action_started: ['action', 'screen'],
  action_completed: ['action', 'durationMs'],
  action_abandoned: ['action', 'atStep'],
  filter_applied: ['screen', 'filterName'],
  search_performed: ['screen', 'resultCount'],
  error_shown: ['screen', 'errorCode'],
  // #1946 — le même principe, tenu là où la tentation est la plus forte : le
  // libellé d'une suggestion de Laura, le texte d'un brouillon commercial et
  // le destinataire d'une intervention sont exactement ce qu'on voudrait lire
  // pour « comprendre », et exactement le pipe commercial d'un client. Aucune
  // de ces clés n'existe ici, donc aucune ne peut être devinée puis interdite.
  assistant_first_question_sent: ['screen'],
  suggestion_clicked: ['screen', 'rank'],
  assistant_first_useful_result: ['screen', 'durationMs'],
  assistant_answer_judged: ['screen', 'verdict'],
  assistant_redirect_followed: ['fromScreen', 'toScreen'],
  prepared_action_stage: ['action', 'stage'],
  draft_reused: ['screen', 'extent'],
  intervention_outcome: ['intervention', 'outcome'],
  memory_added: ['screen'],
  // #2085 — même principe : le VERDICT sur une suggestion préremplie, jamais
  // la valeur devinée ni la valeur saisie ensuite.
  onboarding_prefill_reviewed: ['screen', 'outcome'],
  onboarding_step_back: ['screen'],
  // #2985 — même principe : le RANG rendu pour `question_used` (jamais le
  // texte de la question), un écran seul pour les huit autres.
  brief_generated: ['screen'],
  brief_opened: ['screen'],
  question_used: ['screen', 'rank'],
  notes_added: ['screen'],
  summary_generated: ['screen'],
  summary_approved: ['screen'],
  actions_created: ['screen'],
  followup_created: ['screen'],
  false_association_corrected: ['screen'],
  meeting_completed: ['screen'],
  // #2108.49-.53 — le GENRE de la carte (`kind`, un enum fermé déjà porté par
  // le contrat), jamais son contenu (le libellé, le compte visé…).
  priority_viewed: ['screen', 'kind'],
  priority_accepted: ['screen', 'kind'],
  priority_snoozed: ['screen', 'kind'],
  priority_rejected: ['screen', 'kind'],
  priority_corrected: ['screen', 'kind'],
  // #2108.54 — un écran seul, jamais le titre de la tâche cochée.
  task_completed: ['screen'],
  // #2319.129/.130 — un écran seul : ni le stade, ni l'affaire, ni la source.
  crm_writeback_confirmed: ['screen'],
}

/** Une chaîne autorisée reste courte : ces propriétés sont des noms d'écran,
 *  de filtre ou d'action — jamais un texte libre. Plus court que
 *  {@link MAX_STRING_LEN} du flux d'audit, volontairement : un nom de filtre
 *  ou de route qui dépasse 200 caractères est déjà un signe qu'autre chose que
 *  le contrat prévu a été passé. */
const MAX_BEHAVIORAL_STRING_LEN = 200

/**
 * La liste blanche de {@link BEHAVIORAL_EVENT_PROPERTY_KEYS}, appliquée. Une
 * clé qui n'y figure pas pour CET événement est retirée, quel que soit son
 * nom — c'est la différence avec {@link sanitizeProperties}, qui ne retire que
 * ce qu'elle a explicitement reconnu comme sensible.
 */
export function sanitizeBehavioralProperties(
  eventName: BehavioralEventName,
  input: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {}
  const allowed = BEHAVIORAL_EVENT_PROPERTY_KEYS[eventName] ?? []
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (!(key in input)) continue
    const value = input[key]
    if (typeof value === 'string') {
      out[key] = value.length > MAX_BEHAVIORAL_STRING_LEN ? value.slice(0, MAX_BEHAVIORAL_STRING_LEN) : value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
    // Toute autre forme (objet, tableau, fonction…) est un signe que le
    // contrat n'a pas été respecté par l'appelant — on la laisse tomber
    // plutôt que de stocker une valeur qu'aucun consommateur n'attend.
  }
  return out
}

type RawBehavioralEvent = {
  name: BehavioralEventName
  occurredAt: string
  properties: Record<string, unknown>
}

/** Le lot ne peut jamais grossir sans borne : un navigateur compromis ou un
 *  bug de boucle ne doit pas pouvoir faire écrire un lot arbitrairement grand
 *  en un seul appel. */
const MAX_BATCH_SIZE = 50

/**
 * Valide une charge REÇUE DU NAVIGATEUR — la seule frontière de ce service qui
 * ne vient pas du code serveur. `null` sur le moindre doute : un lot mal
 * formé se traduit par ZÉRO écriture, jamais par une exception qui remonterait
 * jusqu'au visiteur.
 */
function parseBehavioralBatch(payload: unknown): { sessionSeed: string; events: RawBehavioralEvent[] } | null {
  if (!payload || typeof payload !== 'object') return null
  const body = payload as Record<string, unknown>
  const sessionSeed = typeof body.sessionSeed === 'string' ? body.sessionSeed.trim() : ''
  if (!sessionSeed) return null
  if (!Array.isArray(body.events)) return null

  const events: RawBehavioralEvent[] = []
  for (const raw of body.events.slice(0, MAX_BATCH_SIZE)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>
    const name = entry.name
    if (typeof name !== 'string' || !(BEHAVIORAL_EVENT_NAMES as readonly string[]).includes(name)) continue
    const occurredAt = typeof entry.occurredAt === 'string' ? entry.occurredAt : new Date().toISOString()
    const properties =
      entry.properties && typeof entry.properties === 'object' ? (entry.properties as Record<string, unknown>) : {}
    events.push({ name: name as BehavioralEventName, occurredAt, properties })
  }
  return { sessionSeed, events }
}

/**
 * Self-hosted product-analytics writer. `track()` appends one immutable
 * {@link ProductEventEntity} row. STRICTLY best-effort: every call is wrapped so
 * an analytics failure (DB blip, bad payload) can never throw into — or slow a
 * transaction of — the business flow that emitted it. Callers should still
 * `void` the promise so they don't await the write.
 */
@Injectable()
export class ProductAnalyticsService {
  private readonly logger = new Logger(ProductAnalyticsService.name)

  constructor(
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
  ) {}

  async track(eventName: ProductEventName, opts: TrackOptions): Promise<void> {
    try {
      if (!opts.userId) return // never write an event we can't attribute
      await this.events.save(
        this.events.create({
          event_name: eventName,
          user_id: opts.userId,
          workspace_id: opts.workspaceId ?? null,
          properties: sanitizeProperties(opts.properties),
          session_id: opts.sessionId ?? null,
        }),
      )
    } catch (error) {
      // Swallow: analytics must never break the product. A dropped event is an
      // acceptable loss; a failed checkout / analysis / send is not.
      this.logger.warn('Failed to record product event (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        eventName,
      })
    }
  }

  /**
   * #1681.4/#1682 — le pendant COMPORTEMENTAL de `track()`, jamais mélangé
   * avec lui : `user_id` et `workspace_id` sont écrits à `null`
   * INCONDITIONNELLEMENT, quel que soit ce que l'appelant a pu transmettre par
   * ailleurs — un flux qui n'a jamais eu accès à une identité de personne ne
   * peut pas la faire fuiter par erreur de branchement.
   *
   * Sans hash de session, l'événement n'est écrit NULLE PART — symétrique à
   * `track()`, qui refuse d'écrire sans `userId` (« jamais un acteur inventé »
   * devient ici « jamais une session inventée »).
   */
  async trackBehavioral(
    eventName: BehavioralEventName,
    opts: { sessionHash: string; properties?: Record<string, unknown> },
  ): Promise<void> {
    try {
      if (!opts.sessionHash) return
      await this.events.save(this.behavioralRow(eventName, opts.sessionHash, opts.properties))
    } catch (error) {
      this.logger.warn('Failed to record behavioral product event (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        eventName,
      })
    }
  }

  /** La ligne comportementale : `user_id` / `workspace_id` toujours `null` (voir {@link trackBehavioral}). */
  private behavioralRow(
    eventName: BehavioralEventName,
    sessionHash: string,
    properties: Record<string, unknown> | undefined,
  ): ProductEventEntity {
    return this.events.create({
      event_name: eventName,
      user_id: null,
      workspace_id: null,
      properties: sanitizeBehavioralProperties(eventName, properties),
      session_id: sessionHash,
    })
  }

  /**
   * #1682 — le point d'entrée public du traceur front (`POST
   * /analytics/events`, voir {@link AnalyticsController}). Reçoit une charge
   * NON FIABLE (le navigateur, sans JWT — `sendBeacon` ne pose pas d'en-tête) :
   * toute forme inattendue rend `{ accepted: 0 }`, jamais une exception.
   *
   * Le hash de session est calculé ICI, côté serveur, à partir du germe brut
   * envoyé par le navigateur — jamais stocké tel quel (voir
   * `hashBehavioralSession`, `@bellum/contracts`) : la rotation à
   * {@link SESSION_HASH_ROTATION_HOURS} h est ainsi garantie par le code qui
   * ÉCRIT, pas par la discipline de celui qui envoie.
   */
  async ingestBehavioralBatch(payload: unknown): Promise<{ accepted: number }> {
    const parsed = parseBehavioralBatch(payload)
    if (!parsed) return { accepted: 0 }

    const rows: ProductEventEntity[] = []
    for (const event of parsed.events) {
      const occurredAt = new Date(event.occurredAt)
      const sessionHash = hashBehavioralSession(
        parsed.sessionSeed,
        Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      )
      if (!sessionHash) continue
      rows.push(this.behavioralRow(event.name, sessionHash, event.properties))
    }
    const accepted = rows.length
    if (accepted === 0) return { accepted }
    // Un seul INSERT multi-lignes : une transaction par événement saturait le pool (N+1).
    try {
      await this.events.insert(rows as QueryDeepPartialEntity<ProductEventEntity>[])
    } catch (error) {
      this.logger.warn('Failed to record behavioral product event batch (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
        size: accepted,
      })
    }
    return { accepted }
  }
}
