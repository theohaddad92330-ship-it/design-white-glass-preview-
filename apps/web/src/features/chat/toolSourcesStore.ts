import { create } from 'zustand'
import { toolFamiliesOf, type ConnectedClientTool, type ToolFamily } from '@bellum/contracts'

/**
 * #3708 — « OUTILS ET SOURCES » : ce que la personne a DÉSÉLECTIONNÉ pour un fil.
 *
 * Même patron que `researchModeStore.ts` : une clé par conversation, EN MÉMOIRE
 * (la portée annoncée dans le menu est « cette conversation »). On range les
 * EXCLUS et non les choisis : un outil branché après coup est sélectionné par
 * défaut, jamais exclu en silence.
 *
 * Désélectionner n'est PAS déconnecter : ce magasin n'écrit rien dans le
 * registre d'outils ni dans les droits — il ne dit que ce que le PROCHAIN tour
 * n'a pas le droit de lire (`excludedToolFamilies`, appliqué côté serveur).
 */
type ToolSourcesStore = {
  excluded: Record<string, string[]>
  toggle: (conversationId: string, provider: string) => void
}

export const useToolSourcesStore = create<ToolSourcesStore>(set => ({
  excluded: {},
  toggle: (conversationId, provider) =>
    set(state => {
      const current = state.excluded[conversationId] ?? []
      const next = current.includes(provider) ? current.filter(p => p !== provider) : [...current, provider]
      return { excluded: { ...state.excluded, [conversationId]: next } }
    }),
}))

const NONE: readonly string[] = []

/** Les fournisseurs exclus d'un fil — vide pour un fil sans choix. */
export function excludedProvidersFor(
  excluded: Record<string, string[]>,
  conversationId: string | null | undefined,
): readonly string[] {
  return (conversationId && excluded[conversationId]) || NONE
}

/**
 * Les FAMILLES réellement coupées pour le tour : celles dont TOUS les outils
 * branchés sont exclus. Le serveur exécute ses lectures par famille (CRM,
 * messagerie, agenda…) ; une famille encore portée par un outil sélectionné
 * reste donc lisible — le menu le DIT (`familyStillRead`), il ne fait pas
 * semblant d'avoir exclu l'autre. #3973 — un outil compte dans CHACUNE des
 * familles qu'il sert (Microsoft 365 : messagerie ET agenda, `toolFamiliesOf`).
 */
export function excludedFamilies(
  tools: readonly ConnectedClientTool[],
  excludedProviders: readonly string[],
): ToolFamily[] {
  const families = [...new Set(tools.flatMap(toolFamiliesOf))]
  return families.filter(family =>
    tools
      .filter(tool => toolFamiliesOf(tool).includes(family))
      .every(tool => excludedProviders.includes(tool.provider)),
  )
}

/**
 * #3708.fournisseur — les OUTILS réellement décochés pour le tour, par
 * identifiant de connecteur : ce que le serveur filtre outil par outil (il en
 * déduit lui-même la famille quand le dernier outil d'une famille est décoché).
 * Un identifiant qui n'est plus branché est écarté : jamais d'exclusion fantôme.
 */
export function excludedProviderIds(
  tools: readonly ConnectedClientTool[],
  excludedProviders: readonly string[],
): string[] {
  return [...new Set(tools.map(tool => tool.provider))].filter(provider => excludedProviders.includes(provider))
}
