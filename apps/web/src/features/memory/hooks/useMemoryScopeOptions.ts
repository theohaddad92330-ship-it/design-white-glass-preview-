import { useQuery } from '@tanstack/react-query'
import { businessUnitListSchema, offerableMemoryScopes, type MemoryScopeOffer } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1918.2 / #1918.5 — CE QUE L'ÉCRAN A LE DROIT DE PROPOSER comme portée, ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK, ET PAS `memoryItemScopes` PARCOURU DANS LE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les écrans parcouraient l'énumération entière. Deux valeurs ajoutées y
 * auraient fait apparaître tout seuls deux boutons radio qu'aucun écran ne peut
 * honorer : « cette conversation » hors d'un fil ne désigne rien, et « mon
 * périmètre » ne veut rien dire pour qui n'en porte aucun. La règle vit donc
 * dans le contrat (`offerableMemoryScopes`, un seul endroit — GA-26) ; ce hook
 * ne fait que lui apporter le contexte.
 *
 * Les périmètres viennent de la liste que l'API rend déjà (`GET /business-units`),
 * filtrée sur ceux que l'appelant PORTE (`viewerIsMember`) et qui sont ACTIFS —
 * on ne propose pas d'écrire pour une agence archivée. Une lecture qui échoue
 * rend simplement les deux portées d'avant : « je n'ai pas pu lire » n'ouvre
 * jamais une portée, il la retire.
 */
export function useMemoryScopeOptions(conversationId?: string | null): MemoryScopeOffer[] {
  const { user } = useSession()
  const { data } = useQuery({
    queryKey: ['memory', 'scope-options', 'business-units'],
    queryFn: async () => {
      const raw = await apiFetch<unknown>({ path: '/business-units' })
      const parsed = businessUnitListSchema.safeParse(raw)
      if (!parsed.success) return []
      return parsed.data.businessUnits
        .filter(unit => unit.viewerIsMember && unit.status === 'active')
        .map(unit => ({ id: unit.id, name: unit.name }))
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
  return offerableMemoryScopes({ conversationId, businessUnits: data ?? [] })
}
