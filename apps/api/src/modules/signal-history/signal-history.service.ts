import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { SignalImportance } from '@bellum/contracts'
import { SignalHistoryEntity } from '../../database/entities/signal-history.entity'
import { projectSignalHistory, signalHistoryKey, type JobOfferHistoryRow } from './signal-history.projection'
import { returnedCount } from '../../database/returned-rows'

/** Une ligne d'historique telle que lue pour l'affichage. Les `timestamptz`
 *  arrivent en `Date` avec le driver pg (en `string` selon la config) — les deux
 *  formes sont acceptées, l'appelant normalise en ISO. */
type SignalHistoryRow = {
  /** Théo L1 — sélecteur avancé — l'identité de la ligne, par laquelle une offre
   *  d'emploi se désigne comme périmètre de Laura (`job_offer`). */
  id: string
  account_id: string
  signal_key: string
  first_detected_at: Date | string
  first_detection_exact: boolean
  last_seen_at: Date | string
  last_changed_at: Date | string | null
  change_count: number
  status: string
  resolved_at: Date | string | null
  /** Pondération dérivée (V2 §20) — `null` quand rien ne permet de la calculer. */
  importance: SignalImportance | null
  /** L'action déclenchée par ce signal, et son libellé — `null` s'il n'a rien
   *  produit. Le libellé vient de la ligne `action_plan_items` jointe, jamais
   *  d'une reformulation. */
  action_id: string | null
  action_label: string | null
  /** #2107.28 — le libellé du SIGNAL lui-même (« Levée de fonds Série B »),
   *  déjà écrit à la matérialisation (`INSERT ... label`). Distinct
   *  d'`action_label` : celui-ci décrit ce qui a bougé CHEZ LE COMPTE, pas ce
   *  que Bellum en a fait. */
  label: string
  /** #3206.2 (partiel, épopée #3240) — `null` tant que personne n'a cliqué
   *  « Marquer vérifié » sur ce signal. */
  last_verified_at: Date | string | null
}

/**
 * Historique de signal (restitution V2 §11) — matérialisation + lecture de la
 * table `signal_history` (migration `1787952416309`).
 *
 * Le blob `accounts.recent_signals` est réécrit intégralement à chaque analyse :
 * il porte l'état COURANT, jamais l'histoire. Ce service dérive l'histoire du
 * blob, de façon déterministe et idempotente :
 *
 * - un signal vu pour la première fois → ligne créée, `first_detected_at` = now ;
 * - un signal déjà connu → `last_seen_at` rafraîchi, `first_detected_at` INTACT
 *   (il n'est jamais dans le SET de l'upsert) ;
 * - un signal dont le libellé/date/source/type/fraîcheur a bougé → `change_count`
 *   incrémenté et `last_changed_at` daté ;
 * - un signal absent de la dernière analyse → `status = 'resolved'` + `resolved_at`.
 *
 * Re-matérialiser deux fois le même blob ne duplique rien (index unique sur
 * (account_id, md5(signal_key))) et n'incrémente aucun compteur.
 *
 * Best-effort de bout en bout : une erreur d'historisation ne doit jamais faire
 * échouer une analyse qui, elle, a bien abouti (même contrat que
 * `ProjectsService.materialize`).
 */
@Injectable()
export class SignalHistoryService {
  private readonly logger = new Logger(SignalHistoryService.name)

  constructor(
    @InjectRepository(SignalHistoryEntity)
    private readonly repo: Repository<SignalHistoryEntity>,
  ) {}

