import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { useMailboxStatus } from '@/features/mailbox/api'
import { usePlanItems } from '@/features/actions/hooks/usePlanItems'
import { ContactRelationSummary } from './ContactRelationSummary'

vi.mock('@/features/activities/hooks/useTimeline', () => ({ useTimeline: vi.fn() }))
vi.mock('@/features/mailbox/api', () => ({ useMailboxStatus: vi.fn() }))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to)}>{children}</a>
  ),
}))

const CONTACT = 'c0000000-0000-4000-8000-000000000001'
const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

function setTimeline(items: unknown[], extra: Record<string, unknown> = {}) {
  vi.mocked(useTimeline).mockReturnValue({
    data: { items },
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useTimeline>)
}
function setPlan(items: unknown[]) {
  vi.mocked(usePlanItems).mockReturnValue({ items } as unknown as ReturnType<typeof usePlanItems>)
}
const planItem = (over: Record<string, unknown>) => ({
  id: 'p1',
  account_id: ACCOUNT,
  label: 'Relancer par téléphone',
  contact_id: CONTACT,
  execution_status: 'todo',
  due_date: null,
  owner_name: null,
  outcome: null,
  result: null,
  completed_at: null,
  ...over,
})

function setMailbox(connected: boolean) {
  vi.mocked(useMailboxStatus).mockReturnValue({ data: { connected } } as unknown as ReturnType<typeof useMailboxStatus>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  setMailbox(true)
})

describe('ContactRelationSummary (#3691)', () => {
  it('sans historique : « Aucun échange enregistré », jamais « Jamais contacté »', () => {
    setTimeline([])
    setPlan([])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText('Aucun échange enregistré')).toBeInTheDocument()
    expect(screen.queryByText(/jamais contacté/i)).not.toBeInTheDocument()
  })

  it('tentative sans réponse, relance en retard : tout tient en quelques lignes, lien vers la tâche', () => {
    setTimeline([{ id: 'a1', kind: 'email', direction: 'outbound', occurredAt: day(-5), verdict: 'sent' }])
    setPlan([planItem({ due_date: day(-2).slice(0, 10) })])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText('Dernière prise de contact')).toBeInTheDocument()
    expect(screen.getByText('Aucune réponse enregistrée depuis')).toBeInTheDocument()
    expect(screen.queryByText('Dernier échange réel')).not.toBeInTheDocument()
    expect(screen.getByText(/En retard depuis le/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relancer par téléphone' })).toHaveAttribute('href', '/actions/p1')
  })

  it('#3688 — les lignes du résumé sont sur deux colonnes (le premier écran garde notes + historique)', () => {
    setTimeline([{ id: 'a1', kind: 'email', direction: 'outbound', occurredAt: day(-5), verdict: 'sent' }])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    const list = screen.getByText('Dernière prise de contact').closest('dl')
    expect(list?.className).toContain('sm:grid-cols-2')
  })

  it('une réponse enregistrée : dernier échange réel visible, plus d’attente de réponse', () => {
    setTimeline([
      { id: 'a1', kind: 'email', direction: 'outbound', occurredAt: day(-5), verdict: 'sent' },
      { id: 'a2', kind: 'email', direction: 'inbound', occurredAt: day(-3), verdict: null },
    ])
    setPlan([planItem({ due_date: day(4).slice(0, 10), owner_name: 'Marie' })])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText('Dernier échange réel')).toBeInTheDocument()
    expect(screen.queryByText('Aucune réponse enregistrée depuis')).not.toBeInTheDocument()
    expect(screen.getByText(/Responsable : Marie/)).toBeInTheDocument()
  })

  it('messagerie non lue : la réponse n’est pas garantie absente', () => {
    setTimeline([{ id: 'a1', kind: 'email', direction: 'outbound', occurredAt: day(-5), verdict: 'sent' }])
    setPlan([])
    setMailbox(false)
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText(/Réponse non vérifiable/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune réponse enregistrée depuis')).not.toBeInTheDocument()
  })

  it('une note ne rajeunit pas le dernier contact ; une tâche terminée n’est pas « à faire »', () => {
    setTimeline([{ id: 'n1', kind: 'note', direction: 'internal', occurredAt: day(-1), verdict: null }])
    setPlan([
      planItem({ execution_status: 'done', outcome: 'positive', result: 'Veut un devis', completed_at: day(-1) }),
    ])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.queryByText('Dernière prise de contact')).not.toBeInTheDocument()
    expect(screen.queryByText('Prochaine action')).not.toBeInTheDocument()
    expect(screen.getByText('Veut un devis')).toBeInTheDocument()
  })

  it('échec de lecture ≠ « sans réponse » : on le dit', () => {
    setTimeline([], { data: undefined, isError: true })
    setPlan([])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText(/n’a pas pu être lu/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun échange enregistré')).not.toBeInTheDocument()
  })

  it('plusieurs actions : la prochaine pertinente + l’accès aux autres', () => {
    setTimeline([])
    setPlan([
      planItem({ id: 'p1', due_date: day(2).slice(0, 10) }),
      planItem({ id: 'p2', label: 'Autre', due_date: day(9).slice(0, 10) }),
    ])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByRole('link', { name: 'Relancer par téléphone' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ 1 autre action ouverte/ })).toHaveAttribute('href', '/actions')
  })

  // #3697.8 — l'objection RÉELLEMENT exprimée en appel enrichit la relation, avec son appel pour provenance.
  it('#3697.8 — l’objection consignée en appel s’affiche avec sa provenance ; sans débrief, aucune ligne', () => {
    setTimeline([
      {
        id: 'a1',
        kind: 'call',
        direction: 'outbound',
        occurredAt: day(-3),
        verdict: null,
        outcome: 'interest',
        callDebrief: { objection: 'Déjà un prestataire en place' },
      },
    ])
    setPlan([])
    const { unmount } = render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.getByText('Objection exprimée')).toBeInTheDocument()
    expect(screen.getByText('Déjà un prestataire en place')).toBeInTheDocument()
    expect(screen.getByText(/Entendue lors de l’appel du/)).toBeInTheDocument()
    unmount()

    setTimeline([{ id: 'a2', kind: 'call', direction: 'outbound', occurredAt: day(-3), verdict: null, outcome: null }])
    render(<ContactRelationSummary contactId={CONTACT} accountId={ACCOUNT} />)
    expect(screen.queryByText('Objection exprimée')).not.toBeInTheDocument()
  })
})
