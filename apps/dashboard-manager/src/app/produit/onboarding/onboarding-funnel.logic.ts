import { COHORT_MIN_SPACES } from '@/app/_components/charts.logic'
import { LANGUE_CONSOLE } from '@/lib/dates'
import type { CohorteEntonnoir } from './onboarding-funnel.client'

/**
 * #1686 — CE QUE L'ÉCRAN DE L'ENTONNOIR DÉCIDE, ET CE QU'IL NE DÉCIDE PAS.
 *
 * Il ne recalcule ni « mesurée / non mesurée » ni la médiane du délai — c'est
 * fait CÔTÉ API, où l'heure de la lecture est connue
 * (`apps/api/src/modules/analytics/onboarding-funnel.ts`). Il ne redéfinit pas
 * non plus le seuil d'anonymat : `COHORT_MIN_SPACES` (#1643) est RÉEXPORTÉ, pas
 * recopié — même règle que `retention.logic.ts` (#1658.1), pour la même
 * raison (GA-26).
 *
 * Ce qu'il ajoute : le MASQUAGE des petites cohortes (1686.1). L'API rend
 * TOUTES les cohortes, sans en cacher aucune — elle ne connaît pas la règle
 * d'affichage (même partage que la rétention). C'est ici qu'une cohorte de
 * moins de {@link COHORT_MIN_SPACES} espaces devient une ligne MASQUÉE,
 * nommée avec sa raison, plutôt qu'une ligne absente — une ligne
 * silencieusement absente se lirait « personne ne s'est inscrit ce mois-là ».
 */

export { COHORT_MIN_SPACES }

/** Une ligne de l'écran, telle qu'elle se rend. Exportée : #1642.2 lui donne
 *  un second consommateur (`_components/cohorts-table.tsx`, le tableau des
 *  cohortes AFFICHÉES sur `DataTable`) — deux lecteurs de la même forme, pas
 *  une recopie. */
export type LigneEntonnoir =
  | { etat: 'affichee'; cohorte: CohorteEntonnoir; libelle: string }
  | { etat: 'masquee'; cohorte: CohorteEntonnoir; libelle: string }

type VueEntonnoir = {
  lignes: LigneEntonnoir[]
  /** Combien de lignes sont montrées. */
  affichees: number
  /** Combien sont masquées. Zéro est ici un VRAI zéro : on a compté. */
  masquees: number
  /** Espaces retenus dans les cohortes masquées — l'opérateur sait ce qu'il ne
   *  voit pas, sans qu'aucun espace ne soit nommé (un compte ne désigne
   *  personne). */
  espacesMasques: number
}

/**
 * `2026-03` → `mars 2026`.
 *
 * ⚠️ Lu et rendu en **UTC** — un mois est un span du calendrier, pas un
 * instant. Même raison, mot pour mot, que `libelleCohorte` de la rétention
 * (#1658.1), dont l'API construit les étiquettes de la même façon.
 */
export function libelleCohorte(etiquette: string): string {
  if (!/^\d{4}-\d{2}$/.test(etiquette)) return etiquette
  const date = new Date(`${etiquette}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return etiquette
  return date.toLocaleDateString(LANGUE_CONSOLE, { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

/**
 * Une part d'espaces (0 → 1) en pourcentage, ZÉRO compris — un vrai zéro se
 * montre. `null` reste `null` : c'est à l'écran de dire « trop tôt » plutôt
 * qu'à ce formateur d'inventer un mot pour une valeur qu'il n'a pas.
 */
export function formaterPart(part: number | null): string | null {
  return part === null ? null : `${Math.round(part * 100)} %`
}

/** Un délai en jours, à la décimale près, en notation FR (virgule). `null`
 *  reste `null` — jamais « 0 j », qui dirait « immédiat » d'une absence de
 *  mesure. */
export function formaterDelai(medianJours: number | null): string | null {
  if (medianJours === null) return null
  return `${medianJours.toString().replace('.', ',')} j`
}

/**
 * La vue complète : chaque cohorte de l'API devient une ligne affichée ou
 * masquée, DANS L'ORDRE où l'API les rend (de la plus ancienne à la plus
 * récente).
 */
export function construireVueEntonnoir(cohortes: readonly CohorteEntonnoir[]): VueEntonnoir {
  const lignes: LigneEntonnoir[] = cohortes.map(cohorte => ({
    etat: cohorte.espaces < COHORT_MIN_SPACES ? 'masquee' : 'affichee',
    cohorte,
    libelle: libelleCohorte(cohorte.cohorte),
  }))

  const masquees = lignes.filter(ligne => ligne.etat === 'masquee')

  return {
    lignes,
    affichees: lignes.length - masquees.length,
    masquees: masquees.length,
    espacesMasques: masquees.reduce((somme, ligne) => somme + ligne.cohorte.espaces, 0),
  }
}