  /**
   * Matérialise l'historique des signaux d'un compte depuis son blob persisté.
   *
   * Un blob absent / non-tableau (analyse jamais aboutie, colonne NULL) ne touche
   * à RIEN : on ne peut pas conclure qu'un signal a disparu à partir d'une
   * absence de données. Seule une liste de signaux réellement produite fait foi.
   */
  async materialize(accountId: string): Promise<void> {
    try {
      const rows = await this.repo.manager.query<Array<{ workspace_id: string | null; recent_signals: unknown }>>(
        `SELECT workspace_id, recent_signals FROM accounts WHERE id = $1 AND status <> 'deleted' LIMIT 1`,
        [accountId],
      )
      const account = rows[0]
      if (!account || !Array.isArray(account.recent_signals)) return

      const records = projectSignalHistory(account.recent_signals)

      if (records.length > 0) {
        // Une seule requête : autant de tuples que de signaux, tous paramétrés.
        const params: Array<string | null> = [accountId, account.workspace_id]
        const tuples = records.map(record => {
          const base = params.length
          params.push(
            record.key,
            record.label,
            record.type,
            record.source,
            record.date,
            record.freshness,
            record.importance,
          )
          return `($2, $1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
        })

        await this.repo.manager.query(
          `
          INSERT INTO signal_history
            (workspace_id, account_id, signal_key, label, signal_type, source, signal_date, freshness, importance)
          VALUES ${tuples.join(', ')}
          ON CONFLICT (account_id, md5(signal_key)) DO UPDATE SET
            last_seen_at    = now(),
            status          = 'active',
            resolved_at     = NULL,
            workspace_id    = COALESCE(EXCLUDED.workspace_id, signal_history.workspace_id),
            change_count    = signal_history.change_count + CASE WHEN ${CHANGED} THEN 1 ELSE 0 END,
            last_changed_at = CASE WHEN ${CHANGED} THEN now() ELSE signal_history.last_changed_at END,
            label           = EXCLUDED.label,
            signal_type     = EXCLUDED.signal_type,
            source          = EXCLUDED.source,
            signal_date     = EXCLUDED.signal_date,
            freshness       = EXCLUDED.freshness,
            importance      = EXCLUDED.importance
          `,
          params,
        )
      }

      // Résolution : ce qui n'est plus dans l'analyse cesse d'être actif. Daté une
      // seule fois (`COALESCE`) — un signal résolu qui reste absent garde la date
      // de sa disparition.
      await this.repo.manager.query(
        `
        UPDATE signal_history
        SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
        WHERE account_id = $1
          AND status = 'active'
          AND NOT (signal_key = ANY($2::text[]))
        `,
        [accountId, records.map(record => record.key)],
      )
    } catch (err) {
      this.logger.error('materialize error', { error: err, accountId })
    }
  }

  /**
   * L'historique des signaux ACTIFS et RÉSOLUS du workspace, pour enrichir le
   * flux de veille. Même repli que la politique RLS (`workspace_id` du signal ou
   * du compte parent) tant que la colonne peut être transitoirement NULL.
   */
  async listForWorkspace(workspaceId: string): Promise<SignalHistoryRow[]> {
    try {
      return await this.queryForWorkspace(workspaceId)
    } catch (err) {
      this.logger.error('listForWorkspace error', { error: err })
      return []
    }
  }

  /**
   * La MÊME lecture, mais qui LAISSE PASSER son erreur.
   *
   * `listForWorkspace` avale la sienne et rend `[]` — ce qui convient au flux de
   * veille, où une liste vide s'affiche comme une liste vide. Ça ne convient pas
   * à un COMPTEUR : « 0 nouveau signal » et « je n'ai pas su lire les signaux »
   * s'écrivent alors pareil, et un commercial qui les confond cesse de croire le
   * chiffre. C'est le défaut « cassé et non mesurable se ressemblent ».
   *
   * Le SQL vit ici, à UN seul endroit : les deux méthodes ne diffèrent que par
   * ce qu'elles font d'un échec.
   */
  async queryForWorkspace(workspaceId: string): Promise<SignalHistoryRow[]> {
    return this.repo.manager.query<SignalHistoryRow[]>(
      `
        SELECT
          h.id                    AS id,
          h.account_id            AS account_id,
          h.signal_key            AS signal_key,
          h.label                 AS label,
          h.first_detected_at     AS first_detected_at,
          h.first_detection_exact AS first_detection_exact,
          h.last_seen_at          AS last_seen_at,
          h.last_changed_at       AS last_changed_at,
          h.change_count          AS change_count,
          h.status                AS status,
          h.resolved_at           AS resolved_at,
          h.importance            AS importance,
          h.action_id             AS action_id,
          i.label                 AS action_label,
          h.last_verified_at      AS last_verified_at
        FROM signal_history h
        JOIN accounts a ON a.id = h.account_id
        LEFT JOIN action_plan_items i ON i.id = h.action_id
        WHERE (h.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
        `,
      [workspaceId],
    )
  }

  /**
   * Théo L1 — sélecteur avancé — L'OFFRE D'EMPLOI qu'un fil de Laura désigne.
   *
   * Une ligne d'historique de RECRUTEMENT, relue par son identifiant et BORNÉE à
   * l'espace de l'appelant : le compte est dans l'espace, et la ligne n'en porte
   * pas un autre. Hors de l'espace, `null` — l'appelant dit « introuvable »,
   * jamais une porte dérobée vers l'offre d'un autre client. Le dossier du compte
   * vient tel qu'il est stocké (blob des signaux, offres collectées) : rien n'est
   * recalculé, aucun appel n'est fait.
   *
   * ⚠️ Laisse passer son erreur, comme `queryForWorkspace` : « illisible » et
   * « introuvable » ne s'écrivent pas pareil dans le prompt de Laura.
   */
  async readJobOffer(id: string, workspaceId: string): Promise<JobOfferHistoryRow | null> {
    const rows = await this.repo.manager.query<JobOfferHistoryRow[]>(
      `
        SELECT
          h.label        AS label,
          h.signal_key   AS signal_key,
          h.signal_date  AS signal_date,
          h.status       AS status,
          h.resolved_at  AS resolved_at,
          a.company_name AS company_name,
          a.website      AS website,
          a.recent_signals AS recent_signals,
          COALESCE(a.raw_analysis -> 'it_job_signals', '[]'::jsonb) AS job_signals
        FROM signal_history h
        JOIN accounts a ON a.id = h.account_id
        WHERE h.id = $1
          AND a.workspace_id = $2
          AND (h.workspace_id IS NULL OR h.workspace_id = $2)
          AND a.status <> 'deleted'
          AND h.signal_type IN ('recrutement', 'hiring', 'recruitment')
        LIMIT 1
        `,
      [id, workspaceId],
    )
    return rows[0] ?? null
  }

  /**
   * Ce signal existe-t-il dans l'historique du workspace du demandeur ?
   * L'appartenance est vérifiée AVANT toute écriture, sur la même identité
   * partagée (compte + libellé normalisé) et le même scope que la lecture.
   *
   * Une erreur SQL renvoie `false` : mieux vaut refuser de lier que lier à
   * l'aveugle (l'appelant répond alors « signal introuvable »).
   */
  async hasSignal(args: { workspaceId: string; accountId: string; label: string }): Promise<boolean> {
    try {
      const rows = await this.repo.manager.query<Array<{ id: string }>>(
        `
        SELECT h.id
        FROM signal_history h
        JOIN accounts a ON a.id = h.account_id
        WHERE h.account_id = $2
          AND md5(h.signal_key) = md5($3)
          AND (h.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
        LIMIT 1
        `,
        [args.workspaceId, args.accountId, signalHistoryKey(args.label)],
      )
      return rows.length > 0
    } catch (err) {
      this.logger.error('hasSignal error', { error: err, accountId: args.accountId })
      return false
    }
  }

  /**
   * Relie un signal à l'action qu'il a DÉCLENCHÉE (restitution V2 §20 — l'objet
   * `Signal` exigeait « … importance, action »).
   *
   * Le lien n'est jamais deviné : il est posé au moment où l'utilisateur
   * transforme ce signal précis en action depuis la Veille. La cible est
   * retrouvée sur l'identité PARTAGÉE (compte + libellé normalisé), la même que
   * la matérialisation et la lecture, et la mise à jour est scopée au workspace
   * du signal (ou, en repli, à celui du compte parent — comme la politique RLS).
   *
   * Renvoie `false` quand aucune ligne n'a été touchée (signal inconnu, ou hors
   * du workspace du demandeur) : l'appelant décide alors quoi répondre.
   */
  async linkAction(args: {
    workspaceId: string
    accountId: string
    label: string
    actionId: string
  }): Promise<boolean> {
    try {
      const result = await this.repo.manager.query<Array<{ id: string }>>(
        `
        UPDATE signal_history h
        SET action_id = $4
        FROM accounts a
        WHERE a.id = h.account_id
          AND h.account_id = $2
          AND md5(h.signal_key) = md5($3)
          AND (h.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
        RETURNING h.id
        `,
        [args.workspaceId, args.accountId, signalHistoryKey(args.label), args.actionId],
      )
      // `result.length` valait 2 sur un UPDATE (`[lignes, nombre]`) : la
      // méthode répondait donc TOUJOURS « lié », y compris quand aucune ligne
      // ne correspondait.
      return returnedCount(result) > 0
    } catch (err) {
      this.logger.error('linkAction error', { error: err, accountId: args.accountId })
      return false
    }
  }

  /**
   * « Marquer ce signal comme vérifié » (#3206.2 partiel, épopée #3240) — la
   * plus petite tranche prouvable d'un événement de vérification, qui n'existait
   * nulle part dans le pipeline jusqu'ici.
   *
   * `last_verified_at = now()`, posé par le SERVEUR, jamais fourni par le
   * client — même discipline que `declaredAt` sur `declareSignals`. La cible
   * est retrouvée sur l'identité PARTAGÉE (compte + libellé normalisé), le même
   * scope que `linkAction`. Une observation n'est pas une vérification : ce
   * geste ne s'exécute QUE sur un clic explicite, jamais déduit d'une
   * re-détection en matérialisation.
   *
   * Renvoie `false` quand aucune ligne n'a été touchée (signal inconnu, ou hors
   * du workspace du demandeur) : l'appelant répond alors 404.
   */
  async verifySignal(args: { workspaceId: string; accountId: string; label: string }): Promise<boolean> {
    try {
      const result = await this.repo.manager.query<Array<{ id: string }>>(
        `
        UPDATE signal_history h
        SET last_verified_at = now()
        FROM accounts a
        WHERE a.id = h.account_id
          AND h.account_id = $2
          AND md5(h.signal_key) = md5($3)
          AND (h.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> 'deleted'
        RETURNING h.id
        `,
        [args.workspaceId, args.accountId, signalHistoryKey(args.label)],
      )
      return returnedCount(result) > 0
    } catch (err) {
      this.logger.error('verifySignal error', { error: err, accountId: args.accountId })
      return false
    }
  }

  /** Clé de jointure mémoire entre un signal projeté et sa ligne d'historique. */
  static indexKey(accountId: string, label: string): string {
    return `${accountId}|${signalHistoryKey(label)}`
  }
}

/** Le payload courant diffère-t-il de la ligne stockée ? (comparaison de lignes
 *  NULL-safe : `IS DISTINCT FROM`). `status` en fait partie — un signal résolu
 *  qui réapparaît est un changement, pas un simple « revu ».
 *
 *  `importance` en est volontairement ABSENTE : elle est DÉRIVÉE de la date, de
 *  la source et de la fraîcheur, donc elle bouge toute seule quand le temps
 *  passe (un signal actif finit archivé). La compter ferait dire « mis à jour 3
 *  fois » à un signal que personne n'a touché. */
const CHANGED = `(
  signal_history.label, signal_history.signal_type, signal_history.source,
  signal_history.signal_date, signal_history.freshness, signal_history.status
) IS DISTINCT FROM (
  EXCLUDED.label, EXCLUDED.signal_type, EXCLUDED.source,
  EXCLUDED.signal_date, EXCLUDED.freshness, 'active'
)`
