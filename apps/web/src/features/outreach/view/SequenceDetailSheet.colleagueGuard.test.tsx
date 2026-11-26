import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { chooseOption } from '@/test/select'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { teamGuardrailsApi } from '@/features/team-guardrails/api'
import { SequenceDetailSheet } from './SequenceDetailSheet'

const action = vi.fn()
const stepDone = vi.fn()
const addStep = vi.fn()
const updateStep = vi.fn()
const removeStep = vi.fn()
const duplicate = vi.fn()
const declareEngagementSignal = vi.fn()

vi.mock('@/features/team-guardrails/api', () => ({ teamGuardrailsApi: { checkContacts: vi.fn() } }))

vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachSequenceAction: () => ({ mutate: action, isPending: false }),
  useOutreachStepDone: () => ({ mutate: stepDone, isPending: false }),
  useOutreachAddStep: () => ({ mutate: addStep, isPending: false }),
  useOutreachUpdateStep: () => ({ mutate: updateStep, isPending: false }),
  useOutreachRemoveStep: () => ({ mutate: removeStep, isPending: false }),
  useOutreachDuplicateSequence: () => ({ mutate: duplicate, isPending: false }),
  useOutreachDeclareEngagementSignal: () => ({ mutate: declareEngagementSignal, isPending: false }),
  useOutreachReorderSteps: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachDeclareOutcome: () => ({ mutate: vi.fn(), isPending: false }),
  useOutreachMeetingBooked: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #2203.62 — la même recherche que le reste du produit (`useContacts`),
// aucune nouvelle route : le mock reprend la même forme que
// `ScopeDialog.test.tsx` (`data.pages[0].data`).
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({
    data: {
      pages: [
        {
          data: [
            {
              id: '44444444-4444-4444-4444-444444444444',
              full_name: 'Marie Dubois',
              title: 'DSI',
              company_name: 'NOVA LOGISTIQUE',
            },
            {
              id: '66666666-6666-6666-6666-666666666666',
              full_name: 'Karim Haddad',
              title: 'DAF',
              company_name: 'NOVA LOGISTIQUE',
            },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s-${Math.random()}`,
    sequence_id: 'seq',
    position: 0,
    due_at: '2026-09-01T09:00:00.000Z',
    kind: 'email',
    payload: { label: 'Premier contact (J0)' },
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step()]
  return {
    id: `q-${Math.random()}`,
    contact_id: '44444444-4444-4444-4444-444444444444',
    contact_name: 'Marie Dubois',
    contact_role: 'Directrice des systèmes d’information',
    account_id: '55555555-5555-5555-5555-555555555555',
    account_name: 'NOVA LOGISTIQUE',
    name: 'Compte froid — email',
    campaign_label: null,
    // #2378.6/.7 — `template_key`/`duplicated_from` sont apparus avec
    // 1255e7a34 (dupliquer/gabarit) sans ces fixtures : porte check-types
    // pré-existante rouge sur ce fichier, corrigée ici (pas de comportement changé).
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-09-01T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  }
}

/**
 * #4158.51 — la garde « contacté il y a N j par un collègue » (#21) s'affiche
 * aussi sur une étape de séquence préparée : confirmation, jamais un blocage dur.
 */
beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.clearAllMocks()
})

describe('SequenceDetailSheet — garde collègue sur « Fait » (#4158.51)', () => {
  it('demande confirmation quand un collègue a contacté le contact, puis laisse continuer', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({
      items: [
        {
          contact_id: '44444444-4444-4444-4444-444444444444',
          do_not_contact: null,
          contacted: {
            contact_id: '44444444-4444-4444-4444-444444444444',
            by_user_id: 'u-bob',
            by_name: 'Bob Durand',
            at: '',
            days_ago: 4,
            proof: 'verified',
          },
        },
      ],
    })
    const seq = sequence()
    renderWithRouter(<SequenceDetailSheet sequence={seq} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('outreach:sequence.stepDone') }))
    expect(await screen.findByText(/Bob Durand/)).toBeInTheDocument()
    expect(stepDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('teamGuardrails:guard.confirm') }))
    await waitFor(() => expect(stepDone).toHaveBeenCalledTimes(1))
  })

  it('exécute directement quand l’espace ne sait rien (aucun dialogue)', async () => {
    vi.mocked(teamGuardrailsApi.checkContacts).mockResolvedValue({ items: [] })
    renderWithRouter(<SequenceDetailSheet sequence={sequence()} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('outreach:sequence.stepDone') }))
    await waitFor(() => expect(stepDone).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Bob Durand/)).toBeNull()
  })
})
