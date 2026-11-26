/**
 * #2007.11 — la SEULE forme sous laquelle la construction du contexte de
 * profil apprend les questions volontairement PASSÉES
 * (`esn_profiles.skipped_question_keys`), pour les transmettre au Profileur
 * (`ProfileContextService.triggerGeneration` → `IaClient.generateProfile`).
 *
 * Même raisonnement que `answer-meta.port.ts` (#2007.6/.7/.10/.12) et
 * `connected-tools.port.ts` (#2007.8) : GA-07 refuse qu'un service aille
 * chercher celui d'un autre module (`EsnProfileWorkspaceResolver` vit dans le
 * module `esn-profile`) — le câblage vit dans `profile-context.module.ts`.
 */
export const SKIPPED_QUESTIONS_READER = Symbol('SKIPPED_QUESTIONS_READER')

export type SkippedQuestionsReader = {
  /**
   * Les clés passées, fusionnées entreprise + personnel comme les réponses
   * elles-mêmes. Une lecture ratée dégrade en `[]` — jamais bloquante pour la
   * génération elle-même (même doctrine que {@link AnswerMetaReader}) :
   * aucune clé passée transmise plutôt qu'une génération cassée.
   */
  resolveSkippedQuestionKeys(userId: string): Promise<string[]>
}
