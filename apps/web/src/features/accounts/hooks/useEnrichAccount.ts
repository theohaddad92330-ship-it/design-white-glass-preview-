import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ContactScope, OrgHierarchyRelation } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi, type EnrichContactsResult } from '@/features/accounts/api'
import { contactKeys } from '@/features/contacts/api'
import { ApiError } from '@/lib/api-error'

/** HTTP status behind an ``apiFetch`` failure, when we can read it. */
function statusOf(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  if (err instanceof Error && typeof err.cause === 'number') return err.cause
  return null
}

/**
 * Mutation for `POST /analysis/:id/enrich-contacts` — re-runs Phase 2 (contact
 * discovery) for an account whose original analysis came back empty. Used by
 * the "Enrichir les contacts" button on the AccountDetail Contacts tab.
 *
 * Synchronous from the server's POV: the API blocks until the IA service
 * finishes (~30-60s typically). We invalidate both the account detail and
 * the contacts-by-account caches so the new rows appear once the request
 * lands.
 */
export function useEnrichContacts(accountId: string) {
  const qc = useQueryClient()

  // `mutate()` runs a wide pass; `mutate(scope)` narrows the re-run to one angle
  // (entity / persona-theme / seniority) and merges into the existing stock.
  return useMutation<EnrichContactsResult, Error, ContactScope | void>({
    mutationKey: ['accounts', accountId, 'enrichContacts'],
    mutationFn: scope => accountsApi.enrichContacts(accountId, scope || undefined),
    onSuccess: ({ count, identified, organigramRebuild, orgAnchorSource }) => {
      // C.2 (Cédric 20/10) — une recherche partie sans ancre d'organisation le DIT,
      // plutôt que de laisser croire qu'on a cherché plus loin. Absent = non mesuré.
      const nameOnly = orgAnchorSource === 'none' ? i18n.t('accounts:toast.contactsSearchNameOnly') : undefined
      // Ce que le dossier a GAGNÉ, pas ce que la recherche a annoncé. Le serveur
      // renvoie les deux : un contact déjà connu est fusionné dans sa ligne, une
      // identité insuffisante est refusée — « 2 contacts identifiés » sur une
      // liste qui ne bouge pas, c'est ce qui faisait chercher un bug ailleurs.
      if (count === 0) {
        toast.info(
          identified && identified > 0
            ? i18n.t('accounts:toast.contactsAlreadyKnown', { count: identified })
            : i18n.t('accounts:toast.noContactsFound'),
          nameOnly ? { description: nameOnly } : undefined,
        )
      } else {
        toast.success(i18n.t('accounts:toast.contactsIdentified', { count }), {
          // La carte d'influence se lit dans le graphe, reconstruit en tâche de
          // fond derrière la recherche. `queued` : l'onglet Organigramme suit et
          // le dira. `unavailable` : les contacts sont au dossier mais la carte
          // ne bougera pas toute seule — on le DIT plutôt que de laisser chercher
          // pourquoi rien n'a changé à l'écran.
          description:
            [
              organigramRebuild === 'queued'
                ? i18n.t('accounts:toast.orgMapRebuilding')
                : organigramRebuild === 'unavailable'
                  ? i18n.t('accounts:toast.orgMapNotRefreshed')
                  : undefined,
              nameOnly,
            ]
              .filter(Boolean)
              .join(' ') || undefined,
        })
      }
    },
    // Rechargé même en échec : les contacts s'écrivent côté serveur AVANT la
    // réponse. Une connexion coupée sur un appel long ne doit pas laisser l'écran
    // sur un dossier périmé alors que le travail est fait — sinon on relance, et
    // on repaie, une recherche déjà aboutie.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
      // Le suivi de reconstruction doit repartir sur le job qui vient d'être mis
      // en file, pas sur l'état lu avant le clic.
      qc.invalidateQueries({ queryKey: accountKeys.orgRebuild(accountId) })
    },
    onError: err => {
      // Refus de PÉRIMÈTRE (Théo TF1 p8) : la recherche ciblée vise une entité ou
      // un thème que le commercial a EXCLU au lancement de l'analyse. Le serveur
      // refuse EN AMONT (409, zéro appel Apollo/LLM, zéro crédit) avec un message
      // précis nommant l'entité/le thème écarté. C'est exactement le genre de refus
      // que le front avalait en silence : on le rend VISIBLE et DISTINCT d'une vraie
      // erreur technique — un avertissement, pas une erreur.
      if (statusOf(err) === 409) {
        toast.warning(i18n.t('accounts:toast.contactSearchOutOfScope'), {
          description: err.message || undefined,
          duration: 8_000,
        })
        return
      }
      toast.error(err.message || i18n.t('accounts:toast.enrichContactsError'))
    },
  })
}

