import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import {
  buildAccountRankLine,
  buildWatchlistItems,
  countWatchlistFacets,
  countWatchlistTypeFacets,
  filterWatchlistByTypes,
  groupWatchlistByAccount,
  hasUsableSignal,
  signalNeedKind,
} from './watchlist'

/** #4088 — correctifs finaux après recette du 13/10 : chaque test sait dire NON. */

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)

const signal = (id: string, account: string, overrides: Partial<AccountSignalItem> = {}): AccountSignalItem => ({
  id,
  account_id: `00000000-0000-4000-8000-${account.padStart(12, '0')}`,
  account_created_at: day(200),
  account_score: null,
  company_name: `Compte ${account}`,
  date: day(3),
  label: 'Programme data',
  sector: 'Services',
  source: 'Communiqué',
  type: 'Recrutement',
  ...overrides,
})

describe('#4088.11 — SG : un programme de rachat d’ACTIONS n’est pas un rachat d’entreprise', () => {
  const SG =
    'Résultats du deuxième trimestre 2026 en forte hausse, objectifs de rentabilité relevés et programme de rachat d’actions de 1,5 Md€'
  it.each(['budget', 'Rachat', 'acquisition'])('type « %s »', type => {
    expect(signalNeedKind(type, SG)).toBeNull()
  })
  it('un vrai rachat reste un rachat', () => {
    expect(signalNeedKind('acquisition', 'Veolia rachète Suez et lance un rachat d’actions')).toBe('mna')
  })
})

describe('#4088.10 — la puce « Autres » ne compte que les comptes SANS type nommé', () => {
  const items = buildWatchlistItems([
    signal('1', '1', { type: 'Recrutement', label: 'Data engineer' }),
    signal('2', '1', { type: 'Météo', label: 'Orage' }), // le compte 1 a AUSSI un signal « autre »
    signal('3', '2', { type: 'Météo', label: 'Orage' }),
    signal('4', '3', { type: 'Nomination', label: 'Nouveau DSI' }),
  ])

  it('Autres < total quand d’autres types existent ; somme cohérente', () => {
    const counts = countWatchlistTypeFacets(items, undefined)
    expect(counts.other).toBe(1)
    expect(counts.hiring).toBe(1)
    expect(counts.exec).toBe(1)
    expect(counts.other).toBeLessThan(3)
  })

  it('filtrer sur « Autres » ne garde que ce que la puce annonce', () => {
    const kept = filterWatchlistByTypes(items, new Set(['other']), undefined)
    expect(new Set(kept.map(i => i.accountId)).size).toBe(1)
  })
})

describe('#4088.6 — le compteur « À traiter » = les lignes réellement affichables', () => {
  it('un compte dont le signal le plus fort est écarté ne gonfle pas la puce', () => {
    const items = buildWatchlistItems([
      signal('1', '1', { type: 'Recrutement', label: 'Data engineer' }),
      signal('2', '2', { type: 'Recrutement', label: 'Stage développeur' }),
    ])
    const counts = countWatchlistFacets(items, { query: '', rules: [], profile: undefined })
    expect(counts.todo).toBe(1)
  })
})

describe('#4088.7 — « Aucune offre… » est écarté : le repli « Écartés » se remplit en prod', () => {
  it('un compte dont le seul signal est « Aucune offre… » est dans les écartés', () => {
    const items = buildWatchlistItems([
      signal('1', '1', { type: 'croissance', label: 'Aucune offre d’emploi détectée' }),
    ])
    const [group] = groupWatchlistByAccount(items)
    expect(group?.discardReason).toBe('general')
  })
})

describe('#4088.3 — une raison de rang factuelle quand il n’y a ni priorité, ni règle, ni signal récent', () => {
  it('type + fraîcheur, jamais un score', () => {
    const [group] = groupWatchlistByAccount(
      buildWatchlistItems([signal('1', '1', { type: 'Nomination', label: 'Nouveau DSI', date: day(100) })]),
    )
    const line = buildAccountRankLine(group!, [])
    expect(line.join(' · ')).toMatch(/Nomination/)
    expect(line.join(' · ')).toMatch(/100 jours/)
    expect(line.join(' ')).not.toMatch(/\/10/)
  })

  it('#4088 (recette 15/10) — un signal sans type ne donne jamais « Signal « Signal » »', () => {
    const [group] = groupWatchlistByAccount(
      buildWatchlistItems([signal('1', '1', { type: undefined, label: 'Quelque chose', date: day(100) })]),
    )
    const line = buildAccountRankLine(group!, [])
    expect(line.join(' · ')).not.toMatch(/Signal\s+«\s*Signal\s*»/)
    expect(line.join(' · ')).toMatch(/100 jours/)
  })

  it('#4088 — un type générique « Signal » ne se répète pas : « Signal » seul', () => {
    const [group] = groupWatchlistByAccount(
      buildWatchlistItems([signal('1', '1', { type: 'Signal', label: 'Quelque chose', date: day(100) })]),
    )
    const line = buildAccountRankLine(group!, []).join(' · ')
    expect(line).not.toMatch(/«/)
    expect(line).toMatch(/^Signal · /)
  })

  it('NON : les vraies raisons priment sur le repli', () => {
    const [group] = groupWatchlistByAccount(buildWatchlistItems([signal('1', '1', { account_score: 9, date: day(2) })]))
    expect(buildAccountRankLine(group!, [])[0]).toBe('Compte prioritaire')
  })

  it('NON : sans libellé ni type, la ligne n’a rien d’exploitable', () => {
    expect(hasUsableSignal({ signalLabel: ' ', signalType: '' })).toBe(false)
    expect(hasUsableSignal({ signalLabel: 'Nouveau DSI', signalType: '' })).toBe(true)
  })
})
