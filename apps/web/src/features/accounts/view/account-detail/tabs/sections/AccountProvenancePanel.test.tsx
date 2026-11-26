import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { AccountProvenancePanel } from './AccountProvenancePanel'
import type { AccountProvenance } from './accountProvenance'

const empty: AccountProvenance = {
  lastAnalyzedAt: null,
  ageDays: null,
  reliability: null,
  tier: null,
  sources: [],
}

describe('AccountProvenancePanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('renders nothing when there is no freshness, no confidence and no source', () => {
    const { container } = render(<AccountProvenancePanel provenance={empty} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the global freshness and the dossier confidence', () => {
    render(
      <AccountProvenancePanel
        provenance={{ ...empty, lastAnalyzedAt: '2026-07-13T09:00:00.000Z', reliability: 72, tier: 'high' }}
      />,
    )
    expect(screen.getByText(/Dernière analyse le/)).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('Confiance élevée')).toBeInTheDocument()
  })

  it('shows "Non évaluable" instead of a numeric score when the tier is non_evaluable (#2307.19)', () => {
    render(
      <AccountProvenancePanel
        provenance={{ ...empty, lastAnalyzedAt: '2026-07-13T09:00:00.000Z', reliability: 0, tier: 'non_evaluable' }}
      />,
    )
    expect(screen.getByText('Non évaluable')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
  })

  it('lists a canonical provider with what it fed', () => {
    render(
      <AccountProvenancePanel
        provenance={{
          ...empty,
          lastAnalyzedAt: '2026-07-13T09:00:00.000Z',
          sources: [
            { key: 'apollo', providerKey: 'apollo', rawLabel: null, feeds: ['firmographics'], latestDate: null },
          ],
        }}
      />,
    )
    expect(screen.getByText('Réseau professionnel')).toBeInTheDocument()
    expect(screen.getByText('Firmographie')).toBeInTheDocument()
    // #2613 — pas de date au niveau de l'item ⇒ la ligne ne fait plus « date
    // inconnue » : elle se tait, la source (son nom, ses feeds) reste seule.
    expect(screen.queryByText('date inconnue')).not.toBeInTheDocument()
  })

  it('shows a raw signal source verbatim and flags an unknown one — never a fabricated provenance', () => {
    render(
      <AccountProvenancePanel
        provenance={{
          ...empty,
          lastAnalyzedAt: '2026-07-13T09:00:00.000Z',
          sources: [
            {
              key: 'raw:brave news',
              providerKey: null,
              rawLabel: 'Brave News',
              feeds: ['signals'],
              latestDate: '2026-07-15',
            },
            { key: 'unknown', providerKey: null, rawLabel: null, feeds: ['signals'], latestDate: '2026-07-02' },
          ],
        }}
      />,
    )
    expect(screen.getByText('Brave News')).toBeInTheDocument()
    expect(screen.getByText('Source inconnue')).toBeInTheDocument()
    expect(screen.getByText('non identifiée')).toBeInTheDocument()
  })
})

describe('AccountProvenancePanel — contradictions de champ (#190.1, #190.2)', () => {
  const side = (value: unknown, at: string) => ({ value, source: 'pipeline' as const, at, authority: 2 })
  const a = side(4200, '2026-08-14T09:00:00.000Z')
  const b = side(5000, '2026-08-18T09:00:00.000Z')
  const conflict = (resolvedBy: 'unresolved' | 'freshness_wins', field = 'headcount') => ({
    field,
    valueA: a,
    valueB: b,
    claims: [a, b] as [typeof a, typeof b],
    sourceTypes: ['pipeline' as const],
    conflictSince: b.at,
    resolvedBy,
    chosenValue: resolvedBy === 'unresolved' ? null : 5000,
    freshnessGapDays: 4,
    nextCheck: resolvedBy === 'unresolved' ? '2026-09-01T09:00:00.000Z' : null,
  })

  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme une contradiction ouverte : les deux prétentions, leur catégorie de source et la revérification', () => {
    render(<AccountProvenancePanel provenance={empty} conflicts={[conflict('unresolved')]} />)
    expect(screen.getByText('Une contradiction à trancher')).toBeInTheDocument()
    expect(screen.getByText('Effectifs')).toBeInTheDocument()
    expect(screen.getByText(/4200 — analyse du dossier/)).toBeInTheDocument()
    expect(screen.getByText(/5000 — analyse du dossier/)).toBeInTheDocument()
    expect(screen.getByText(/À revérifier le/)).toBeInTheDocument()
  })

  it('une contradiction tranchée toute seule ne fait QU’une ligne de décompte, jamais une fiche', () => {
    render(<AccountProvenancePanel provenance={empty} conflicts={[conflict('freshness_wins')]} />)
    expect(screen.getByText(/1 contradiction déjà tranchée/)).toBeInTheDocument()
    expect(screen.queryByText('Une contradiction à trancher')).not.toBeInTheDocument()
    expect(screen.queryByText(/À revérifier le/)).not.toBeInTheDocument()
  })

  it('sait dire NON : aucune contradiction, aucune rangée', () => {
    const { container } = render(<AccountProvenancePanel provenance={empty} conflicts={[]} />)
    expect(container).toBeEmptyDOMElement()
    render(
      <AccountProvenancePanel provenance={{ ...empty, lastAnalyzedAt: '2026-07-13T09:00:00.000Z' }} conflicts={[]} />,
    )
    expect(screen.queryByText(/contradiction/)).not.toBeInTheDocument()
  })
})
