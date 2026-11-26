import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequenceDetailSheet } from './SequenceDetailSheet'

/**
 * Lot L-B (#4165) — le détail d'une séquence MULTICANAL : le canal de chaque
 * étape, son délai en jours ouvrés, la porte LinkedIn, le saut journalisé, les
 * gestes manuels (LinkedIn, appel), le réordonnancement au clavier, « RDV pris »,
 * et l'alerte d'une variable vide avant de valider.
 */

const stepDone = vi.fn()
const updateStep = vi.fn()
const reorder = vi.fn()
vi.mock('@/features/team-guardrails/api', () => ({
  teamGuardrailsApi: { checkContacts: vi.fn().mockResolvedValue({ items: [] }) },
}))

const declareOutcome = vi.fn()
const meetingBooked = vi.fn()

vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachSequenceAction: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachStepDone: () => ({ mutate: stepDone, isPending: false }),
  useOutreachAddStep: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachUpdateStep: () => ({ mutate: updateStep, isPending: false }),
  useOutreachRemoveStep: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachDuplicateSequence: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachDeclareEngagementSignal: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachReorderSteps: () => ({ mutate: reorder, isPending: false }),
  useOutreachDeclareOutcome: () => ({ mutate: declareOutcome, isPending: false }),
  useOutreachMeetingBooked: () => ({ mutate: meetingBooked, isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({ data: { pages: [{ data: [] }] }, isLoading: false, isError: false }),
}))

