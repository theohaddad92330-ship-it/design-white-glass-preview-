import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { AVAILABILITY_REVALIDATION_DAYS } from '../consultants/matching/pushable'
import type { RoutineRead } from './routine-read'

/** Un profil dont la disponibilité a été saisie il y a trop longtemps. Non
 *  exporté : seul ce fichier le nomme, l'exécuteur ne lit que les champs
 *  qu'il affiche (règle des exports inutiles, `pnpm lint:exports:types`). */
type AvailabilityToReconfirm = {
  id: string
  full_name: string
  availability: string
  /** Jours écoulés depuis la SAISIE, jamais depuis la création de la fiche. */
  days: number
}

/** Un candidat sans contact depuis assez longtemps pour être « dormant ». */
type DormantCandidate = { id: string; full_name: string; days: number }

/** Jours sans contact avant qu'un candidat soit dit dormant (#2398.2). */
const DORMANT_POOL_DAYS = 90

/** #2843 (L13) — une ligne lue par une routine : l'objet nommé, jamais un nombre inventé. */
export type L13Row = {
  id: string
  full_name?: string | null
  label?: string | null
  title?: string | null
  name?: string | null
  mission_id?: string | null
  submission_id?: string | null
  days?: number | null
  scheduled_at?: Date | string | null
}

/** #2843 (L13) — les seuils des lectures, à UN seul endroit (GA-26), affichés dans la fiche du catalogue. */
const BLOCKED_NEED_DAYS = 21
const PENDING_DOCUMENT_DAYS = 7
const START_DEADLINE_DAYS = 14
const RENEWAL_WINDOW_DAYS = 45
const REPOSITIONING_WINDOW_DAYS = 30

/**
 * Les lectures du vivier dont les routines ont besoin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE REQUÊTE ET PAS UN SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même raison que `CrmRoutinesService`, à la ligne près : importer un service du
 * module `consultants` ferait monter le cliquet GA-07, qui est au plafond. On
 * lit donc le SCHÉMA — un couplage de schéma se voit à la migration suivante.
 *
 * Le SEUIL, lui, n'est pas recopié : il vient de `pushable.ts`, où il est déjà
 * le poids de la pénalité de fraîcheur du moteur de matching. Deux écritures de
 * « 60 » divergeraient, et le produit dirait « à reconfirmer » ici pendant qu'il
 * pénaliserait là-bas — ou l'inverse, ce qui est pire.
 */
