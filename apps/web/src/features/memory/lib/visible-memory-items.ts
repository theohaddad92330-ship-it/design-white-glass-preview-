import { isMemoryItemExpired } from '@bellum/contracts'

/**
 * #3775 — dernier critère (« Le compteur… », reconstruit au lot P04 09/10) :
 * ce que la barre COMPTE et ce que le panneau LISTE sont la même sélection.
 *
 * L'API ne renvoie jamais un élément échu, mais la liste est cachée côté
 * client : un onglet resté ouvert peut la garder après l'échéance. On refiltre
 * donc à l'affichage — ici, une fois, pour les deux lecteurs. La liste reçue
 * est déjà bornée par le serveur (le partagé et ce que l'appelant a épinglé,
 * `memory.service.ts` `visibleToViewer`) : aucun élément privé d'un collègue
 * n'y entre, donc aucun n'est compté.
 */
export function visibleMemoryItems<T extends { expiresAt: string | null }>(items: readonly T[] | undefined): T[] {
  return (items ?? []).filter(item => !isMemoryItemExpired(item.expiresAt))
}
