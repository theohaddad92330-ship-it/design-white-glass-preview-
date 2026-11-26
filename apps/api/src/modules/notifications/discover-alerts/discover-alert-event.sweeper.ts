import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { DiscoverAlertEventKind } from '@bellum/contracts'
import { buildTriggerEvent } from '@bellum/contracts'
import { DiscoverAlertEventEntity } from '../../../database/entities/discover-alert-event.entity'
import { discoverAlertEventsDisabled } from './discover-alert-event.switch'
import { DiscoverAlertEventService } from './discover-alert-event.service'
import { describeDecisionRoleChange } from '../../contacts/decision-role-change'
import { TriggerRegistryService } from '../../trigger-registry/trigger-registry.service'

/**
 * LE BALAYAGE QUI FAIT APPARAÎTRE LES ÉVÉNEMENTS — #2151.17 / .19 / .20 / .22,
 * #2166.67 / .69 / .70.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN BALAYAGE, ET PAS UN APPEL DEPUIS CHAQUE ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Une alerte SURVEILLE : c'est le mot du retour (#2151.14). Surveiller, pour
 * cinq objets qui s'écrivent depuis huit endroits différents (un formulaire, un
 * import, une synchronisation CRM, un outil de Laura, une reprise), veut dire
 * REGARDER le résultat — pas espérer que les huit écrivains pensent à prévenir.
 * Un producteur oublié est silencieux, et un silence ne se voit pas.
 *
 * Les deux genres que ce balayage NE produit PAS sont ceux dont un appelant
 * sait mieux que lui : `new_signal` et `analysis_refreshed` naissent dans
 * `WatchlistRefreshWorker`, qui compare les signaux AVANT et APRÈS une
 * ré-analyse. Lui seul sait qu'un signal est neuf ; le relire en base ne le
 * dirait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRÊT §10 — LE CLOISONNEMENT EST ÉCRIT DANS CHAQUE REQUÊTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chacune des cinq requêtes porte `workspace_id = $1`, en paramètre lié, et
 * aucune n'est construite par concaténation. Le balayage part de la LISTE des
 * espaces qui ont un périmètre de Découvrir : il ne lit jamais « tout », il lit
 * espace par espace. Les espaces sont des ESN, donc des concurrents.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne relance aucune analyse (aucun crédit débité), n'envoie rien, n'écrit
 * dans aucun CRM. Il CONSIGNE. La délivrance appartient à l'émetteur, et le
 * geste appartient au commercial.
 */

/**
 * Un producteur : un genre, et la requête qui dit « ceci est apparu depuis ».
 *
 * Déclaratif à dessein — cinq requêtes écrites côte à côte se relisent, et un
 * genre ajouté est une ligne, pas une méthode de plus qu'on oublie d'appeler.
 */
type EventProducer = {
  kind: DiscoverAlertEventKind
  /** `$1` = l'espace, `$2` = la borne basse. Toujours dans cet ordre. */
  sql: string
}

/**
 * ⚠️ `occurred_at` est la date du FAIT, jamais `now()`. Un balayage qui repasse
 * sur un fait d'hier ne le rajeunit pas : sinon la clé de déduplication
 * changerait de jour à chaque passage, et le même fait ressortirait tous les
 * matins — exactement le doublon que #2151.25 refuse.
 */
