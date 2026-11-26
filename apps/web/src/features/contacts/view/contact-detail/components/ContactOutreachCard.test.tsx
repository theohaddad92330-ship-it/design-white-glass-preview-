import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, OutreachSequence } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useOutreachSequences } from '@/features/outreach/hooks/useOutreachSequences'
import { ContactOutreachCard } from './ContactOutreachCard'

vi.mock('@/features/outreach/hooks/useOutreachSequences', () => ({
  useOutreachSequences: vi.fn(),
  // Lot L-B (#4165) — le dialogue partagé lit les exclusions à l'inscription.
  useEnrollmentEligibility: () => ({ data: undefined }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
  }: {
    children: React.ReactNode
    to: string
    search?: Record<string, string>
    params?: Record<string, string>
  }) => {
    const path = to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? '')
    const query = new URLSearchParams(search ?? {}).toString()
    return <a href={query ? `${path}?${query}` : path}>{children}</a>
  },
}))
// #3700 — le geste « Ajouter à une séquence » ouvre le dialogue PARTAGÉ
// (`CreateSequenceDialog`) : ses propres dépendances, sans rapport avec ce
// test, sont mockées à l'identique de `CreateSequenceDialog.campaign.test.tsx`.
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('@/features/outreach/hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))

const SEQ_ID = '0125b778-807b-4025-a363-b31bfc819af1'
const contact = { id: 'contact-1', full_name: 'Claire Dubois' } as Contact

function setSequences(data: OutreachSequence[] | undefined) {
  vi.mocked(useOutreachSequences).mockReturnValue({ data } as unknown as ReturnType<typeof useOutreachSequences>)
}

function step(over: Record<string, unknown>) {
  return {
    id: 's',
    position: 0,
    kind: 'email',
    status: 'pending',
    due_at: '2026-10-10T08:00:00.000Z',
    payload: {},
    ...over,
  }
}

function sequence(over: Record<string, unknown> = {}): OutreachSequence {
  const done = step({ id: 'a', status: 'done', payload: { label: 'Premier message' } })
  const next = step({ id: 'b', position: 1, payload: { label: 'Relance J+4' } })
  return {
    id: SEQ_ID,
    name: 'Prospection ESN',
    campaign_label: 'Octobre ESN',
    status: 'active',
    can_send: true,
    steps: [done, next],
    next_step: next,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    ...over,
  } as unknown as OutreachSequence
}

describe('ContactOutreachCard — #3700, la fiche ne gère plus les séquences : elle les résume', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('#3700 (recette prod 09/10) — sans séquence : l’état VIDE de la carte s’affiche, avec le geste pour en créer une', () => {
    setSequences([])
    render(<ContactOutreachCard contact={contact} />)
    expect(screen.getByText('Séquences d’outreach')).toBeInTheDocument()
    expect(screen.getByText('Ce contact ne participe à aucune séquence.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter à une séquence' })).toBeInTheDocument()
  })

  it('#3700 — le geste ouvre le dialogue PARTAGÉ (celui de la liste), jamais un second éditeur', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    setSequences([])
    render(<ContactOutreachCard contact={contact} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à une séquence' }))
    // Le dialogue partagé porte ce titre (`CreateSequenceDialog`) — sa
    // présence prouve que c'est bien LUI qui s'ouvre, pas un formulaire maison.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('#3702.8 — la carte dit « rien ne part sans ta validation », vide comme remplie', () => {
    setSequences([])
    const { unmount } = render(<ContactOutreachCard contact={contact} />)
    expect(screen.getByText(/Rien ne part sans ta validation/)).toBeInTheDocument()
    unmount()
    setSequences([sequence()])
    render(<ContactOutreachCard contact={contact} />)
    expect(screen.getByText(/Rien ne part sans ta validation/)).toBeInTheDocument()
  })

  it('pendant le chargement : aucune carte — on ne sait pas encore s’il y a une séquence', () => {
    setSequences(undefined)
    const { container } = render(<ContactOutreachCard contact={contact} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('avec une campagne : nom, état, dernière étape, prochaine action et lien vers LA campagne exacte', () => {
    setSequences([sequence()])
    render(<ContactOutreachCard contact={contact} />)
    expect(screen.getByText('Octobre ESN')).toBeInTheDocument()
    expect(screen.getByText(/Premier message/)).toBeInTheDocument()
    expect(screen.getByText(/Relance J\+4/)).toBeInTheDocument()
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/actions/sequences/${SEQ_ID}`)
  })

  it('ne porte plus de second éditeur : ni « Programmer », ni pause/annuler, ni texte contradictoire', () => {
    setSequences([sequence()])
    render(<ContactOutreachCard contact={contact} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Programmer une séquence/)).toBeNull()
    expect(screen.queryByText(/Jamais d.envoi automatique/)).toBeNull()
  })

  it('une campagne arrêtée n’est JAMAIS lue « active »', () => {
    setSequences([
      sequence({
        status: 'cancelled',
        next_step: null,
        steps: [step({ id: 'a', status: 'done', payload: { label: 'Premier message' } })],
      }),
    ])
    render(<ContactOutreachCard contact={contact} />)
    expect(screen.queryByText('Active')).toBeNull()
    expect(screen.getByText('Annulée')).toBeInTheDocument()
  })
})
