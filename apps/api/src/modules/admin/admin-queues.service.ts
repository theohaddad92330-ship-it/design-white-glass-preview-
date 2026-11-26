import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { type Job, type JobType, type Queue } from 'bullmq'

// The queues the operator is allowed to inspect/poke. Anything outside this
// allowlist is rejected (a 400) so an arbitrary Redis key can never be reached
// through this surface — the queues themselves are owned/configured by the
// analysis + mailer modules; here we only hold read/mutation handles on them.
export const ADMIN_QUEUE_NAMES = ['analysis', 'mailer'] as const
type AdminQueueName = (typeof ADMIN_QUEUE_NAMES)[number]

// Only *finished* states may be bulk-cleaned — cleaning `active`/`waiting` would
// destroy live/pending work. Kept in sync with `CLEANABLE_QUEUE_STATES`.
const CLEANABLE_STATES = new Set<string>(['completed', 'failed', 'delayed'])

// Grace 0 = clean regardless of age; a sane per-call batch cap so one click can't
// block Redis wiping an unbounded backlog.
const CLEAN_LIMIT = 1000

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// Job-data fields safe to surface to the operator. STRICT allowlist (fail-safe):
// anything not listed — the ESN `profileData` blob, the run's `userContext`, the
// mailer's one-time `resetUrl` / `otpCode` — is dropped, never leaked. Only these
// scalar debugging fields (who/what a job is about) ever leave the API.
const SAFE_DATA_KEYS = [
  // analysis pipeline
  'accountId',
  'companyName',
  'userId',
  'workspaceId',
  'siren',
  'scopeMode',
  'country',
  'correlationId',
  // ─── mailer ────────────────────────────────────────────────────────────────
  // ⚠️ `to` — l'adresse du destinataire — sort EN CLAIR. C'est un ARBITRAGE,
  // pas un oubli : le masquage (`maskEmail`) a été ENVISAGÉ puis ÉCARTÉ le
  // 28/08/2026 (décision D46). Trois raisons, dans cet ordre :
  //
  //  1. **Surface d'OPÉRATEUR INTERNE.** Ces routes vivent derrière
  //     `InternalSecretGuard` — secret d'en-tête, aucun JWT d'utilisateur final.
  //     Aucun client, aucun membre d'espace ne les atteint. Ce n'est ni un
  //     journal parti chez un tiers d'observabilité, ni une réponse rendue à un
  //     utilisateur.
  //  2. **Aucun jeton ni code ne passe.** La liste blanche ci-dessus est stricte
  //     et scalaire : `otpCode`, `resetUrl`, `expirationMinutes`, `profileData`,
  //     `userContext` sont écartés, et `admin-queues.service.spec.ts` le vérifie
  //     champ par champ. C'est ce qui rend l'adresse acceptable — elle voyage
  //     SEULE, sans rien qui permette d'agir sur le compte.
  //  3. **Une adresse COMPLÈTE est parfois le seul moyen de rapprocher un job
  //     d'un envoi.** `m***@acme.fr` ne distingue pas deux collègues du même
  //     domaine, et c'est exactement la question qu'on se pose devant une file
  //     `mailer` en échec : « lequel des trois n'a pas reçu son lien ? ».
  //
  // Ce que cette exception NE DIT PAS : le masquage reste la règle PARTOUT
  // ailleurs — journaux, observabilité, import de masse — et il a son module
  // (`packages/contracts/src/schemas/pii-masking.ts`, `maskRecordForLog`). Cette
  // liste-ci est la seule surface où une adresse est rendue entière, et elle
  // l'est derrière un secret d'opérateur.
  //
  // Avant de « corriger » ceci : la décision est ÉCRITE, pas oubliée. La rouvrir
  // suppose de dire ce qui a CHANGÉ — un accès élargi, un jeton ajouté à la
  // liste blanche —, pas de réappliquer la règle générale à une exception qui
  // porte déjà sa raison.
  'to',
  'firstName',
  'emailType',
] as const

