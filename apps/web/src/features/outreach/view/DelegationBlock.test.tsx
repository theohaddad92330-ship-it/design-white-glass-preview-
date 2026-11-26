import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutreachDelegationView, OutreachMessage } from '@bellum/contracts'
import { channelCapability, delegationLifecycle } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { delegableMessages, DelegationBlock } from './DelegationBlock'
import { useDelegationAction, useDelegationSteps, useOutreachDelegations } from '../hooks/useOutreachDelegations'
import { useMailboxStatus } from '@/features/mailbox/api'
import { outreachMessagesApi } from '@/features/outreach/api'

vi.mock('../hooks/useOutreachDelegations', () => ({
  useOutreachDelegations: vi.fn(),
  useDelegationAction: vi.fn(),
  useDelegationSteps: vi.fn(),
  useCreateOutreachDelegation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxStatus: vi.fn() }))
vi.mock('@/features/outreach/api', () => ({
  outreachKeys: { messages: () => ['outreach', 'messages'] },
  outreachMessagesApi: { list: vi.fn() },
}))
const useOutreachDelegationsMock = vi.mocked(useOutreachDelegations)
const useDelegationActionMock = vi.mocked(useDelegationAction)
const useDelegationStepsMock = vi.mocked(useDelegationSteps)
const useMailboxStatusMock = vi.mocked(useMailboxStatus)
const outreachMessagesListMock = vi.mocked(outreachMessagesApi.list)

// `DelegationRow` calcule le cycle de vie sur `new Date()` (l'horloge réelle,
// non injectable depuis ce test) : des bornes RELATIVES à l'instant du test
// tiennent quel que soit le jour où la suite tourne — des dates figées se
// seraient lues « expirée » un jour sur deux.
const delegation = (over: Partial<OutreachDelegationView> = {}): OutreachDelegationView =>
  ({
    id: 'd1',
    campaign_label: 'Relance Q4',
    sent_count: 2,
    max_messages: 20,
    contact_count: 5,
    window: { start_hour: 9, end_hour: 18 },
    starts_at: new Date(Date.now() - 86_400_000).toISOString(),
    expires_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    revoked_at: null,
    paused_at: null,
    ...over,
  }) as OutreachDelegationView

const msg = (over: Partial<OutreachMessage>): OutreachMessage =>
  ({ id: 'm', channel: 'email', status: 'needs_review', blockers: [], ...over }) as OutreachMessage

describe('DelegationBlock (#3702.9 / #3700.8)', () => {
  it('ne propose à la délégation que des e-mails relisibles et non bloqués', () => {
    const kept = delegableMessages([
      msg({ id: 'a' }),
      msg({ id: 'b', channel: 'linkedin' }),
      msg({ id: 'c', status: 'sent' }),
      msg({ id: 'd', blockers: ['opted_out'] }),
    ])
    expect(kept.map(m => m.id)).toEqual(['a'])
  })

  it('un mandat révoqué, expiré ou épuisé n’est jamais « active »', () => {
    const base = {
      starts_at: '2026-10-01T00:00:00.000Z',
      expires_at: '2026-10-20T00:00:00.000Z',
      max_messages: 2,
      sent_count: 0,
      revoked_at: null,
      paused_at: null,
    }
    const now = new Date('2026-10-07T00:00:00.000Z')
    expect(delegationLifecycle(base, now)).toBe('active')
    expect(delegationLifecycle({ ...base, paused_at: '2026-10-06T00:00:00.000Z' }, now)).toBe('paused')
    expect(
      delegationLifecycle(
        { ...base, revoked_at: '2026-10-06T00:00:00.000Z', paused_at: '2026-10-06T00:00:00.000Z' },
        now,
      ),
    ).toBe('revoked')
    expect(delegationLifecycle({ ...base, sent_count: 2 }, now)).toBe('exhausted')
    expect(delegationLifecycle(base, new Date('2026-10-21T00:00:00.000Z'))).toBe('expired')
  })

  it('seul l’e-mail est délégable ; LinkedIn, appel, rappel, tâche restent pour le commercial', () => {
    expect(channelCapability('email')).toBe('delegable')
    for (const c of ['linkedin', 'phone', 'reminder', 'task']) expect(channelCapability(c)).toBe('manual_only')
  })
})

