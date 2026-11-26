import { useCallback, useState } from 'react'
import { loadAllResults } from './loadAllResults'

type Page<T> = { rows: T[]; hasNextPage: boolean; failed: boolean }

/**
 * #3701.3 — « Tous les résultats » : charge (plafonné), PROPOSE, ne coche rien
 * avant l'accord. `proposal` est le jeu à revoir ; `confirm` le coche ET
 * AJOUTE à la sélection existante (rien n'est retiré), `cancel` laisse tout.
 */
export function useSelectAllResults<T extends { id: string }>(args: {
  loaded: T[]
  hasNextPage: boolean
  total: number | undefined
  fetchNext: (() => Promise<Page<T>>) | undefined
  onConfirm: (rows: T[]) => void
}) {
  const { loaded, hasNextPage, total, fetchNext, onConfirm } = args
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<{ rows: T[]; capped: boolean; failed: boolean; total: number } | null>(null)

  const start = useCallback(async () => {
    if (!fetchNext || total === undefined || busy) return
    setBusy(true)
    try {
      setProposal(await loadAllResults({ loaded, hasNextPage, total, fetchNext }))
    } finally {
      setBusy(false)
    }
  }, [busy, fetchNext, hasNextPage, loaded, total])

  const cancel = useCallback(() => setProposal(null), [])
  const confirm = useCallback(() => {
    if (proposal) onConfirm(proposal.rows)
    setProposal(null)
  }, [onConfirm, proposal])
  return { busy, proposal, start, cancel, confirm }
}
