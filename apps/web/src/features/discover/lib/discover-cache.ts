import { clearDiscoverStorage } from './discover-storage'

/* ------------------------------------------------------------------ */
/*  Purge locale de Découvrir.                                          */
/*                                                                     */
/*  La v1 mettait en cache 6 h une liste ENTIÈREMENT générée par LLM,   */
/*  pour éviter de repayer l'appel IA à chaque login. La v2 n'a plus ce */
/*  besoin : le registre répond vite et les suggestions « Similaires »  */
/*  sortent d'une requête base. Il ne reste donc à purger que l'état    */
/*  local de l'écran (shortlist « Suivre »/« Écarter », recherches      */
/*  enregistrées) — tout vit sous le même préfixe.                     */
/* ------------------------------------------------------------------ */

/**
 * Efface toute trace locale de Découvrir, tous utilisateurs confondus.
 * Appelée lors d'une suppression de compte (RGPD) : aucun résidu ne doit
 * survivre à un effacement.
 */
export function clearAllDiscoverCaches(): void {
  clearDiscoverStorage()
}
