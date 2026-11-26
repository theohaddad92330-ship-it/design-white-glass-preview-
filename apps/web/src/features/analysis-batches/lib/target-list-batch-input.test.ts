import { describe, expect, it } from 'vitest'
import type { TargetList, TargetListItem } from '@bellum/contracts'
import {
  analysisBatchSourceFromTargetList,
  itemsFromTargetList,
  targetListsWithAccounts,
} from './target-list-batch-input'

function item(over: Partial<TargetListItem> = {}): TargetListItem {
  return {
    id: 'item-1',
    target_list_id: 'list-1',
    kind: 'account',
    ref_id: 'account-1',
    label: 'Bouygues Construction',
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'manual',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

function list(over: Partial<TargetList> = {}): TargetList {
  return {
    id: 'list-1',
    name: 'Cibles Q4',
    objective: null,
    type: 'accounts',
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 1, ready_to_work: 0, to_review: 1 },
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'user-1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    items: [item()],
    ...over,
  }
}

/**
 * #2809 (#2293.3) — les trois sources sans écran de sélection dédié
 * (`target_list`, `import`, `laura`) se lisent sur le MÊME champ réel que
 * porte déjà chaque liste cible (`target_lists.source`), jamais un choix
 * inventé ici.
 */
describe('analysisBatchSourceFromTargetList (#2809, #2293.3)', () => {
  it('une liste importée attribue la source `import`', () => {
    expect(analysisBatchSourceFromTargetList(list({ source: 'import' }))).toBe('import')
  })

  it('une liste proposée par Laura attribue la source `laura`', () => {
    expect(analysisBatchSourceFromTargetList(list({ source: 'laura' }))).toBe('laura')
  })

  it('toute autre origine (manuelle, Découvrir, analyse, recherche enregistrée, CRM) attribue `target_list`', () => {
    for (const source of ['manual', 'discover', 'analysis', 'saved_search', 'crm'] as const) {
      expect(analysisBatchSourceFromTargetList(list({ source }))).toBe('target_list')
    }
  })
})

describe('itemsFromTargetList (#2809, #2293.3)', () => {
  it('ne garde que les comptes VIVANTS — un contact ou un élément retiré ne fait aucune ligne', () => {
    const withNoise = list({
      items: [
        item({ id: 'a', kind: 'account', label: 'Compte A' }),
        item({ id: 'b', kind: 'contact', label: 'Jean Dupont' }),
        item({ id: 'c', kind: 'account', label: 'Compte retiré', removed_at: '2026-09-10T00:00:00.000Z' }),
        item({ id: 'd', kind: 'account', label: null }),
      ],
    })
    const { items } = itemsFromTargetList(withNoise)
    expect(items).toEqual([{ name: 'Compte A' }])
  })

  it('une liste sans aucun compte vivant rend une liste vide — pas une entrée inventée', () => {
    const empty = list({ items: [item({ kind: 'contact' })] })
    expect(itemsFromTargetList(empty).items).toEqual([])
  })
})

describe('targetListsWithAccounts (#2809, #2293.3) — on n’affiche pas ce qu’on n’a pas', () => {
  it('écarte une liste sans compte vivant : elle ne fait AUCUNE ligne dans le sélecteur', () => {
    const withAccount = list({ id: 'has-account' })
    const withoutAccount = list({ id: 'empty', items: [] })
    expect(targetListsWithAccounts([withAccount, withoutAccount]).map(l => l.id)).toEqual(['has-account'])
  })
})
