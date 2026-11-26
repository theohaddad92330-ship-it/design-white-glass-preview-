import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntroductionAuthorizationItem } from '@bellum/contracts'
import { i18n } from '@/i18n'
import {
  useIntroductionAuthorizations,
  useRecordIntroductionAuthorization,
} from '@/features/contacts/hooks/useIntroductionAuthorizations'
import { ContactIntroductionRelay } from './ContactIntroductionRelay'

vi.mock('@/features/contacts/hooks/useIntroductionAuthorizations', () => ({
  useIntroductionAuthorizations: vi.fn(),
  useRecordIntroductionAuthorization: vi.fn(),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

function setAuthorizations(items: IntroductionAuthorizationItem[]) {
  vi.mocked(useIntroductionAuthorizations).mockReturnValue({
    data: items,
    isLoading: false,
  } as unknown as ReturnType<typeof useIntroductionAuthorizations>)
}

function authorization(overrides: Partial<IntroductionAuthorizationItem> = {}): IntroductionAuthorizationItem {
  return {
    id: 'auth-1',
    targetContactId: 'contact-1',
    referrerContactId: null,
    referrerLabel: 'Ahmed',
    granted: true,
    channel: 'email',
    text: null,
    scope: null,
    restrictions: null,
    authorizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    linkKind: 'explicit_recommendation',
    verified: true,
    warmth: null,
    ...overrides,
  }
}

/**
 * #3690 — le module en huit étapes a quitté la fiche ; ce qu'il PORTAIT reste :
 * un relais enregistré se relit (qui, quel lien, ce qu'il reste à vérifier) et
 * s'enregistre, sans qu'aucun de ces gestes ne sollicite personne.
 */
describe('ContactIntroductionRelay — #3690', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useRecordIntroductionAuthorization).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRecordIntroductionAuthorization>)
  })

  it('#3690.1 — plus aucune des huit étapes : ni « Marquer fait », ni « Introduction chaude »', () => {
    setAuthorizations([authorization()])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.queryByRole('button', { name: 'Marquer fait' })).not.toBeInTheDocument()
    expect(screen.queryByText('Introduction chaude')).not.toBeInTheDocument()
  })

  it('#3690.2 — une autorisation déjà enregistrée reste consultable : qui, quel lien, accord confirmé', () => {
    setAuthorizations([authorization()])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.getByText('Ahmed')).toBeInTheDocument()
    expect(screen.getByText('Recommandation explicite')).toBeInTheDocument()
    expect(screen.getByText('Accord confirmé')).toBeInTheDocument()
    expect(screen.getByText('Le message pourra citer « de la part de Ahmed ».')).toBeInTheDocument()
  })

  it('#3690.3 — un refus se lit comme un refus, et la citation reste bloquée', () => {
    setAuthorizations([authorization({ granted: false })])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.getByText('Refusé')).toBeInTheDocument()
    expect(screen.getByText(/Citation bloquée : le référent n’a pas confirmé/)).toBeInTheDocument()
  })

  it('#3690.4 — un relais non vérifié ne se cite pas, et ce qui reste à vérifier est dit', () => {
    setAuthorizations([authorization({ verified: false })])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.getByText(/Citation bloquée : ce type de lien/)).toBeInTheDocument()
  })

  it('#3690.5 — un accord ancien est à requalifier avant réutilisation', () => {
    setAuthorizations([authorization({ authorizedAt: '2025-01-01T00:00:00.000Z' })])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.getByText('Relation ancienne — à requalifier avant réutilisation')).toBeInTheDocument()
  })

  it('#3690.6 — sans relais : aucun bloc vide, seulement le geste pour en consigner un', () => {
    setAuthorizations([])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.queryByText('Aucune autorisation enregistrée pour l’instant.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consigner un relais' })).toBeInTheDocument()
  })

  it('#3690.7 — consigner un relais enregistre la preuve et ne sollicite personne', async () => {
    setAuthorizations([])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    await user().click(screen.getByRole('button', { name: 'Consigner un relais' }))
    await user().type(screen.getByLabelText('Référent'), 'Ahmed')
    await user().click(screen.getByRole('button', { name: 'A confirmé' }))
    await user().click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ targetContactId: 'contact-1', referrerLabel: 'Ahmed', granted: true }),
    )
  })

  it('#3690.8 — dit ce qu’un relais n’est PAS : ni identité confirmée, ni accord de sollicitation, ni levée d’opposition', () => {
    setAuthorizations([authorization()])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.getByText(/ni une confirmation d’identité/)).toBeInTheDocument()
  })

  // #3690.9 (lot K12 07/10) — le nom du référent (`referrer_label`) : affiché quand il est
  // renseigné (déjà exercé par #3690.2 ci-dessus, « Ahmed »), et SANS AUCUNE ligne quand il ne
  // l'est pas (une absence ne fait jamais de ligne — gardes GA-18/GA-19). En démo, les sept
  // autorisations semées n'en portent aucun : ce cas-ci n'est pas « vide à dessein » faute de
  // raison, il est VOULU (décision Louis 04/10/2026 — aucune déclaration inventée sur une
  // personne réelle, voir DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS).
  it('#3690.9 — un référent non renseigné (`referrer_label` absent) n’affiche AUCUNE ligne de nom', () => {
    setAuthorizations([authorization({ referrerLabel: null })])
    render(<ContactIntroductionRelay contactId="contact-1" contactName="Claire Dupont" />)
    expect(screen.queryByText('Ahmed')).not.toBeInTheDocument()
    // Le type de lien reste affiché : seul le NOM du référent est absent.
    expect(screen.getByText('Recommandation explicite')).toBeInTheDocument()
  })
})
