import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { chooseOption } from '@/test/select'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequenceDetailSheet } from './SequenceDetailSheet'

/**
 * #2203.12 / #2203.13 / #2203.14 — LE HERO DU DÉTAIL SAIT DÉJÀ TOUT ÇA.
 *
 * Les canaux (`step.kind`), les échéances (`step.due_at`) et la prochaine
 * étape (`sequence.next_step`) sont déjà dans le contrat — la frise les
 * égrène pas par pas, mais aucune ligne n'en faisait le RÉSUMÉ en tête.
 * `next_step` a même déjà son couple de clés i18n ailleurs
 * (`ContactOutreachCard.tsx:177-181`, `sequence.nextDue`/`sequence.noNextDue`) :
 * ce test vérifie qu'ils sont repris ICI, pas réinventés.
 */

const action = vi.fn()
const stepDone = vi.fn()
const addStep = vi.fn()
const updateStep = vi.fn()
const removeStep = vi.fn()
const duplicate = vi.fn()
const declareEngagementSignal = vi.fn()
const reorder = vi.fn()
const declareOutcome = vi.fn()
const meetingBooked = vi.fn()

vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachSequenceAction: () => ({ mutate: action, isPending: false }),
  useOutreachStepDone: () => ({ mutate: stepDone, isPending: false }),
  useOutreachAddStep: () => ({ mutate: addStep, isPending: false }),
  useOutreachUpdateStep: () => ({ mutate: updateStep, isPending: false }),
  useOutreachRemoveStep: () => ({ mutate: removeStep, isPending: false }),
  useOutreachDuplicateSequence: () => ({ mutate: duplicate, isPending: false }),
  useOutreachDeclareEngagementSignal: () => ({ mutate: declareEngagementSignal, isPending: false }),
  useOutreachReorderSteps: () => ({ mutate: reorder, isPending: false }),
  useOutreachDeclareOutcome: () => ({ mutate: declareOutcome, isPending: false }),
  useOutreachMeetingBooked: () => ({ mutate: meetingBooked, isPending: false }),
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

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

// Théo C sequences-detail.R1 — la feuille latérale devient une PAGE pleine, avec « Retour aux séquences ».
describe('le détail d’une séquence en page (sequences-detail.R1)', () => {
  it('se rend dans la page, sans fenêtre modale, avec le retour vers la liste', async () => {
    renderWithRouter(
      <SequenceDetailSheet layout="page" sequence={sequence({ name: 'Ouverture Data · SNCF' })} onClose={() => {}} />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Ouverture Data · SNCF' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const back = screen.getByRole('link', { name: /Retour aux séquences/ })
    expect(back).toHaveAttribute('href', '/actions/sequences')
  })

  // Théo C sequences-detail.A5 — liens vers le contact ET le compte, depuis la séquence.
  it('garde les liens vers le contact et vers le compte', async () => {
    renderWithRouter(<SequenceDetailSheet layout="page" sequence={sequence()} onClose={() => {}} />)
    const contact = await screen.findByRole('link', { name: /Ouvrir la fiche contact/ })
    expect(contact).toHaveAttribute('href', '/contacts/44444444-4444-4444-4444-444444444444')
    const account = screen.getByRole('link', { name: /Ouvrir le dossier/ })
    expect(account).toHaveAttribute('href', '/accounts/55555555-5555-5555-5555-555555555555')
  })

  // Théo C sequences-detail.R4 — « Cadre de cette campagne » : canal · règles d’arrêt · envois réels.
  it('présente le cadre de la campagne : canal, règles d’arrêt, envois réels', async () => {
    renderWithRouter(
      <SequenceDetailSheet
        layout="page"
        sequence={sequence({
          steps: [
            step({ id: 'a', kind: 'email', status: 'done', done_at: '2026-09-01T09:00:00.000Z' }),
            step({ id: 'b', kind: 'email' }),
          ],
        })}
        onClose={() => {}}
      />,
    )
    const frame = await screen.findByTestId('sequence-frame')
    expect(frame).toHaveTextContent('Cadre de cette campagne')
    expect(frame).toHaveTextContent(/Canal/)
    expect(frame).toHaveTextContent(/Règles d’arrêt/)
    expect(frame).toHaveTextContent(/Étapes réalisées/)
    expect(frame).toHaveTextContent(/Étapes réalisées[^0-9]*1/)
  })
})
