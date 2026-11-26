/**
 * #3822.5 — un lot payant (enrichissement de masse, …) en vol ne doit jamais
 * être interrompu par un rechargement automatique de build périmé
 * (`stale-build.ts`). Mesuré en recette prod le 07/10 : un lot de 12 contacts
 * s'est fait recharger la page en plein milieu — sélection perdue, aucun
 * récapitulatif affiché, et trois contacts déjà débités côté serveur sans que
 * l'écran ne le sache plus. `recoverFromStaleBuild` ne regardait jamais si un
 * lot tournait avant de recharger ; ce module est ce qu'il consulte désormais.
 *
 * Compteur, pas un booléen : deux lots qui se chevauchent (un clic pendant la
 * fermeture d'un précédent) ne doivent lever le garde qu'une fois le DERNIER
 * terminé.
 */
let inFlight = 0
let deferredReload: (() => void) | null = null

export function isCriticalOperationInFlight(): boolean {
  return inFlight > 0
}

/** À appeler au DÉBUT d'un lot. Renvoie la fin — idempotente, jamais négative. */
export function beginCriticalOperation(): () => void {
  inFlight += 1
  let ended = false
  return () => {
    if (ended) return
    ended = true
    inFlight -= 1
    if (inFlight === 0 && deferredReload) {
      const run = deferredReload
      deferredReload = null
      run()
    }
  }
}

/**
 * Exécute `reload` tout de suite si rien n'est en vol ; sinon le garde pour la
 * fin du DERNIER lot (remplace un essai différé plus ancien — rejouer les
 * tentatives intermédiaires n'apporterait rien, seule la dernière compte).
 */
export function runOrDeferWhileCriticalOperation(reload: () => void): void {
  if (inFlight === 0) {
    reload()
    return
  }
  deferredReload = reload
}
