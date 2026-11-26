import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, ContactStop } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useContactStop, useRecordContactStop } from '@/features/contacts/hooks/useContactStop'
import { useConfirmContactIdentity } from '@/features/contacts/hooks/useConfirmContactIdentity'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import {
  useAuthorizeContactRecommendation,
  useRevokeContactRecommendationAuthorization,
} from '@/features/contacts/hooks/useAuthorizeContactRecommendation'
import { ContactCorrectionsCard } from './ContactCorrectionsCard'

vi.mock('@/features/contacts/hooks/useContactStop', () => ({
  useContactStop: vi.fn(),
  useRecordContactStop: vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useConfirmContactIdentity', () => ({
  useConfirmContactIdentity: vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  useContactRanking: vi.fn(),
}))
vi.mock('@/features/contacts/hooks/useAuthorizeContactRecommendation', () => ({
  useAuthorizeContactRecommendation: vi.fn(),
  useRevokeContactRecommendationAuthorization: vi.fn(),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const confirmMutate = vi.fn()
const authorizeMutate = vi.fn()
const revokeMutate = vi.fn()

const contact = {
  id: 'c-1',
  account_id: 'acc-1',
  identity_confirmed_at: null,
  recommendation_authorized_at: null,
} as unknown as Contact

function setStop(stop: ContactStop | null) {
  vi.mocked(useContactStop).mockReturnValue({
    data: stop,
    isLoading: false,
  } as unknown as ReturnType<typeof useContactStop>)
}

// #2160.29/.58 — la carte « Corrections » regroupe les gestes 56/57/58/59 :
// la confirmation positive (nouvelle) et le refus déclaré (`ContactStopCard`,
// existant). 54/55 (mauvaise entreprise/poste) restent dans l'éditeur de
// fiche juste au-dessus — la carte le dit, elle ne déplace pas ce code.
describe('ContactCorrectionsCard — #2160.29/.58', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    confirmMutate.mockClear()
    setStop(null)
    vi.mocked(useRecordContactStop).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useRecordContactStop>)
    vi.mocked(useConfirmContactIdentity).mockReturnValue({
      mutate: confirmMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useConfirmContactIdentity>)
    authorizeMutate.mockClear()
    revokeMutate.mockClear()
    // Par défaut : aucune exclusion à lever — la carte #2160.60 ne rend rien.
    vi.mocked(useContactRanking).mockReturnValue({
      data: { excluded: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useContactRanking>)
    vi.mocked(useAuthorizeContactRecommendation).mockReturnValue({
      mutate: authorizeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useAuthorizeContactRecommendation>)
    vi.mocked(useRevokeContactRecommendationAuthorization).mockReturnValue({
      mutate: revokeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRevokeContactRecommendationAuthorization>)
  })

  it('#2160.58 — propose « Confirmer le bon contact » quand rien n’est confirmé', async () => {
    render(<ContactCorrectionsCard contact={contact} />)
    const button = screen.getByRole('button', { name: 'Confirmer le bon contact' })
    await user().click(button)
    expect(confirmMutate).toHaveBeenCalledTimes(1)
  })

  it('#2160.58 — affiche la confirmation déjà posée, sans bouton pour la relancer', () => {
    render(
      <ContactCorrectionsCard
        contact={{ ...contact, identity_confirmed_at: '2026-09-20T10:00:00.000Z' } as unknown as Contact}
      />,
    )
    expect(screen.getByText(/Bon contact confirmé le/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmer le bon contact' })).not.toBeInTheDocument()
  })

  it('#2160.29 — regroupe le refus déclaré (ContactStopCard) sous la même carte', () => {
    render(<ContactCorrectionsCard contact={contact} />)
    // Le titre + l'explication de ContactStopCard sont bien rendus ici.
    expect(screen.getByText('Refus de contact')).toBeInTheDocument()
  })

  // #2160.60 — « Autoriser la recommandation », sur la fiche : n'apparaît QUE
  // quand le classement du compte écarte ACTUELLEMENT ce contact pour un doute
  // d'identité (homonym_conflict/entity_mismatch) — jamais pour une autre raison.
  describe('#2160.60 — autoriser la recommandation', () => {
    it('n’affiche rien quand ce contact n’est pas écarté', () => {
      render(<ContactCorrectionsCard contact={contact} />)
      expect(screen.queryByText('Autoriser la recommandation')).not.toBeInTheDocument()
    })

    it('n’affiche rien pour une exclusion NON overridable (permission_denied)', () => {
      vi.mocked(useContactRanking).mockReturnValue({
        data: { excluded: [{ contact_id: 'c-1', reason: 'permission_denied' }] },
        isLoading: false,
      } as unknown as ReturnType<typeof useContactRanking>)
      render(<ContactCorrectionsCard contact={contact} />)
      expect(screen.queryByText('Autoriser la recommandation')).not.toBeInTheDocument()
    })

    it('propose le bouton quand ce contact est écarté pour homonym_conflict, et délègue au clic', async () => {
      vi.mocked(useContactRanking).mockReturnValue({
        data: { excluded: [{ contact_id: 'c-1', reason: 'homonym_conflict' }] },
        isLoading: false,
      } as unknown as ReturnType<typeof useContactRanking>)
      render(<ContactCorrectionsCard contact={contact} />)
      const button = screen.getByRole('button', { name: 'Autoriser la recommandation' })
      await user().click(button)
      expect(authorizeMutate).toHaveBeenCalledWith('homonym_conflict')
    })

    it('affiche l’autorisation déjà posée, avec un bouton pour la retirer', async () => {
      render(
        <ContactCorrectionsCard
          contact={
            {
              ...contact,
              recommendation_authorized_at: '2026-09-20T10:00:00.000Z',
              recommendation_authorized_reason: 'entity_mismatch',
            } as unknown as Contact
          }
        />,
      )
      expect(screen.getByText(/Recommandation autorisée le/)).toBeInTheDocument()
      const revokeButton = screen.getByRole('button', { name: 'Retirer l’autorisation' })
      await user().click(revokeButton)
      expect(revokeMutate).toHaveBeenCalledTimes(1)
    })
  })
})
