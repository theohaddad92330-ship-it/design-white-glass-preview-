/**
 * #4022.1 — une offre = UNE occurrence visible sur tout l'écran (recette prod 13/10, Doctolib :
 * « Product Design Director - Patient » 2× — dans « Ce que BellumAI ajoute » ET dans Recrutements).
 * Sur la veille, la synthèse COMPTE et renvoie aux cartes ; elle ne répète pas l'intitulé.
 */
import type { Account, Contact } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { OpportunityCard } from '../tabs/opportunities/opportunity-cards'
import { RecruitmentSection } from '../tabs/opportunities/OpportunityCards'
import { KnownAccountValueCard } from './KnownAccountValueCard'

const TITLE = 'Product Design Director - Patient (x/f/m)'
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
// #3901.p — ces tests ne portent pas sur le profil : « pas encore chargé » = aucune offre écartée (le motif de WatchlistBoard.test).
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('../components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

const account = { id: 'a', company_name: 'Doctolib', website: null, siren: null } as unknown as Account
const card = {
  key: 'k1',
  title: TITLE,
  basis: { label: TITLE, source: 'Offre d’emploi publiée', date: '2026-10-02', sourceUrl: null, sourceKind: null },
  place: { rank: 'france', place: 'Paris' },
  role: null,
  derivedNeeds: [] as string[],
  contacts: [] as Contact[],
  contactsMatch: 'none',
  origin: 'signal',
  signal: null,
  implication: null,
} as unknown as OpportunityCard

const occurrences = (text: string) => (document.body.textContent?.split(text).length ?? 1) - 1

describe('#4022.1 — la synthèse compte, elle ne répète pas', () => {
  it('veille : synthèse + carte rendues ensemble = UNE occurrence de l’intitulé, et la synthèse COMPTE', async () => {
    watch.signals = [{ signal: `Offre publiée : ${TITLE}`, date: '2026-10-02', sourceUrl: null, sourceKind: null }]
    renderWithRouter(
      <>
        <KnownAccountValueCard account={account} contacts={[]} signalsListedBelow />
        <RecruitmentSection cards={[card]} contacts={[]} />
      </>,
    )
    await screen.findByRole('region', { name: 'Recrutements' })
    expect(screen.getByText(/1 signal depuis ton dernier contact CRM/)).toBeInTheDocument()
    expect(occurrences('Product Design Director')).toBe(1)
  })

  it('SAIT DIRE NON — hors veille (aucune carte à l’écran) la synthèse garde l’intitulé', async () => {
    watch.signals = [{ signal: `Offre publiée : ${TITLE}`, date: '2026-10-02', sourceUrl: null, sourceKind: null }]
    renderWithRouter(<KnownAccountValueCard account={account} contacts={[]} />)
    await screen.findByTestId('known-account-value')
    expect(occurrences('Product Design Director')).toBe(1)
  })
})
