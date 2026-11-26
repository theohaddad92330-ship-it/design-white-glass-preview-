import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PLAYBOOK_DRY_RUN_LIMIT, type PlaybookKey } from '@bellum/contracts'
import { PlaybookSubscriptionEntity } from '../../database/entities/playbook-subscription.entity'
import { playbookMessage, type PlaybookLanguage } from './playbook-message'

/**
 * QUI un playbook viserait — la moitié qui manquait entre l'écran et l'envoi.
 *
 * Une seule source de cibles pour les DEUX usages : la simulation (lecture
 * seule, écran) et le balayage (envoi réel). C'est délibéré. Deux requêtes qui
 * répondent séparément à « qui serait relancé ? » finiraient par diverger, et la
 * divergence se verrait au pire endroit : une simulation rassurante suivie
 * d'envois qu'elle n'avait pas montrés.
 *
 * Trois décisions de modélisation, chacune contre un envoi injustifié :
 *
 *  1. **Le silence se mesure sur ce que NOUS avons dit en dernier**, pas sur la
 *     date de création de l'objet. Un projet ouvert il y a six mois et discuté
 *     hier n'est pas silencieux depuis six mois.
 *  2. **Un silence inconnu ne relance pas.** Un espace qui ne capture aucune
 *     activité rend `null` partout, et le garde-fou refuse. C'est le bon sens :
 *     sans trace de ce qu'on a dit, on ne peut pas savoir qu'on attend.
 *  3. **Une réponse ferme la séquence**, et « réponse » veut dire une activité
 *     ENTRANTE postérieure à notre dernier message — ou, pour un renouvellement,
 *     l'existence d'une mission qui prend la suite. Une activité `internal`
 *     (réunion de préparation) n'est pas une réponse du client.
 */

/** Une cible, prête à être jugée puis, éventuellement, écrite. */
export type PlaybookTarget = {
  /** L'objet visé — c'est la clé d'idempotence de `playbook_sends`. */
  targetId: string
  workspaceId: string
  /** Le propriétaire : c'est SA messagerie qui enverra, et sa signature. */
  ownerId: string | null
  recipient: string | null
  /** De quoi il s'agit, en clair, pour l'écran de simulation. */
  label: string
  /** Jours écoulés depuis notre dernier message. `null` = inconnu. */
  silenceDays: number | null
  hasReply: boolean
  subject: string
  body: string
}

/** Les colonnes que les trois requêtes rendent, sous une forme commune. */
type TargetRow = {
  target_id: string
  workspace_id: string
  owner_id: string | null
  recipient: string | null
  contact_first_name: string | null
  consultant_name: string | null
  account_name: string | null
  subject_label: string | null
  ends_on: string | null
  silence_days: string | number | null
  has_reply: boolean
  language: string | null
}

/**
 * Un contact JOIGNABLE : une adresse, et personne qu'on a écarté.
 *
 * Les trois exclusions ne sont pas décoratives. Écrire à un contact supprimé,
 * masqué ou anonymisé serait au mieux embarrassant, au pire une violation de la
 * demande d'effacement qu'on venait d'honorer — et c'est le seul chemin du
 * produit où personne ne relit avant l'envoi.
 */
const CONTACTABLE = `ct.email IS NOT NULL AND ct.email <> ''
     AND ct.deleted_at IS NULL AND ct.hidden = false AND ct.anonymized_at IS NULL`

/**
 * Le contact à qui écrire, pour un projet donné.
 *
 * UNE seule adresse, jamais toute la liste : une relance automatique envoyée à
 * cinq personnes d'un même compte est un envoi de masse, et c'est exactement ce
 * que les garde-fous cherchent à empêcher. On prend le contact du projet le plus
 * récemment rattaché — c'est celui avec qui la conversation a le plus de chances
 * d'être en cours.
 *
 * Rendu comme une sous-requête SCALAIRE (une colonne, un appel par colonne
 * voulue) et non comme une table dérivée : Postgres refuse qu'une table dérivée
 * référence une colonne de la requête englobante (`p.id` ici) sans `LATERAL`.
 * La version « propre » qui factorisait les deux colonnes en un seul
 * `FROM (…) r` était donc invalide, et ne se voyait qu'à l'exécution.
 */
const projectRecipient = (column: string) => `
  SELECT ${column}
    FROM project_contacts pc
    JOIN contacts ct ON ct.id = pc.contact_id
   WHERE pc.project_id = p.id
     AND ${CONTACTABLE}
   ORDER BY pc.created_at DESC
   LIMIT 1`

