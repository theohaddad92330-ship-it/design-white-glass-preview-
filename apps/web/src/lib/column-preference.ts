/**
 * Une colonne AJOUTÉE atteint ceux qui ont déjà choisi leurs colonnes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE ÇA RÉPARE, TROUVÉ EN PRODUCTION LE 04/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le choix des colonnes d'un tableau est une PRÉFÉRENCE PERSISTÉE. Une
 * préférence enregistrée avant qu'une colonne existe ne la contient pas — et un
 * lecteur qui rend la liste stockée telle quelle rend la colonne neuve
 * **invisible pour tous ceux qui ont déjà ouvert l'écran**.
 *
 * C'est arrivé sur `/missions` : « Prochaine action » était inscrite aux
 * colonnes par défaut, sous un commentaire disant « une colonne d'action livrée
 * MASQUÉE est exactement le défaut qu'on répare », et elle n'atteignait aucun
 * bêta-testeur — c'est-à-dire précisément les gens qui l'avaient demandée.
 * Mesuré : 11 colonnes au sélecteur, aucune « Prochaine action », et 8 cellules
 * de risque sans un seul élément cliquable.
 *
 * Le défaut ne se voit d'aucun test qui parte d'un stockage vide, et d'aucune
 * relecture de code : il faut un stockage ANCIEN pour le produire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS « REVENIR AUX DÉFAUTS »
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que ce serait effacer un choix délibéré. On n'ajoute que les colonnes
 * apparues APRÈS l'enregistrement : celles que l'utilisateur n'a jamais eu
 * l'occasion de décocher. Une colonne qu'il a vue et retirée reste retirée.
 *
 * La liste `added` est donc un journal d'AJOUTS, pas la liste des défauts :
 * elle ne grandit que quand une colonne naît, et chaque écran tient la sienne.
 */
export function mergeAddedColumns<Key extends string>(
  stored: readonly Key[],
  /** Les colonnes nées depuis que ce stockage peut dater. Ordre sans importance. */
  added: readonly Key[],
  /** Le catalogue, qui donne l'ORDRE — jamais l'ordre des clics. */
  catalogue: readonly Key[],
): Key[] {
  const chosen = new Set<Key>(stored)
  for (const key of added) {
    // Une clé retirée du produit ne doit pas réapparaître par cette porte.
    if (catalogue.includes(key)) chosen.add(key)
  }
  return catalogue.filter(key => chosen.has(key))
}
