import { placesProfilesForClients } from '@bellum/contracts'

/**
 * #2091.28 — les cartes secondaires de `/welcome`, ISSUES DE L'AUDIT plutôt
 * que fixes à deux. `analyzeAccount` reste le repli générique (#1921.11/.12) :
 * elle ouvre la recherche libre même sans suggestion prête, donc rien dans
 * l'audit ne peut la rendre hors-sujet. `positionConsultant`, elle, ne l'est
 * QUE si l'ESN a répondu `yes` à « places-tu des CDI chez tes clients ? »
 * (#1124, `recruits_for_clients`, signal déjà chargé sur cet écran) : la
 * proposer à une ESN qui a répondu `no` pousserait une piste que son propre
 * questionnaire vient d'écarter.
 *
 * « Prioriser la semaine » (#2091.31) exige un signal de PORTEFEUILLE
 * EXISTANT (`hasAccountsToAct`, `AccountsController.hasAccountsToAct`) —
 * un utilisateur qui vient de finir l'onboarding n'a, par construction, rien
 * à prioriser, donc la carte ne se propose QUE si le portefeuille porte déjà
 * au moins un compte en attente d'action.
 *
 * TROIS CARTES MAXIMUM (#2091.28, corps de l'épopée #2897) : le CTA
 * principal (« laisse Laura choisir »), `analyzeAccount` (repli générique,
 * toujours présent), et UNE SEULE carte candidate parmi `positionConsultant`
 * / `prioritizeWeek` — jamais les deux à la fois, même si les deux signaux
 * sont vrais. `positionConsultant` reste prioritaire (#2091.28, déjà livrée) :
 * `prioritizeWeek` ne se propose que si elle ne s'applique pas.
 */
type WelcomeCardKind = 'analyzeAccount' | 'analyzeAccountFromAudit' | 'positionConsultant' | 'prioritizeWeek'

export function deriveWelcomeCards(input: {
  recruitsForClients: string | null | undefined
  hasAccountsToAct?: boolean
  /** #2091.28 — l'audit a produit des comptes à proposer (`firstAnalysisSuggestions`). */
  hasAuditSuggestions?: boolean
}): readonly WelcomeCardKind[] {
  // #2091.28 — dérivée de l'audit quand il a proposé des comptes ; sinon repli générique.
  const cards: WelcomeCardKind[] = [input.hasAuditSuggestions ? 'analyzeAccountFromAudit' : 'analyzeAccount']
  if (placesProfilesForClients(input.recruitsForClients)) cards.push('positionConsultant')
  else if (input.hasAccountsToAct) cards.push('prioritizeWeek')
  return cards
}
