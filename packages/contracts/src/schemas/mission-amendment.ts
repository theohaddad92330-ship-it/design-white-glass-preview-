import { z } from 'zod'
import type { StatusMove } from './status-transitions.js'

/**
 * #2423 — LAU-FINAL-137 : les CHANGEMENTS d'une mission (TJM, société, site,
 * pause…), effective-dated, jamais réécrits rétroactivement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER LIVRE, ET CE QU'IL NE LIVRE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le VOCABULAIRE (seize types d'événements, cinq statuts, quatre causes de
 * pause — #2423.2/.5/.7) et la table STRICTE des transitions de statut
 * (#2423.5). Chaque avenant PROPOSÉ est un enregistrement immuable : sa date
 * d'effet, sa preuve et ses termes ne changent JAMAIS après création — seul
 * son STATUT évolue (#2423.1, « historique des termes précédents conservé »,
 * par construction plutôt que par garde).
 *
 * NE livre PAS : la simulation d'impact chiffré (#2423.6, ÉCRAN — calculateurs
 * revenu/marge/forecast/facturation/PO), la cascade qui crée réellement une
 * nouvelle `mission_assignments` sur `consultant_replacement` (#2423.8), le
 * wording Laura « préparé jamais accepté » (#2423.9, `apps/ia`), et
 * l'application effective d'un avenant ACTIF aux champs vivants de la mission.
 * Ce sont des tranches distinctes, laissées `retenu` — voir le registre.
 */

// ── Le vocabulaire ───────────────────────────────────────────────────────────

/** Les seize types d'événements de changement qu'une mission peut subir. */
export const MISSION_AMENDMENT_EVENT_TYPES = [
  /** Le TJM change (D2423.4 : n'affecte jamais les CRA déjà produits — cf. `mission_rate_history`). */
  'daily_rate_change',
  /** La société qui facture change (D9). */
  'legal_entity_change',
  /** Le lieu d'exécution change. */
  'work_site_change',
  /** La politique de télétravail change. */
  'remote_policy_change',
  /** Une pause commence — porte `pauseCause` (#2423.7). */
  'pause_start',
  /** La pause se termine, la mission reprend. */
  'pause_end',
  /** La date de fin change (prolongation ou raccourcissement). */
  'end_date_change',
  /** La date de début change, avant démarrage. */
  'start_date_change',
  /** La nature du contrat change (régie/forfait/…). */
  'contract_kind_change',
  /** L'intitulé du rôle change. */
  'role_title_change',
  /** Le contact de facturation change. */
  'billing_contact_change',
  /** Les conditions du bon de commande changent (montant, volume, validité). */
  'po_terms_change',
  /** Un consultant remplace un autre — crée une NOUVELLE affectation (#2423.8), jamais une identité réécrite. */
  'consultant_replacement',
  /** Le périmètre de la mission change. */
  'scope_change',
  /** Les conditions de renouvellement changent. */
  'renewal_terms_change',
  /** Un préavis de fin est posé. */
  'termination_notice',
] as const
export const missionAmendmentEventTypeSchema = z.enum(MISSION_AMENDMENT_EVENT_TYPES)
export type MissionAmendmentEventType = z.infer<typeof missionAmendmentEventTypeSchema>

/** Les cinq statuts d'un avenant — proposé/accepté/actif/rejeté/annulé. */
export const MISSION_AMENDMENT_STATUSES = ['proposed', 'accepted', 'active', 'rejected', 'cancelled'] as const
export const missionAmendmentStatusSchema = z.enum(MISSION_AMENDMENT_STATUSES)
export type MissionAmendmentStatus = z.infer<typeof missionAmendmentStatusSchema>

/**
 * Les quatre causes de pause distinguées explicitement (#2423.7). N'existe
 * que sur un avenant `pause_start` — une mission qui n'a jamais fait de
 * pause n'en porte aucune.
 */
