import type { FeedbackItem } from '@/lib/feedback'
import { ecranDe, grouperParEcran } from '../feedback.logic'

/**
 * #1673.3 — LE FILTRE « ÉCRAN CONCERNÉ » de `/feedback`, absent avant ce lot :
 * l'issue demandait un filtre par écran, et l'écran n'avait qu'un filtre
 * d'ÉTAT (ouvert/traité/tous).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE MODULE NE RECALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `grouperParEcran` (`feedback.logic.ts`) existait déjà pour la vue « Par
 * écran » : même normalisation de route (`ecranDe`), même tri par volume,
 * même règle « écran inconnu » en dernier quel que soit son volume. Refaire
 * ce regroupement ici produirait une SECONDE réponse à la même question — la
 * loi « une dérivation vit à un seul endroit » (GA-26). Ce fichier ADAPTE
 * seulement la forme au contrat de `FilterBar` (`key`/`label`/`count`).
 */

export const ECRAN_TOUS = 'tous'

/**
 * La clé d'URL pour « écran inconnu ». `grouperParEcran` rend `ecran: null`
 * pour ce cas — mais une valeur `null` ne s'écrit pas dans une URLSearchParams
 * (elle deviendrait la chaîne `"null"`, indistinguable d'un écran RÉEL nommé
 * ainsi). Un sentinel explicite lève l'ambiguïté.
 */
export const SENTINEL_ECRAN_INCONNU = '__inconnu__'

export type EcranFilterOption = { key: string; label: string; count: number }

/**
 * Les options du filtre, dans l'ordre où `FilterBar` doit les rendre :
 * « Tous » (compte TOTAL) d'abord, puis un pilule par écran dans l'ordre déjà
 * décidé par `grouperParEcran` (volume décroissant, « écran inconnu »
 * toujours en dernier).
 */
export function optionsFiltreEcran(items: readonly FeedbackItem[], labelTous: string): EcranFilterOption[] {
  const groupes = grouperParEcran(items)
  return [
    { key: ECRAN_TOUS, label: labelTous, count: items.length },
    ...groupes.map(g => ({ key: g.ecran ?? SENTINEL_ECRAN_INCONNU, label: g.libelle, count: g.items.length })),
  ]
}

/**
 * Un retour matche-t-il le filtre « écran » actif ? `tous` ne filtre rien —
 * c'est le défaut, jamais écrit dans l'URL (#1673.2).
 */
export function matchEcranFiltre(item: FeedbackItem, ecranFiltre: string): boolean {
  if (ecranFiltre === ECRAN_TOUS) return true
  return (ecranDe(item) ?? SENTINEL_ECRAN_INCONNU) === ecranFiltre
}
