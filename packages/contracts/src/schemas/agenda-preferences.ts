/**
 * #2101.17 — LES PRÉFÉRENCES D'AGENDA, RÉGLÉES PAR TOI (au-delà du seul temps
 * protégé).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS UN CHAMP DE PLUS SUR `protected-time.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * #2101 liste le temps protégé, les priorités ET les préférences comme trois
 * entrées SÉPARÉES de la routine. Le temps protégé (#2101.13) répond à « où
 * commence et finit ma journée » ; les priorités (#2101.14) restent hors
 * périmètre (aucun lien compte↔rendez-vous dans `agendaEventSchema`, cf.
 * commentaire du lot vague F sur #2770). Ce fichier répond à une AUTRE
 * question, que `agenda-compact.ts` tranchait jusqu'ici pour tout le monde de
 * la même façon avec deux constantes globales
 * (`AGENDA_CAPACITY_MINUTES_PER_DOSSIER`, `AGENDA_CAPACITY_RESERVE_SLOTS`) :
 * combien de temps CETTE personne a besoin pour ouvrir un dossier, et combien
 * de créneaux elle veut garder en réserve. Deux commerciaux ne travaillent pas
 * à la même vitesse ; le calcul de capacité (#2101.33-.35) le devinait pour
 * les deux de la même façon.
 *
 * Même sac `user_preferences` que `protected-time.ts` et `reply-preferences.ts`
 * — une clé de plus, aucune migration, aucun second chemin vers le calcul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME, ET CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque champ est INDÉPENDANT : régler l'un sans l'autre est valide, et une
 * lecture tolère un sac écrit par un appelant plus ancien qui n'en connaissait
 * qu'un (même discipline que `readReplyPreferences`). Un champ absent ou hors
 * bornes est ABSENT du résultat, jamais ramené à une valeur devinée — le défaut
 * vit au point de calcul (`agenda-compact.ts`), pour rester visible côté
 * appelant plutôt que caché ici.
 */
import { z } from 'zod'

export const agendaPreferencesSchema = z.object({
  /** Minutes qu'il faut à CETTE personne pour ouvrir un dossier. */
  dossierDurationMinutes: z.number().int().min(15).max(240),
  /** Créneaux que le calcul de capacité ne compte JAMAIS (#2101.35), réglé par la personne. */
  reserveSlots: z.number().int().min(0).max(10),
})
export type AgendaPreferences = z.infer<typeof agendaPreferencesSchema>

const dossierDurationMinutesSchema = agendaPreferencesSchema.shape.dossierDurationMinutes
const reserveSlotsSchema = agendaPreferencesSchema.shape.reserveSlots

export function isValidAgendaPreferences(value: unknown): value is AgendaPreferences {
  return agendaPreferencesSchema.safeParse(value).success
}

/**
 * Lecture TOLÉRANTE du sac, PAR CHAMP — un champ invalide n'invalide pas
 * l'autre, contrairement à `isValidAgendaPreferences` (utilisée à l'écriture
 * pour refuser un objet mal formé d'un bloc plutôt que de le stocker puis
 * l'ignorer en silence).
 */
export function readAgendaPreferences(bag: Record<string, unknown> | null | undefined): Partial<AgendaPreferences> {
  if (!bag || typeof bag !== 'object') return {}
  const value = bag.agendaPreferences
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  const out: Partial<AgendaPreferences> = {}
  const duration = dossierDurationMinutesSchema.safeParse(record.dossierDurationMinutes)
  if (duration.success) out.dossierDurationMinutes = duration.data
  const reserve = reserveSlotsSchema.safeParse(record.reserveSlots)
  if (reserve.success) out.reserveSlots = reserve.data
  return out
}
