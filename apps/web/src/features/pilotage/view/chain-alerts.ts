import type { PilotageLevelReport } from '@bellum/contracts'

/**
 * Les deux bouts du chemin entre le compteur « 3 alertes » et les maillons
 * qu'il compte (#1128).
 *
 * Ils vivent dans le MÊME module — pas parce que c'est joli, mais parce qu'une
 * clé d'ancre recopiée d'un côté se décale de l'autre sans que rien ne
 * rougisse : le compteur mènerait alors vers un identifiant que plus personne
 * ne pose, et le bouton redeviendrait ce qu'il était, une pastille inerte.
 */

/** L'ancre d'un maillon de la chaîne — la destination du compteur d'alertes. */
export function chainLevelAnchor(level: PilotageLevelReport['level']): string {
  return `pilotage-maillon-${level}`
}

/**
 * Ce maillon décroche-t-il ?
 *
 * ⚠️ UNE seule définition, et trois appelants : l'entête décide s'il y a une
 * pastille à rendre, la pastille décide où elle mène, la carte décide si elle
 * est une destination. Trois `=== 'alerte'` recopiés auraient divergé le jour
 * où un quatrième statut apparaît — et le désaccord serait muet : une pastille
 * qui compte trois maillons dont deux ne se posent pas en destination.
 */
export function isAlertingLevel(level: PilotageLevelReport): boolean {
  return level.status === 'alerte'
}

/** Les maillons qui décrochent — ce que le compteur compte. */
export function alertingLevels(levels: PilotageLevelReport[]): PilotageLevelReport[] {
  return levels.filter(isAlertingLevel)
}