/**
 * POURQUOI UNE RAISON À VOCABULAIRE FERMÉ, ET PAS LE MESSAGE D'ERREUR
 *
 * Cette raison VOYAGE JUSQU'À L'ÉCRAN de l'opérateur. Un message d'exception
 * Redis porte régulièrement l'URL de connexion — donc le mot de passe
 * (`redis://default:<motdepasse>@host:6379`). Rendre `err.message` ici
 * afficherait un secret dans le back-office, ce que `aucun-secret-affiche`
 * interdit et qu'aucune garde de NOMMAGE ne pourrait voir (le champ s'appelle
 * `raison`, pas `password`).
 *
 * Un vocabulaire fermé règle les deux problèmes d'un coup : rien d'imprévu ne
 * sort, et l'écran peut TRADUIRE chaque cas au lieu de recopier de l'anglais
 * d'exception. Le détail technique, lui, part au journal (`logger.warn`).
 */
export type AdminQueueUnknownReason =
  /** La file n'a pas répondu — Redis, réseau, sérialisation. */
  | 'lecture-impossible'
  /** Les comptes annoncent des jobs en attente, aucun n'a pu être lu. */
  | 'comptes-et-file-divergent'
  /** Le job existe, son instant d'ajout n'est pas un nombre exploitable. */
  | 'horodatage-illisible'
  /** `getJobCounts()` n'a pas rendu de profondeur `waiting`. */
  | 'profondeur-illisible'

/**
 * L'ANCIENNETÉ DU JOB LE PLUS VIEUX EN ATTENTE — trois états qui ne se
 * confondent JAMAIS (#1662).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE UNION, ET PAS `number | null`
 * ─────────────────────────────────────────────────────────────────────────────
 * `oldestWaitingAgeMs: number | null` — la forme livrée le 07/09 — écrasait
 * DEUX faits distincts sur la même valeur :
 *
 *   · « il n'y a rien en attente »  → il n'y a pas d'ancienneté à mesurer ;
 *   · « on n'a pas pu lire la file » → il y a peut-être un job de trois jours.
 *
 * Le premier est une bonne nouvelle, le second est une panne. Les rendre
 * indiscernables oblige l'écran à deviner, et un écran qui devine finit par
 * écrire « aucun job en attente » sur une file dont Redis ne répond plus.
 * L'union retire le MOYEN de se tromper : après `if (o.etat === 'mesure')`,
 * TypeScript sait que `plusVieuxMs` est un nombre, et aucun `?? 0` n'a plus de
 * raison d'exister (doctrine `UnknownValue`, gardes GA-18 / GA-19).
 *
 * ⚠️ ET UNE FILE VIDE N'A PAS UN JOB DE 0 MINUTE. « Aucun job en attente » et
 * « le plus vieux attend depuis zéro minute » sont deux phrases différentes ;
 * la seconde se lit comme une file qui vient de commencer à s'accumuler.
 */
export type AdminQueueOldestWaiting =
  /** Aucun job en attente : il n'y a rien dont mesurer l'âge. */
  | { etat: 'vide' }
  /** L'âge n'a pas pu être établi. Une panne ne rend pas une file saine. */
  | { etat: 'inconnu'; raison: AdminQueueUnknownReason }
  /** Mesuré : le job le plus vieux attend depuis `plusVieuxMs` millisecondes. */
  | { etat: 'mesure'; plusVieuxMs: number }

/** Compact BullMQ depth snapshot for one queue (the `/queues` summary row). */
export interface AdminQueueSummary {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: number
  /**
   * Depuis quand ce qui attend, attend (#1662) — la seule chose qu'une
   * profondeur ne dit pas. `waiting: 40` ne distingue pas un pic de trois
   * minutes d'un blocage de trois jours ; c'est pourtant la seule question
   * qu'un opérateur se pose devant une file qui monte.
   *
   * ⚠️ CE CHAMP EST LE CONTRAT DE LA FILE DE DÉCISION (#1647). La règle
   * « un job bloqué depuis plus d'une heure remonte dans la file de décision »
   * se dérive d'ICI : `oldestWaiting.etat === 'mesure' && plusVieuxMs >= seuil`.
   * Le SEUIL appartient à la file de décision et n'est volontairement écrit
   * nulle part dans ce fichier — deux dérivations du même seuil divergeraient,
   * et c'est la loi « une dérivation vit à un seul endroit ».
   */
  oldestWaiting: AdminQueueOldestWaiting
}

