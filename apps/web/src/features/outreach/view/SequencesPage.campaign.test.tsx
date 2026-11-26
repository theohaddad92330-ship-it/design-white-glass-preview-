import { fireEvent, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignAudience } from '../campaign-audience'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequencesPage } from './SequencesPage'

/**
 * #1935.25 — LA CAMPAGNE PRÉPARÉE PAR LAURA OUVRE L'ÉCRAN SÉQUENCES.
 *
 * LE DÉFAUT QUE CE FICHIER GARDE. `campaignFromSearch` existait, juste et
 * testé, et **personne ne l'appelait** : le chat proposait une campagne, le clic
 * naviguait vers `/actions/sequences?contact_ids=…&objective=…`, et l'écran
 * s'ouvrait VIDE. Tout le travail de préparation était perdu au dernier maillon
 * — c'est le défaut n°1 de ce dépôt, du code juste que personne n'appelle.
 *
 * Chaque test protège une lecture FAUSSE que l'écran produirait sans lui :
 *  · une campagne annoncée qui ouvre une fenêtre vierge ;
 *  · un contact écarté qui DISPARAÎT de l'audience sans que personne sache
 *    pourquoi ;
 *  · une audience pas encore relue présentée comme complète ;
 *  · et le témoin : une URL SANS campagne, qui ne doit rien changer.
 */
const useOutreachSequencesMock = vi.fn()
const useMailboxStatusMock = vi.fn()
const useCampaignAudienceMock = vi.fn()

vi.mock('../hooks/useOutreachSequences', () => ({
  useEnrollmentEligibility: () => ({ data: undefined }),
  useOutreachSequences: () => useOutreachSequencesMock(),
}))
vi.mock('../hooks/useCampaignAudience', () => ({
  useCampaignAudience: (ids: readonly string[]) => useCampaignAudienceMock(ids),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxStatus: () => useMailboxStatusMock() }))
