import { connectedClientTools } from '@bellum/contracts'
import { useMemo } from 'react'
import { useToolRegistry } from '@/features/integration-center/api'

/** Un outil de facturation que l'ESPACE a branché : son nom, sa dernière lecture, son état. */
type InvoicingTool = { provider: string; name: string; lastSync: string | null; needsReconnect: boolean }

/**
 * Les outils de facturation BRANCHÉS par l'espace — ceux dont le registre dit qu'ils lisent des
 * factures (`data_types.reads` ∋ `invoices`), sous le nom que leur donne `connectedClientTools` :
 * on nomme ce que l'espace a branché, jamais ce qui nous sert (doctrine). Aucun outil : liste vide,
 * et l'écran le dit au lieu d'inventer une source.
 */
export function useInvoicingTools(): InvoicingTool[] {
  const { data } = useToolRegistry()
  return useMemo(() => {
    const registry = Array.isArray(data) ? data : []
    const readsInvoices = new Map(
      registry
        .filter(tool => tool.data_types?.reads?.includes('invoices'))
        .map(tool => [tool.provider, tool.last_sync ?? null] as const),
    )
    return connectedClientTools(registry)
      .filter(tool => readsInvoices.has(tool.provider))
      .map(tool => ({
        provider: tool.provider,
        name: tool.name,
        lastSync: readsInvoices.get(tool.provider) ?? null,
        needsReconnect: tool.needsReconnect === true,
      }))
  }, [data])
}