/** Idem, mais pour un compte : la mission ne porte pas de contact. */
const accountRecipient = (column: string) => `
  SELECT ${column}
    FROM contacts ct
   WHERE ct.account_id = m.account_id
     AND ${CONTACTABLE}
   ORDER BY ct.created_at DESC
   LIMIT 1`

/** Le prénom, tiré du nom complet — la seule forme que porte `contacts`. */
const FIRST_NAME = "split_part(ct.full_name, ' ', 1)"

@Injectable()
export class PlaybookTargetsService {
  constructor(
    @InjectRepository(PlaybookSubscriptionEntity)
    private readonly subscriptions: Repository<PlaybookSubscriptionEntity>,
  ) {}

  /**
   * Les cibles d'un playbook.
   *
   * `workspaceId` à `null` balaye TOUS les espaces (le cron) ; renseigné, il
   * n'en regarde qu'un (la simulation). Les espaces de démonstration sont exclus
   * dans les deux cas — une salle traversée par des inconnus ne doit jamais voir
   * partir un e-mail, ni même en voir un dans une simulation.
   */
  async collect(
    playbook: PlaybookKey,
    workspaceId: string | null,
    limit = PLAYBOOK_DRY_RUN_LIMIT,
  ): Promise<PlaybookTarget[]> {
    const rows = await this.query(playbook, workspaceId, limit)
    return rows.map(row => this.toTarget(playbook, row))
  }

  private query(playbook: PlaybookKey, workspaceId: string | null, limit: number): Promise<TargetRow[]> {
    switch (playbook) {
      case 'submission_no_reply':
        return this.submissions(workspaceId, limit)
      case 'mission_renewal':
        return this.renewals(workspaceId, limit)
      case 'proposal_no_reply':
        return this.proposals(workspaceId, limit)
    }
  }

  private run(sql: string, params: unknown[]): Promise<TargetRow[]> {
    return this.subscriptions.manager.query<TargetRow[]>(sql, params)
  }

  /**
   * Un CV parti, aucun retour.
   *
   * Le silence se compte depuis `submitted_at` et non depuis la création : la
   * sélection interne d'un profil n'est pas du temps d'attente client.
   */
  private submissions(workspaceId: string | null, limit: number) {
    return this.run(
      `SELECT s.id AS target_id,
              s.workspace_id,
              s.owner_id,
              (${projectRecipient('ct.email')}) AS recipient,
              (${projectRecipient(FIRST_NAME)}) AS contact_first_name,
              c.full_name AS consultant_name,
              a.company_name AS account_name,
              NULL::text AS subject_label,
              NULL::text AS ends_on,
              floor(extract(epoch FROM (now() - s.submitted_at)) / 86400)::int AS silence_days,
              (s.first_feedback_at IS NOT NULL) AS has_reply,
              np.email_language AS language
         FROM submissions s
         JOIN workspaces w ON w.id = s.workspace_id AND w.is_demo = false
         LEFT JOIN consultants c ON c.id = s.consultant_id
         LEFT JOIN opportunities p ON p.id = s.project_id
         LEFT JOIN accounts a ON a.id = p.account_id
         LEFT JOIN notification_preferences np ON np.user_id = s.owner_id
        WHERE s.closed_at IS NULL
          AND s.submitted_at IS NOT NULL
          AND ($1::uuid IS NULL OR s.workspace_id = $1::uuid)
        ORDER BY s.submitted_at ASC
        LIMIT $2`,
      [workspaceId, limit],
    )
  }

  /**
   * Une mission qui se termine, sans suite ouverte.
   *
   * « Une suite est ouverte » = une AUTRE mission du même compte démarre après
   * la fin de celle-ci. Volontairement littéral, comme dans la file
   * d'intervention : c'est ce que les données savent dire avec certitude.
   */
  private renewals(workspaceId: string | null, limit: number) {
    return this.run(
      `SELECT m.id AS target_id,
              m.workspace_id,
              m.user_id AS owner_id,
              (${accountRecipient('ct.email')}) AS recipient,
              (${accountRecipient(FIRST_NAME)}) AS contact_first_name,
              NULL::text AS consultant_name,
              a.company_name AS account_name,
              m.label AS subject_label,
              m.ends_on::text AS ends_on,
              (SELECT floor(extract(epoch FROM (now() - max(act.occurred_at))) / 86400)::int
                 FROM activities act
                WHERE act.account_id = m.account_id AND act.direction = 'outbound') AS silence_days,
              (EXISTS (
                SELECT 1 FROM missions n
                 WHERE n.account_id = m.account_id
                   AND n.id <> m.id
                   AND n.started_on IS NOT NULL
                   AND n.started_on >= m.ends_on
              ) OR EXISTS (
                SELECT 1 FROM activities act
                 WHERE act.account_id = m.account_id
                   AND act.direction = 'inbound'
                   AND act.occurred_at > COALESCE(
                     (SELECT max(o.occurred_at) FROM activities o
                       WHERE o.account_id = m.account_id AND o.direction = 'outbound'),
                     to_timestamp(0))
              )) AS has_reply,
              np.email_language AS language
         FROM missions m
         JOIN workspaces w ON w.id = m.workspace_id AND w.is_demo = false
         LEFT JOIN accounts a ON a.id = m.account_id
         LEFT JOIN notification_preferences np ON np.user_id = m.user_id
        WHERE m.status IN ('active', 'onboarding', 'paused')
          AND m.ends_on IS NOT NULL
          AND m.ends_on <= (now() + interval '30 days')::date
          AND ($1::uuid IS NULL OR m.workspace_id = $1::uuid)
        ORDER BY m.ends_on ASC
        LIMIT $2`,
      [workspaceId, limit],
    )
  }