// #2222 — meme correction que `SequencesPage.test.tsx` : `'full'` et `reason`
// n'existent dans aucun des cinq etats du contrat de route.
vi.mock('@/components/access/useRouteAccess', () => ({
  useRouteAccess: () => ({ state: 'ready', missing: [] }),
}))
vi.mock('@/components/access/CapabilityBanner', () => ({ CapabilityBanner: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Maëlle' }))
vi.mock('@/features/automations/view/SignalSequencesSection', () => ({ SignalSequencesSection: () => null }))
// #4355.1 — l'entête ouvre le parcours ; sa dernière étape rend la main à la fenêtre de création.
vi.mock('./SequenceJourney', () => ({
  SequenceJourney: ({
    onLaunchManual,
  }: {
    onLaunchManual: (request: { contacts: never[]; name: string; template: string; customSteps: null }) => void
  }) => (
    <button
      type="button"
      onClick={() => onLaunchManual({ contacts: [], name: '', template: 'nurturing', customSteps: null })}
    >
      [vérifier]
    </button>
  ),
}))

// La fenêtre de création a son propre fichier de test : ici on vérifie ce
// qu'elle REÇOIT, ce qu'aucun autre test ne peut vérifier à sa place.
vi.mock('./CreateSequenceDialog', () => ({
  CreateSequenceDialog: ({
    open,
    onOpenChange,
    initialContacts = [],
    initialTemplate,
    campaignContext,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialContacts?: readonly { id: string; full_name: string }[]
    initialTemplate?: string
    campaignContext?: { objective: string; persona?: string | null; tone?: string | null }
  }) =>
    open ? (
      <div>
        <p>[fenêtre de création]</p>
        <button type="button" onClick={() => onOpenChange(false)}>
          [fermer]
        </button>
        <p>objectif : {campaignContext?.objective ?? 'aucun'}</p>
        <p>gabarit : {initialTemplate ?? 'aucun'}</p>
        <p>persona : {campaignContext?.persona ?? 'aucun'}</p>
        <ul>
          {initialContacts.map(contact => (
            <li key={contact.id}>{contact.full_name}</li>
          ))}
        </ul>
      </div>
    ) : null,
}))

function audience(over: Partial<CampaignAudience> = {}): CampaignAudience {
  return { eligible: [], dropped: [], pending: 0, ...over }
}

function contact(id: string, fullName: string) {
  return { id, full_name: fullName, title: null, email: `${id}@nova.fr` }
}

const CAMPAIGN_URL =
  '/actions/sequences?contact_ids=c-1,c-2&objective=Relancer les DSI industrie&persona=DSI&template=cold_email&tone=direct'

beforeEach(async () => {
  useOutreachSequencesMock.mockReset()
  useMailboxStatusMock.mockReset()
  useCampaignAudienceMock.mockReset()
  useOutreachSequencesMock.mockReturnValue({ data: [], isLoading: false })
  useMailboxStatusMock.mockReturnValue({ data: { connected: true } })
  useCampaignAudienceMock.mockReturnValue(audience())
  await i18n.changeLanguage('fr')
})

describe('la campagne annoncée par l’URL', () => {
  it('relit les contacts ANNONCÉS — l’écran n’invente pas son audience', async () => {
    useCampaignAudienceMock.mockReturnValue(audience({ eligible: [contact('c-1', 'Marie Dubois')] }))
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    await screen.findByText('[fenêtre de création]')
    expect(useCampaignAudienceMock).toHaveBeenCalledWith(['c-1', 'c-2'])
  })

  it('ouvre la fenêtre PRÉ-REMPLIE : l’audience, l’objectif, le persona et le gabarit', async () => {
    useCampaignAudienceMock.mockReturnValue(
      audience({ eligible: [contact('c-1', 'Marie Dubois'), contact('c-2', 'Alain Roche')] }),
    )
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    expect(await screen.findByText('[fenêtre de création]')).toBeInTheDocument()
    expect(screen.getByText('objectif : Relancer les DSI industrie')).toBeInTheDocument()
    expect(screen.getByText('gabarit : cold_email')).toBeInTheDocument()
    expect(screen.getByText('persona : DSI')).toBeInTheDocument()
    expect(screen.getByText('Marie Dubois')).toBeInTheDocument()
    expect(screen.getByText('Alain Roche')).toBeInTheDocument()
  })

  it('NOMME les contacts écartés, avec le motif écrit — sinon ils disparaissent en silence', async () => {
    useCampaignAudienceMock.mockReturnValue(
      audience({
        eligible: [contact('c-1', 'Marie Dubois')],
        dropped: [{ id: 'c-2', fullName: 'Sophie Marin', reason: 'opted_out', detail: 'a quitté l’entreprise' }],
      }),
    )
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    expect(await screen.findByText(/Sophie Marin/)).toBeInTheDocument()
    expect(screen.getByText(/a quitté l’entreprise/)).toBeInTheDocument()
  })

  it('nomme un contact introuvable par son IDENTIFIANT — jamais par un nom inventé', async () => {
    useCampaignAudienceMock.mockReturnValue(
      audience({
        eligible: [contact('c-1', 'Marie Dubois')],
        dropped: [{ id: 'c-404', fullName: null, reason: 'missing', detail: null }],
      }),
    )
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    expect(await screen.findByText(/c-404/)).toBeInTheDocument()
  })

  it('n’ouvre RIEN tant que les fiches sont en lecture — une audience partielle n’est pas l’audience', async () => {
    useCampaignAudienceMock.mockReturnValue(audience({ eligible: [contact('c-1', 'Marie Dubois')], pending: 1 }))
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    expect(await screen.findByText(/Je relis les contacts/)).toBeInTheDocument()
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()
  })

  it('aucun contact exploitable : rien ne s’ouvre, et l’écran DIT pourquoi', async () => {
    useCampaignAudienceMock.mockReturnValue(
      audience({ dropped: [{ id: 'c-2', fullName: 'Sophie Marin', reason: 'opted_out', detail: null }] }),
    )
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    expect(await screen.findByText(/Aucun de ces contacts/)).toBeInTheDocument()
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()
  })

  it('la fenêtre refermée, la campagne reste REPRENABLE — un bouton, pas un lien mort', async () => {
    useCampaignAudienceMock.mockReturnValue(audience({ eligible: [contact('c-1', 'Marie Dubois')] }))
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    fireEvent.click(await screen.findByRole('button', { name: '[fermer]' }))
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Reprendre la préparation/ }))
    expect(screen.getByText('[fenêtre de création]')).toBeInTheDocument()
    expect(screen.getByText('objectif : Relancer les DSI industrie')).toBeInTheDocument()
  })

  it('le bouton de l’entête ouvre une fenêtre VIERGE, même sur un écran ouvert par une campagne', async () => {
    useCampaignAudienceMock.mockReturnValue(audience({ eligible: [contact('c-1', 'Marie Dubois')] }))
    renderWithRouter(<SequencesPage />, CAMPAIGN_URL)
    fireEvent.click(await screen.findByRole('button', { name: '[fermer]' }))

    fireEvent.click(screen.getByRole('button', { name: /Créer une séquence/ }))
    fireEvent.click(screen.getByRole('button', { name: '[vérifier]' }))
    expect(screen.getByText('objectif : aucun')).toBeInTheDocument()
    // le gabarit est celui choisi DANS le parcours, jamais celui de la campagne (cold_email)
    expect(screen.getByText('gabarit : nurturing')).toBeInTheDocument()
  })
})

describe('le témoin — ce que la campagne ne doit PAS attraper', () => {
  it('sans campagne dans l’URL, l’écran est inchangé : rien ne s’ouvre, aucune fiche relue', async () => {
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/Tu n’as encore aucune séquence/)).toBeInTheDocument()
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()
    expect(screen.queryByText(/Campagne préparée par Laura/)).not.toBeInTheDocument()
    expect(useCampaignAudienceMock).toHaveBeenCalledWith([])
  })

  it('des contacts SANS objectif ne sont pas une campagne — les deux moitiés vont ensemble', async () => {
    renderWithRouter(<SequencesPage />, '/actions/sequences?contact_ids=c-1,c-2')
    expect(await screen.findByText(/Tu n’as encore aucune séquence/)).toBeInTheDocument()
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()
    expect(useCampaignAudienceMock).toHaveBeenCalledWith([])
  })

  it('le bouton « Créer une séquence » de l’entête reste SANS campagne — il n’en hérite pas', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer une séquence/ }))
    fireEvent.click(screen.getByRole('button', { name: '[vérifier]' }))
    expect(screen.getByText('objectif : aucun')).toBeInTheDocument()
    expect(screen.getByText('gabarit : nurturing')).toBeInTheDocument()
  })
})
