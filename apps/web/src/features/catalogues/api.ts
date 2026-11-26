import type { AddCatalogueValue, CatalogueValue, CataloguesResponse } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'

const catalogueKeys = { all: ['catalogues'] as const }

export function useCatalogues() {
  return useQuery({
    queryKey: [...catalogueKeys.all, i18n.language],
    queryFn: () =>
      apiFetch<CataloguesResponse>({
        path: `/settings/catalogues?lang=${i18n.language.startsWith('en') ? 'en' : 'fr'}`,
      }),
  })
}

export function useAddCatalogueValue() {
  const qc = useQueryClient()
  return useMutation<CatalogueValue, Error, AddCatalogueValue>({
    mutationFn: body =>
      apiFetch<CatalogueValue, AddCatalogueValue>({ path: '/settings/catalogues', method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogueKeys.all }),
    onError: error => toast.error(i18n.t('catalogues:addFailed'), { description: error.message }),
  })
}

/**
 * Retire une valeur. La réponse DIT laquelle des deux choses a eu lieu, et
 * l'écran le répète : quelqu'un qui clique « supprimer » et voit la valeur
 * rester doit comprendre pourquoi, sinon il reclique.
 */
export function useRemoveCatalogueValue() {
  const qc = useQueryClient()
  return useMutation<{ outcome: 'delete' | 'archive' }, Error, { key: string; id: string }>({
    mutationFn: ({ key, id }) =>
      apiFetch<{ outcome: 'delete' | 'archive' }>({ path: `/settings/catalogues/${key}/${id}`, method: 'DELETE' }),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: catalogueKeys.all })
      toast.success(i18n.t(`catalogues:removed.${result.outcome}`))
    },
    onError: error => toast.error(i18n.t('catalogues:removeFailed'), { description: error.message }),
  })
}

/** Une proposition d'alias de compétence (PDF 3 §5.3). */
type SkillAliasProposal = {
  id: string
  rawTerm: string
  canonicalTerm: string | null
  occurrences: number
  status: string
  createdAt: string
}

/**
 * La file d'enrichissement du catalogue : les mots que le produit ne comprend
 * pas. Sans elle, un terme hors référentiel est ignoré en silence et les
 * profils qui l'ont écrit ne remontent sur aucune recherche.
 */
export function useSkillAliasQueue() {
  return useQuery({
    queryKey: ['skill-aliases'],
    queryFn: () =>
      apiFetch<{ items: SkillAliasProposal[]; suggestions: SharedAliasSuggestion[] }>({
        path: '/talents/skill-aliases',
      }),
    select: response => response.items,
  })
}

/** Un rapprochement qu'un AUTRE espace a validé. */
type SharedAliasSuggestion = { rawTerm: string; canonicalTerm: string; workspacesApproved: number }

/**
 * Ce que d'autres ESN ont validé et que ton espace n'a pas encore tranché.
 *
 * Deux listes SÉPARÉES, jamais fondues : ce que ton équipe a écrit d'un côté,
 * ce qui vient d'ailleurs de l'autre. Les mélanger ferait passer un vocabulaire
 * étranger pour le tien — et « ELK » ne veut pas dire la même chose chez une
 * ESN cyber et chez une ESN data.
 */
export function useSharedAliasSuggestions() {
  return useQuery({
    queryKey: ['skill-aliases'],
    queryFn: () =>
      apiFetch<{ items: SkillAliasProposal[]; suggestions: SharedAliasSuggestion[] }>({
        path: '/talents/skill-aliases',
      }),
    select: response => response.suggestions ?? [],
  })
}

/** Trancher — rien ne s'applique avant. */
export function useDecideSkillAlias() {
  const qc = useQueryClient()
  return useMutation<
    SkillAliasProposal,
    Error,
    { id: string; decision: 'approved' | 'rejected'; canonicalTerm?: string }
  >({
    mutationFn: ({ id, decision, canonicalTerm }) =>
      apiFetch<SkillAliasProposal, { decision: string; canonicalTerm?: string }>({
        path: `/talents/skill-aliases/${id}`,
        method: 'PUT',
        body: { decision, canonicalTerm },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skill-aliases'] })
      // Un alias validé change ce que le vivier trouve : la recherche doit
      // repartir, sinon l'effet ne se voit qu'au rechargement.
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}
