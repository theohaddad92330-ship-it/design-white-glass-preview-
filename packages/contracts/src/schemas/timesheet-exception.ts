import { z } from 'zod'
import type { TimesheetStatus } from './mission.js'

/**
 * #2196.31 — « MARQUER NON APPLICABLE » UN RELEVÉ (décision Louis, 19/09/2026).
 *
 * `not_required` était entièrement DÉRIVÉ de la nature du contrat
 * (`expectsTimesheet`), recalculé à chaque lecture : un bouton qui l'aurait
 * écrit aurait été écrasé à la lecture suivante. Le geste est donc une
 * EXCEPTION TRACÉE, stockée à part (`mission_timesheet_exceptions`) :
 *
 *  - elle dit QUI, QUAND et POURQUOI — le motif est obligatoire, ici, dans le
 *    DTO, et en base (`mission_timesheet_exceptions_reason_check`) ;
 *  - elle PRIME sur la déduction du contrat pour CE mois-là, et pour cette
 *    maille (mission × consultant) seulement ;
 *  - elle est RÉVERSIBLE : « Annuler » la RÉVOQUE (date, auteur), la déduction
 *    reprend — et la ligne reste. On archive, on ne supprime pas ;
 *  - elle est visible au journal de la mission (l'historique du compte).
 */

/**
 * Les NATURES d'exception — une seule aujourd'hui. Miroir de
 * `mission_timesheet_exceptions_kind_check` : la contrainte SQL s'élargit AVANT
 * le code qui écrit une valeur neuve (GA-11/GA-12).
 */
export const TIMESHEET_EXCEPTION_KINDS = ['not_applicable'] as const

/**
 * Les statuts qu'une exception peut couvrir : ceux que la DÉDUCTION produit
 * (ou une ligne ouverte à vide par `openExpected`), jamais un relevé déposé.
 *
 * Un relevé brouillon, soumis, validé, contesté ou rejeté est un FAIT — le
 * cacher derrière « non applicable » ferait disparaître des jours déclarés de
 * la facturation sans que personne ne les ait refusés. `not_required` est déjà
 * la réponse : il n'y a rien à excepter.
 */
const NOT_APPLICABLE_ELIGIBLE: readonly TimesheetStatus[] = ['expected', 'missing', 'escalated']

/** Une exception « non applicable » peut-elle couvrir une ligne à ce statut ? */
export function canMarkTimesheetNotApplicable(status: TimesheetStatus): boolean {
  return NOT_APPLICABLE_ELIGIBLE.includes(status)
}

/**
 * Corps de `POST /delivery/timesheets/not-applicable`.
 *
 * La maille passe par le CORPS (mission × mois × consultant) et non par un
 * identifiant de relevé : un mois sans dépôt n'en a pas — c'est précisément le
 * mois qu'on marque. Bornes du motif : celles de `rejectTimesheetSchema`, un
 * réglage vit à un seul endroit.
 */
export const markTimesheetNotApplicableSchema = z
  .object({
    missionId: z.string().guid(),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    consultantId: z.string().guid().nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

/** Le corps de la pose — ce que l'écran envoie. */
export type MarkTimesheetNotApplicableInput = z.infer<typeof markTimesheetNotApplicableSchema>

/** L'exception ACTIVE d'une ligne, telle que l'écran la montre. */
export type TimesheetNotApplicable = {
  id: string
  reason: string
  markedAt: string
  /** Nom de la personne qui a marqué — son e-mail en repli, `null` si inconnue. */
  markedByName: string | null
}

/**
 * Les clés des lignes que la pose et l'annulation écrivent au JOURNAL de la
 * mission (l'historique du compte porteur), sous la forme système
 * `<contexte> — <clé>` (`timelineSystemSubject`). L'API les écrit, l'écran les
 * traduit : une seule liste, pour que les deux côtés ne divergent pas (GA-26).
 */
export const TIMESHEET_EXCEPTION_TIMELINE_KEYS = [
  'timesheet_not_applicable',
  'timesheet_not_applicable_revoked',
] as const
export type TimesheetExceptionTimelineKey = (typeof TIMESHEET_EXCEPTION_TIMELINE_KEYS)[number]
