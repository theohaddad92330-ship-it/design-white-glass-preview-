/**
 * #4294.7 — « DÉJÀ TRAVAILLÉE » : LE PRÉDICAT, À UN SEUL ENDROIT (GA-26).
 *
 * Un compte de l'espace est déjà travaillé quand il porte une relation ou une mission passée : le statut client, une
 * affaire gagnée, ou une mission (livrée ou en cours). Le prédicat se calcule à la LECTURE — jamais écrit sur le
 * compte. Le cadrage d'analyse (`workedSirens`) et le filtre de Découvrir (`workedBefore`) lisent le même fragment :
 * deux copies auraient fini par ne plus dire la même chose.
 *
 * `workspaceParam` est le NOM du paramètre SQL (`$1`) déjà lié par l'appelant ; `account` est l'alias de `accounts`.
 */
export function workedAccountSql(account: string, workspaceParam: string): string {
  return `(${account}.commercial_status = 'customer'
               OR EXISTS (SELECT 1 FROM opportunities project WHERE project.account_id = ${account}.id AND project.stage = 'won')
               -- #4294.7 — une mission (livrée ou en cours) au compte : déjà travaillé, même sans statut CRM.
               OR EXISTS (SELECT 1 FROM missions mission WHERE mission.account_id = ${account}.id AND mission.workspace_id = ${workspaceParam}))`
}
