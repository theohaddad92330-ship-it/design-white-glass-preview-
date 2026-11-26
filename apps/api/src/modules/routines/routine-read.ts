/**
 * Le résultat d'une lecture de routine : ce qu'elle a trouvé, ET si elle a pu
 * regarder.
 *
 * Ce type existe parce que `[]` répondait aux deux questions à la fois. Une
 * requête en panne rendait une liste vide, et l'utilisateur lisait « rien à
 * signaler » — la même phrase que quand tout va bien. Une panne devenait un
 * rapport rassurant.
 *
 * C'est à l'APPELANT de décider quoi faire d'une lecture non mesurée : se
 * taire, l'écrire dans la trace, ou continuer avec ce que l'autre moitié d'un
 * calcul à deux lectures a quand même trouvé.
 *
 * ⚠️ Il vit dans son propre fichier, et non dans le service qui l'a introduit,
 * pour que les DEUX services de routines (comptes et vivier) portent la même
 * forme. Deux voisins qui résolvent le même problème de deux façons, c'est la
 * divergence qu'on paie six mois plus tard.
 */
export type RoutineRead<T> = {
  measured: boolean
  rows: T[]
}
