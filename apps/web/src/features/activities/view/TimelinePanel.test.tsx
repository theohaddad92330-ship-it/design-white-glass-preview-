import type { Activity } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { Timeline } from '../api'
import { TimelinePanel } from './TimelinePanel'

const timeline = vi.fn()
const log = vi.fn()
const sync = vi.fn()
const remove = vi.fn()

vi.mock('../hooks/useTimeline', () => ({
  useTimeline: () => timeline(),
  useLogActivity: () => ({ mutate: log, isPending: false }),
  useSyncActivities: () => ({ mutate: sync, isPending: false }),
  useRemoveActivity: () => ({ mutate: remove, isPending: false }),
}))

/**
 * #2777 — ce test vérifie le CÂBLAGE (« après l'enregistrement d'une note,
 * l'écran propose la cascade »), pas le rendu de la cascade elle-même (déjà
 * couvert par les tests de `MeetingNotesCard`/`MeetingCascade`) : un double
 * mock signale ce que `TimelinePanel` lui a transmis.
 */
const noteCascadeProposal = vi.fn()
vi.mock('./NoteCascadeProposal', () => ({
  NoteCascadeProposal: (props: { accountId: string; notes: string }) => {
    noteCascadeProposal(props)
    return <div data-testid="note-cascade-proposal">{props.notes}</div>
  },
}))

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    kind: 'email',
    source: 'mailbox',
    direction: 'outbound',
    subject: 'Deux profils conformité',
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt: '2026-08-14T09:00:00.000Z',
    durationSeconds: null,
    accountId: 'acc-1',
    contactId: null,
    projectId: null,
    linkReason: 'contact_email',
    userId: null,
    authorName: null,
    participants: [],
    externalId: 'msg-1',
    externalUrl: null,
    createdAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  }
}

function ok(items: Activity[], engagement: Partial<Timeline['engagement']> = {}) {
  return {
    data: {
      items,
      engagement: {
        total: items.length,
        lastOutboundAt: null,
        lastInboundAt: null,
        daysSinceLastActivity: 3,
        awaitingReply: false,
        byKind: {},
        ...engagement,
      },
    },
    isLoading: false,
    isError: false,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TimelinePanel scope="account" entityId="acc-1" accountId="acc-1" />
    </QueryClientProvider>,
  )
}

/**
 * Le MÊME panneau, sous un routeur — nécessaire seulement quand une ligne porte
 * un `contactId` (#2124.65), parce que le lien vers le contact est un `Link` et
 * qu'un `Link` hors routeur jette. Le harnais du routeur monte de façon
 * ASYNCHRONE : ces tests-là attendent (`findBy…`), les autres restent
 * synchrones plutôt que d'attendre pour rien.
 */
function renderPanelWithRouter() {
  return renderWithRouter(<TimelinePanel scope="account" entityId="acc-1" accountId="acc-1" />)
}

/**
 * #3405 — recette prod 01/10 : l'onglet Historique & preuves rendait chaque
 * ligne « Laura a consulté ton CRM » DEUX fois (liste « Actions exécutées »,
 * puis chronologie) — même source, deux blocs. `omitActions` retire de la
 * chronologie ce que la liste au-dessus montre déjà.
 */
describe('TimelinePanel — omitActions (#3405)', () => {
  const crm = activity({ id: 'crm-1', kind: 'crm_lookup', source: 'system', subject: null, direction: 'internal' })
  const email = activity({ id: 'mail-1' })

  it('sans omitActions, la ligne d’action reste dans la chronologie', () => {
    timeline.mockReturnValue(ok([crm, email]))
    renderPanel()
    expect(screen.getAllByText(/a consulté ton CRM|consulted your CRM/i)).toHaveLength(1)
  })

  it('avec omitActions, l’action disparaît, l’échange reste, et le filtre « Actions » aussi', () => {
    timeline.mockReturnValue(ok([crm, email]))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TimelinePanel scope="account" entityId="acc-1" accountId="acc-1" omitActions />
      </QueryClientProvider>,
    )
    expect(screen.queryByText(/a consulté ton CRM|consulted your CRM/i)).toBeNull()
    expect(screen.getByText('Deux profils conformité')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Actions)$/ })).toBeNull()
  })
})

