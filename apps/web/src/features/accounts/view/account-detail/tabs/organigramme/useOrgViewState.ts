import { useCallback, useState } from 'react'
import { DEFAULT_ORG_VIEW_STATE, type OrgViewState } from './orgViewState'

/**
 * #4061.b — l'état de l'organigramme, CONTRÔLÉ par l'URL quand l'appelant le porte (le dossier compte :
 * `AccountDetailTabContent`), local sinon (tests, autres appelants). Un seul réglage, deux sources — jamais
 * deux états en parallèle : dès que `controlled` est fourni, l'état local n'est plus lu.
 */
export function useOrgViewState(
  controlled?: OrgViewState,
  onChange?: (next: OrgViewState) => void,
): [OrgViewState, (patch: Partial<OrgViewState>) => void] {
  const [local, setLocal] = useState<OrgViewState>(DEFAULT_ORG_VIEW_STATE)
  const state = controlled ?? local
  const patch = useCallback(
    (change: Partial<OrgViewState>) => {
      const next = { ...state, ...change }
      if (controlled) onChange?.(next)
      else setLocal(next)
    },
    [state, controlled, onChange],
  )
  return [state, patch]
}
