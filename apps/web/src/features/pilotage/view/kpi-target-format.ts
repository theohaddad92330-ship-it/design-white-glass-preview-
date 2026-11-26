import type { KpiTarget } from '@bellum/contracts'

/**
 * La borne d'une cible, écrite avec son SENS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT SEULE, HORS DU COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux écrans l'appellent, et ils ne rendent pas la même chose : l'écran Finance
 * la met dans une pilule AVEC un verdict, le dictionnaire des indicateurs
 * l'affiche SANS — il ne porte aucune valeur, délibérément, et une pilule
 * colorée y comparerait la cible à un chiffre qui n'est pas là.
 *
 * Deux écrans qui écriraient chacun leur borne finiraient par écrire l'un
 * « ≤ 65 » et l'autre « 65 max » : la même cible, deux promesses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `< 65 j` et `> 85 %` se lisent dans deux directions opposées ; une pilule qui
 * afficherait « 65 j » tout court laisserait le lecteur deviner, et il
 * devinerait dans le sens qui l'arrange. Le SENS vient du contrat
 * (`target.direction`), jamais d'une convention d'écran.
 *
 * L'unité se colle au nombre par la TRADUCTION et pas ici : l'anglais écrit
 * « 65 days » là où le français écrit « 65 j », et l'espace insécable avant le
 * `%` est une règle typographique française que l'anglais n'a pas.
 */
export function formatKpiTarget(
  target: KpiTarget,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const unit = (value: number) => t(`target.units.${target.unit}`, { value })
  switch (target.direction) {
    case 'below':
      return t('target.below', { value: unit(target.bound) })
    case 'above':
      return t('target.above', { value: unit(target.bound) })
    case 'band':
      // `upperBound` est garanti non nul par le schéma sur une bande ; le repli
      // évite d'imprimer « 25 – null » si une cible arrivait d'ailleurs.
      return target.upperBound === null
        ? unit(target.bound)
        : t('target.band', { min: String(target.bound), max: unit(target.upperBound) })
    case 'zero':
      return t('target.zero')
  }
}
