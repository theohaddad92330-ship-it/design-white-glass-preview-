/**
 * #3925 — « Ce que BellumAI ajoute » cite l'offre publiée SANS lien (recette NE, démo SNCF 10/10).
 * Un signal cité qui porte une URL porte aussi « Voir l'offre » / « Voir l'article » ; sans URL, aucune ligne.
 */
import type { Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KnownAccountValueCard } from './KnownAccountValueCard'

const watch = vi.hoisted(() => ({ signals: [] as Record<string, unknown>[] }))
vi.mock('@/features/accounts/model/watchData', () => ({ buildAccountWatchData: () => ({ signals: watch.signals }) }))
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({
  useCrmPresence: () => ({
    data: {
      provider: 'hubspot',
      matched: true,
      contactsCount: 0,
      contacts: [],
      openDeals: [],
      lastActivityAt: '2026-09-01T00:00:00.000Z',
    },
  }),
}))

const account = { id: 'a', company_name: 'SNCF', website: null, siren: null } as unknown as Account

describe('#3925 — KnownAccountValueCard porte le lien des signaux cités', () => {
  it('une offre publiée avec URL (source_kind job) porte « Voir l’offre »', () => {
    watch.signals = [
      {
        signal: 'Offre publiée : Architecte cloud',
        date: '2026-10-02',
        sourceUrl: 'https://example.org/demo/job/sncf-architecte-cloud',
        sourceKind: 'job',
      },
    ]
    render(<KnownAccountValueCard account={account} contacts={[]} />)
    expect(screen.getByText(/Offre publiée : Architecte cloud/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Voir l.offre/ })
    expect(link.getAttribute('href')).toBe('https://example.org/demo/job/sncf-architecte-cloud')
  })

  it('SAIT DIRE NON — un signal sans URL ne fait aucun lien, ni « Sans lien vérifiable »', () => {
    watch.signals = [
      { signal: 'Offre publiée : Architecte cloud', date: '2026-10-02', sourceUrl: null, sourceKind: null },
    ]
    const { container } = render(<KnownAccountValueCard account={account} contacts={[]} />)
    expect(screen.getByText(/Offre publiée : Architecte cloud/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).not.toMatch(/Sans lien/)
  })

  it('R25 — le compteur compte les ÉVÉNEMENTS, pas les doublons que la liste fusionne (EDF : 4 annoncés, 3 listés)', () => {
    const base = { category: 'budget', date: '2026-10-02', freshness: 'current', sourceUrl: null, sourceKind: null }
    watch.signals = [
      { ...base, signal: 'Veolia investit dans Mistral AI', source: 'A' },
      { ...base, signal: 'Veolia investit dans Mistral AI pour l’IA générative', source: 'B' },
      { ...base, signal: 'Nouveau DSI nommé', source: 'C' },
    ]
    render(<KnownAccountValueCard account={account} contacts={[]} signalsListedBelow />)
    expect(screen.getByText(/^2 signaux depuis ton dernier contact CRM/)).toBeInTheDocument()
  })
})