function step(position: number, over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s${position}`,
    sequence_id: 'seq',
    position,
    due_at: '2099-09-0' + (position + 1) + 'T07:00:00.000Z',
    kind: 'email',
    payload: { label: `Étape ${position}` },
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(steps: OutreachSequenceStep[], over: Partial<OutreachSequence> = {}): OutreachSequence {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    contact_id: '44444444-4444-4444-4444-444444444444',
    contact_name: 'Marie Dubois',
    contact_role: 'DSI',
    account_id: null,
    account_name: 'NOVA',
    name: 'Multicanal',
    campaign_label: null,
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    delay_unit: 'business_days',
    vacation_until: null,
    created_at: '2099-09-01T07:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    ...over,
  }
}

beforeEach(async () => {
  for (const mock of [stepDone, updateStep, reorder, declareOutcome, meetingBooked]) mock.mockReset()
  await i18n.changeLanguage('fr')
})

describe('canaux et délais', () => {
  it('nomme le canal de chaque étape et le délai en jours OUVRÉS', async () => {
    const seq = sequence([
      step(0, { kind: 'linkedin_invite', payload: { label: 'Invitation', offset_days: 0 } }),
      step(1, { kind: 'call', payload: { label: 'Appel', offset_days: 3 } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/J\+3 ouvrés/)).toBeInTheDocument()
    expect(screen.getAllByText(/Appel \(geste manuel\)/).length).toBeGreaterThan(0)
  })

  it('une séquence EXISTANTE garde ses jours calendaires : « J+3 » sans « ouvrés »', async () => {
    const seq = sequence([step(0, { kind: 'task', payload: { label: 'Tâche', offset_days: 3 } })], {
      delay_unit: 'calendar_days',
    })
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/J\+3 ·/)).toBeInTheDocument()
    expect(screen.queryByText(/ouvrés/)).not.toBeInTheDocument()
  })
})

describe('porte LinkedIn', () => {
  it('un message après une invitation non acceptée est « en attente d’acceptation »', async () => {
    const seq = sequence([
      step(0, {
        kind: 'linkedin_invite',
        status: 'done',
        done_at: '2099-09-01T08:00:00.000Z',
        payload: { label: 'Invitation', outcome: 'pending' },
      }),
      step(1, { kind: 'linkedin_message', payload: { label: 'Message' } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByTestId('linkedin-gate')).toHaveTextContent('En attente d’acceptation')
  })

  it('acceptée : plus de badge d’attente', async () => {
    const seq = sequence([
      step(0, {
        kind: 'linkedin_invite',
        status: 'done',
        done_at: '2099-09-01T08:00:00.000Z',
        payload: { label: 'Invitation', outcome: 'accepted' },
      }),
      step(1, { kind: 'linkedin_message', payload: { label: 'Message' } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    await screen.findByText('Message')
    expect(screen.queryByTestId('linkedin-gate')).not.toBeInTheDocument()
  })

  it('une étape sautée dit POURQUOI (invitation non acceptée à l’échéance)', async () => {
    const seq = sequence([
      step(0, {
        kind: 'linkedin_invite',
        status: 'done',
        done_at: '2099-09-01T08:00:00.000Z',
        payload: { label: 'Invitation', outcome: 'pending' },
      }),
      step(1, {
        kind: 'linkedin_message',
        status: 'skipped',
        payload: { label: 'Message', skip_reason: 'linkedin_invite_not_accepted' },
      }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByTestId('skip-reason')).toHaveTextContent('n’était pas acceptée')
  })
})

describe('gestes manuels', () => {
  const linkedin = () =>
    sequence([
      step(0, {
        kind: 'linkedin_message',
        payload: {
          label: 'Message',
          linkedin_draft: { body: 'Bonjour Marie', profile_url: 'https://www.linkedin.com/in/marie' },
        },
      }),
    ])

  it('LinkedIn : copier le message, ouvrir le profil, puis marquer envoyé (une déclaration)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const seq = linkedin()
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copier le message et ouvrir le profil' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Bonjour Marie'))
    expect(open).toHaveBeenCalledWith('https://www.linkedin.com/in/marie', '_blank', 'noopener,noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Marquer envoyé' }))
    // #4158.51 — la garde « contacté par un collègue » lit l'espace d'abord (rien à dire ici : le geste part).
    await vi.waitFor(() => expect(stepDone).toHaveBeenCalledWith({ id: seq.id, stepId: 's0' }))
    open.mockRestore()
  })

  it('LinkedIn sans message préparé : le dit, n’invente rien', async () => {
    const seq = sequence([step(0, { kind: 'linkedin_invite', payload: { label: 'Invitation', linkedin_draft: null } })])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText(/Aucun message n’est préparé/)).toBeInTheDocument()
  })

  it('appel : la trame préparée et « RDV pris » depuis l’étape', async () => {
    const seq = sequence([
      step(0, { kind: 'call', payload: { label: 'Appel', call_script: 'Ouvrir sur le projet cloud' } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    expect(await screen.findByText('Ouvrir sur le projet cloud')).toBeInTheDocument()
    const gesture = screen.getByTestId('gesture-call')
    fireEvent.click(within(gesture).getByRole('button', { name: 'RDV pris' }))
    expect(meetingBooked).toHaveBeenCalledWith({ id: seq.id, stepId: 's0' })
  })

  it('« RDV pris » sur la séquence entière', async () => {
    const seq = sequence([step(0), step(1)])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'RDV pris' }))
    expect(meetingBooked).toHaveBeenCalledWith({ id: seq.id })
  })
})

describe('réordonner au clavier', () => {
  it('« Descendre l’étape » envoie le nouvel ordre des étapes à faire', async () => {
    const seq = sequence([step(0), step(1), step(2)])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const first = await screen.findByTestId('step-row-0')
    fireEvent.click(within(first).getByRole('button', { name: 'Descendre l’étape' }))
    expect(reorder).toHaveBeenCalledWith({ id: seq.id, stepIds: ['s1', 's0', 's2'] })
  })

  it('la première étape ne peut pas monter, la dernière ne peut pas descendre', async () => {
    const seq = sequence([step(0), step(1)])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const first = await screen.findByTestId('step-row-0')
    expect(within(first).getByRole('button', { name: 'Monter l’étape' })).toBeDisabled()
    const last = screen.getByTestId('step-row-1')
    expect(within(last).getByRole('button', { name: 'Descendre l’étape' })).toBeDisabled()
  })

  it('une étape déjà faite ne se déplace pas', async () => {
    const seq = sequence([step(0, { status: 'done', done_at: '2099-09-01T08:00:00.000Z' }), step(1), step(2)])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const done = await screen.findByTestId('step-row-0')
    expect(within(done).queryByRole('button', { name: 'Descendre l’étape' })).not.toBeInTheDocument()
  })
})

describe('variables avec valeur de repli', () => {
  it('alerte une variable VIDE avant de valider, et n’enregistre pas sans confirmation', async () => {
    const seq = sequence([
      step(0, { kind: 'email', payload: { label: 'Mail', draft_available: false, email_draft: null } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Objet de l’e-mail'), { target: { value: 'Bonjour' } })
    fireEvent.change(screen.getByLabelText('Corps de l’e-mail'), {
      target: { value: 'Bonjour {{ville}}, on se parle ?' },
    })
    expect(await screen.findByTestId('empty-variables-alert')).toHaveTextContent('ville')
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Enregistrer quand même, je complète le message moi-même'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(updateStep).toHaveBeenCalled()
  })

  it('une variable avec repli n’alerte pas et le texte enregistré est RÉSOLU', async () => {
    const seq = sequence([
      step(0, { kind: 'email', payload: { label: 'Mail', draft_available: false, email_draft: null } }),
    ])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Objet de l’e-mail'), { target: { value: 'Pour {{prenom}}' } })
    fireEvent.change(screen.getByLabelText('Corps de l’e-mail'), { target: { value: 'Bonjour {{ville|à vous}}' } })
    expect(screen.queryByTestId('empty-variables-alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const input = updateStep.mock.calls[0]?.[0]?.input as { email_draft: { subject: string; body: string } }
    expect(input.email_draft).toEqual({ subject: 'Pour Marie', body: 'Bonjour à vous' })
  })

  it('le délai retouché part en jours (offset_days), jamais avec une date', async () => {
    const seq = sequence([step(0, { kind: 'task', payload: { label: 'Tâche', offset_days: 2 } })])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Délai (jours ouvrés après la création)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const input = updateStep.mock.calls[0]?.[0]?.input as Record<string, unknown>
    expect(input['offset_days']).toBe(5)
    expect(input).not.toHaveProperty('due_at')
  })
})

describe('stats par étape', () => {
  it('« — » pour une valeur non mesurée, jamais 0', async () => {
    const seq = sequence([step(0, { kind: 'linkedin_invite', status: 'pending' })])
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    const stats = await screen.findByTestId('step-stats')
    const cells = within(stats).getAllByRole('cell')
    // étape · préparé · fait · répondu · RDV : rien de fait → répondu et RDV non mesurés
    expect(cells.map(cell => cell.textContent)).toEqual(['1. Invitation LinkedIn (geste manuel)', '1', '0', '—', '—'])
  })
})
