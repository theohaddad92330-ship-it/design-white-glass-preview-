import type { Account, CompanySuggestion, Contact, RecordFieldAudit } from '@bellum/contracts'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useRecordHistory } from '@/features/crm-core/hooks/useRecordEdit'
import { useWorkspaceAccountFor } from './useWorkspaceAccountMatch'

type KnownAccount = {
  /** Le compte de l'espace qui correspond à l'entreprise choisie, ou `null` (première analyse). */
  account: Account | null
  contacts: readonly Contact[]
  corrections: readonly RecordFieldAudit[] | undefined
}

/**
 * « Ce que Bellum sait déjà » (refonte Théo R1.A3) — le compte de l'espace qui porte le SIREN de
 * l'entreprise choisie, avec ses contacts et son historique de corrections. Un dossier repris
 * (`/search?accountId=`) passe son compte directement : c'est lui qui gagne. Aucune lecture
 * payante, aucune donnée devinée : sans compte, tout est vide et l'écran se tait.
 *
 * Théo B r1-recherche.A3 (PR11, rebranché) — sans entité verrouillée, le compte que le plan de lancement reconnaît,
 * ou le dossier récent qui porte EXACTEMENT le nom tapé (`fallbackAccountId`), le reconnaît aussi : c'est le seul
 * chemin en démo (le plan y répond `demo`) et il ne coûte aucune lecture de plus.
 */
export function useKnownAccount(
  entity: CompanySuggestion | null,
  sourceAccount: Account | null,
  fallbackAccountId?: string,
): KnownAccount {
  const matched = useWorkspaceAccountFor(sourceAccount ? null : entity)
  const accountId = sourceAccount?.id ?? matched?.id ?? fallbackAccountId ?? ''
  const { account, contacts } = useAccount(accountId)
  const history = useRecordHistory('account', accountId, accountId.length > 0)
  return { account: sourceAccount ?? account, contacts, corrections: history.data }
}
