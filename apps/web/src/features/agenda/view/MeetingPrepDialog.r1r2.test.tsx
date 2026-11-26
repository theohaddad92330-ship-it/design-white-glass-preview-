import type { AgendaEvent } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4424.2-.5 — L'APPELANT : le brief d'avant rendez-vous propose R1 et R2 dans
 * le choix manuel, et rend les nouveaux blocs (pitch, REX, atelier, reprise du
 * R1) à partir de ce que l'espace sait déjà.
 */

const account = {
  id: 'a1',
  company_name: 'Acme',
  website: 'acme.fr',
  it_challenges: [{ title: 'Moderniser la plateforme data' }],
  recent_signals: [],
  raw_analysis: null,
  sector: null,
  employees: null,
  revenue: null,
  last_analyzed_at: null,
}
const contact = {
  id: 'c1',
  full_name: 'Jeanne Martin',
  email: 'jeanne@acme.fr',
  title: 'DSI',
  entity: 'Acme',
  decision_role: null,
  updated_at: '2026-10-01T00:00:00.000Z',
}

let factsBrief: { meetings?: { date: string; kind: 'meeting'; label: string }[]; needs?: unknown[] } | null = null

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [account] }] } }),
}))
vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account, contacts: [contact], loading: false }),
}))
vi.mock('../meeting-account-match', async importOriginal => ({
  ...(await importOriginal<typeof import('../meeting-account-match')>()),
  externalAccountCandidatesForEvent: () => [account],
  resolveAssociatedAccount: () => account,
}))
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({
  useAccountFactsBrief: () =>
    factsBrief
      ? { asOf: '2026-10-21T00:00:00.000Z', deals: [], missions: [], recurringNeeds: [], exchanges: [], ...factsBrief }
      : null,
}))
vi.mock('@/features/account-facts/AccountFactsBriefBlock', () => ({ AccountFactsBriefBlock: () => null }))
vi.mock('@/features/activities/hooks/useTimeline', () => ({
  useTimeline: () => ({ data: { items: [] }, isLoading: false }),
}))
vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: [] }, isLoading: false }),
}))
vi.mock('@/features/missions/api', () => ({
  useMissions: () => ({
    data: {
      missions: [
        {
          id: 'm1',
          account_id: 'a9',
          label: 'Refonte data',
          accountName: 'Banque Alpha',
          started_on: '2026-05-01',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  }),
}))
vi.mock('@/features/meetings/api', () => ({ useRecapExists: () => ({ data: { exists: false }, isLoading: false }) }))
vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({ useOfferPortfolio: () => ({ data: undefined }) }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: { esn_name: 'DataCraft', expertise_areas: ['Data'], client_references: [] } }),
}))
vi.mock('@/features/rag/hooks/useRagDocuments', () => ({ useRagDocuments: () => ({ data: [] }) }))
vi.mock('@/lib/product-tracker', () => ({
  trackBriefGenerated: vi.fn(),
  trackBriefOpened: vi.fn(),
  trackFalseAssociationCorrected: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
  useNavigate: () => vi.fn(),
}))
// Le menu Radix ne s'ouvre pas en jsdom : une option = un bouton, même contrat.
vi.mock('@bellum/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@bellum/ui')>()),
  SelectField: ({
    options,
    onChange,
  }: {
    options: { value: string; label: string }[]
    onChange: (value: string) => void
  }) => (
    <div>
      {options.map(option => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

const { MeetingPrepDialog } = await import('./MeetingPrepDialog')

const event: AgendaEvent = {
  id: 'e1',
  summary: 'Point Acme',
  description: null,
  location: null,
  start: '2099-01-10T09:00:00.000Z',
  end: '2099-01-10T10:00:00.000Z',
  organizer: 'moi@datacraft.fr',
  attendees: [{ email: 'jeanne@acme.fr', name: 'Jeanne Martin', external: true }],
  conferenceUrl: null,
  webUrl: null,
  status: null,
  isExternal: true,
  cancelled: false,
} as unknown as AgendaEvent

function renderDialog() {
  return render(<MeetingPrepDialog event={event} language="fr" onClose={() => undefined} />)
}

describe('MeetingPrepDialog — R1, R2 et pitch (#4424)', () => {
  beforeEach(() => {
    factsBrief = null
  })

  it('#4424.5 — R1 et R2 sont proposés dans le choix manuel du type', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'R1 — premier rendez-vous' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'R2 — atelier' })).toBeTruthy()
  })

  it('#4424.4 — le pitch est dans le brief, quel que soit le type : offre de l’ESN × enjeu du compte', () => {
    renderDialog()
    expect(screen.getByText(/Ton pitch/)).toBeTruthy()
    expect(screen.getByText(/Nous sommes DataCraft/)).toBeTruthy()
    expect(screen.getByText(/Chez Acme, nous lisons un enjeu : Moderniser la plateforme data/)).toBeTruthy()
  })

  it('#4424.2 — un R1 rend le déroulé, un REX tiré des missions de l’espace et la proposition d’atelier', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'R1 — premier rendez-vous' }))
    expect(screen.getByText('Le déroulé')).toBeTruthy()
    expect(screen.getByText(/· REX à citer/)).toBeTruthy()
    expect(screen.getByText(/Mission · Refonte data — Banque Alpha/)).toBeTruthy()
    expect(screen.getByText(/Proposer l’atelier/)).toBeTruthy()
  })

  it('#4424.3 — un R2 avec un R1 noté reprend son compte rendu', () => {
    factsBrief = {
      meetings: [{ date: '2026-10-10T10:00:00.000Z', kind: 'meeting', label: 'Budget data 2027 confirmé' }],
      needs: [],
    }
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'R2 — atelier' }))
    expect(screen.getByText(/Ce que le R1 a appris/)).toBeTruthy()
    expect(screen.getByText('R1 du 10/10/2026 : Budget data 2027 confirmé')).toBeTruthy()
  })

  it('#4424.3 — un R2 sans R1 connu le DIT', () => {
    factsBrief = { meetings: [], needs: [] }
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'R2 — atelier' }))
    expect(screen.getByText(/Aucun R1 connu sur ce compte/)).toBeTruthy()
  })
  // #2102.35 / #2102.36 — Renouvellement et Entretien consultant : proposés au choix manuel, jamais déduits,
  // et leur posture s'affiche dans le panneau « Ce que tu veux obtenir ».
  it('#2102.35 — Renouvellement est proposé, et pose sa posture', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Renouvellement' }))
    expect(screen.getByText('Renouveler sur les résultats, pas sur l’habitude.')).toBeTruthy()
  })

  it('#2102.36 — Entretien consultant est proposé, et pose sa posture', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Entretien consultant' }))
    expect(screen.getByText('Préparer le consultant, pas lui souffler ses réponses.')).toBeTruthy()
  })

  // #2097.38 — l'ouverture du panneau d'objectif joue `MOTION.reveal` (fondu M1) : au montage il part
  // de la transparence. Aucun glissement, aucun rebond (GA-25).
  it('#2097.38 — le panneau d’objectif s’ouvre en fondu (MOTION.reveal)', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Renouvellement' }))
    const panel = screen.getByTestId('meeting-outcome-panel')
    expect(panel.style.opacity).toBe('0')
    expect(panel.style.transform).toBe('')
  })
})
