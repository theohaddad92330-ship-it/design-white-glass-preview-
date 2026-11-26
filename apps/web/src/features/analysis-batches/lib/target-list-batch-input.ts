import {
  ANALYSIS_BATCH_MAX_ITEMS,
  type AnalysisBatchInput,
  type AnalysisBatchSource,
  type TargetList,
} from '@bellum/contracts'

/**
 * #2809 (#2293.3) — TROIS SOURCES SANS ÉCRAN DE SÉLECTION DÉDIÉ : liste cible
 * (`target_list`), import, demandé à Laura. `NewAnalysisBatch.tsx` ne
 * connaissait que la liste COLLÉE (`parseBatchInput`, sources `names` /
 * `identifiers`) — les trois autres sources existaient déjà dans le contrat
 * (`ANALYSIS_BATCH_SOURCES`) sans jamais être atteignables depuis Découvrir.
 *
 * Les trois se lisent sur le MÊME champ réel, `target_lists.source`
 * (`TargetListSource`, déjà écrit par la création manuelle, l'import ou le
 * handoff Laura d'une liste — voir `target-list.entity.ts`) : jamais un choix
 * demandé une seconde fois à l'utilisateur, jamais une source devinée.
 */
export function analysisBatchSourceFromTargetList(list: Pick<TargetList, 'source'>): AnalysisBatchSource {
  if (list.source === 'import') return 'import'
  if (list.source === 'laura') return 'laura'
  return 'target_list'
}

/** Un élément de liste cible qui désigne une ENTREPRISE toujours présente —
 *  un lot d'analyse ne porte que des comptes, jamais un contact isolé. */
function isLiveAccountItem(item: Pick<TargetList['items'][number], 'kind' | 'removed_at' | 'label'>): boolean {
  return item.kind === 'account' && item.removed_at == null && !!item.label?.trim()
}

/**
 * Les entreprises d'une liste cible, telles qu'un lot les emporterait.
 * `label` porte déjà le nom lu sur la fiche canonique (`target-list.ts`) —
 * aucun second appel réseau. Bornée à {@link ANALYSIS_BATCH_MAX_ITEMS} ; le
 * reste est compté, jamais tronqué en silence (même règle que `parseBatchInput`).
 */
export function itemsFromTargetList(list: Pick<TargetList, 'items'>): {
  items: AnalysisBatchInput[]
  overLimit: number
} {
  const live = list.items.filter(isLiveAccountItem)
  const items = live.slice(0, ANALYSIS_BATCH_MAX_ITEMS).map(item => ({ name: item.label!.trim() }))
  return { items, overLimit: Math.max(0, live.length - ANALYSIS_BATCH_MAX_ITEMS) }
}

/** Les listes réellement proposables : au moins une entreprise vivante.
 *  On n'affiche pas ce qu'on n'a pas — une liste sans compte ne fait aucune ligne. */
export function targetListsWithAccounts(lists: readonly TargetList[]): TargetList[] {
  return lists.filter(list => itemsFromTargetList(list).items.length > 0)
}