@Injectable()
export class TalentRoutinesService {
  private readonly logger = new Logger(TalentRoutinesService.name)

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
  ) {}

  /**
   * Les disponibilités saisies il y a plus de `days` jours et jamais reconfirmées.
   *
   * Trois exclusions, et chacune répond à une question qu'on se poserait :
   *
   *  - **`availability_checked_at IS NULL` ne remonte JAMAIS.** `null` veut dire
   *    « jamais saisie », ce qui n'est pas « saisie il y a longtemps » — c'est
   *    la sémantique que `availabilityIsStale` porte déjà. Le rappel est un
   *    rappel de CONFIRMATION : sans saisie, il n'y a rien à confirmer, et
   *    prétendre le contraire ferait remonter tout le vivier au premier
   *    balayage.
   *  - **`availability = 'inconnu'` ne remonte pas.** Demander de confirmer
   *    qu'on ne sait toujours pas est du bruit, et « non renseigné » n'est pas
   *    « indifférent » : le trou se comble par une saisie, pas par un rappel.
   *  - **une fiche archivée ne remonte pas.** Elle est sortie du vivier actif ;
   *    sa disponibilité ne se confirme plus.
   *
   * ⚠️ `indisponible` remonte, lui, et c'est voulu : quelqu'un déclaré
   * indisponible il y a deux mois s'est peut-être libéré, et c'est le cas qui
   * rapporte le plus. Le taire ferait de la routine un rappel de ce qu'on sait
   * déjà.
   */
  async availabilityToReconfirm(
    workspaceId: string,
    days: number = AVAILABILITY_REVALIDATION_DAYS,
  ): Promise<RoutineRead<AvailabilityToReconfirm>> {
    return this.rows(
      `SELECT c.id, c.full_name, c.availability,
              FLOOR(EXTRACT(EPOCH FROM (now() - c.availability_checked_at)) / 86400)::int AS days
         FROM consultants c
        WHERE c.workspace_id = $1
          AND c.archived_at IS NULL
          AND c.availability_checked_at IS NOT NULL
          AND c.availability <> 'inconnu'
          AND c.availability_checked_at < now() - ($2 || ' days')::interval
        ORDER BY c.availability_checked_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'availabilityToReconfirm',
    )
  }

  /**
   * #2398.2 — les CANDIDATS dont le dernier contact (`last_contact_at`, l'ancrage
   * de rétention) dépasse `DORMANT_POOL_DAYS`. `last_contact_at IS NULL` ne
   * remonte JAMAIS : « jamais contacté » n'est pas « dormant » (même sémantique
   * que `availabilityToReconfirm`). Un consultant en poste (`kind = 'consultant'`)
   * et une fiche archivée sont hors du vivier à réveiller.
   */
  async dormantPool(workspaceId: string, days: number = DORMANT_POOL_DAYS): Promise<RoutineRead<DormantCandidate>> {
    return this.rows(
      `SELECT c.id, c.full_name,
              FLOOR(EXTRACT(EPOCH FROM (now() - c.last_contact_at)) / 86400)::int AS days
         FROM consultants c
        WHERE c.workspace_id = $1
          AND c.kind = 'candidate'
          AND c.archived_at IS NULL
          AND c.last_contact_at IS NOT NULL
          AND c.last_contact_at < now() - ($2 || ' days')::interval
        ORDER BY c.last_contact_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'dormantPool',
    )
  }

  /**
   * Une lecture qui dit CE QU'ELLE A PU FAIRE (D733, 30/08/2026) — le MÊME
   * défaut que celui corrigé sur `CrmRoutinesService.rows()` (D715), et donc
   * la MÊME solution, reprise à l'identique plutôt que réinventée : un échec
   * rendait `[]`, l'EXACTE même valeur qu'un vrai zéro, et « aucune
   * disponibilité à reconfirmer » ne se distinguait plus d'une requête qui
   * vient de casser. `measured: false` rétablit la différence sans changer CE
   * QUE CE `catch` PROTÈGE : il continue d'empêcher qu'une lecture cassée
   * fasse tomber toute une routine — il reste posé ICI, autour de la lecture,
   * jamais retiré. Ce qui change est ce que l'appelant reçoit à la place d'un
   * `[]` muet : de quoi DIRE l'échec plutôt que le taire.
   *
   * `label` identifie QUELLE lecture a cassé, pour que la trace serve à
   * quelque chose. L'erreur elle-même ne porte ni jeton ni e-mail ni secret :
   * c'est une exception SQL du driver Postgres, jamais une charge utile
   * applicative.
   */
  // ─────────────────────────────────────────────────────────────────────
  // #2843.1-.6 / #2102.45 (lot L13) — les lectures des routines qui manquaient
  // aux rôles. Même patron que `dormantPool` : une requête bornée à l'espace,
  // `measured: false` sur échec (« non mesuré » n'est jamais « aucun »,
  // GA-18/19), une mission ou un besoin PRIVÉ n'est jamais lu (il serait
  // annoncé à quelqu'un qui ne le voit pas). Aucune écriture.
  // ─────────────────────────────────────────────────────────────────────

  /** #2843.2 — entretiens des 48 prochaines heures dont l'issue n'est pas posée. */
  async interviewsUpcoming(workspaceId: string): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT i.id, c.full_name, s.id AS submission_id, i.scheduled_at
         FROM interviews i
         JOIN submissions s ON s.id = i.submission_id
         JOIN consultants c ON c.id = s.consultant_id
        WHERE i.workspace_id = $1
          AND i.outcome = 'pending'
          AND i.scheduled_at >= now()
          AND i.scheduled_at < now() + interval '48 hours'
        ORDER BY i.scheduled_at ASC
        LIMIT 20`,
      [workspaceId],
      'interviewsUpcoming',
    )
  }

  /** #2843.2 — entretiens passés (1 à 30 jours) sans issue ni retour client consigné. */
  async interviewsWithoutFeedback(workspaceId: string): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT i.id, c.full_name, s.id AS submission_id,
              FLOOR(EXTRACT(EPOCH FROM (now() - i.scheduled_at)) / 86400)::int AS days
         FROM interviews i
         JOIN submissions s ON s.id = i.submission_id
         JOIN consultants c ON c.id = s.consultant_id
        WHERE i.workspace_id = $1
          AND i.scheduled_at < now() - interval '1 day'
          AND i.scheduled_at >= now() - interval '30 days'
          AND (i.outcome = 'pending'
               OR NOT EXISTS (SELECT 1 FROM submission_feedback f WHERE f.submission_id = i.submission_id))
        ORDER BY i.scheduled_at ASC
        LIMIT 20`,
      [workspaceId],
      'interviewsWithoutFeedback',
    )
  }

  /** #2843.3 — missions en cours dont une affectation porte un risque DÉCLARÉ. */
  async missionsWithDeclaredRisks(workspaceId: string): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT DISTINCT ON (m.id) m.id, m.label, c.full_name
         FROM mission_assignments a
         JOIN missions m ON m.id = a.mission_id
         JOIN consultants c ON c.id = a.consultant_id
        WHERE m.workspace_id = $1
          AND NOT m.is_private
          AND m.status IN ('onboarding', 'active')
          AND a.declared_risks IS NOT NULL
          AND btrim(a.declared_risks) <> ''
        ORDER BY m.id
        LIMIT 20`,
      [workspaceId],
      'missionsWithDeclaredRisks',
    )
  }

  /** #2843.3 — besoins ouverts sans aucun mouvement (statut, candidature) depuis `days` jours. */
  async blockedNeeds(workspaceId: string, days = BLOCKED_NEED_DAYS): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT n.id, n.title,
              FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(n.status_changed_at, n.created_at))) / 86400)::int AS days
         FROM project_needs n
        WHERE n.workspace_id = $1
          AND NOT n.is_private
          AND n.status = 'open'
          AND COALESCE(n.status_changed_at, n.created_at) < now() - ($2 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM submissions s
             WHERE s.need_id = n.id AND s.stage_entered_at >= now() - ($2 || ' days')::interval
          )
        ORDER BY COALESCE(n.status_changed_at, n.created_at) ASC
        LIMIT 20`,
      [workspaceId, days],
      'blockedNeeds',
    )
  }

  /** #2843.4 — pièces de mission (contrat, avenant, NDA…) non signées depuis `days` jours. */
  async pendingMissionDocuments(workspaceId: string, days = PENDING_DOCUMENT_DAYS): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT d.id, d.name, d.mission_id, m.label,
              FLOOR(EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400)::int AS days
         FROM mission_documents d
         JOIN missions m ON m.id = d.mission_id
        WHERE d.workspace_id = $1
          AND NOT m.is_private
          AND m.status IN ('onboarding', 'active')
          AND d.status IN ('draft', 'sent', 'pending')
          AND d.updated_at < now() - ($2 || ' days')::interval
        ORDER BY d.updated_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'pendingMissionDocuments',
    )
  }

  /** #2843.4 — démarrages des `days` prochains jours sans contrat signé consigné. */
  async missionStartsWithoutSignedContract(
    workspaceId: string,
    days = START_DEADLINE_DAYS,
  ): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT m.id, m.label, (m.started_on::date - CURRENT_DATE)::int AS days
         FROM missions m
        WHERE m.workspace_id = $1
          AND NOT m.is_private
          AND m.status = 'onboarding'
          AND m.started_on IS NOT NULL
          AND m.started_on::date >= CURRENT_DATE
          AND m.started_on::date <= CURRENT_DATE + $2::int
          AND NOT EXISTS (
            SELECT 1 FROM mission_documents d
             WHERE d.mission_id = m.id AND d.kind = 'contract' AND d.status = 'signed'
          )
        ORDER BY m.started_on ASC
        LIMIT 20`,
      [workspaceId, days],
      'missionStartsWithoutSignedContract',
    )
  }

  /** #2843.6 — missions qui finissent dans `days` jours et dont le renouvellement n'est pas engagé. */
  async renewalsToEngage(workspaceId: string, days = RENEWAL_WINDOW_DAYS): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT m.id, m.label, (m.ends_on::date - CURRENT_DATE)::int AS days
         FROM missions m
        WHERE m.workspace_id = $1
          AND NOT m.is_private
          AND m.status = 'active'
          AND m.ends_on IS NOT NULL
          AND m.ends_on::date >= CURRENT_DATE
          AND m.ends_on::date <= CURRENT_DATE + $2::int
          AND (m.renewal_status IS NULL OR m.renewal_status = 'non_engage')
        ORDER BY m.ends_on ASC
        LIMIT 20`,
      [workspaceId, days],
      'renewalsToEngage',
    )
  }

  /** #2843.6 — consultants dont l'affectation finit dans `days` jours sans suite planifiée. */
  async consultantsToReposition(workspaceId: string, days = REPOSITIONING_WINDOW_DAYS): Promise<RoutineRead<L13Row>> {
    return this.rows(
      `SELECT c.id, c.full_name, (a.ends_on::date - CURRENT_DATE)::int AS days
         FROM mission_assignments a
         JOIN consultants c ON c.id = a.consultant_id
         JOIN missions m ON m.id = a.mission_id
        WHERE a.workspace_id = $1
          AND NOT m.is_private
          AND c.archived_at IS NULL
          AND a.status IN ('confirmed', 'active')
          AND a.ends_on IS NOT NULL
          AND a.ends_on::date >= CURRENT_DATE
          AND a.ends_on::date <= CURRENT_DATE + $2::int
          AND NOT EXISTS (
            SELECT 1 FROM mission_assignments n
             WHERE n.consultant_id = a.consultant_id
               AND n.id <> a.id
               AND n.status IN ('planned', 'confirmed', 'active')
               AND (n.ends_on IS NULL OR n.ends_on > a.ends_on)
          )
        ORDER BY a.ends_on ASC
        LIMIT 20`,
      [workspaceId, days],
      'consultantsToReposition',
    )
  }

  private async rows<T>(sql: string, params: unknown[], label: string): Promise<RoutineRead<T>> {
    try {
      const rows = await this.consultants.manager.query<T[]>(sql, params)
      return { measured: true, rows }
    } catch (error) {
      // Convention du dépôt : logger.error(...), jamais Sentry direct — le
      // transport capture automatiquement avec le correlation-id.
      this.logger.error(`Lecture de routine vivier en échec (${label})`, { error })
      return { measured: false, rows: [] }
    }
  }
}