describe('TimelinePanel', () => {
  beforeEach(() => {
    timeline.mockReset()
    log.mockReset()
    sync.mockReset()
    noteCascadeProposal.mockReset()
    // #3688.10 — le filtre et la recherche se retrouvent d’une visite à l’autre : chaque test repart à neuf.
    window.sessionStorage.clear()
    noteCascadeProposal.mockReset()
  })

  it('affiche l’objet de l’échange', () => {
    timeline.mockReturnValue(ok([activity()]))
    renderPanel()
    expect(screen.getByText('Deux profils conformité')).toBeInTheDocument()
  })

  it('met « en attente de réponse » EN TÊTE, pas au lecteur de le déduire', () => {
    timeline.mockReturnValue(ok([activity()], { awaitingReply: true, daysSinceLastActivity: 4 }))
    renderPanel()
    expect(screen.getByText('En attente de réponse')).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme un historique vide', () => {
    // La faute trouvée en production le 17/08 sur les notes : un 403 s'affichait
    // « aucune note », et on cherchait la panne au mauvais endroit.
    timeline.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPanel()
    expect(screen.getByText(/la lecture qui a échoué/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun échange enregistré.')).not.toBeInTheDocument()
  })

  it('dit « aucun échange » quand il n’y en a vraiment aucun', () => {
    timeline.mockReturnValue(ok([]))
    renderPanel()
    expect(screen.getByText('Aucun échange enregistré.')).toBeInTheDocument()
  })

  /**
   * #2126.6 / #2126.19 — un historique vide parce qu'AUCUN outil n'est
   * branché se distingue d'un historique simplement vide, et propose le
   * geste qui répare : se connecter, pas « réessayer ».
   */
  it('propose « Connecter un outil » quand la récupération dit qu’aucun outil n’est branché', async () => {
    timeline.mockReturnValue(ok([]))
    sync.mockImplementation((_vars: unknown, opts?: { onSuccess?: (result: unknown) => void }) => {
      opts?.onSuccess?.({
        sources: [
          { source: 'mailbox', ingested: 0, duplicates: 0, skipped: [], unavailable: 'x', reason: 'not_connected' },
          { source: 'agenda', ingested: 0, duplicates: 0, skipped: [], unavailable: 'x', reason: 'not_connected' },
          { source: 'telephony', ingested: 0, duplicates: 0, skipped: [], unavailable: 'x', reason: 'not_connected' },
        ],
        ingested: 0,
      })
    })
    renderPanelWithRouter()
    fireEvent.click(await screen.findByText('Récupérer'))
    expect(await screen.findByText('Aucun outil connecté ne peut alimenter cet historique.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun échange enregistré.')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter un outil' })).toHaveAttribute('href', '/integrations')
  })

  it('ne propose PAS « Connecter un outil » quand une source est simplement EN PANNE', async () => {
    timeline.mockReturnValue(ok([]))
    sync.mockImplementation((_vars: unknown, opts?: { onSuccess?: (result: unknown) => void }) => {
      opts?.onSuccess?.({
        sources: [
          { source: 'mailbox', ingested: 0, duplicates: 0, skipped: [], unavailable: 'x', reason: 'not_connected' },
          { source: 'agenda', ingested: 0, duplicates: 0, skipped: [], unavailable: 'Graph 503', reason: 'error' },
          { source: 'telephony', ingested: 0, duplicates: 0, skipped: [], unavailable: 'x', reason: 'not_connected' },
        ],
        ingested: 0,
      })
    })
    renderPanelWithRouter()
    fireEvent.click(await screen.findByText('Récupérer'))
    await screen.findByText('Aucun échange enregistré.')
    expect(screen.queryByText('Aucun outil connecté ne peut alimenter cet historique.')).not.toBeInTheDocument()
  })

  it('marque une activité INTERNE — elle ne prouve rien sur la relation client', () => {
    timeline.mockReturnValue(ok([activity({ direction: 'internal', subject: 'Préparation interne' })]))
    renderPanel()
    expect(screen.getByText('Interne')).toBeInTheDocument()
  })

  it('DIT qu’un corps a été coupé plutôt que de laisser croire au message entier', () => {
    timeline.mockReturnValue(ok([activity({ body: 'Bonjour', bodyTruncated: true })]))
    renderPanel()
    expect(screen.getByText(/Message tronqué/)).toBeInTheDocument()
  })

  it('affiche la PROVENANCE de chaque ligne — « saisi à la main » n’a pas la même valeur qu’un mail lu', () => {
    timeline.mockReturnValue(ok([activity({ source: 'manual' })]))
    renderPanel()
    expect(screen.getByText('Saisi à la main')).toBeInTheDocument()
  })

  it('justifie le rattachement — « rattaché » seul ne se vérifie pas', () => {
    timeline.mockReturnValue(ok([activity({ linkReason: 'account_domain' })]))
    renderPanel()
    expect(screen.getByText('Rattaché par le domaine du compte')).toBeInTheDocument()
  })

  it('n’affiche pas de durée quand le fournisseur n’en donne pas', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'call', durationSeconds: null })]))
    renderPanel()
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument()
  })

  it('dit « issue non renseignée » sur un appel sans issue — lisible, jamais planté', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'call', outcome: undefined })]))
    renderPanel()
    expect(screen.getByText('Issue non renseignée')).toBeInTheDocument()
  })

  it('affiche l’issue d’un appel quand elle est renseignée', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'call', outcome: 'voicemail' })]))
    renderPanel()
    expect(screen.getByText('Messagerie')).toBeInTheDocument()
  })

  it('n’affiche aucune issue sur une activité qui n’est pas un appel', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'meeting' })]))
    renderPanel()
    expect(screen.queryByText('Issue non renseignée')).not.toBeInTheDocument()
  })

  it('propose de retirer une saisie MANUELLE', () => {
    timeline.mockReturnValue(ok([activity({ source: 'manual' })]))
    renderPanel()
    expect(screen.getByLabelText('Retirer cette saisie')).toBeInTheDocument()
  })

  it('n’offre AUCUN bouton de retrait sur une activité capturée', () => {
    // L'effacer ne ferait pas disparaître l'e-mail chez le fournisseur, et la
    // prochaine récupération la ramènerait.
    timeline.mockReturnValue(ok([activity({ source: 'mailbox' })]))
    renderPanel()
    expect(screen.queryByLabelText('Retirer cette saisie')).not.toBeInTheDocument()
  })

  /**
   * #2124.59 — LES CATÉGORIES.
   *
   * Le filtre découpait par NATURE technique (`email` / `call` / `meeting`) et
   * laissait `task`, `workflow`, `stage_change`, `analysis` et
   * `gate_decision` stockés, rendus dans le fil, et introuvables au filtre.
   */
  it('filtre par CATÉGORIE, et sait dire NON', () => {
    timeline.mockReturnValue(
      ok([
        activity({ id: 'a-mail', subject: 'Deux profils conformité' }),
        activity({ id: 'a-analyse', kind: 'analysis', subject: 'Analyse relancée' }),
      ]),
    )
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Analyses' }))
    expect(screen.getByText('Analyse relancée')).toBeInTheDocument()
    expect(screen.queryByText('Deux profils conformité')).not.toBeInTheDocument()
  })

  /**
   * #2124.64 — LE RÉSULTAT D'UN ÉVÉNEMENT QUI N'EST PAS UN APPEL.
   *
   * `verdict` était stocké sur toute activité — `sent`, `drafted`, `failed`,
   * `partial`, `unknown` — et l'écran ne le lisait NULLE PART : seule l'issue
   * d'un APPEL s'affichait. Un message resté en brouillon se lisait donc comme
   * un message parti.
   */
  it('affiche le RÉSULTAT d’un e-mail resté en brouillon', () => {
    timeline.mockReturnValue(ok([activity({ verdict: 'drafted' })]))
    renderPanel()
    expect(screen.getByText('Resté en brouillon')).toBeInTheDocument()
  })

  it('sait dire NON — une ligne sans résultat n’en invente pas un', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'note', verdict: null, subject: 'Note interne' })]))
    renderPanel()
    expect(screen.getByText('Note interne')).toBeInTheDocument()
    expect(screen.queryByText('Parti')).not.toBeInTheDocument()
    expect(screen.queryByText('Sort indéterminé')).not.toBeInTheDocument()
  })

  /** #2124.65 — le lien vers l'OBJET concerné, pas seulement vers l'outil. */
  it('ouvre le CONTACT rattaché quand la ligne en porte un', async () => {
    timeline.mockReturnValue(ok([activity({ contactId: '3f0c2b6e-1111-4111-8111-111111111111' })]))
    renderPanelWithRouter()
    expect(await screen.findByRole('link', { name: 'Ouvrir le contact' })).toHaveAttribute(
      'href',
      '/contacts/3f0c2b6e-1111-4111-8111-111111111111',
    )
  })

  it('sait dire NON — sans contact rattaché, aucun lien de contact', async () => {
    timeline.mockReturnValue(ok([activity({ contactId: null, subject: 'Sans contact' })]))
    renderPanelWithRouter()
    await screen.findByText('Sans contact')
    expect(screen.queryByRole('link', { name: 'Ouvrir le contact' })).not.toBeInTheDocument()
  })

  /**
   * #1931.19 — COCHER UNE TÂCHE N'EST PAS CONTACTER QUELQU'UN.
   *
   * `tasks.service.ts::recordCompletion` écrit une ligne `kind: 'task'`,
   * `direction: 'internal'` dans le même historique qu'un e-mail ou un appel
   * réellement échangé. Sans marqueur, un lecteur qui n'a pas coché la case
   * lui-même lit « Relancer le devis — fait » comme la preuve d'un contact.
   */
  it('cocher une tâche affiche que personne n’a été contacté', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'task', direction: 'internal', subject: 'Relancer le devis' })]))
    renderPanel()
    expect(screen.getByText(/Personne n'a été contacté/)).toBeInTheDocument()
  })

  it('sait dire NON — un échange réel ne porte pas la mention « personne n’a été contacté »', () => {
    timeline.mockReturnValue(ok([activity({ kind: 'email', direction: 'internal' })]))
    renderPanel()
    expect(screen.queryByText(/Personne n'a été contacté/)).not.toBeInTheDocument()
  })

  /**
   * #2777 — recette écran 27/09 : « Noter un échange » → « Enregistrer »
   * enregistrait la note (toast « Échange enregistré. ») mais ne proposait
   * AUCUNE cascade. L'appelant manquant : après un enregistrement réussi, sur
   * un compte connu, l'écran propose la cascade sur le texte qu'on vient
   * d'écrire.
   */
  it('#2777 — propose la cascade après l’enregistrement d’une note liée à un compte', () => {
    timeline.mockReturnValue(ok([]))
    log.mockImplementation((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    renderPanel()

    fireEvent.click(screen.getByText('Consigner un échange'))
    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByLabelText("Ce qui s'est dit"), {
      target: { value: 'RDV avec la DSI, besoin data 2 consultants.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByTestId('note-cascade-proposal')).toHaveTextContent('RDV avec la DSI, besoin data 2 consultants.')
    expect(noteCascadeProposal).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', notes: 'RDV avec la DSI, besoin data 2 consultants.' }),
    )
  })

  it('#2777 — sait dire NON : aucune cascade proposée sans compte rattaché', () => {
    timeline.mockReturnValue(ok([]))
    log.mockImplementation((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <TimelinePanel scope="contact" entityId="contact-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByText('Consigner un échange'))
    fireEvent.click(screen.getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByLabelText("Ce qui s'est dit"), { target: { value: 'Un échange sans compte connu.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.queryByTestId('note-cascade-proposal')).not.toBeInTheDocument()
    expect(noteCascadeProposal).not.toHaveBeenCalled()
  })

  it('#3505 — douze consultations identiques du CRM se lisent en UNE ligne avec « × 12 »', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      activity({
        id: `lookup-${i}`,
        kind: 'crm_lookup',
        source: 'manual',
        direction: 'internal',
        subject: null,
        occurredAt: `2026-09-30T${String(8 + i).padStart(2, '0')}:00:00.000Z`,
      }),
    )
    timeline.mockReturnValue(ok(rows))
    renderPanel()
    expect(screen.getAllByText(/a consulté ton CRM/)).toHaveLength(1)
    expect(screen.getByText('× 12')).toBeInTheDocument()
  })
})

// #4016.6d — l'appel d'origine d'une détection est ATTEIGNABLE : chaque ligne porte une ancre,
// et la ligne visée par `#activity-<id>` est mise en évidence et amenée à l'écran.
describe('TimelinePanel — ancre d’une activité (#4016.6d)', () => {
  const call = activity({ id: 'call-9', kind: 'call', source: 'manual', subject: 'Appel SNCF' })
  const other = activity({ id: 'mail-2' })
  const scroll = vi.fn()

  beforeEach(() => {
    scroll.mockReset()
    Element.prototype.scrollIntoView = scroll
    window.location.hash = ''
  })

  it('chaque ligne porte une ancre stable `activity-<id>`', () => {
    timeline.mockReturnValue(ok([call, other]))
    renderPanel()
    expect(document.getElementById('activity-call-9')).not.toBeNull()
    expect(document.getElementById('activity-mail-2')).not.toBeNull()
  })

  it('la ligne visée par le hash est amenée à l’écran et marquée — les autres non', () => {
    window.location.hash = '#activity-call-9'
    timeline.mockReturnValue(ok([call, other]))
    renderPanel()
    expect(document.getElementById('activity-call-9')?.hasAttribute('data-anchored')).toBe(true)
    expect(document.getElementById('activity-mail-2')?.hasAttribute('data-anchored')).toBe(false)
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON : un hash qui ne vise aucune ligne ne déplace rien', () => {
    window.location.hash = '#activity-inconnue'
    timeline.mockReturnValue(ok([call, other]))
    renderPanel()
    expect(document.querySelector('[data-anchored]')).toBeNull()
    expect(scroll).not.toHaveBeenCalled()
  })
})
