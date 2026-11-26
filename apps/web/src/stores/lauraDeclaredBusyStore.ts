import { create } from 'zustand'

/**
 * #2403.15 / #2403.16 — CE QUE `useLauraBusy` NE POUVAIT PAS ENCORE LIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU
 * ─────────────────────────────────────────────────────────────────────────────
 * `useLauraBusy` compose des états qui existent déjà ailleurs — analyse,
 * tâche de fond, saisie, modale. Deux busy réels n'avaient AUCUN état à lire :
 *
 *  · le mode vocal actif (`voice.phase`, local à chaque `useVoiceMode`) ;
 *  · une action critique qu'un écran lance SANS ouvrir de `[role=dialog]`
 *    (le règlement, l'annulation d'un « facturé » ou un litige, dans
 *    `InvoiceReadinessPanel`, sont des invites EN LIGNE — `useIsModalOpen`
 *    ne les voit pas).
 *
 * Plutôt que deux magasins qui dupliqueraient le même mécanisme (GA-26 — un
 * réglage vit à un seul endroit), UN SEUL magasin, référencé PAR IDENTIFIANT :
 * deux déclarations concurrentes (le vocal ET un règlement en même temps) se
 * composent sans s'écraser, et chacune se retire d'elle-même — voir
 * `useDeclareLauraBusy` dans `useLauraBusy.ts`, qui est le seul consommateur
 * prévu de ce magasin.
 */
type DeclaredBusyStore = {
  activeIds: ReadonlySet<string>
  begin: (id: string) => void
  end: (id: string) => void
}

export const useDeclaredBusyStore = create<DeclaredBusyStore>(set => ({
  activeIds: new Set(),
  begin: id =>
    set(state => {
      if (state.activeIds.has(id)) return state
      const next = new Set(state.activeIds)
      next.add(id)
      return { activeIds: next }
    }),
  end: id =>
    set(state => {
      if (!state.activeIds.has(id)) return state
      const next = new Set(state.activeIds)
      next.delete(id)
      return { activeIds: next }
    }),
}))
