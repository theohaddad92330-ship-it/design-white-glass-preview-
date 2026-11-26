import { z } from 'zod'

/**
 * #5011 — LA SUITE PROPOSÉE APRÈS UNE RÉPONSE DÉPEND DE L'AVANCEMENT COMPTÉ DE L'ESPACE.
 *
 * L'état est LU côté API (comptes, contacts, actions de l'espace — filtre `workspace_id`), jamais
 * deviné par le modèle ni par l'écran. Chaque étape porte le FAIT compté qui la justifie
 * (#5011.2) : sans fait, pas de suite. Dérivation pure — la même règle à l'écran et en test (GA-26).
 *
 * Garde, ne recode pas : le guide in-app (#2950) et les modes guidés (#2918) ; ici seule la SUITE
 * d'une réponse suit l'avancement. Laura propose, l'humain valide (#5011.3) : aucune étape n'envoie.
 */
export const workspaceProgressSchema = z.object({
  accounts: z.number().int().nonnegative(),
  contacts: z.number().int().nonnegative(),
  actions: z.number().int().nonnegative(),
})

export type WorkspaceProgress = z.infer<typeof workspaceProgressSchema>

export type WorkspaceNextStep = {
  kind: 'analyze_account' | 'import_accounts' | 'find_contacts' | 'prepare_message'
  fact: 'workspace_no_account' | 'workspace_accounts_no_contact' | 'workspace_contacts_no_action'
  /** Le nombre compté qui cite le fait ; absent quand le fait est « aucun compte ». */
  count?: number
}

export function workspaceNextSteps(progress: WorkspaceProgress): WorkspaceNextStep[] {
  if (progress.accounts === 0) {
    return [
      { kind: 'analyze_account', fact: 'workspace_no_account' },
      { kind: 'import_accounts', fact: 'workspace_no_account' },
    ]
  }
  if (progress.contacts === 0) {
    return [{ kind: 'find_contacts', fact: 'workspace_accounts_no_contact', count: progress.accounts }]
  }
  if (progress.actions === 0) {
    return [{ kind: 'prepare_message', fact: 'workspace_contacts_no_action', count: progress.contacts }]
  }
  return []
}