const PRODUCERS: readonly EventProducer[] = [
  {
    // #2151.17 / #2166.67 — une entreprise est entrée dans le périmètre.
    //
    // ⚠️ LIMITE ASSUMÉE, écrite ici parce qu'elle se lit à l'écran : « entrée
    // dans le périmètre » veut dire « entrée dans l'ESPACE », pas « satisfait
    // les filtres du périmètre ». Re-jouer les filtres appellerait le moteur et
    // débiterait un crédit sans geste de personne — une décision de facturation
    // que ce lot n'a pas à prendre, et la même raison qui fait que l'émetteur
    // ne rejoue pas la recherche.
    kind: 'new_matching_company',
    sql: `SELECT id AS subject_id, COALESCE(company_name, '') AS subject_label, created_at AS occurred_at
            FROM accounts
           WHERE workspace_id = $1 AND created_at >= $2
           ORDER BY created_at DESC LIMIT 50`,
  },
  {
    // #2151.19 / #2166.69 — un besoin CONFIRMÉ. Confirmé = quelqu'un l'a fait
    // sortir de « à qualifier » ; un besoin qui vient d'arriver n'est pas
    // confirmé, il est à regarder. `status_changed_at` date le geste.
    kind: 'new_confirmed_need',
    sql: `SELECT id AS subject_id, COALESCE(title, '') AS subject_label, status_changed_at AS occurred_at
            FROM project_needs
           WHERE workspace_id = $1 AND status = 'qualified' AND status_changed_at >= $2
           ORDER BY status_changed_at DESC LIMIT 50`,
  },
  {
    // #2151.20 — une ESN déclarée présente sur un compte. Les lignes ÉCARTÉES
    // (« ce n'est pas exact ») ne déclenchent rien : la pierre tombale vaut
    // décision, et la ressusciter en alerte annulerait la correction humaine.
    kind: 'new_relationship',
    sql: `SELECT id AS subject_id, COALESCE(name, '') AS subject_label, created_at AS occurred_at
            FROM account_partners
           WHERE workspace_id = $1 AND created_at >= $2 AND dismissed_at IS NULL
           ORDER BY created_at DESC LIMIT 50`,
  },
  {
    // #2151.22 — une mission s'est terminée : quelqu'un se libère.
    // `stage_entered_at` date l'entrée dans l'état ACTUEL, et c'est la seule
    // colonne qui le dit : `updated_at` bouge à chaque retouche de TJM.
    kind: 'mission_ended',
    sql: `SELECT id AS subject_id, COALESCE(label, '') AS subject_label, stage_entered_at AS occurred_at
            FROM missions
           WHERE workspace_id = $1 AND status IN ('ended','terminated') AND stage_entered_at >= $2
           ORDER BY stage_entered_at DESC LIMIT 50`,
  },
  {
    // #2166.70 — une voie d'entrée neuve consignée sur un compte.
    kind: 'new_access_path',
    sql: `SELECT id AS subject_id, COALESCE(value, '') AS subject_label, created_at AS occurred_at
            FROM access_facts
           WHERE workspace_id = $1 AND kind = 'path' AND created_at >= $2
           ORDER BY created_at DESC LIMIT 50`,
  },
]

/** Une ligne telle que les cinq requêtes la rendent — même forme pour toutes. */
type ProducerRow = {
  subject_id: string | null
  subject_label: string | null
  occurred_at: Date | string | null
}

/**
 * Jusqu'où on regarde en arrière au PREMIER passage d'un espace.
 *
 * Sept jours, et pas « depuis toujours » : un premier balayage sans borne
 * consignerait des années d'historique d'un coup, et le commercial ouvrirait
 * Aujourd'hui sur trois cents lignes dont aucune n'est d'aujourd'hui. Sept
 * jours est la fenêtre du digest de veille — reprise, pas redécidée.
 */
const FIRST_SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

/** Ce qu'un passage a fait. Jamais un total muet : consignés ET doublons. */
type DiscoverAlertSweepCounts = {
  workspaces: number
  recorded: number
  /** Déjà connus — la preuve que la porte de #2151.25 travaille. */
  duplicates: number
  failed: number
  /** L'interrupteur d'opérateur a coupé le passage avant toute lecture. */
  switchOff: boolean
}

@Injectable()
export class DiscoverAlertEventSweeper {
  private readonly logger = new Logger(DiscoverAlertEventSweeper.name)

