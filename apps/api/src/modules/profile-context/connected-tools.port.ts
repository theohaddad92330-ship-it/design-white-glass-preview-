/**
 * #2007.8 — la SEULE forme sous laquelle la construction du contexte de profil
 * apprend quels outils sont RÉELLEMENT branchés pour un utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PORT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le profileur a besoin de distinguer deux choses que l'utilisateur confond :
 * ce qu'il a DÉCLARÉ utiliser (le bloc `tooling_*` du questionnaire) et ce qui
 * est réellement CONNECTÉ à son espace. L'écart entre les deux est justement ce
 * que le modèle doit pouvoir interpréter.
 *
 * La première version lisait `ToolRegistryService` directement depuis
 * `ProfileContextService`. GA-07 l'a refusé, et il avait raison : un service
 * qui va chercher le service d'un autre module fait fondre la frontière entre
 * les deux, et c'est irréversible une fois que dix l'ont fait. Le message de la
 * garde dit quoi faire à la place — un contrat, un événement, ou l'orchestration
 * dans le contrôleur. C'est un contrat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre d'outils reste le seul à savoir ce qu'est un outil « connecté » :
 * le port est lié à lui dans `profile-context.module.ts`, et c'est LÀ que vit la
 * traduction. Personne n'écrit rien par ici — c'est une lecture, et elle dégrade
 * en liste vide plutôt que de faire échouer une génération (best-effort assumé,
 * écrit dans l'appelant).
 *
 * GA-07 : ce fichier n'importe RIEN et son nom ne contient pas « service » —
 * `profile-context` en dépend sans ajouter d'import service → service. Le seul
 * endroit qui connaît les deux côtés est le `.module.ts`, que la garde exempte
 * à dessein : c'est là que le câblage d'une application a le droit de vivre.
 */
export const CONNECTED_TOOLS_READER = Symbol('CONNECTED_TOOLS_READER')

export type ConnectedToolsReader = {
  /**
   * Les NOMS affichables des outils connectés pour cet utilisateur, jamais les
   * identifiants ni les secrets. Une liste vide dit « aucun outil connecté » —
   * elle ne dit jamais « on n'a pas pu lire » : cette nuance-là est portée par
   * le journal de l'appelant, pas par la valeur de retour.
   */
  listConnected(userId: string): Promise<string[]>
}