/** One job as shown in the operator queue viewer. Carries only whitelisted
 *  debugging fields — never secrets/PII beyond who/what the job is about.
 *  In-file only (composed into {@link AdminQueueJobsPage}) — knip flags lone
 *  type exports. */
interface AdminQueueJob {
  id: string | null
  name: string
  data: Record<string, string>
  attemptsMade: number
  timestamp: number | null
  processedOn: number | null
  finishedOn: number | null
  /** The failure message BullMQ recorded — THE field that diagnoses an incident. */
  failedReason: string | null
  /** Last line of the most recent stack trace (the deepest frame). */
  stackTail: string | null
}

export interface AdminQueueJobsPage {
  queue: string
  state: string
  limit: number
  offset: number
  total: number
  jobs: AdminQueueJob[]
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function clampLimit(limit: number | undefined): number {
  const n = Number(limit)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)))
}

/**
 * LA DÉRIVATION D'ANCIENNETÉ — le seul endroit du dépôt qui décide si une file
 * est vide, inconnue, ou mesurée (#1662).
 *
 * ⚠️ `maintenantMs` est un PARAMÈTRE, jamais `Date.now()` lu ici : une
 * dérivation qui lit l'horloge passe sur la machine de celui qui l'écrit et
 * échoue sur un exécuteur CI, et un test ne peut plus rien affirmer.
 *
 * C'EST LA FONCTION QUE LA FILE DE DÉCISION (#1647) CONSOMME — soit
 * directement, soit par `AdminQueueSummary.oldestWaiting`, qui n'est que son
 * résultat. La règle « bloqué depuis plus d'une heure » se lit dessus ; le
 * SEUIL n'est pas ici, il appartient à la file de décision.
 *
 * @param enAttente    la profondeur `waiting` lue par `getJobCounts()`, ou
 *                     `undefined` si la clé manque.
 * @param ajouteA      l'instant (ms epoch) d'ajout du job le plus vieux, ou
 *                     `null`/`undefined` s'il n'y en a pas.
 * @param maintenantMs l'instant de LECTURE.
 * @param panne        vrai si la lecture de la file a échoué — auquel cas rien
 *                     d'autre n'est concluant.
 */
export function ancienneteDuPlusVieuxEnAttente(entree: {
  enAttente: number | undefined
  ajouteA: number | null | undefined
  maintenantMs: number
  panne?: boolean
}): AdminQueueOldestWaiting {
  const { enAttente, ajouteA, maintenantMs, panne } = entree

  // Une panne ARRÊTE le raisonnement. Sans ce court-circuit, une file
  // injoignable retomberait sur la branche « aucun job lu » et se déclarerait
  // vide — c'est-à-dire saine, ce qui est exactement le mensonge à éviter.
  if (panne) return { etat: 'inconnu', raison: 'lecture-impossible' }

  if (ajouteA === null || ajouteA === undefined) {
    // Les comptes disent qu'il y a des jobs, la file n'en a rendu aucun : les
    // deux lectures ne sont pas du même instant. On ne tranche pas, on le dit.
    if (typeof enAttente === 'number' && Number.isFinite(enAttente) && enAttente > 0) {
      return { etat: 'inconnu', raison: 'comptes-et-file-divergent' }
    }
    // Sans profondeur lisible, « vide » serait une conclusion tirée d'un
    // silence — et un verdict ne se conclut pas d'un silence.
    if (typeof enAttente !== 'number' || !Number.isFinite(enAttente)) {
      return { etat: 'inconnu', raison: 'profondeur-illisible' }
    }
    return { etat: 'vide' }
  }

  if (typeof ajouteA !== 'number' || !Number.isFinite(ajouteA) || !Number.isFinite(maintenantMs)) {
    return { etat: 'inconnu', raison: 'horodatage-illisible' }
  }

  // Borné à 0 : l'horloge de Redis peut avoir une seconde d'avance sur la
  // nôtre, et un âge NÉGATIF se lirait comme un job programmé dans le futur.
  return { etat: 'mesure', plusVieuxMs: Math.max(0, maintenantMs - ajouteA) }
}

