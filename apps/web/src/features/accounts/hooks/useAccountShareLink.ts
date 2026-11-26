import { useMutation } from '@tanstack/react-query'
import type { AccountShareLink, AccountShareSection } from '@bellum/contracts'
import { ensureError, TechnicalError } from '@bellum/errors'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

/**
 * Mints a public share link for an account dossier — ONLY when the caller
 * invokes `mutate()`/`mutateAsync()` explicitly.
 *
 * #2735 — c'était une `useQuery` avec `enabled: open` : ouvrir la fenêtre
 * « Partager le dossier » suffisait à fabriquer un lien public de 30 jours,
 * sans le moindre clic. Tranché par Louis (22/09 soir,
 * decisions-louis-22-09-soir.md §7) : la fenêtre s'ouvre SANS lien, un bouton
 * le fabrique. Une `useMutation` ne se déclenche jamais au montage ni sur un
 * changement de prop — seulement sur `mutate()`, ce qui rend le bug de
 * conception impossible à reproduire par construction.
 *
 * #2914 (#2128.11) — `mutate(section)` : `undefined`/absent = le dossier
 * ENTIER (comportement historique), `'evaluation'` = la section Score seule.
 */
export function useAccountShareLink(accountId: string) {
  return useMutation<AccountShareLink, Error, AccountShareSection | undefined>({
    mutationKey: ['account-share-link', accountId],
    mutationFn: async section => {
      try {
        return await apiFetch<AccountShareLink>({
          path: `/accounts/${accountId}/share`,
          method: 'POST',
          body: { section },
        })
      } catch (cause) {
        toast.error(i18n.t('accounts:toast.shareLinkError'))
        throw new TechnicalError('Failed to mint share link', { cause: ensureError(cause) })
      }
    },
  })
}
