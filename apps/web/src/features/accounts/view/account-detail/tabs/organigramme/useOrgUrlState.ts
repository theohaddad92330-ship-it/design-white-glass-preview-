import type { Contact } from '@bellum/contracts'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef } from 'react'
import { contactOriginSearch } from '@/features/contacts/lib/contactOrigin'
import { definedOrgKeys, orgStateFromSearch, orgStateToSearch, type OrgViewState } from './orgViewState'

/**
 * #4061.b — l'état de l'onglet Organigramme, branché sur les search params de `/accounts/$id`.
 *
 * Écriture : `replace` (jamais une entrée d'historique par filtre tapé). Ouverture d'une fiche : la
 * sélection posée juste avant le clic est écrite D'ABORD (replace, attendue), puis la fiche est poussée ;
 * l'entrée d'historique que le retour du navigateur rouvre porte donc déjà vue, filtres, colonnes et
 * sélection, et le fil d'Ariane de la fiche les reçoit (`fromOrg`, contactOrigin.ts).
 */
export function useOrgUrlState(accountId: string) {
  const navigate = useNavigate()
  const viewState = useSearch({ from: '/accounts/$id', select: orgStateFromSearch })
  const lastWrite = useRef<{ state: OrgViewState; done: Promise<unknown> } | null>(null)

  const onViewStateChange = (next: OrgViewState) => {
    const done = Promise.resolve(
      navigate({
        to: '/accounts/$id',
        params: { id: accountId },
        search: prev => ({ ...prev, ...orgStateToSearch(next) }),
        replace: true,
      }),
    ).catch(() => undefined)
    lastWrite.current = { state: next, done }
  }

  const openContact = (contact: Contact) => {
    const pending = lastWrite.current
    void (pending?.done ?? Promise.resolve()).then(() =>
      navigate({
        to: '/contacts/$id',
        params: { id: contact.id },
        search: contactOriginSearch({
          kind: 'account',
          accountId,
          tab: 'organigramme',
          org: definedOrgKeys(pending?.state ?? viewState),
        }),
      }),
    )
  }

  return { viewState, onViewStateChange, openContact }
}
