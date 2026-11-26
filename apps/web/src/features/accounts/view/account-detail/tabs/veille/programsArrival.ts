/**
 * #3677 — l'arrivée par l'ancien lien `?tab=programs`, capturée au niveau de l'ÉCRAN.
 *
 * Cause racine (recette prod 10/10, Sanofi, `scrollY = 0`) : `SignalPrograms` ne se monte
 * qu'une fois le compte chargé et l'onglet « veille » affiché — donc APRÈS la réécriture
 * d'URL `?tab=programs` → `?tab=veille`. Sa lecture de l'URL à son propre montage ne voyait
 * plus jamais l'ancien lien (même piège que la notice de migration, #3720). L'écran
 * (`AccountDetailPage`) lit l'URL au tout premier rendu et dépose le verdict ici.
 */
let arrivedByProgramsLink = false

export function rememberProgramsArrival(value: boolean): void {
  arrivedByProgramsLink = value
}

export function arrivedByProgramsLinkAtScreenOpen(): boolean {
  return arrivedByProgramsLink
}
