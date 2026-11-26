/**
 * #2101.13/.14/.17 — LE TEMPS PROTÉGÉ, RÉGLÉ PAR TOI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ ÇA VIT, ET POURQUOI PAS AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même sac `user_preferences` que les réglages de réponse de Laura
 * (`reply-preferences.ts`) — une rangée par personne, JSONB, aucune migration :
 * une clé de plus n'ouvre ni table ni second chemin. `agenda-compact.ts`
 * (web) le documentait déjà comme la question non tranchée qui l'empêchait de
 * compter les créneaux libres avant le premier rendez-vous ou après le
 * dernier : « ce réglage — le temps protégé — n'existe pas encore dans le
 * produit ». Il existe maintenant, comme un CHOIX explicite de la personne,
 * jamais une heure devinée (« 9 h - 18 h » n'est écrit nulle part ici).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME, ET CE QU'ELLE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux minutes depuis minuit, `startMinute < endMinute`, toutes deux dans une
 * même journée (`0 ≤ start`, `end ≤ 1440`) : pas de fenêtre qui traverse
 * minuit, ni de borne à zéro largeur — une personne qui règle 9 h = 9 h n'a
 * rien protégé, `isValidProtectedTime` le refuse à l'écriture.
 */
import { z } from 'zod'

export const protectedTimeSchema = z
  .object({
    /** Minutes depuis minuit — 540 = 9 h 00. */
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine(({ startMinute, endMinute }) => endMinute > startMinute, {
    message: 'endMinute doit être strictement après startMinute',
  })
export type ProtectedTime = z.infer<typeof protectedTimeSchema>

export function isValidProtectedTime(value: unknown): value is ProtectedTime {
  return protectedTimeSchema.safeParse(value).success
}

/**
 * Lecture TOLÉRANTE du sac — même discipline que `readReplyPreferences` :
 * absent ou invalide (écrit par un appelant d'avant la validation, ou
 * corrompu) rend `null`, jamais une fenêtre devinée.
 */
export function readProtectedTime(bag: Record<string, unknown> | null | undefined): ProtectedTime | null {
  if (!bag || typeof bag !== 'object') return null
  const value = bag.protectedTime
  return isValidProtectedTime(value) ? value : null
}

/**
 * #2770.27 — les HEURES DE TRAVAIL que le plan de Laura respecte : la fenêtre de
 * temps protégé de la personne, ramenée aux heures pleines que le calcul de
 * créneaux libres attend (`workdayStartHour`/`workdayEndHour`). Arrondi vers
 * l'INTÉRIEUR (début au plus tôt à l'heure suivante, fin à l'heure précédente) :
 * un créneau proposé ne déborde jamais du temps réglé. Pas d'heure pleine à
 * l'intérieur, ou pas de réglage → `null`, jamais une fenêtre devinée.
 */
export function protectedTimeWorkdayHours(
  value: ProtectedTime | null | undefined,
): { workdayStartHour: number; workdayEndHour: number } | null {
  if (!value) return null
  const workdayStartHour = Math.ceil(value.startMinute / 60)
  const workdayEndHour = Math.floor(value.endMinute / 60)
  if (workdayStartHour > 23 || workdayEndHour <= workdayStartHour) return null
  return { workdayStartHour, workdayEndHour }
}
