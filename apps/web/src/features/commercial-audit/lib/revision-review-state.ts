import type { ProfileContextStatus } from '@bellum/contracts'

/**
 * #2010.1 / #2010.3 / #2010.17 / #2011.9 — « Un résultat IA ne devient plus
 * immédiatement la vérité », tranché par Louis 22/09 soir
 * (decisions-louis-22-09-soir.md §1), reco appliquée : scopé au SEUL audit
 * (`useCommercialAudit`), JAMAIS aux 8 autres consommateurs de
 * `useProfileContext` (le `WelcomeScreen` compris, #2062/#2063) — les
 * gater tous sur « validé seulement » viderait `/welcome` pour chaque
 * nouvel utilisateur jusqu'à son premier clic « Valider », une régression
 * massive plutôt qu'un renforcement de doctrine.
 *
 * `to_review` est un état DÉRIVÉ, jamais persisté : poser un enum
 * (`to_review`/`corrected`/`superseded`) sur `profileContextStatusValues`
 * sans qu'aucun appelant ne l'écrive serait exactement le défaut n°1 de ce
 * dépôt (`agent_docs/chantiers-livres.md` : « du code juste, calculé,
 * testé, que personne n'appelle »). Ici, la valeur se calcule à la lecture,
 * à partir de deux faits déjà persistés : le statut du contexte
 * (`profile_context_status`) et le nombre de révisions déjà archivées
 * (`GET /profile-context/revisions`, déjà lu par `useCommercialAudit`).
 *
 * Un contexte `succeeded` (généré, jamais encore validé) qui remplace au
 * moins une version antérieure (`revisionCount > 1`) est « à revoir » — la
 * première génération d'un compte (`revisionCount <= 1`) ne l'est jamais :
 * il n'y a rien d'antérieur à comparer, c'est la revue normale d'un premier
 * résultat, pas une régénération qui écrase un existant.
 */
export function isProfileContextToReview(status: ProfileContextStatus | null, revisionCount: number): boolean {
  return status === 'succeeded' && revisionCount > 1
}
