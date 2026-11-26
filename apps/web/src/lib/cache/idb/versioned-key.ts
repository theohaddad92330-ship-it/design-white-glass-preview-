/**
 * La version du build, ou `dev` hors de Vite.
 *
 * `__CODE_VERSION_ID__` est injecté par `define` : il n'existe ni sous vitest,
 * ni dans un rendu serveur. Le lire sans garde fait exploser au montage tout
 * composant qui hydrate — c'est arrivé, six tests sont tombés d'un coup et le
 * message (« __CODE_VERSION_ID__ is not defined ») ne désignait pas le cache.
 */
const BUILD_VERSION = typeof __CODE_VERSION_ID__ === 'string' ? __CODE_VERSION_ID__ : 'dev'

/**
 * Préfixe une clé de cache par la version du build.
 *
 * Un cache est une COPIE d'un état serveur : il doit mourir avec la version qui
 * l'a écrit, sinon un état de panne enregistré avant un correctif est relu
 * après, et l'utilisateur voit toujours l'écran cassé — le rapport de bug qui
 * remonte dit « toujours pas corrigé », et personne ne pense à vider un cache
 * dont il ignore l'existence. Le dépôt l'a payé deux fois (Tome 7 §22.2).
 *
 * ⚠️ Ne PAS l'appliquer à une PRÉFÉRENCE — thème, onglet retenu, filtre
 * enregistré. Une préférence doit survivre à un déploiement ; la buster ferait
 * perdre son réglage à l'utilisateur à chaque livraison, ce qui est un défaut à
 * part entière. La règle porte sur ce qui est une copie, pas sur ce qui est un
 * choix.
 *
 * Les clés d'une version précédente ne sont pas purgées : elles cessent
 * simplement d'être lues. Purger au démarrage retarderait le premier rendu pour
 * économiser des octets.
 */
export function versionedCacheKey(key: string): string {
  return `${BUILD_VERSION}|${key}`
}
