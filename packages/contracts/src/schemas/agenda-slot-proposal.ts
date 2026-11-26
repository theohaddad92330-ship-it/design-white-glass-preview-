import { z } from 'zod'

/**
 * #2770 (#2101.19/.21/.22/.30/.37/.40) — LA PORTE D'ÉCRITURE D'UN CRÉNEAU
 * PROPOSÉ POUR UN COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS LE MOTEUR DE RECOMMANDATION COMPLET DE L'ÉPOPÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'épopée #2770 nomme un moteur qui écrit des suggestions sur TOUT l'agenda,
 * les distingue visuellement PARTOUT (`AgendaGrid`/`AgendaBoard`), et retient
 * un refus pour n'importe quelle proposition. Reconstruire cela en un lot
 * referait exactement ce qu'un précédent bilan a nommé « from scratch,
 * plusieurs jours ». Ce contrat porte la plus petite tranche RÉELLE : une
 * proposition pour UN compte précis, à la demande explicite du commercial
 * (jamais générée seule), prévisualisée puis écrite via une PORTE — même
 * principe que `outbound_write_request` côté CRM, sans dupliquer sa table.
 *
 * MISE À JOUR (28/09/2026) — la distinction visuelle (.19/.21/.22/.37) vit
 * maintenant AUSSI sur la grille/le plateau d'agenda partagés
 * (`AgendaGrid`/`AgendaBoard`), sans le round-trip `extendedProperties`
 * envisagé ci-dessus : `confirmSlotProposal` enregistre localement
 * (`agenda_bellum_created_event`, voir `bellumCreatedEventIdsResponseSchema`
 * plus bas) l'identifiant que le fournisseur a rendu, et le web croise cette
 * liste avec les évènements lus — jamais un second aller-retour fournisseur.
 */

export const agendaSlotProposalPreviewRequestSchema = z.object({
  accountId: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(240).default(60),
})
export type AgendaSlotProposalPreviewRequest = z.infer<typeof agendaSlotProposalPreviewRequestSchema>

/**
 * `suppressed` — #2101.40 : un refus posé AUJOURD'HUI pour ce compte. Le
 * calcul de créneau n'est même pas tenté : proposer quand même referait
 * exactement ce que le refus voulait arrêter.
 *
 * `no_slot` — aucun créneau assez long dans les dix jours ouvrés qui
 * suivent. Jamais un créneau deviné pour combler l'absence.
 *
 * `ready` — la prévisualisation FIGÉE : `confirm` écrit EXACTEMENT `slot`,
 * jamais un recalcul au clic. `consequence` est le seul fait direct et
 * mesurable de ce geste : combien de minutes de temps libre il consomme —
 * jamais une capacité recalculée en double d'`agenda-compact.ts` (GA-26).
 */
export type AgendaSlotProposalPreview =
  | { status: 'suppressed' }
  | { status: 'no_slot' }
  | { status: 'ready'; slot: { start: string; end: string }; consequence: { freeMinutesConsumed: number } }

export const agendaSlotProposalConfirmRequestSchema = z.object({
  accountId: z.string().min(1),
  /** Le titre EXACT que l'écran a montré — jamais recomposé côté serveur. */
  title: z.string().min(1).max(200),
  start: z.string().min(1),
  end: z.string().min(1),
})
export type AgendaSlotProposalConfirmRequest = z.infer<typeof agendaSlotProposalConfirmRequestSchema>

export const agendaSlotProposalRejectRequestSchema = z.object({
  accountId: z.string().min(1),
})
export type AgendaSlotProposalRejectRequest = z.infer<typeof agendaSlotProposalRejectRequestSchema>

/**
 * #2101.40 — UN REFUS, DANS LE MÊME SAC `user_preferences` QUE
 * `protected-time.ts`/`agenda-preferences.ts` (clé `agendaSlotRejections`) :
 * aucune migration, aucun second chemin d'écriture.
 */
export const agendaSlotRejectionSchema = z.object({
  accountId: z.string(),
  /** Jour du refus, `YYYY-MM-DD`, calendrier UTC — la même granularité que la
   *  mémoire, jamais une heure précise qu'on ne rejouerait pas de la même façon. */
  date: z.string(),
})
export type AgendaSlotRejection = z.infer<typeof agendaSlotRejectionSchema>

/** Bornée : un refus vieux de plusieurs mois ne sert plus à rien, et un sac
 *  non borné grossirait sans fin pour un commercial actif depuis des années. */
const MAX_REJECTIONS_KEPT = 200

/**
 * Lecture TOLÉRANTE du sac, comme `readAgendaPreferences`/`readProtectedTime` :
 * une entrée corrompue est simplement écartée, elle n'invalide pas les autres.
 */
export function readAgendaSlotRejections(bag: Record<string, unknown> | null | undefined): AgendaSlotRejection[] {
  if (!bag || typeof bag !== 'object') return []
  const value = (bag as Record<string, unknown>).agendaSlotRejections
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    const parsed = agendaSlotRejectionSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

export function wasSlotRejectedToday(
  rejections: readonly AgendaSlotRejection[],
  accountId: string,
  today: string,
): boolean {
  return rejections.some(rejection => rejection.accountId === accountId && rejection.date === today)
}

/** Ajoute un refus — jamais deux fois le même (compte, jour), et borné. */
export function withAgendaSlotRejection(
  rejections: readonly AgendaSlotRejection[],
  accountId: string,
  today: string,
): AgendaSlotRejection[] {
  const deduped = rejections.filter(rejection => !(rejection.accountId === accountId && rejection.date === today))
  return [...deduped, { accountId, date: today }].slice(-MAX_REJECTIONS_KEPT)
}

/**
 * #2770 (#2101.14) — UN COMPTE classé pour choisir à qui proposer un créneau
 * en premier. `priorityScore` n'est jamais absent ici : `BriefingService.
 * topAccountsForSlotProposal` exclut déjà les comptes sans score mesuré
 * avant de rendre cette liste (GA-18/19 — un compte non mesuré n'est jamais
 * classé, pas même dernier).
 */
export const slotProposalPriorityAccountSchema = z.object({
  accountId: z.string(),
  companyName: z.string(),
  priorityScore: z.number(),
})
export type SlotProposalPriorityAccount = z.infer<typeof slotProposalPriorityAccountSchema>

/**
 * #2770 (#2101.19/.21/.22/.37) — les identifiants d'évènements agenda ÉCRITS
 * par `confirmSlotProposal`, dans la fenêtre demandée. Jamais un second
 * calcul de capacité ou de statut : juste la liste que la grille/le plateau
 * croisent avec `event.id` pour poser `AgendaEvent.createdByBellum`.
 */
export const bellumCreatedEventIdsResponseSchema = z.object({
  eventIds: z.array(z.string()),
})
export type BellumCreatedEventIdsResponse = z.infer<typeof bellumCreatedEventIdsResponseSchema>
