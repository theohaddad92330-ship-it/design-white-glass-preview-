import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  MaskableWorkspaceSection,
  UpdateWorkspaceHiddenSections,
  WorkspaceHiddenSectionsResolution,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2957 (#2179.2/.35) — les sections qu'un admin a masquées pour l'espace.
 *
 * Lu par la barre d'onglets (masquer pour TOUS) et par l'empty state de `/rfp`
 * (le seul endroit où on bascule). Le doute ne masque pas : tant que la
 * lecture n'a pas répondu, ou si elle échoue, la liste est VIDE — un onglet
 * qui disparaît sur une erreur réseau se lirait comme une panne.
 */
export const WORKSPACE_HIDDEN_SECTIONS_KEY = ['workspace', 'hidden-sections'] as const

export function useWorkspaceHiddenSections(enabled = true): readonly MaskableWorkspaceSection[] {
  const { data } = useQuery({
    queryKey: WORKSPACE_HIDDEN_SECTIONS_KEY,
    queryFn: () => apiFetch<WorkspaceHiddenSectionsResolution>({ path: '/workspaces/hidden-sections' }),
    enabled,
    staleTime: 5 * 60_000,
  })
  return Array.isArray(data?.hiddenSections) ? data.hiddenSections : []
}

export function useSetWorkspaceSectionHidden() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      current,
      section,
      hidden,
    }: {
      current: readonly MaskableWorkspaceSection[]
      section: MaskableWorkspaceSection
      hidden: boolean
    }) => {
      const next = hidden ? [...new Set([...current, section])] : current.filter(value => value !== section)
      return apiFetch<WorkspaceHiddenSectionsResolution, UpdateWorkspaceHiddenSections>({
        path: '/workspaces/hidden-sections',
        method: 'PATCH',
        body: { hiddenSections: next },
      })
    },
    onSuccess: data => queryClient.setQueryData(WORKSPACE_HIDDEN_SECTIONS_KEY, data),
  })
}
