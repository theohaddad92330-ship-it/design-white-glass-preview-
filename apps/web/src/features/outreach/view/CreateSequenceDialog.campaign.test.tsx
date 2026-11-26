import { render, screen } from '@testing-library/react'
import { CreateSequenceDialog } from './CreateSequenceDialog'

/**
 * #1935.1 → .6 / #1935.24 — LE CONTEXTE D'UNE CAMPAGNE PRÉPARÉE PAR LAURA,
 * AFFICHÉ EN TÊTE, ET CHAQUE MESSAGE RELISIBLE AVANT LA CRÉATION.
 *
 * Avant ce lot : `CreateSequenceDialog` ignorait tout du chat — aucun moyen
 * d'afficher l'objectif, le persona ou la relation qu'une conversation avait
 * établis, et aucune surface n'affichait le brouillon d'une étape avant le
 * clic « Créer ». Ces tests verrouillent les deux ajouts, additifs : les
 * usages existants (sans `campaignContext`) restent inchangés.
 */

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children?: React.ReactNode }) => <>{children}</> }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => ({ data: undefined }) }))
vi.mock('../hooks/useOutreachMutations', () => ({
  useCreateOutreachSequence: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
// #2202.14 — porte CRM sans rapport avec ce lot : pas de connecteur (comportement d'avant).
vi.mock('@/features/crm/api', () => ({ useCrmWriteRequests: () => ({ data: { status: 'not_connected' } }) }))
// #2202.23 — sans rapport avec ce lot : liste vide, aucun avertissement porteur.
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('../hooks/useOutreachSequences', () => ({
  useOutreachSequences: () => ({ data: undefined }),
  useEnrollmentEligibility: () => ({ data: undefined }),
}))

const CONTACT_WITH_DRAFT = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Claire Dubois',
  title: 'DSI',
  email: 'claire@example.com',
  email_message: { subject: 'Objet du message', body: 'Bonjour Claire, corps du message préparé.' },
}
const CONTACT_WITHOUT_DRAFT = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Marc Petit',
  title: 'DSI',
  email: 'marc@example.com',
  email_message: null,
}

describe('CreateSequenceDialog — contexte de campagne (#1935)', () => {
  it('affiche l’objectif, le persona, la relation et le ton annoncés par Laura', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{
          objective: 'Relancer les DSI industrie sur le cloud souverain',
          persona: 'DSI',
          relation: 'cold',
          tone: 'direct',
        }}
      />,
    )
    expect(screen.getByText('Relancer les DSI industrie sur le cloud souverain')).toBeInTheDocument()
    expect(screen.getByText('Persona visé : DSI')).toBeInTheDocument()
    expect(screen.getByText('Relation : prise de contact à froid')).toBeInTheDocument()
    expect(screen.getByText('Ton : direct')).toBeInTheDocument()
  })

  // #1935.5 — LE CANAL VOULU, DEMANDÉ EN CONVERSATION, AFFICHÉ AVANT LA
  // CRÉATION. Déjà câblé (`chat_tools.py` → `campaignSearch` →
  // `campaign-prefill.ts` → cet écran) ; il manquait la preuve, aucun test ne
  // verrouillait ce rendu. Ce qui reste HORS de ce point (voir le registre) :
  // la persistance réelle d'une étape de séquence reste email/reminder/task —
  // un canal LinkedIn ou téléphone choisi ici n'a encore aucun effet sur
  // l'étape créée. Fonctionnalité à part entière (`outreachStepKindSchema`),
  // pas ce point-ci.
  it('#1935.5 — affiche les canaux voulus, demandés en conversation', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{ objective: 'Relancer les DSI', channels: ['linkedin', 'phone'] }}
      />,
    )
    expect(screen.getByText('Canaux voulus : message privé, téléphone')).toBeInTheDocument()
  })

  it('#1935.5 — un seul canal email (l’implicite) ne s’affiche pas (comportement d’avant)', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{ objective: 'Relancer les DSI', channels: ['email'] }}
      />,
    )
    expect(screen.queryByText(/^Canaux voulus/)).not.toBeInTheDocument()
  })

  // #1935.15 — le MODE (`outreach`/`nurturing`) choisi dans le chat voyageait
  // jusqu'à l'URL de Séquences (`campaignSearch`, `PendingActions.tsx`) puis
  // s'arrêtait là : ni cet écran ni `SequencesPage` ne le lisaient. Une
  // campagne « nurturing » atterrissait donc identique à une « outreach »,
  // sans aucune distinction visible.
  it('#1935.15 — nomme le mode nurturing annoncé par Laura, distinct d’outreach', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{
          objective: 'Entretenir la relation avec les comptes déjà signés',
          mode: 'nurturing',
        }}
      />,
    )
    expect(screen.getByText('Mode : nurturing, relation à entretenir')).toBeInTheDocument()
  })

  it('#1935.15 — un mode « outreach » (ou absent) ne s’affiche pas — c’est le comportement d’avant', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{ objective: 'Relancer les DSI', mode: 'outreach' }}
      />,
    )
    expect(screen.queryByText(/^Mode :/)).not.toBeInTheDocument()
  })

  // #1935.14 — une audience 100% téléphone EST une liste d'appels : le trou
  // restant après le prefill (`campaign-prefill.ts`) et l'appelant
  // (`PendingActions.tsx`) était ICI — l'écran qui en ferait quelque chose de
  // visible, une liste d'appels n'étant pas une séquence e-mail/rappel/tâche.
  it('#1935.14 — nomme la liste d’appels annoncée par Laura, distincte d’une campagne', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{ objective: 'Relancer les DSI par téléphone', outputKind: 'call_list' }}
      />,
    )
    expect(screen.getByText('Liste d’appels préparée par Laura')).toBeInTheDocument()
    expect(screen.queryByText('Campagne préparée par Laura')).not.toBeInTheDocument()
  })

  it('#1935.14 — un type de sortie « sequence_campaign » (ou absent) garde le libellé de campagne (comportement d’avant)', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        campaignContext={{ objective: 'Relancer les DSI', outputKind: 'sequence_campaign' }}
      />,
    )
    expect(screen.getByText('Campagne préparée par Laura')).toBeInTheDocument()
  })

  it('ne montre aucun bandeau de campagne sans `campaignContext` (comportement inchangé)', () => {
    render(<CreateSequenceDialog open onOpenChange={() => {}} initialContacts={[CONTACT_WITH_DRAFT]} />)
    expect(screen.queryByText('Campagne préparée par Laura')).not.toBeInTheDocument()
  })

  it('présélectionne le gabarit annoncé', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT]}
        initialTemplate="cold_email"
      />,
    )
    expect(screen.getByRole('button', { name: /Compte froid — email/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('#1935.24 — relit le brouillon existant, et NOMME l’absence de brouillon sans l’inventer', () => {
    render(
      <CreateSequenceDialog
        open
        onOpenChange={() => {}}
        initialContacts={[CONTACT_WITH_DRAFT, CONTACT_WITHOUT_DRAFT]}
        initialTemplate="cold_email"
      />,
    )
    expect(screen.getByText('Objet du message')).toBeInTheDocument()
    expect(screen.getByText('Bonjour Claire, corps du message préparé.')).toBeInTheDocument()
    expect(screen.getByText(/Aucun brouillon préparé — la rédaction automatique n’a pas abouti/)).toBeInTheDocument()
  })
})
