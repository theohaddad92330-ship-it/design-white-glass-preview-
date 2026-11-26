import { lireListeDacces, type ListeDacces } from '@/lib/roles'

/**
 * Ce que l'ENVIRONNEMENT dit des rôles (#1668, #1669).
 *
 * ⚠️ SÉPARÉ DE `roles.ts` À DESSEIN. `roles.ts` porte la matrice, le découpage
 * de la liste et la liste des écrans de trésorerie : il est importé par le rail
 * latéral, donc il traverse la frontière du navigateur. Rien qui lise
 * `process.env` ne doit traverser cette frontière — pas parce que la valeur
 * fuirait (Next n'inline que les `NEXT_PUBLIC_*`), mais parce qu'un module
 * serveur importé par un composant client est exactement la forme que prend
 * l'accident suivant.
 */

/** La liste telle que l'environnement la pose. */
export function listeDacces(): ListeDacces {
  return lireListeDacces(process.env['DM_ALLOWED_EMAILS'])
}

/**
 * La fenêtre d'enrôlement TOTP (#1668).
 *
 * Aucun écran d'enrôlement n'existe ailleurs dans le produit : appliquer
 * « TOTP absent → connexion refusée » au pied de la lettre voudrait dire que
 * personne ne peut jamais se connecter. La fenêtre se pose le temps d'enrôler,
 * puis se RETIRE — après quoi plus personne ne peut s'auto-enrôler, même en
 * connaissant le Basic Auth et un mot de passe de la liste.
 */
export function enrolementOuvert(): boolean {
  const valeur = (process.env['DM_ENROLLMENT_OPEN'] ?? '').trim().toLowerCase()
  return valeur === '1' || valeur === 'true' || valeur === 'oui'
}