  constructor(
    @InjectRepository(DiscoverAlertEventEntity)
    private readonly events: Repository<DiscoverAlertEventEntity>,
    private readonly registry: DiscoverAlertEventService,
    // #2875 (#2402.1, #2402.3, lot R03) — le registre canonique des
    // déclencheurs. EN DERNIER et optionnel, même règle de position que
    // `WatchlistRefreshWorker` : un paramètre inséré au milieu décalerait en
    // silence un appelant qui construit par position.
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {}

  /**
   * Un passage complet : les espaces qui ont un périmètre de Découvrir, puis
   * les cinq producteurs sur chacun.
   */
  async run(now: Date = new Date()): Promise<DiscoverAlertSweepCounts> {
    const counts: DiscoverAlertSweepCounts = {
      workspaces: 0,
      recorded: 0,
      duplicates: 0,
      failed: 0,
      switchOff: false,
    }

    // L'interrupteur, AVANT la moindre lecture : « coupé » veut dire chemin
    // identique à celui d'avant ce lot, pas « on lit tout puis on jette ».
    if (discoverAlertEventsDisabled()) {
      counts.switchOff = true
      this.logger.log('Balayage des événements de Découvrir coupé (DISCOVER_ALERT_EVENTS_DISABLED)')
      return counts
    }

    const workspaces = await this.workspacesWithADiscoverPerimeter()
    counts.workspaces = workspaces.length

    for (const workspaceId of workspaces) {
      try {
        const since = await this.sinceFor(workspaceId, now)
        await this.sweepWorkspace(workspaceId, since, counts)
      } catch (error) {
        // Un espace en échec ne fait pas tomber le passage : les autres
        // appartiennent à d'autres ESN, qui n'y sont pour rien.
        counts.failed += 1
        this.logger.warn('Balayage des événements de Découvrir en échec pour un espace (non fatal)', {
          workspace: { id: workspaceId },
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await this.sweepDeadlineAo(now)
    await this.sweepChangementDecideur(now)
    await this.sweepReferencementDetecte(now)

    this.logger.log(
      `Événements de Découvrir : ${counts.workspaces} espace(s), ${counts.recorded} consigné(s), ` +
        `${counts.duplicates} déjà connu(s), ${counts.failed} en échec`,
    )
    return counts
  }

  /**
   * Les espaces à balayer : ceux qui ont au moins un périmètre de Découvrir.
   *
   * Balayer les autres coûterait cinq requêtes par espace pour consigner des
   * événements que personne n'a demandé à surveiller. Un espace qui enregistre
   * son premier périmètre est balayé dès le passage suivant.
   */
  private async workspacesWithADiscoverPerimeter(): Promise<string[]> {
    const rows = await this.events.manager.query<Array<{ workspace_id: string }>>(
      `SELECT DISTINCT workspace_id FROM saved_views
        WHERE scope = 'discover' AND workspace_id IS NOT NULL`,
    )
    return rows.map(row => row.workspace_id)
  }

  /**
   * Depuis quand on regarde : le dernier événement consigné pour cet espace,
   * ou sept jours en arrière au premier passage.
   *
   * ⚠️ On repart de la date du dernier ÉVÉNEMENT, pas d'une date de passage :
   * si un passage a échoué hier, celui d'aujourd'hui reprend le trou de
   * lui-même. Et si le même fait est relu, la porte de déduplication le refuse
   * — le recouvrement ne coûte rien, le trou coûterait une alerte perdue.
   */
  private async sinceFor(workspaceId: string, now: Date): Promise<Date> {
    const last = await this.registry.lastOccurredAt(workspaceId)
    if (last) return last
    return new Date(now.getTime() - FIRST_SWEEP_LOOKBACK_MS)
  }

  private async sweepWorkspace(workspaceId: string, since: Date, counts: DiscoverAlertSweepCounts): Promise<void> {
    for (const producer of PRODUCERS) {
      // Paramètres LIÉS — jamais de concaténation : `workspace_id` est la
      // barrière de cloisonnement, et une barrière interpolée n'en est pas une.
      const rows = await this.events.manager.query<ProducerRow[]>(producer.sql, [workspaceId, since])
      for (const row of rows) {
        const occurredAt = parseDate(row.occurred_at)
        // Une date illisible n'est pas « aujourd'hui » : sans date, le fait
        // n'est pas datable, donc pas signalable. On le laisse passer plutôt
        // que de lui inventer un jour — qui changerait sa clé.
        if (!occurredAt || !row.subject_id) continue

        const result = await this.registry.record({
          workspaceId,
          kind: producer.kind,
          subjectId: row.subject_id,
          subjectLabel: (row.subject_label ?? '').trim(),
          occurredAt,
        })
        if (result.status === 'recorded') {
          counts.recorded += 1
          // #2875 (#2402.1, #2402.3) — le SEUL des cinq genres de ce balayage
          // nommé par les dix signaux commerciaux de l'issue (#2402.3) : un
          // besoin CONFIRMÉ. `new_matching_company`/`new_relationship`/
          // `mission_ended`/`new_access_path` restent hors de ce registre —
          // aucun n'a de nom dans le catalogue canonique.
          if (producer.kind === 'new_confirmed_need') {
            this.recordBesoinEntrantTrigger(workspaceId, row.subject_id, row.subject_label, occurredAt)
          }
        } else counts.duplicates += 1
      }
    }
  }

  /**
   * #2875 (#2402.1, #2402.3, lot R03) — persiste AUSSI un `TriggerEvent`
   * canonique `besoin_entrant`, au registre unique (#2402.9). `buildTriggerEvent`
   * reste l'UNIQUE point de construction (#2402.2) : rien n'est recalculé, ce
   * n'est qu'une seconde écriture du même constat que {@link DiscoverAlertEventService.record}
   * vient de faire. Best-effort, jamais sur le chemin critique du balayage.
   */
  private async sweepDeadlineAo(now: Date): Promise<void> {
    if (!this.triggers) return
    try {
      const until = new Date(now.getTime() + DEADLINE_AO_HORIZON_MS)
      const rows = await this.events.manager.query<DeadlineAoRow[]>(DEADLINE_AO_SQL, [now, until])
      for (const row of rows) {
        const deadline = parseDate(row.deadline_at)
        if (!deadline || !row.subject_id || !row.workspace_id) continue
        const evidence = deadlineAoEvidence(row.subject_label, deadline)
        const event = buildTriggerEvent({
          type: 'deadline_ao',
          source: 'discover',
          subjectType: 'project_need',
          subjectId: row.subject_id,
          workspaceId: row.workspace_id,
          ownerId: null,
          evidence,
          confidence: 'mesuree',
          now,
          // #2875 — la clé porte la DATE LIMITE : une même échéance n'est
          // consignée qu'une fois, une échéance déplacée redevient un fait neuf.
          dedupeQualifier: deadline.toISOString().slice(0, 10),
        })
        await this.triggers.recordOnceByDedupeKey(event, 'notifications/discover-alerts/discover-alert-event.sweeper')
      }
    } catch (err) {
      this.logger.warn('Événement canonique « deadline_ao » en échec (non fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #2875 (#2402.3, lot P06) — `changement_decideur`. La MÉMOIRE de transition
   * (`contact_decision_role_history`, alimentée par un trigger SQL sur
   * `contacts.decision_role`, donc par TOUS les écrivains) est lue ici ; chaque
   * ligne non émise devient au plus un `TriggerEvent`, puis est marquée émise.
   * Une première classification ou un passage entre rôles non décisionnels est
   * marqué émis SANS événement (`describeDecisionRoleChange`) : l'inconnu se
   * tait, la ligne reste archivée. Best-effort, jamais sur le chemin critique.
   */
  private async sweepChangementDecideur(now: Date): Promise<void> {
    if (!this.triggers) return
    try {
      const rows = await this.events.manager.query<DecisionRoleChangeRow[]>(DECISION_ROLE_CHANGE_SQL)
      for (const row of rows) {
        if (!row.id || !row.contact_id || !row.workspace_id) continue
        const change = describeDecisionRoleChange(row.from_role, row.to_role)
        if (change) {
          const event = buildTriggerEvent({
            type: 'changement_decideur',
            source: 'contacts',
            subjectType: 'contact',
            subjectId: row.contact_id,
            workspaceId: row.workspace_id,
            ownerId: row.assigned_to ?? null,
            evidence: `Changement de décideur : ${(row.full_name ?? '').trim() || row.contact_id} passe de « ${change.from} » à « ${change.to} »`,
            confidence: 'mesuree',
            now: parseDate(row.changed_at) ?? now,
            // #2875 — chaque transition de rôle est UN fait : la clé porte la ligne d'historique.
            dedupeQualifier: row.id,
          })
          await this.triggers.recordOnceByDedupeKey(event, 'notifications/discover-alerts/discover-alert-event.sweeper')
        }
        await this.events.manager.query(
          'UPDATE contact_decision_role_history SET emitted_at = $2 WHERE id = $1 AND emitted_at IS NULL',
          [row.id, now],
        )
      }
    } catch (err) {
      this.logger.warn('Événement canonique « changement_decideur » en échec (non fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #2875 (#2402.3, lot X54) — `referencement_detecte`. Le fait vient d'une
   * ligne `access_facts` (kind `mode`, valeur `direct_reference`) : PAR ESPACE,
   * PAR COMPTE, datée — ce que la table partagée du marché n'avait pas. Un
   * compte n'est émis qu'une fois par espace : la requête écarte ceux déjà
   * consignés au registre canonique (même clé sujet que `dedupeKey`).
   * Best-effort, jamais sur le chemin critique.
   */
  private async sweepReferencementDetecte(now: Date): Promise<void> {
    if (!this.triggers) return
    try {
      const rows = await this.events.manager.query<ReferencementRow[]>(REFERENCEMENT_SQL)
      for (const row of rows) {
        if (!row.subject_id || !row.workspace_id) continue
        const event = buildTriggerEvent({
          type: 'referencement_detecte',
          source: 'discover',
          subjectType: 'account',
          subjectId: row.subject_id,
          workspaceId: row.workspace_id,
          ownerId: row.assigned_to ?? null,
          evidence: `Référencement détecté : ${(row.company_name ?? '').trim() || row.subject_id} (${(row.source ?? '').trim() || 'source non précisée'})`,
          confidence: 'mesuree',
          now: parseDate(row.occurred_at) ?? now,
        })
        // #2875 — un référencement par (espace, compte) : clé non datée, à dessein.
        await this.triggers.recordOnceByDedupeKey(event, 'notifications/discover-alerts/discover-alert-event.sweeper')
      }
    } catch (err) {
      this.logger.warn('Événement canonique « referencement_detecte » en échec (non fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private recordBesoinEntrantTrigger(
    workspaceId: string,
    subjectId: string,
    subjectLabel: string | null,
    occurredAt: Date,
  ): void {
    if (!this.triggers) return
    try {
      const event = buildTriggerEvent({
        type: 'besoin_entrant',
        source: 'discover',
        subjectType: 'project_need',
        subjectId,
        workspaceId,
        // Aucun propriétaire connu à ce point : les cinq requêtes de ce
        // balayage ne lisent aucune colonne d'utilisateur (voir §10 en tête
        // de fichier), et en deviner un serait une donnée fictive.
        ownerId: null,
        evidence: `Besoin confirmé : ${(subjectLabel ?? '').trim() || subjectId}`,
        confidence: 'mesuree',
        now: occurredAt,
      })
      // #2875 — un besoin confirmé = un fait : clé (espace, type, besoin) non datée, à dessein.
      void this.triggers.recordOnceByDedupeKey(event, 'notifications/discover-alerts/discover-alert-event.sweeper')
    } catch (err) {
      this.logger.warn('Événement canonique « besoin_entrant » en échec (non fatal)', {
        subjectId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

// #2875 (#2402.3) — `deadline_ao` : un besoin né d'un appel d'offres (`source =
// 'tender'`, cf. `rfp-to-need.ts`) encore OUVERT dont la date limite de remise
// tombe dans les sept prochains jours. Échéance absente ou passée = aucun
// événement (l'inconnu se tait). Une même échéance n'est consignée qu'une fois
// (l'évidence porte la date) ; une échéance déplacée redevient un fait neuf.
const DEADLINE_AO_HORIZON_MS = 7 * 24 * 60 * 60 * 1000
const DEADLINE_AO_SQL = `SELECT workspace_id, id AS subject_id, COALESCE(title, '') AS subject_label, deadline_at
            FROM project_needs
           WHERE source = 'tender' AND status = 'open' AND archived_at IS NULL
             AND deadline_at > $1 AND deadline_at <= $2
           ORDER BY deadline_at ASC LIMIT 200`

type DeadlineAoRow = {
  workspace_id: string | null
  subject_id: string | null
  subject_label: string | null
  deadline_at: Date | string | null
}

function deadlineAoEvidence(label: string | null, deadline: Date): string {
  return `Appel d'offres « ${(label ?? '').trim() || 'sans titre'} » : remise avant le ${deadline.toISOString().slice(0, 10)}`
}

function parseDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// #2875 (#2402.3, lot P06) — `changement_decideur` : les transitions de
// `contacts.decision_role` consignées par le trigger SQL et pas encore émises.
// LEFT JOIN : un contact effacé (RGPD) emporte sa ligne (CASCADE), mais une
// lecture ne doit jamais faire DISPARAÎTRE une transition faute de contact.
// #2875 (#2402.3, lot X54) — `referencement_detecte` : un fait d'accès par
// espace « référencé en direct », jamais encore consigné pour ce compte.
const REFERENCEMENT_SQL = `SELECT f.workspace_id, f.account_id AS subject_id, a.company_name, f.source,
            COALESCE(f.observed_at, f.created_at) AS occurred_at, a.assigned_to
       FROM access_facts f
       LEFT JOIN accounts a ON a.id = f.account_id
      WHERE f.workspace_id IS NOT NULL AND f.kind = 'mode' AND f.value = 'direct_reference'
        AND NOT EXISTS (
          SELECT 1 FROM canonical_trigger_events e
           WHERE e.kind = 'referencement_detecte' AND e.workspace_id = f.workspace_id
             AND e.payload->>'subjectId' = f.account_id::text)
      ORDER BY occurred_at ASC LIMIT 200`

interface ReferencementRow {
  workspace_id: string | null
  subject_id: string | null
  company_name: string | null
  source: string | null
  occurred_at: Date | string | null
  assigned_to: string | null
}

const DECISION_ROLE_CHANGE_SQL = `SELECT h.id, h.workspace_id, h.contact_id, h.from_role, h.to_role, h.changed_at,
            c.full_name, c.assigned_to
       FROM contact_decision_role_history h
       LEFT JOIN contacts c ON c.id = h.contact_id
      WHERE h.emitted_at IS NULL AND h.workspace_id IS NOT NULL
      ORDER BY h.changed_at ASC LIMIT 200`

interface DecisionRoleChangeRow {
  id: string
  workspace_id: string | null
  contact_id: string
  from_role: string | null
  to_role: string | null
  changed_at: Date | string | null
  full_name: string | null
  assigned_to: string | null
}
