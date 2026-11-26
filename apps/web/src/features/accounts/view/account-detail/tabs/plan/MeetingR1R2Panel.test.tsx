import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4424.1-.3 — LE PANNEAU de la fiche compte : R1 par défaut sans rendez-vous
 * passé, R2 avec ; REX / atelier / pitch présents ; rien d'écrit.
 */

let factsBrief: { meetings?: { date: string; kind: 'meeting'; label: string }[] } | null = null
const mutate = vi.fn()

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({
    contacts: [{ id: 'c1', full_name: 'Jeanne Martin', title: 'DSI' }],
  }),
}))
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({
  useAccountFactsBrief: () =>
    factsBrief
      ? { asOf: '2026-10-21T00:00:00.000Z', deals: [], missions: [], recurringNeeds: [], exchanges: [], ...factsBrief }
      : null,
}))
vi.mock('@/features/missions/api', () => ({
  useMissions: () => ({
    data: {
      missions: [
        {
          id: 'm1',
          label: 'Refonte data',
          accountName: 'Banque Alpha',
          started_on: '2026-05-01',
          updated_at: '2026-05-02T00:00:00.000Z',
        },
      ],
    },
  }),
  useCreateMission: () => ({ mutate }),
}))
vi.mock('@/features/rag/hooks/useRagDocuments', () => ({ useRagDocuments: () => ({ data: [] }) }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({
    data: { esn_name: 'Nova ESN', expertise_areas: ['Data'], client_references: [] },
  }),
}))

// Radix Select ne s'ouvre pas sous jsdom : un <select> natif, même contrat (value / onChange / ariaLabel).
vi.mock('@bellum/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@bellum/ui')>()),
  SelectField: (props: {
    value: string
    onChange: (next: string) => void
    ariaLabel: string
    emptyOption: { label: string }
    options: { value: string; label: string }[]
  }) => (
    <select aria-label={props.ariaLabel} value={props.value} onChange={event => props.onChange(event.target.value)}>
      <option value="">{props.emptyOption.label}</option>
      {props.options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

const { MeetingR1R2Panel } = await import('./MeetingR1R2Panel')

const panel = () => (
  <MeetingR1R2Panel accountId="a1" companyName="Acme" stakesRaw={[{ title: 'Moderniser la plateforme data' }]} />
)

describe('MeetingR1R2Panel — #4424 la préparation R1/R2 depuis la fiche compte', () => {
  beforeEach(() => {
    factsBrief = null
    mutate.mockClear()
  })

  it('R1 par défaut sans rendez-vous passé : déroulé R1, REX, atelier, pitch', () => {
    render(panel())
    expect(screen.getByRole('button', { name: 'Premier rendez-vous (R1)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/aucun rendez-vous passé/)).toBeInTheDocument()
    expect(screen.getAllByText(/Refonte data — Banque Alpha/).length).toBeGreaterThan(0) // REX
    expect(screen.getByText(/Nova ESN/)).toBeInTheDocument() // pitch
    expect(screen.getAllByText(/atelier/i).length).toBeGreaterThan(0) // proposition d'atelier
  })

  it('R2 par défaut quand un compte rendu de R1 existe : reprise du R1', () => {
    factsBrief = { meetings: [{ date: '2026-10-01', kind: 'meeting', label: 'CR du R1 Acme' }] }
    render(panel())
    expect(screen.getByRole('button', { name: 'Second rendez-vous (R2)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/CR du R1 Acme/)).toBeInTheDocument()
  })

  it('le choix manuel l’emporte, et l’interlocuteur est facultatif', () => {
    render(panel())
    fireEvent.click(screen.getByRole('button', { name: 'Second rendez-vous (R2)' }))
    expect(screen.getByRole('button', { name: 'Second rendez-vous (R2)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Interlocuteur : /)).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Interlocuteur (facultatif)' }), { target: { value: 'c1' } })
    expect(screen.getByText('Interlocuteur : Jeanne Martin')).toBeInTheDocument()
  })

  it('ne crée rien : aucune écriture déclenchée', () => {
    render(panel())
    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/aucun e-mail n’est envoyé/)).toBeInTheDocument()
  })
})
