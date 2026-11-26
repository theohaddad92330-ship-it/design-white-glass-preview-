import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeclareOrgPeopleRequest, DeclareOrgPeopleResponse, OrgImportPreviewResponse } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'

/**
 * Déclarer des personnes qu'on connaît et que Bellum n'a pas trouvées (#1103).
 *
 * « Ici il faudrait pouvoir […] soit charger un organigramme si on en a un,
 * soit pouvoir décrire des éléments et ensuite ça intègre. »
 *
 * Les trois portes de l'écran passent par cette seule mutation. Aucun crédit,
 * aucun appel de modèle : c'est une écriture de ce qu'un humain sait.
 */
export function useDeclareOrgPeople(accountId: string) {
  const qc = useQueryClient()

  return useMutation<DeclareOrgPeopleResponse, Error, DeclareOrgPeopleRequest['people']>({
    mutationKey: ['accounts', accountId, 'declareOrgPeople'],
    mutationFn: people => accountsApi.declareOrgPeople(accountId, people),
    onSuccess: result => {
      // `grafted: false` = l'ardoise est écrite, ce dossier n'a pas encore
      // d'organigramme où greffer. Le dire vaut mieux qu'un succès muet, qu'on
      // lirait « ça n'a rien fait ».
      toast.success(
        result.grafted
          ? i18n.t('accounts:orgDeclare.toast.done', { count: result.declared })
          : i18n.t('accounts:orgDeclare.toast.savedForNextRun', { count: result.declared }),
      )
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.toast.error'))
    },
  })
}

/** #2553 / #3740 — la même écriture, pour un organigramme IMPORTÉ : elle crée
 *  aussi les contacts (les connus se lient, rien n'est écrasé) et rend, pour
 *  chaque personne, son contact — de quoi les enrichir ensuite. */
export function useImportOrgChartPeople(accountId: string) {
  const qc = useQueryClient()

  return useMutation<DeclareOrgPeopleResponse, Error, DeclareOrgPeopleRequest['people']>({
    mutationKey: ['accounts', accountId, 'importOrgChartPeople'],
    mutationFn: people => accountsApi.declareOrgPeople(accountId, people, { createContacts: true }),
    onSuccess: result => {
      toast.success(
        result.grafted
          ? i18n.t('accounts:orgDeclare.toast.done', { count: result.declared })
          : i18n.t('accounts:orgDeclare.toast.savedForNextRun', { count: result.declared }),
      )
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.all })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.toast.error'))
    },
  })
}

/** Laura met un texte libre en lignes (#1103). Ne déclare RIEN — c'est une
 *  proposition, que l'utilisateur relit avant de valider. */
export function useProposeOrgPeopleFromText(accountId: string) {
  return useMutation<
    { people: DeclareOrgPeopleRequest['people']; dropped: string[] },
    Error,
    { text: string } | { file: { base64: string; name?: string } }
  >({
    mutationKey: ['accounts', accountId, 'proposeOrgPeopleFromText'],
    mutationFn: input => accountsApi.proposeOrgPeopleFromText(accountId, input),
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.toast.structureError'))
    },
  })
}

/** #2553 / #3740 — un organigramme PDF / image / PPTX mis en lignes côté serveur.
 *  Ne déclare RIEN : une proposition, relue puis validée par `useDeclareOrgPeople`. */
export function useProposeOrgPeopleFromFile(accountId: string) {
  return useMutation<
    { people: DeclareOrgPeopleRequest['people']; dropped: string[] },
    Error,
    { fileB64: string; filename: string }
  >({
    mutationKey: ['accounts', accountId, 'proposeOrgPeopleFromFile'],
    mutationFn: file => accountsApi.proposeOrgPeopleFromFile(accountId, file),
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.toast.fileError'))
    },
  })
}

/** #3740.1 — ce que Bellum sait déjà des personnes d'un fichier importé. Lecture
 *  seule : n'écrit rien, ne débite rien. */
export function usePreviewOrgPeople(accountId: string) {
  return useMutation<OrgImportPreviewResponse, Error, DeclareOrgPeopleRequest['people']>({
    mutationKey: ['accounts', accountId, 'previewOrgPeople'],
    mutationFn: people => accountsApi.previewOrgPeople(accountId, people),
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.toast.previewError'))
    },
  })
}

/** #4072.1 — l'organigramme lu dans les documents de l'espace. Ne déclare RIEN :
 *  une proposition, relue puis validée par `useImportOrgChartPeople`. */
export function useProposeOrgPeopleFromDocuments(accountId: string) {
  return useMutation<
    { people: DeclareOrgPeopleRequest['people']; documentsRead: number; truncated: boolean },
    Error,
    void
  >({
    mutationKey: ['accounts', accountId, 'proposeOrgPeopleFromDocuments'],
    mutationFn: () => accountsApi.proposeOrgPeopleFromDocuments(accountId),
    onError: err => {
      toast.error(err.message || i18n.t('accounts:orgDeclare.documents.error'))
    },
  })
}