// #3702 (R26) — le mandat, la pause, la révocation et l'arrêt sur exclusion
// doivent être VISIBLES, pas seulement vrais côté serveur : ce bloc rend
// l'écran lui-même, pas les seules fonctions pures couvertes ci-dessus.
describe('DelegationBlock — mandat, pause, révocation, arrêts (#3702, lot R26)', () => {
  beforeEach(() => {
    useDelegationStepsMock.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useDelegationSteps>)
  })

  it('un mandat ACTIF se voit, et seule « Mettre en pause » / « Révoquer » lui sont proposés', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    const mutate = vi.fn()
    useDelegationActionMock.mockReturnValue({ mutate } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)

    expect(screen.getByText('Relance Q4')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Révoquer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reprendre' })).not.toBeInTheDocument()
  })

  it('« Mettre en pause » poste l’action pause pour CE mandat, jamais un autre', async () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation(), delegation({ id: 'd2', campaign_label: 'Relance décideurs' })],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    const mutate = vi.fn()
    useDelegationActionMock.mockReturnValue({ mutate } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)
    const [, second] = screen.getAllByRole('button', { name: 'Mettre en pause' })
    await userEvent.click(second)

    expect(mutate).toHaveBeenCalledWith({ id: 'd2', action: 'pause' })
  })

  it('un mandat EN PAUSE propose « Reprendre » et « Révoquer », jamais « Mettre en pause »', async () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation({ paused_at: new Date().toISOString() })],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    const mutate = vi.fn()
    useDelegationActionMock.mockReturnValue({ mutate } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)
    expect(screen.getByText('En pause')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }))
    expect(mutate).toHaveBeenCalledWith({ id: 'd1', action: 'revoke' })
  })

  it('un mandat RÉVOQUÉ ne propose plus aucun geste — ce qui est arrêté le reste', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation({ revoked_at: new Date().toISOString() })],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)
    expect(screen.getByText('Révoquée')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reprendre' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Révoquer' })).not.toBeInTheDocument()
  })

  it('nomme l’arrêt sur EXCLUSION, compté, jamais confondu avec une réponse ou une opposition', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)
    useDelegationStepsMock.mockReturnValue({
      data: [
        {
          message_id: 'm1',
          contact_id: 'c1',
          status: 'needs_review',
          verdict: { decision: 'stop', reason: 'excluded' },
        },
        {
          message_id: 'm2',
          contact_id: 'c2',
          status: 'needs_review',
          verdict: { decision: 'stop', reason: 'excluded' },
        },
        {
          message_id: 'm3',
          contact_id: 'c3',
          status: 'needs_review',
          verdict: { decision: 'stop', reason: 'replied' },
        },
        { message_id: 'm4', contact_id: 'c4', status: 'approved', verdict: { decision: 'run' } },
      ],
    } as unknown as ReturnType<typeof useDelegationSteps>)

    render(<DelegationBlock canSend />)

    expect(screen.getByText('2 arrêtés — exclu')).toBeInTheDocument()
    expect(screen.getByText('1 arrêté — réponse reçue')).toBeInTheDocument()
  })

  it('aucun arrêt : aucune ligne « 0 arrêté » — l’absence ne s’affiche jamais comme un chiffre', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)

    expect(screen.queryByText(/arrêté/)).not.toBeInTheDocument()
  })

  it('un mandat révoqué ou expiré n’interroge plus les arrêts — rien de nouveau à arrêter', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation({ revoked_at: new Date().toISOString() })],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)

    expect(useDelegationStepsMock).toHaveBeenCalledWith('d1', false)
  })

  // #3702.12 — les arrêts « personne effacée » et « consentement expiré » (#4016 L5)
  // n'avaient aucun libellé : l'écran aurait montré une clé brute.
  it('un arrêt « effacé » ou « consentement expiré » se lit en français, jamais une clé brute', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)
    useDelegationStepsMock.mockReturnValue({
      data: [
        { message_id: 'm1', contact_id: 'c1', status: 'approved', verdict: { decision: 'stop', reason: 'erased' } },
        {
          message_id: 'm2',
          contact_id: 'c2',
          status: 'approved',
          verdict: { decision: 'stop', reason: 'consent_expired' },
        },
      ],
    } as unknown as ReturnType<typeof useDelegationSteps>)

    render(<DelegationBlock canSend />)

    expect(screen.getByText('1 arrêté — personne effacée')).toBeInTheDocument()
    expect(screen.getByText('1 arrêté — consentement expiré')).toBeInTheDocument()
  })

  // #3702.13 — « boîte expirée / lecture des réponses retirée jamais masquées par Active ».
  it('un mandat « Active » dont la boîte est tombée NOMME ce qui attend, par raison', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)
    useDelegationStepsMock.mockReturnValue({
      data: [
        {
          message_id: 'm1',
          contact_id: 'c1',
          status: 'approved',
          verdict: { decision: 'awaits_validation', reason: 'mailbox_unavailable' },
        },
        {
          message_id: 'm2',
          contact_id: 'c2',
          status: 'approved',
          verdict: { decision: 'awaits_validation', reason: 'mailbox_unavailable' },
        },
        {
          message_id: 'm3',
          contact_id: 'c3',
          status: 'approved',
          verdict: { decision: 'awaits_validation', reason: 'replies_unreadable' },
        },
        // déjà parti : son verdict d'aujourd'hui n'est plus une attente
        {
          message_id: 'm4',
          contact_id: 'c4',
          status: 'sent',
          verdict: { decision: 'awaits_validation', reason: 'mailbox_unavailable' },
        },
        // attente normale (hors fenêtre) : pas une anomalie, pas de ligne
        {
          message_id: 'm5',
          contact_id: 'c5',
          status: 'approved',
          verdict: { decision: 'awaits_validation', reason: 'outside_window' },
        },
      ],
    } as unknown as ReturnType<typeof useDelegationSteps>)

    render(<DelegationBlock canSend />)

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('2 en attente — boîte d’envoi non connectée')).toBeInTheDocument()
    expect(screen.getByText('1 en attente — lecture des réponses indisponible')).toBeInTheDocument()
    expect(screen.queryByText(/hors fenêtre/)).not.toBeInTheDocument()
  })

  it('aucune attente anormale ⇒ aucune ligne (jamais « 0 en attente »)', () => {
    useOutreachDelegationsMock.mockReturnValue({
      data: [delegation()],
    } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)
    useDelegationStepsMock.mockReturnValue({
      data: [{ message_id: 'm1', contact_id: 'c1', status: 'approved', verdict: { decision: 'run' } }],
    } as unknown as ReturnType<typeof useDelegationSteps>)

    render(<DelegationBlock canSend />)

    expect(screen.queryByText(/en attente —/)).not.toBeInTheDocument()
  })

  it('sans aucun mandat, l’écran le dit — jamais une liste vide muette', () => {
    useOutreachDelegationsMock.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)

    render(<DelegationBlock canSend />)

    expect(
      screen.getByText('Aucune délégation : chaque e-mail attend ta validation avant de partir.'),
    ).toBeInTheDocument()
  })
})

