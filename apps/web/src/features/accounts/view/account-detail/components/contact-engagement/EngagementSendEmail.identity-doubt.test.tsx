import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'

/**
 * #3694.8 — « identité ambiguë empêche un envoi aveugle ». La porte existait déjà
 * pour le CLASSEMENT (`contact-eligibility.ts`, #2160.60 : `homonym_conflict` /
 * `entity_mismatch`, levable à la main sur la fiche) mais jamais pour l'ENVOI :
 * un commercial pouvait écrire et expédier un message à un homonyme non résolu.
 * Même source de vérité que `ContactRecommendationAuthorizationCard`
 * (`useContactRanking`, déjà en cache) — aucun appel réseau de plus.
 *
 * La RÉDACTION reste possible (manque non bloquant n'empêche pas la rédaction) :
 * seul le bouton « Envoyer » se désactive, avec la raison nommée.
 */
const mutate = vi.fn()
vi.mock('@/features/contacts/hooks/useSendContactEmail', () => ({
  useSendContactEmail: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useContactSendability', () => ({
  useContactSendability: () => ({ data: undefined }),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxSenders: () => ({ data: undefined }) }))
vi.mock('@/features/contacts/hooks/useContactCadence', () => ({
  useContactCadence: () => ({ data: undefined }),
}))

let rankingData: unknown
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: () => ({ data: rankingData, isLoading: false }),
}))

const { EngagementSendEmailAction } = await import('./EngagementSendEmail')

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-a',
    account_id: 'account-1',
    full_name: 'Alice Martin',
    email: 'alice@exemple.test',
    email_sent_at: null,
    recommendation_authorized_at: null,
    recommendation_authorized_reason: null,
    ...overrides,
  } as unknown as Contact
}

describe('EngagementSendEmailAction — #3694.8 identité ambiguë bloque l’envoi', () => {
  it('SAIT DIRE NON : un homonyme non résolu désactive « Envoyer », raison nommée', () => {
    rankingData = { excluded: [{ contact_id: 'contact-a', reason: 'homonym_conflict' }] }
    render(<EngagementSendEmailAction contact={contact()} subject="Objet" text="Bonjour" />)

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('une entité hors périmètre désactive aussi « Envoyer »', () => {
    rankingData = { excluded: [{ contact_id: 'contact-a', reason: 'entity_mismatch' }] }
    render(<EngagementSendEmailAction contact={contact()} subject="Objet" text="Bonjour" />)

    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('une autorisation posée pour CETTE raison précise lève le blocage', () => {
    rankingData = { excluded: [{ contact_id: 'contact-a', reason: 'homonym_conflict' }] }
    const authorized = contact({
      recommendation_authorized_at: '2026-10-01T00:00:00.000Z',
      recommendation_authorized_reason: 'homonym_conflict',
    })
    render(<EngagementSendEmailAction contact={authorized} subject="Objet" text="Bonjour" />)

    expect(screen.getByRole('button', { name: 'Envoyer' })).not.toBeDisabled()
  })

  it('un autre contact du classement exclu ne bloque pas CE contact', () => {
    rankingData = { excluded: [{ contact_id: 'contact-b', reason: 'homonym_conflict' }] }
    render(<EngagementSendEmailAction contact={contact()} subject="Objet" text="Bonjour" />)

    expect(screen.getByRole('button', { name: 'Envoyer' })).not.toBeDisabled()
  })

  it('aucune exclusion : « Envoyer » reste disponible (pas de régression)', () => {
    rankingData = { excluded: [] }
    render(<EngagementSendEmailAction contact={contact()} subject="Objet" text="Bonjour" />)

    expect(screen.getByRole('button', { name: 'Envoyer' })).not.toBeDisabled()
  })
})
