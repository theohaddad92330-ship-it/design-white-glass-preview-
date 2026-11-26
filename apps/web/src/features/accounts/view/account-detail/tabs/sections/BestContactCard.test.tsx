import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, ContactRankingResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { BestContactCard } from './BestContactCard'

vi.mock('@/features/contacts/hooks/useContactRanking', () => ({ useContactRanking: vi.fn() }))

/**
 * #2730 — retour Loïc Inacio (Bedrock, 22/09/2026) : le chemin d'accès
 * recommandé EXISTE (`PriorityPathSection`, onglet Contacts) mais le client
 * ne l'a pas trouvé pendant le call. `BestContactCard` est l'entrée qui
 * répond « avec qui commencer ? » depuis la Synthèse — SANS savoir dans quel
 * onglet regarder — mais elle piochait `contacts[0]` au lieu du n°1 du MÊME
 * classement API que l'onglet Contacts, sans jamais dire pourquoi ni le
 * situer dans un ordre. Elle ne pouvait donc pas être reconnue comme la
 * réponse à la question.
 */
function contact(patch: Partial<Contact>): Contact {
  return {
    id: 'c1',
    account_id: 'acc-1',
    full_name: 'Camille Roux',
    title: 'Responsable Data',
    entity: 'ACME Retail',
    decision_role: 'user',
    priority: 3,
    email: null,
    email_verified: false,
    phone: null,
    linkedin_url: null,
    photo_url: null,
    why_contact: null,
    location: null,
    last_enrichment_at: null,
    email_sent_at: null,
    ...patch,
  } as Contact
}

function mockRanking(state: { data?: ContactRankingResponse; isError?: boolean }) {
  vi.mocked(useContactRanking).mockReturnValue({
    data: state.data,
    isError: state.isError ?? false,
  } as ReturnType<typeof useContactRanking>)
}

beforeEach(async () => {
  vi.mocked(useContactRanking).mockReset()
  await i18n.changeLanguage('fr')
})

describe('BestContactCard — l’entrée « avec qui commencer ? » de la Synthèse', () => {
  it('#2730.1 — montre le n°1 du CLASSEMENT, pas simplement le premier contact du compte', () => {
    const first = contact({ id: 'c1', full_name: 'Premier Contact' })
    const ranked = contact({ id: 'c2', full_name: 'Camille Prioritaire' })
    mockRanking({
      data: {
        excluded: [],
        ranked: [
          {
            contact_id: 'c2',
            position: 1,
            score: 40,
            max: 75,
            axes: [],
            strategic_axes: [],
            group: 'first_door',
            explanation: {
              who: { key: 'who', measured: true, code: 'who_first_door' },
              when: { key: 'when', measured: false, code: 'when_no_recent_signal' },
              stage: { key: 'stage', measured: true, code: 'stage_discovery' },
              unlocks: { key: 'unlocks', measured: false, code: 'unlocks_not_identified' },
              next: { key: 'next', measured: false, code: 'next_path_end' },
              limit: { key: 'limit', measured: true, code: 'limit_no_decision_power' },
            },
            anti_advice: { what: 'dont_ask_for_decision', why: 'limit_no_decision_power' },
            confidence: 'high',
            access_path: { kind: 'verified_email', missing_reason: null },
            last_interaction_at: null,
          },
        ],
        total: 2,
        scored: 2,
        context: {
          perimeter: null,
          perimeter_source: 'account',
          subject: null,
          subject_source: 'account',
          offer: null,
        },
      },
    })

    render(<BestContactCard accountId="acc-1" contacts={[first, ranked]} companyName="ACME" onViewContacts={vi.fn()} />)

    expect(screen.getByText('Camille Prioritaire')).toBeInTheDocument()
    expect(screen.queryByText('Premier Contact')).not.toBeInTheDocument()
  })

  it('#2730.2 — nomme l’ORDRE et la RAISON, pas seulement le nom', () => {
    const ranked = contact({ id: 'c2', full_name: 'Camille Prioritaire' })
    mockRanking({
      data: {
        excluded: [],
        ranked: [
          {
            contact_id: 'c2',
            position: 1,
            score: 40,
            max: 75,
            axes: [],
            strategic_axes: [],
            group: 'first_door',
            explanation: {
              who: { key: 'who', measured: true, code: 'who_first_door' },
              when: { key: 'when', measured: false, code: 'when_no_recent_signal' },
              stage: { key: 'stage', measured: true, code: 'stage_discovery' },
              unlocks: { key: 'unlocks', measured: false, code: 'unlocks_not_identified' },
              next: { key: 'next', measured: false, code: 'next_path_end' },
              limit: { key: 'limit', measured: true, code: 'limit_no_decision_power' },
            },
            anti_advice: { what: 'dont_ask_for_decision', why: 'limit_no_decision_power' },
            confidence: 'high',
            access_path: { kind: 'verified_email', missing_reason: null },
            last_interaction_at: null,
          },
        ],
        total: 4,
        scored: 4,
        context: {
          perimeter: null,
          perimeter_source: 'account',
          subject: null,
          subject_source: 'account',
          offer: null,
        },
      },
    })

    render(<BestContactCard accountId="acc-1" contacts={[ranked]} companyName="ACME" onViewContacts={vi.fn()} />)

    // l'ORDRE, sur 4 contacts classés
    expect(screen.getByText(/N° 1 sur 4/)).toBeInTheDocument()
    // le POURQUOI, la même raison que l'onglet Contacts (`priorityPath.explanation.codes.who_first_door`)
    expect(screen.getByText(/e-mail vérifié, entrée sûre/)).toBeInTheDocument()
  })

  it('#2730.3 — le geste dit explicitement « chemin d’accès recommandé » pour être reconnu ensuite dans Contacts', () => {
    mockRanking({ isError: true })
    render(<BestContactCard accountId="acc-1" contacts={[contact({})]} companyName="ACME" onViewContacts={vi.fn()} />)
    expect(screen.getByText("Voir le chemin d'accès recommandé")).toBeInTheDocument()
  })

  it('#2730.4 — classement indisponible : retombe sur le contact du dossier, sans ordre ni raison inventés', () => {
    const first = contact({ id: 'c1', full_name: 'Premier Contact' })
    mockRanking({ isError: true })

    render(<BestContactCard accountId="acc-1" contacts={[first]} companyName="ACME" onViewContacts={vi.fn()} />)

    expect(screen.getByText('Premier Contact')).toBeInTheDocument()
    expect(screen.queryByText(/N° \d+ sur/)).not.toBeInTheDocument()
  })
})
