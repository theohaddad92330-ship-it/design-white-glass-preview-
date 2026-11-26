import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi, type DetachPreview } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2117.36-38 — archiver / détacher / supprimer DEPUIS LE MENU « … » DU HERO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS `useArchiveAccount.ts` / `useDetachAccount.ts`
 * ─────────────────────────────────────────────────────────────────────────
 * Les trois écritures existent déjà — `useArchiveAccount` et `useDeleteAccount`
 * pour la liste de comptes, `useDetachAccount` pour `LinkedAccountsCard`. Ce
 * fichier ne les DUPLIQUE pas côté réseau : `accountsApi.archive` /
 * `.detachAccount` / `.delete` sont les mêmes appels.
 *
 * Ce qui change, c'est le message de succès. Le contrat de bouton du dossier
 * (#2116.40, `dossier-cta-interdits.test.ts`) exige qu'un succès d'écriture
 * NOMME ce qui a bougé — « Compte archivé » ne le fait pas. Réécrire ce texte
 * dans les hooks existants sortirait ce lot de son périmètre de fichiers (ils
 * sont partagés avec la liste de comptes, hors périmètre) ; ce fichier porte
 * donc sa PROPRE couche de succès, nommée par le compte, pour les trois
 * gestes atteints depuis le dossier.
 *
 * L'ÉCHEC garde la phrase de l'API en `description` (comme `useAccountGate`) :
 * une `BadRequestException` Nest range sa raison dans `message`, et un toast
 * qui n'affiche que sa propre clé la perd — « Erreur lors de l'archivage » ne
 * dit pas que le compte n'appartient pas à l'espace. Tenu entrée par entrée par
 * `dossier-cta-outcome.test.tsx`.
 */

type AdminActionInput = { accountId: string; companyName: string | null }

function nameOrAccount(companyName: string | null): string {
  return companyName?.trim() || i18n.t('accounts:cta.moreActions.thisAccount')
}

/** #2117.36 — archiver ce dossier depuis le dossier lui-même. */
export function useArchiveAccountFromDossier() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<{ archived: true }, Error, AdminActionInput>({
    mutationKey: ['accounts', 'archive', 'dossier'],
    mutationFn: ({ accountId }) => accountsApi.archive(accountId),
    onSuccess: (_data, { accountId, companyName }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(i18n.t('accounts:cta.moreActions.archive.success', { company: nameOrAccount(companyName) }))
    },
    onError: error => {
      toast.error(i18n.t('accounts:toast.archiveError'), { description: error.message })
    },
  })
}

/** #2117.37 — détacher ce dossier du groupe auquel il a été rattaché (#1111). */
export function useDetachAccountFromDossier() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<DetachPreview, Error, AdminActionInput>({
    mutationKey: ['accounts', 'detach', 'dossier'],
    mutationFn: ({ accountId }) => accountsApi.detachAccount(accountId),
    onSuccess: (result, { accountId, companyName }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.links(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(
        i18n.t('accounts:cta.moreActions.detach.success', {
          company: companyName?.trim() || result.detachedName,
        }),
      )
    },
    onError: error => {
      toast.error(i18n.t('accounts:detach.toast.error'), { description: error.message })
    },
  })
}

/** #2117.38 — supprimer (archivage doux : la ligne reste, `status → 'deleted'`). */
export function useDeleteAccountFromDossier() {
  const qc = useQueryClient()
  const { user } = useSession()

  return useMutation<{ deleted: true }, Error, AdminActionInput>({
    mutationKey: ['accounts', 'delete', 'dossier'],
    mutationFn: ({ accountId }) => accountsApi.delete(accountId),
    onSuccess: (_data, { accountId, companyName }) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.list(user?.id) })
      toast.success(i18n.t('accounts:cta.moreActions.delete.success', { company: nameOrAccount(companyName) }))
    },
    onError: error => {
      toast.error(i18n.t('accounts:toast.deleteError'), { description: error.message })
    },
  })
}
