import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Contact, ContactStatus } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys } from '@/features/accounts/api'
import { contactAccountQueryKeys } from '@/features/contacts/lib/contactAccountKeys'
import { contactKeys, contactsApi } from '@/features/contacts/api'

type UpdateStatusInput = {
  id: string
  /** `null` = contact à qualifier, sans entreprise (#1473). */
  account_id: string | null
  full_name: string | null
  status: ContactStatus
}

/**
 * « Où en est ce contact ? » — le geste par lequel le commercial consigne l'issue
 * d'une approche : il a répondu, un rendez-vous est décroché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PATCH /contacts/:id/status` était livré ET complet côté serveur — il avance le
 * statut, pose le repère de replanification sur le compte, met en pause les
 * séquences de relance en cours — et **aucun écran ne l'appelait**. Le client
 * `contactsApi.updateStatus` existait lui aussi, sans un seul appelant. C'est le
 * motif que ce dépôt paie le plus souvent : du code juste, testé, que personne
 * n'appelle.
 *
 * La conséquence se voyait à l'autre bout : l'entonnoir du tableau de bord ne
 * quittait jamais « Nouveaux », et les compteurs `response_received` /
 * `rdv_obtained` — lus par les statistiques de la semaine et les KPIs d'équipe —
 * restaient à zéro faute d'un geste capable de les écrire. Ce zéro-là ne
 * mesurait pas une contre-performance : il mesurait une absence de moyen.
 *
 * ⚠️ La trace au journal d'activité est écrite par le SERVEUR, dans le même
 * geste que le changement de statut. Surtout ne pas la rejouer ici par un
 * `POST /actions/track` : deux chemins d'écriture pour un seul fait finissent
 * toujours par diverger, et un double comptage rendrait le compteur
 * auto-gonflable.
 */
export function useUpdateContactStatus() {
  const queryClient = useQueryClient()

  return useMutation<Contact, Error, UpdateStatusInput>({
    mutationKey: ['contacts', 'status'],
    mutationFn: input => contactsApi.updateStatus(input.id, input.status),
    // #16 — mise à jour OPTIMISTE de la fiche ouverte : le sélecteur montre le nouveau statut tout de suite
    // (il gardait l'ancien libellé jusqu'au rechargement).
    onMutate: async input => {
      await queryClient.cancelQueries({ queryKey: contactKeys.detail(input.id) })
      const previous = queryClient.getQueryData<Contact>(contactKeys.detail(input.id))
      if (previous) {
        // Ce que l'écran LIT : le statut déclaré ET le badge de relation (la déclaration humaine gagne).
        const declared = input.status === 'new' ? null : input.status
        queryClient.setQueryData<Contact>(contactKeys.detail(input.id), {
          ...previous,
          user_status: input.status,
          ...(previous.relation_badge && declared
            ? {
                relation_badge: {
                  ...previous.relation_badge,
                  declared,
                  shown: { source: 'declared' as const, status: declared },
                },
              }
            : {}),
        })
      }
      return { previous }
    },
    onSuccess: (_result, input) => {
      toast.success(
        i18n.t('contacts:status.updated', {
          name: input.full_name ?? i18n.t('contacts:status.thisContact'),
          // i18n keys: contacts:status.value.new | .contacted | .replied | .meeting | .refused | .silence
          status: i18n.t(`contacts:status.value.${input.status}`),
        }),
      )
    },
    onError: (error, input, context) => {
      const previous = (context as { previous?: Contact } | undefined)?.previous
      if (previous) queryClient.setQueryData<Contact>(contactKeys.detail(input.id), previous)
      toast.error(i18n.t('contacts:status.updateError', { name: input.full_name ?? '' }), {
        description: error.message,
      })
    },
    onSettled: (_result, _error, input) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.list, refetchType: 'inactive' })
      // #16 — la fiche OUVERTE est une requête ACTIVE : `refetchType: 'inactive'` ne la rafraîchissait jamais,
      // d'où le CTA qui n'apparaissait qu'après rechargement. Ici, le défaut (actives comprises).
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(input.id) })
      // #1473 — sans compte, il n'y a rien à rafraîchir de ce côté.
      for (const key of contactAccountQueryKeys(input.account_id))
        queryClient.invalidateQueries({ queryKey: key, refetchType: 'inactive' })
      // Le tableau de bord LIT cette issue deux fois — l'entonnoir « Ce que ton
      // activité a produit » et les compteurs de la semaine. Sans ces deux
      // invalidations, le commercial déclare un rendez-vous et son tableau de
      // bord continue d'afficher l'état d'avant jusqu'au prochain rechargement.
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'inactive' })
      queryClient.invalidateQueries({ queryKey: ['actions', 'weekly-stats'], refetchType: 'inactive' })
    },
  })
}
