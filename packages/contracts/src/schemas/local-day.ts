/**
 * LA DATE CIVILE DE CELUI QUI REGARDE — une seule définition (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `date.toISOString().slice(0, 10)` est le raccourci naturel pour « la date au
 * format jour ». Il est FAUX partout à l'est de Greenwich : il rend la date de
 * l'instant en UTC, pas la date qu'affiche l'horloge. À Paris en heure d'été,
 * entre minuit et 02 h 00, l'instant UTC est encore la veille.
 *
 * Ce n'est pas une subtilité théorique : mesuré le 01/09/2026 à 00 h 06 CEST,
 * il produisait une échéance J+n rendue à J+n−1 (`matching.controller.ts`) et un
 * mois de période reculé d'un mois entier sur le semis de démonstration — le 1er
 * du mois, `setDate(1)` puis `toISOString()` renvoie le mois PRÉCÉDENT, donc
 * l'écran « Prêt à facturer » se serait vidé chaque nuit.
 *
 * ⚠️ Trois fichiers avaient déjà écrit la bonne réponse — et chacun l'avait
 * gardée PRIVÉE. La leçon est celle de GA-26 : une dérivation recopiée diverge,
 * et une dérivation cachée se réinvente de travers ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUAND NE PAS UTILISER CECI
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour COMPARER une chaîne `YYYY-MM-DD` déjà en base (`started_on`, `ends_on`),
 * les deux bords doivent être le même minuit UTC — `new Date('2026-09-01')`
 * s'analyse en minuit UTC par la spec. C'est ce que fait `startOfDay` dans
 * `staffing.ts`, et c'est un problème DIFFÉRENT : ici on FORMATE l'instant
 * présent, là on ANCRE une date déjà écrite.
 */

/** `YYYY-MM-DD` lu sur l'horloge locale. */
export function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `YYYY-MM` lu sur l'horloge locale. */
export function localMonthKey(date: Date): string {
  return localDayKey(date).slice(0, 7)
}

/**
 * La date civile locale décalée de `days` jours, au format jour.
 *
 * ⚠️ Le décalage passe par `setDate`, qui NORMALISE : `setDate(0)` recule au
 * dernier jour du mois précédent, `setDate(32)` avance sur le suivant. C'est
 * exactement ce qu'on veut, et c'est pourquoi on ne calcule pas en
 * millisecondes — 24 h ajoutées franchissent mal un changement d'heure.
 */
export function shiftLocalDays(from: Date, days: number): string {
  const shifted = new Date(from.getTime())
  shifted.setDate(shifted.getDate() + days)
  return localDayKey(shifted)
}
