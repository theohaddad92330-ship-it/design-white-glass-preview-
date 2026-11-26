import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { rememberCreatedPlanAction } from '@/features/actions/hooks/usePlanItems'
import { planItemsApi } from '@/features/actions/planItems.api'
import { contactPlanAction } from '@/features/contacts/lib/contactPlanAction'

/**
 * #2120.40 — le sous-ensemble de champs dont ce hook a RÉELLEMENT besoin :
 * `account_id` pour router l'appel, `id`/`full_name`/`title` pour
 * {@link contactPlanAction} (#2123.46 — l'identifiant désigne le contact
 * VISÉ). Une ligne de compte (`Contact`, sans `company_name`) et une ligne
 * globale (`GlobalContact`) partagent cette forme — le hook n'exige rien de
 * plus que ce qu'il lit.
 */
type PlanEligibleContact = {
  id: string
  account_id: string | null
  full_name: string
  title?: string | null
}

/** Ce qui s'est RÉELLEMENT passé, ligne par ligne. Aucun de ces trois nombres
 *  n'est estimé : `added`/`skipped` viennent du serveur, `failed` est le nombre
 *  d'appels qui ont échoué. */
type BulkPlanOutcome = {
  added: number
  skipped: number
  failed: number
  /**
   * #1473 — les contacts À QUALIFIER de la sélection, comptés à part.
   *
   * Un plan d'action appartient à un COMPTE : un contact sans entreprise n'a
   * nulle part où poser la ligne. Ce n'est ni un échec (rien n'a cassé) ni un
   * « déjà au plan » (rien n'y était) — les confondre dirait au commercial que
   * son geste a porté alors qu'il n'a rien produit pour ces lignes-là.
   */
  unqualified: number
}

/**
 * « Ajouter au plan d'action » appliqué à toute une sélection de contacts.
 *
 * Réutilise EXACTEMENT la porte unitaire de la fiche contact (#2123.46 —
 * `POST /plan-items` via `planItemsApi.create`, même corps via
 * {@link contactPlanAction}) : il n'existe pas de second endpoint « en masse »
 * qui pourrait diverger du geste unitaire. Les contacts d'une sélection
 * appartiennent à plusieurs comptes — chaque ligne part donc sur SON compte.
 *
 * La porte serveur est idempotente et le dit (`added: false` = l'action y était
 * déjà, ouverte) : « N ajoutés, M ignorés (déjà au plan) » n'est donc pas une
 * déduction du client. Un appel en échec ne fait jamais tomber les suivants —
 * il est compté et annoncé.
 */
export function useAddContactsToPlan() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<BulkPlanOutcome, Error, readonly PlanEligibleContact[]>({
    mutationFn: async contacts => {
      const outcome: BulkPlanOutcome = { added: 0, skipped: 0, failed: 0, unqualified: 0 }

      for (const contact of contacts) {
        // #1473 — sans entreprise, il n'existe aucun plan d'action où écrire.
        // On le COMPTE et on l'annonce, plutôt que de le laisser tomber dans
        // « échoué », qui ferait chercher une panne inexistante.
        const accountId = contact.account_id
        if (!accountId) {
          outcome.unqualified += 1
          continue
        }
        try {
          // #2123.46 — la ligne CANONIQUE, avec le contact comme objet visé.
          const created = await planItemsApi.create({ account_id: accountId, ...contactPlanAction(contact) })
          // Le cache du plan de SON compte et `/actions` : la même règle que
          // toute autre écriture d'action (GA-26).
          rememberCreatedPlanAction(queryClient, created)
          // `added` absent = une API antérieure à ce déploiement : elle ne sait
          // pas dire si la ligne y était déjà. On ne devine pas — l'appel a
          // réussi, il est compté comme ajouté.
          if (created.added === false) outcome.skipped += 1
          else outcome.added += 1
        } catch {
          outcome.failed += 1
        }
      }

      return outcome
    },
    onSuccess: outcome => {
      // Rien n'a été tenté et rien n'a échoué : toute la sélection était « à
      // qualifier ». Dire « échec » serait faux.
      if (outcome.added === 0 && outcome.skipped === 0 && outcome.failed === 0 && outcome.unqualified > 0) {
        toast.info(t('selection.plan.allUnqualified', { count: outcome.unqualified }))
        return
      }
      if (outcome.added === 0 && outcome.skipped === 0) {
        toast.error(t('selection.plan.allFailed'))
        return
      }

      const details = [
        outcome.skipped > 0 ? t('selection.plan.skipped', { count: outcome.skipped }) : null,
        outcome.unqualified > 0 ? t('selection.plan.unqualified', { count: outcome.unqualified }) : null,
        outcome.failed > 0 ? t('selection.plan.failed', { count: outcome.failed }) : null,
      ].filter((line): line is string => line !== null)
      const description = details.length > 0 ? details.join(' · ') : undefined

      if (outcome.added === 0) {
        toast.info(t('selection.plan.noneAdded'), description ? { description } : undefined)
        return
      }
      toast.success(t('selection.plan.added', { count: outcome.added }), description ? { description } : undefined)
    },
    onError: () => toast.error(t('selection.plan.allFailed')),
  })
}