  /** Une proposition en négociation, restée sans réponse. */
  private proposals(workspaceId: string | null, limit: number) {
    return this.run(
      `SELECT p.id AS target_id,
              p.workspace_id,
              p.owner_id,
              (${projectRecipient('ct.email')}) AS recipient,
              (${projectRecipient(FIRST_NAME)}) AS contact_first_name,
              NULL::text AS consultant_name,
              a.company_name AS account_name,
              p.label AS subject_label,
              NULL::text AS ends_on,
              (SELECT floor(extract(epoch FROM (now() - max(act.occurred_at))) / 86400)::int
                 FROM activities act
                WHERE act.project_id = p.id AND act.direction = 'outbound') AS silence_days,
              EXISTS (
                SELECT 1 FROM activities act
                 WHERE act.project_id = p.id
                   AND act.direction = 'inbound'
                   AND act.occurred_at > COALESCE(
                     (SELECT max(o.occurred_at) FROM activities o
                       WHERE o.project_id = p.id AND o.direction = 'outbound'),
                     to_timestamp(0))
              ) AS has_reply,
              np.email_language AS language
         FROM opportunities p
         JOIN workspaces w ON w.id = p.workspace_id AND w.is_demo = false
         LEFT JOIN accounts a ON a.id = p.account_id
         LEFT JOIN notification_preferences np ON np.user_id = p.owner_id
        WHERE p.stage = 'negotiation'
          AND p.closed_at IS NULL
          AND ($1::uuid IS NULL OR p.workspace_id = $1::uuid)
        ORDER BY p.updated_at ASC
        LIMIT $2`,
      [workspaceId, limit],
    )
  }

  /** Assemble la cible et SON message. Le texte est composé ici pour que la
   *  simulation montre exactement ce que l'envoi enverra. */
  private toTarget(playbook: PlaybookKey, row: TargetRow): PlaybookTarget {
    const language: PlaybookLanguage = row.language === 'en' ? 'en' : 'fr'
    const silenceDays = row.silence_days === null ? null : Number(row.silence_days)
    const message = playbookMessage(
      playbook,
      {
        contactFirstName: row.contact_first_name,
        consultantName: row.consultant_name,
        accountName: row.account_name,
        subjectLabel: row.subject_label,
        silenceDays,
        endsOn: row.ends_on,
      },
      language,
    )
    return {
      targetId: row.target_id,
      workspaceId: row.workspace_id,
      ownerId: row.owner_id,
      recipient: row.recipient,
      label: buildLabel(row),
      silenceDays: Number.isFinite(silenceDays as number) ? silenceDays : null,
      hasReply: Boolean(row.has_reply),
      subject: message.subject,
      body: message.body,
    }
  }
}

/**
 * L'intitulé lisible d'une cible — « Marie Dupont chez ACME ».
 *
 * Exporté pour être testé : c'est la seule chaîne que l'utilisateur lit pour
 * décider s'il arme, et un intitulé vide rendrait la simulation inutilisable.
 */
export function buildLabel(row: Pick<TargetRow, 'consultant_name' | 'subject_label' | 'account_name'>): string {
  const what = row.consultant_name?.trim() || row.subject_label?.trim() || null
  const where = row.account_name?.trim() || null
  if (what && where) return `${what} — ${where}`
  // Un intitulé inconnu le DIT. Rendre une chaîne vide ferait passer une ligne
  // pour un défaut d'affichage alors que c'est une donnée manquante.
  return what || where || 'Cible sans intitulé'
}
