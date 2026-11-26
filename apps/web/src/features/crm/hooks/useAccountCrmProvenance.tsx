import type { AccountCrmProvenance } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { crmPushApi } from '../api'

/** #4459 — une seule clé de cache ; « Compléter le compte » invalide le préfixe `crm/push/provenance` après envoi. */
function accountCrmProvenanceKey(accountId: string) {
  return ['crm', 'push', 'provenance', accountId] as const
}

const AccountCrmProvenanceContext = createContext<AccountCrmProvenance | null>(null)

/**
 * #4459.2 — la provenance CRM des contacts du compte ouvert, lue UNE fois pour toute la fiche (hero, synthèse,
 * Personnes, organigramme) : les feuilles lisent le contexte, jamais la requête — une ligne de contact rendue
 * hors de la fiche (ou dans un test sans client de requêtes) n'affiche simplement rien.
 *
 * La règle « on la montre » vit ICI, une fois (GA-26) : un compte venu du CRM, ou dont au moins un contact y
 * était déjà. Sur tout autre compte, chaque contact serait « apporté par Bellum » — une mention vraie mais creuse.
 */
export function AccountCrmProvenanceProvider({
  accountId,
  children,
}: {
  accountId: string | null | undefined
  children: ReactNode
}) {
  const query = useQuery({
    queryKey: accountCrmProvenanceKey(accountId ?? ''),
    queryFn: () => crmPushApi.accountProvenance(accountId ?? ''),
    enabled: !!accountId,
    retry: false,
    staleTime: 60_000,
  })
  const data = query.data
  // #4604 — ou dont le CRM DIT quelque chose (affaires rattachées par SIREN, miroir de la salle de démonstration) :
  // sans ce troisième cas, « Ce que dit ton CRM » restait muet sur un compte que le CRM connaît sans lien d'import.
  const shown =
    data &&
    (data.accountFromCrm ||
      data.contacts.some(contact => contact.origin === 'crm') ||
      Boolean(data.crm) ||
      // #4680 — un import en base est une présence, sans aucun connecteur live.
      Boolean(data.knownContacts) ||
      Boolean(data.accountImport))
      ? data
      : null
  return <AccountCrmProvenanceContext.Provider value={shown}>{children}</AccountCrmProvenanceContext.Provider>
}

/** La provenance du compte ouvert, ou `null` quand elle n'a rien à dire (ou hors de la fiche). */
export function useAccountCrmProvenance(): AccountCrmProvenance | null {
  return useContext(AccountCrmProvenanceContext)
}
