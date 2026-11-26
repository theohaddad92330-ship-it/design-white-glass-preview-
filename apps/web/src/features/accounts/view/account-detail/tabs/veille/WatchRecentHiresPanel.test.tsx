import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AccountRecentHires, RecentHire } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { WatchRecentHiresPanel } from './WatchRecentHiresPanel'

const hire = (overrides: Partial<RecentHire> = {}): RecentHire => ({
  contactId: 'c1',
  name: 'Claire Martin',
  role: 'DSI',
  startedOn: '2026-08-01',
  source: 'people_enrichment',
  email: 'claire.martin@acme.fr',
  phone: null,
  linkedinUrl: null,
  relevance: {
    status: 'pertinent',
    reasonFr: 'Nouveau décideur de ta persona « DSI » — il revoit souvent ses prestataires à son arrivée.',
    reasonEn: 'New decision-maker from your persona "DSI" — newcomers often review their suppliers.',
  },
  ...overrides,
})

const data = (overrides: Partial<AccountRecentHires> = {}): AccountRecentHires => ({
  windowDays: 183,
  examinedContacts: 4,
  hires: [hire()],
  ...overrides,
})

// #3970 — « qui a été recruté, à quel rôle, depuis quand, et pourquoi ça colle ».
describe('WatchRecentHiresPanel (#3970)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme la personne, son rôle, sa date, la capacité source, la raison et ses coordonnées pro', () => {
    render(<WatchRecentHiresPanel data={data()} isError={false} />)
    expect(screen.getByRole('heading', { name: 'Recrutements récents' })).toBeInTheDocument()
    expect(screen.getByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText('DSI')).toBeInTheDocument()
    expect(screen.getByText(/Depuis/)).toBeInTheDocument()
    expect(screen.getByText(/Enrichissement des profils/)).toBeInTheDocument()
    expect(screen.getByText(/Nouveau décideur de ta persona/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /claire\.martin@acme\.fr/ })).toHaveAttribute(
      'href',
      'mailto:claire.martin@acme.fr',
    )
  })

  it('sait dire NON : sans aucun parcours connu, « non mesuré », jamais « aucun recrutement »', () => {
    render(<WatchRecentHiresPanel data={data({ examinedContacts: 0, hires: [] })} isError={false} />)
    expect(screen.getByText(/Non mesuré/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune arrivée/)).not.toBeInTheDocument()
  })

  it('des parcours examinés sans arrivée datée récente : le dit, avec le nombre examiné', () => {
    render(<WatchRecentHiresPanel data={data({ hires: [] })} isError={false} />)
    expect(screen.getByText(/Aucune arrivée datée de moins de 6 mois parmi 4 contacts/)).toBeInTheDocument()
  })

  it('une pertinence non évaluable ne fait aucune ligne de raison', () => {
    render(
      <WatchRecentHiresPanel
        data={data({ hires: [hire({ relevance: { status: 'non_evaluable', reasonFr: 'NE', reasonEn: 'NE' } })] })}
        isError={false}
      />,
    )
    expect(screen.queryByText('NE')).not.toBeInTheDocument()
  })

  it('une lecture en échec le dit, sans liste vide qui se lirait « personne »', () => {
    render(<WatchRecentHiresPanel data={null} isError />)
    expect(screen.getByText(/n’ont pas pu être lus/)).toBeInTheDocument()
  })

  it('aucun nom de fournisseur à l’écran', () => {
    const { container } = render(<WatchRecentHiresPanel data={data()} isError={false} />)
    expect(container.textContent ?? '').not.toMatch(/apollo/i)
  })
})
