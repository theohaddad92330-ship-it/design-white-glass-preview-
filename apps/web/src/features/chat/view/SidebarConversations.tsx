/**
 * ⚠️ COQUILLE VIDE, À DESSEIN — et pour un temps seulement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI S'EST PASSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce composant rendait la liste des conversations de Laura DANS la barre
 * latérale du produit, juste sous le bouton « Demander à Laura ». Louis, le
 * 30/08/2026 : « ce qui se passe sous le bouton laura prend trop de place […]
 * sinon on voit plus bien le sidebar principal si on laisse comme ça. »
 *
 * Mesuré en production ce jour-là, sur un écran de 861 px de haut : la liste
 * occupait **510 px**, et il ne restait que **135 px** de fenêtre défilante
 * pour **278 px** de navigation — soit **3 entrées sur 8** entièrement
 * visibles. La liste vit désormais dans `ConversationsPanel`, à l'intérieur de
 * l'écran du copilote, où elle se replie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE ENCORE, ET CE QU'IL RESTE À FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Son SEUL appelant est `apps/web/src/components/sidebar/CustomerNavbarBody.tsx`
 * — un fichier qu'un autre lot était en train de modifier au moment de celui-ci,
 * et auquel il était donc interdit de toucher sous peine de le rendre
 * infusionnable. Retirer le montage ici plutôt que là-bas est ce qui permet de
 * livrer la place rendue à la barre latérale sans marcher sur l'autre lot.
 *
 * La manipulation qui referme ce fichier, une fois l'autre lot fusionné —
 * **D314**, parquée au §12.6 du dossier du 26 août :
 *
 *   1. `CustomerNavbarBody.tsx` : supprimer le bloc `{onLaura && (…)}` (les
 *      lignes 115-119 au 30/08/2026), l'import de `SidebarConversations`, la
 *      constante `onLaura` et l'import `useRouterState` devenu inutile ;
 *   2. supprimer ce fichier ;
 *   3. GA-110 passe alors de « ce composant ne rend rien » à « plus personne
 *      ne l'importe » — la garde est écrite pour que les deux formulations
 *      soient vraies au même endroit.
 *
 * ⚠️ Ne PAS y remettre de rendu : la liste serait alors à DEUX endroits, et
 * c'est exactement le défaut que ce lot vient de corriger. GA-110 le refuse.
 */
export function SidebarConversations() {
  return null
}