/** Map a BullMQ `getJobCounts()` bag to the compact summary shape. */
function toSummary(
  name: string,
  counts: Record<string, number> | undefined,
  oldestWaiting: AdminQueueOldestWaiting,
): AdminQueueSummary {
  const c = counts ?? {}
  return {
    name,
    waiting: num(c['waiting']),
    active: num(c['active']),
    completed: num(c['completed']),
    failed: num(c['failed']),
    delayed: num(c['delayed']),
    paused: num(c['paused']),
    oldestWaiting,
  }
}

/** Keep only whitelisted scalar fields from a job's `data` (fail-safe redaction). */
function safeJobData(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {}
  const src = data as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const key of SAFE_DATA_KEYS) {
    const v = src[key]
    if (v === null || v === undefined) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[key] = String(v)
    }
    // Objects/arrays are intentionally dropped — never dump a nested blob.
  }
  return out
}

/** Last non-empty line of the most recent stack trace, trimmed. */
function lastStackLine(stacktrace: unknown): string | null {
  if (!Array.isArray(stacktrace) || stacktrace.length === 0) return null
  const latest = stacktrace[stacktrace.length - 1]
  if (typeof latest !== 'string') return null
  const lines = latest
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null
}

function toAdminJob(job: Job): AdminQueueJob {
  const failedReason = typeof job.failedReason === 'string' && job.failedReason.length > 0 ? job.failedReason : null
  return {
    id: job.id ?? null,
    name: job.name,
    data: safeJobData(job.data),
    attemptsMade: num(job.attemptsMade),
    timestamp: typeof job.timestamp === 'number' ? job.timestamp : null,
    processedOn: typeof job.processedOn === 'number' ? job.processedOn : null,
    finishedOn: typeof job.finishedOn === 'number' ? job.finishedOn : null,
    failedReason,
    stackTail: lastStackLine(job.stacktrace),
  }
}

/**
 * Operator queue viewer for the `dashboard-manager` backoffice — lists the
 * INDIVIDUAL jobs in the pipeline queues (not just the counts the health screen
 * shows) so an operator can see WHY a job failed (`failedReason` + the last
 * stack line). Sibling of {@link AdminOpsService}: same `internal/admin` surface,
 * behind `InternalSecretGuard`. The queues (`analysis` + `mailer`) are injected
 * read/mutate handles — this service never creates or configures them.
 *
 * Every entry point resolves the queue through {@link resolveQueue}, which
 * enforces the {@link ADMIN_QUEUE_NAMES} allowlist so an arbitrary queue name
 * can't be poked.
 */
@Injectable()
export class AdminQueuesService {
  private readonly logger = new Logger(AdminQueuesService.name)
  private readonly queues: Record<AdminQueueName, Queue>

  constructor(@InjectQueue('analysis') analysisQueue: Queue, @InjectQueue('mailer') mailerQueue: Queue) {
    this.queues = { analysis: analysisQueue, mailer: mailerQueue }
  }

  private resolveQueue(name: string): Queue {
    const queue = (this.queues as Record<string, Queue | undefined>)[name]
    if (!queue) {
      throw new BadRequestException(`Unknown queue "${name}". Allowed: ${ADMIN_QUEUE_NAMES.join(', ')}.`)
    }
    return queue
  }