/**
 * #3702 (recette prod 09/10, écriture) — « Expéditeur : — » et « Aucun
 * message e-mail relisible » ne disaient jamais POURQUOI, ni le geste qui
 * débloque. Ce bloc prouve la modale elle-même, ouverte.
 */
describe('DelegationBlock — la modale NOMME pourquoi elle est bloquée (#3702)', () => {
  beforeEach(() => {
    useOutreachDelegationsMock.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useOutreachDelegations>)
    useDelegationActionMock.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<typeof useDelegationAction>)
    useDelegationStepsMock.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useDelegationSteps>)
  })

  async function openDialog(ui: React.ReactElement) {
    renderWithRouter(ui)
    await userEvent.click(await screen.findByRole('button', { name: 'Déléguer l’envoi' }))
  }

  it('boîte non connectée : le motif se lit, et le lien mène à /integrations', async () => {
    useMailboxStatusMock.mockReturnValue({
      data: { connected: false, provider: null, address: null, capabilities: {}, connectedCount: 0 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMailboxStatus>)
    outreachMessagesListMock.mockResolvedValue([])

    await openDialog(<DelegationBlock canSend />)

    expect(await screen.findByText('Expéditeur : — — boîte d’envoi non connectée.')).toBeInTheDocument()
    const links = await screen.findAllByRole('link', { name: 'Connecter ta messagerie' })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute('href', '/integrations')
  })

  it('boîte connectée, aucune séquence validée : le motif se lit, et le geste ouvre la création', async () => {
    useMailboxStatusMock.mockReturnValue({
      data: { connected: true, provider: 'google', address: 'louis@esn.fr', capabilities: {}, connectedCount: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMailboxStatus>)
    outreachMessagesListMock.mockResolvedValue([])
    const onCreateSequence = vi.fn()

    await openDialog(<DelegationBlock canSend onCreateSequence={onCreateSequence} />)

    expect(await screen.findByText('Aucune séquence e-mail validée n’existe encore à déléguer.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Créer une séquence' }))
    expect(onCreateSequence).toHaveBeenCalledTimes(1)
  })

  it('G.11 — chaque champ de la modale porte un libellé VISIBLE relié à son champ (a11y, GA-32)', async () => {
    useMailboxStatusMock.mockReturnValue({
      data: { connected: true, provider: 'google', address: 'louis@esn.fr', capabilities: {}, connectedCount: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMailboxStatus>)
    outreachMessagesListMock.mockResolvedValue([msg({ id: 'm1', status: 'approved', contact_name: 'Marie Dubois' })])

    await openDialog(<DelegationBlock canSend />)
    await screen.findByText('Marie Dubois —')

    for (const text of [
      'Nom de la campagne',
      'Début de fenêtre (h)',
      'Fin de fenêtre (h)',
      'Durée (jours, 30 max)',
      'Volume (200 max)',
    ]) {
      const label = screen.getByText(text, { selector: 'label' })
      const field = document.getElementById(label.getAttribute('for') ?? '')
      expect(field, text).not.toBeNull()
      expect(field?.tagName).toBe('INPUT')
    }
  })

  it('boîte connectée, des messages relisibles existent : aucun motif de blocage affiché', async () => {
    useMailboxStatusMock.mockReturnValue({
      data: { connected: true, provider: 'google', address: 'louis@esn.fr', capabilities: {}, connectedCount: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMailboxStatus>)
    outreachMessagesListMock.mockResolvedValue([msg({ id: 'm1', status: 'approved', contact_name: 'Marie Dubois' })])

    await openDialog(<DelegationBlock canSend />)

    expect(await screen.findByText('Marie Dubois —')).toBeInTheDocument()
    expect(screen.queryByText('Aucune séquence e-mail validée n’existe encore à déléguer.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connecter ta messagerie' })).not.toBeInTheDocument()
  })
})