/**
 * Mutation pour `POST /analysis/:id/recompute-path` — « Recalculer le chemin ».
 *
 * Frère léger d'« Enrichir l'organigramme » : le serveur réordonne la séquence
 * d'approche à partir du graphe DÉJÀ stocké (aucune recherche, aucun crédit),
 * ce qui rend la réponse immédiate. Utile après avoir écarté un contact ou
 * enrichi une zone blanche : seul l'ORDRE était périmé.
 */
export function useRecomputeOrgPath(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ steps: number; graphVersion: number }, Error>({
    mutationKey: ['accounts', accountId, 'recomputeOrgPath'],
    mutationFn: () => accountsApi.recomputeOrgPath(accountId),
    onSuccess: ({ steps }) => {
      toast.success(i18n.t('accounts:toast.orgPathRecomputed', { count: steps }))
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.orgPathRecomputeError'))
    },
  })
}

/**
 * Mutation pour `POST /analysis/:id/verify-relation` — « Vérifier une relation »
 * (annexe organigramme p22).
 *
 * Le serveur va chercher la preuve d'UN lien inféré : trouvée, le lien devient
 * vérifié (plein, sourcé) ; pas trouvée, on le DIT et le lien reste tel quel —
 * l'absence de preuve n'est pas une preuve du contraire, on ne dégrade rien.
 * ⚠️ Ce geste COÛTE 1 à 2 crédits (`creditCostOf('relation_verification')`), et ce
 * fichier affirmait le contraire depuis sa création. Le débit part dans
 * `analysis-ondemand.service.ts` APRÈS la preuve : une recherche qui ne trouve
 * rien n'est pas facturée. C'est le seul repli honnête — mais « aucun crédit »
 * était faux, et l'écran le répétait à l'utilisateur.
 */
export function useVerifyOrgRelation(accountId: string) {
  const qc = useQueryClient()

  return useMutation<
    { found: boolean; verified: boolean; confidence: number | null; graphVersion: number | null },
    Error,
    { fromId: string; toId: string; type: OrgHierarchyRelation }
  >({
    mutationKey: ['accounts', accountId, 'verifyOrgRelation'],
    mutationFn: edge => accountsApi.verifyOrgRelation(accountId, edge),
    onSuccess: result => {
      if (!result.found) {
        // Une recherche qui ne trouve rien n'est pas une panne : on le dit
        // comme une information, pas comme une erreur.
        toast.info(i18n.t('accounts:toast.relationNoProof'))
        return
      }
      // #3777 / #3680.5 — une confiance absente n'est pas « confiance 0 » : sans valeur, la phrase ne la cite pas.
      toast.success(
        result.verified
          ? i18n.t('accounts:toast.relationVerified')
          : result.confidence === null
            ? i18n.t('accounts:toast.relationSupportedNoScore')
            : i18n.t('accounts:toast.relationSupported', { value: result.confidence }),
      )
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.relationVerifyError'))
    },
  })
}

/**
 * Mutation for `POST /analysis/:id/enrich-organigram` — re-runs Phase 3
 * (role classification + email/phone) over the existing contacts of an
 * account. Used by the "Enrichir l'organigramme" button on the Organigramme
 * tab when the original enrichment was incomplete.
 */
export function useEnrichOrganigram(accountId: string) {
  const qc = useQueryClient()

  return useMutation<{ matched: number; total: number; orgGraphUpdated: boolean }, Error>({
    mutationKey: ['accounts', accountId, 'enrichOrganigram'],
    mutationFn: () => accountsApi.enrichOrganigram(accountId),
    onSuccess: ({ matched, total, orgGraphUpdated }) => {
      if (total === 0) {
        toast.info(i18n.t('accounts:toast.noContactsToEnrich'))
      } else if (!orgGraphUpdated) {
        // #2755 — la phase 3 a classé des contacts, mais l'IA n'a assemblé
        // AUCUN graphe cette fois (`saveOrgChart` a no-op côté serveur).
        // Dire « organigramme mis à jour » laisserait croire qu'une carte va
        // apparaître — l'onglet Organigramme reste sur son état vide, et le
        // toast doit le dire plutôt que de fabriquer un succès.
        toast.warning(i18n.t('accounts:toast.orgGraphNotAssembled', { matched, total }))
      } else {
        toast.success(i18n.t('accounts:toast.orgUpdated', { matched, total }))
      }
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
    },
    onError: err => {
      toast.error(err.message || i18n.t('accounts:toast.enrichOrgError'))
    },
  })
}