  /** Queue list + their counts (same source as the health screen: getJobCounts)
   *  + how long the oldest waiting job has been sitting there (#1662). `now` is
   *  injectable for deterministic tests; defaults to the real clock. */
  async listQueues(now: Date = new Date()): Promise<AdminQueueSummary[]> {
    return Promise.all(
      ADMIN_QUEUE_NAMES.map(async name => {
        const queue = this.queues[name]
        // getJobs(['waiting'], 0, 0, true) === queue.getWaiting(0, 0): asc=true
        // orders by soonest-to-run first, so index 0 is the OLDEST waiting job.
        //
        // ⚠️ Cette lecture-là est ISOLÉE de celle des comptes, à dessein. Si
        // elle échoue, la file devient INCONNUE — elle ne devient pas vide, et
        // elle ne fait pas non plus tomber les profondeurs, qui sont l'autre
        // moitié de l'écran. Une panne partielle reste une réponse partielle.
        const [counts, plusVieux] = await Promise.all([
          queue.getJobCounts(),
          (queue.getJobs(['waiting'], 0, 0, true) as Promise<Job[]>).then(
            page => ({ panne: false, job: page[0] }),
            (err: unknown) => {
              // Le détail technique part au JOURNAL, jamais à l'écran : un
              // message d'erreur Redis porte l'URL de connexion, donc le mot
              // de passe. L'écran reçoit une raison à vocabulaire fermé.
              this.logger.warn('Lecture du job le plus vieux impossible', {
                tags: { queue: name },
                error: err,
              })
              return { panne: true, job: undefined }
            },
          ),
        ])

        return toSummary(
          name,
          counts,
          ancienneteDuPlusVieuxEnAttente({
            enAttente: counts?.['waiting'],
            ajouteA: plusVieux.job?.timestamp,
            maintenantMs: now.getTime(),
            panne: plusVieux.panne,
          }),
        )
      }),
    )
  }

  /** One page of individual jobs in `state`, newest-index first, with the total
   *  for that state. This is the endpoint that exposes `failedReason`. */
  async listJobs(name: string, state: string, limit?: number, offset?: number): Promise<AdminQueueJobsPage> {
    const queue = this.resolveQueue(name)
    const cappedLimit = clampLimit(limit)
    const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0))
    const start = safeOffset
    const end = safeOffset + cappedLimit - 1

    const [jobs, total] = await Promise.all([
      queue.getJobs([state as JobType], start, end) as Promise<Job[]>,
      queue.getJobCountByTypes(state as JobType),
    ])

    return {
      queue: name,
      state,
      limit: cappedLimit,
      offset: safeOffset,
      total: num(total),
      jobs: jobs.map(toAdminJob),
    }
  }

  /** Retry a failed job (re-enqueues it). 404 when the id is unknown. */
  async retryJob(name: string, id: string, actor = 'backoffice') {
    const queue = this.resolveQueue(name)
    const job = await queue.getJob(id)
    if (!job) throw new NotFoundException(`Job ${id} not found in queue ${name}`)
    await job.retry('failed')
    this.audit('queue_job_retry', name, { jobId: id, actor })
    return { queue: name, id, action: 'retry' as const, ok: true }
  }

  /** Remove a job from the queue. 404 when the id is unknown. */
  async removeJob(name: string, id: string, actor = 'backoffice') {
    const queue = this.resolveQueue(name)
    const job = await queue.getJob(id)
    if (!job) throw new NotFoundException(`Job ${id} not found in queue ${name}`)
    await job.remove()
    this.audit('queue_job_remove', name, { jobId: id, actor })
    return { queue: name, id, action: 'remove' as const, ok: true }
  }

  /** Bulk-clean a finished state (`failed`/`completed`/`delayed`). Refuses live
   *  states so a click can never wipe active/pending work. */
  async cleanState(name: string, state: string, actor = 'backoffice') {
    const queue = this.resolveQueue(name)
    if (!CLEANABLE_STATES.has(state)) {
      throw new BadRequestException(
        `State "${state}" is not bulk-cleanable. Allowed: ${[...CLEANABLE_STATES].join(', ')}.`,
      )
    }
    const removed = await queue.clean(0, CLEAN_LIMIT, state as 'completed' | 'failed' | 'delayed')
    this.audit('queue_clean', name, { state, removed: removed.length, actor })
    return { queue: name, state, action: 'clean' as const, removed: removed.length }
  }

  /** Structured audit log — same path the other admin mutations use (Winston
   *  tags → Sentry/Grafana): who did what, to which queue, when. */
  private audit(action: string, queue: string, meta: Record<string, unknown>): void {
    this.logger.log('Admin queue control', { tags: { 'admin.action': action, queue, ...meta } })
  }
}
