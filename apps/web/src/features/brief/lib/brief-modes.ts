/**
 * #2125.29-.33 — le brief change de contenu selon le CONTEXTE du rendez-vous.
 * Cinq modes, fermés : ajouter un mode ici sans lui donner ses propres
 * `questions`/`objections` dans `brief.json` (FR + EN) le ferait retomber sur
 * la clé i18n manquante, affichée telle quelle à l'écran.
 */
export const BRIEF_MODES = ['first_meeting', 'client_checkin', 'partner', 'renewal', 'defense'] as const

export type BriefMode = (typeof BRIEF_MODES)[number]

export const DEFAULT_BRIEF_MODE: BriefMode = 'first_meeting'

export function isBriefMode(value: string): value is BriefMode {
  return (BRIEF_MODES as readonly string[]).includes(value)
}
