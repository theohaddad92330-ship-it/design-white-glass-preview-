import type { CohortesDUsage, MesureDeTaux } from '@/lib/manager-kpi'

/**
 * #1946.14 — « Instrumenter : usage J+7 et J+30 », côté écran.
 *
 * Ce que ce fichier calcule, séparé de ce qu'il rend. Tout est pur : aucune
 * horloge, aucune requête, aucun seuil recopié — `required` arrive dans la
 * charge utile, il n'est jamais réécrit ici (un seuil qui vivrait des deux
 * côtés divergerait au premier changement).
 *
 * ⚠️ L'UNITÉ D'ANALYSE. Ces deux taux comptent des INSCRITS dans une cohorte,
 * jamais quelqu'un : ils ne nomment ni un utilisateur, ni un espace client. Ils
 * ne se lisent pas non plus comme la grille de cohortes qui les surplombe —
 * celle-ci suit des ESPACES par mois de vie, ceux-ci suivent des inscriptions à
 * deux repères fixes. Deux grandeurs, deux phrases, jamais un seul chiffre.
 */

/** Les deux repères, dans l'ordre où l'issue les écrit. */
export const REPERES_DUSAGE: ReadonlyArray<{
  readonly cle: keyof CohortesDUsage
  readonly titre: string
  readonly aide: string
}> = [
  {
    cle: 'activeCohortAtDay7',
    titre: 'Usage à J+7',
    aide: 'Part des inscrits d’il y a 7 à 13 jours qui ont agi dans les 7 derniers jours — le geste de l’inscription elle-même ne compte pas.',
  },
  {
    cle: 'activeCohortAtDay30',
    titre: 'Usage à J+30',
    aide: 'Part des inscrits d’il y a 30 à 36 jours qui ont agi dans les 14 derniers jours.',
  },
] as const

/** Ce qu'une tuile affiche. Local : c'est le retour de `libelleCohorteDUsage`,
 *  que les appelants lisent par inférence (knip). */
type LibelleDUsage = { valeur: string; pied: string }

/**
 * Le taux, ou la raison de son absence — jamais « 0 % » à la place.
 *
 * Trois absences, et elles ne disent pas la même chose : `null` en entrée =
 * l'indicateur n'a pas pu être LU (panne de route) ; une cohorte vide = personne
 * n'est arrivé dans la fenêtre ; une cohorte trop petite = le taux désignerait
 * ses membres. Les confondre écrirait une panne en fait de marché.
 */
export function libelleCohorteDUsage(mesure: MesureDeTaux | null | undefined): LibelleDUsage {
  if (!mesure) return { valeur: 'non lu', pied: 'indicateur indisponible' }
  const { value, measurability } = mesure
  if (value === null || !measurability.measurable) {
    return {
      valeur: 'non mesuré',
      pied:
        measurability.observed === 0
          ? 'aucun inscrit dans la fenêtre'
          : `${measurability.observed} inscrits sur ${measurability.required} nécessaires`,
    }
  }
  return { valeur: `${Math.round(value * 100)} %`, pied: `sur ${measurability.observed} inscrits` }
}