export const MISSION_PAUSE_CAUSES = [
  /** La mission elle-même est mise en pause (ex : entre deux jalons de forfait). */
  'mission_pause',
  /** Le consultant est absent (congé, arrêt). */
  'consultant_absence',
  /** Le client est fermé (congés collectifs, fermeture annuelle). */
  'client_closure',
  /** Jours non facturables déclarés sans que la mission ni le consultant ne s'arrêtent. */
  'non_billable_days',
] as const
export const missionPauseCauseSchema = z.enum(MISSION_PAUSE_CAUSES)
export type MissionPauseCause = z.infer<typeof missionPauseCauseSchema>

// ── La table STRICTE des transitions (#2423.5) ──────────────────────────────

const AMENDMENT_FORWARD: Readonly<Record<MissionAmendmentStatus, readonly MissionAmendmentStatus[]>> = {
  proposed: ['accepted', 'rejected', 'cancelled'],
  accepted: ['active', 'cancelled'],
  active: [],
  rejected: [],
  cancelled: [],
}

/**
 * Volontairement plus simple que `missionStatusMove`/`assignmentStatusMove` :
 * un avenant n'a pas de retour arrière (on ne "dé-rejette" pas un avenant,
 * on en propose un nouveau — #2423.1, l'historique ne se réécrit pas). Tout
 * ce qui n'est pas listé EN AVANT est `refused`, jamais deviné `backward`.
 */
export function missionAmendmentStatusMove(from: MissionAmendmentStatus, to: MissionAmendmentStatus): StatusMove {
  if (from === to) return 'same'
  if (AMENDMENT_FORWARD[from]?.includes(to)) return 'forward'
  return 'refused'
}

// ── La proposition (#2423.3 : date d'effet, preuve, ancien/nouveau terme) ──

/**
 * Le corps d'une PROPOSITION d'avenant. `previousTerm`/`newTerm` restent
 * libres (`Record<string, unknown>`) : seize types d'événements ne partagent
 * pas la même forme de terme (un TJM est un nombre, une pause n'a pas de
 * "terme" au sens strict) — leur figer une forme commune en aurait perdu la
 * moitié.
 */
export const proposeMissionAmendmentSchema = z
  .object({
    eventType: missionAmendmentEventTypeSchema,
    /** AAAA-MM-JJ — jamais devinée depuis "aujourd'hui". */
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’effet au format AAAA-MM-JJ'),
    /** Aucun changement ne se propose sans preuve (email, avenant signé, ticket client…). */
    proof: z.string().trim().min(1).max(2000),
    previousTerm: z.record(z.string(), z.unknown()).nullable().optional(),
    newTerm: z.record(z.string(), z.unknown()).nullable().optional(),
    /** Exigée seulement pour `pause_start` — validée par l'appelant (#2423.7). */
    pauseCause: missionPauseCauseSchema.optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict()
export type ProposeMissionAmendmentInput = z.infer<typeof proposeMissionAmendmentSchema>

/** Le corps d'un changement de STATUT d'avenant. */
export const missionAmendmentStatusChangeSchema = z
  .object({
    to: missionAmendmentStatusSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
export type MissionAmendmentStatusChangeInput = z.infer<typeof missionAmendmentStatusChangeSchema>

/**
 * La vue rendue par l'API — au moins dix attributs nommés (#2423.3), jamais
 * moins : `id`, `missionId`, `eventType`, `status`, `effectiveFrom`, `proof`,
 * `previousTerm`, `newTerm`, `requestedBy`, `requestedAt`, `approvedBy`,
 * `approvedAt`.
 */
export type MissionAmendmentView = {
  id: string
  missionId: string
  eventType: MissionAmendmentEventType
  status: MissionAmendmentStatus
  effectiveFrom: string
  proof: string
  previousTerm: Record<string, unknown> | null
  newTerm: Record<string, unknown> | null
  pauseCause: MissionPauseCause | null
  note: string | null
  requestedBy: string
  requestedAt: string
  approvedBy: string | null
  approvedAt: string | null
}
