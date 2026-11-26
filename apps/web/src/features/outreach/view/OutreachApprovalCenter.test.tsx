import type { OutreachMessage } from '@bellum/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { OutreachApprovalCenter } from './OutreachApprovalCenter'

/**
 * #2382 — le centre d'approbation de l'outreach. Ce que chaque test empêche :
 *  · un onglet qui n'existe pas (les sept vues de la spec, #2382.1) ;
 *  · une carte muette sur ce qui bloque, ce qui risque, et le droit requis (#2382.2) ;
 *  · un diff qui ne montre pas ce qui entre et sort (#2382.3) ;
 *  · un bouton de validation offert à qui n'a pas le droit (#2382.7) ;
 *  · un « valider tout » qui n'envoie pas la version AFFICHÉE (#2382.9).
 */
const list = vi.fn()
const approve = vi.fn()
const revise = vi.fn()
const flagQuality = vi.fn()
const alternativeHooks = vi.fn()
const listCalls = vi.fn()
const transitionCall = vi.fn()
const variables = vi.fn()
vi.mock('../api', () => ({
  outreachKeys: { all: ['outreach'], messages: () => ['outreach', 'messages', 'all'] },
  outreachMessagesApi: {
    list: () => list(),
    approve: (body: unknown) => approve(body),
    revise: (id: string, body: unknown) => revise(id, body),
    flagQuality: (id: string, body: unknown) => flagQuality(id, body),
    variables: (id: string) => variables(id),
    listCalls: () => listCalls(),
    transitionCall: (id: string, body: unknown) => transitionCall(id, body),
    alternativeHook: (input: unknown) => alternativeHooks(input),
  },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

function message(over: Partial<OutreachMessage> = {}): OutreachMessage {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    contact_id: '00000000-0000-4000-8000-0000000000c1',
    contact_name: 'Marie Dubois',
    contact_role: 'DSI',
    account_name: 'Acme',
    channel: 'email',
    intent: 'open_relationship',
    source: 'laura',
    reason: null,
    status: 'needs_review',
    sequence_id: null,
    sequence_step_id: null,
    asset_id: null,
    owner_id: 'u-1',
    current_version: 2,
    message_style_template_id: null,
    message_style_template_version: null,
    subject: 'Bonjour Marie',
    body: 'Bonjour Marie\nVotre DSI recrute.',
    versions: [
      {
        version: 1,
        kind: 'template',
        subject: 'Bonjour',
        body: 'Bonjour {prénom}\nNous avons une mission.',
        author: null,
        created_at: '2026-09-22T10:00:00.000Z',
      },
      {
        version: 2,
        kind: 'personalized',
        subject: 'Bonjour Marie',
        body: 'Bonjour Marie\nVotre DSI recrute.',
        author: 'u-1',
        created_at: '2026-09-22T10:00:00.000Z',
      },
    ],
    approval: null,
    view: 'to_review',
    blockers: [],
    risks: [],
    can_approve: true,
    required_permission: 'messages:send',
    created_at: '2026-09-22T10:00:00.000Z',
    updated_at: '2026-09-22T10:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  list.mockReset()
  approve.mockReset()
  approve.mockResolvedValue({ approved: [], excluded: [] })
  revise.mockReset()
  alternativeHooks.mockReset()
  flagQuality.mockReset()
  flagQuality.mockResolvedValue({ kind: 'wrong_fact' })
  listCalls.mockReset()
  listCalls.mockResolvedValue([])
  variables.mockReset()
  variables.mockResolvedValue([])
})

describe('OutreachApprovalCenter', () => {
  // En PREMIER : le client de requêtes du rendu de test est partagé, un cache
  // rempli par un test précédent rendrait ce silence impossible à observer.
  it('se tait quand aucun message n’est préparé', async () => {
    list.mockResolvedValue([])
    renderWithRouter(<OutreachApprovalCenter />)
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Centre d’approbation' })).toBeNull()
  })
  it('nomme les sept vues de la spec (#2382.1)', async () => {
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    for (const label of ['À valider', 'Modifiés', 'Bloqués', 'Prêts', 'Planifiés', 'Exécutés', 'Échecs']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  // #3419 (recette démo 10/10) — un siège se nomme par son titre : nom et rôle identiques ne s'écrivent qu'une fois.
  it('#3419 — un nom identique au rôle ne s’écrit qu’une fois par carte', async () => {
    const seat = 'Directeur technique — entité numérique voyageurs'
    list.mockResolvedValue([message({ contact_name: seat, contact_role: seat })])
    renderWithRouter(<OutreachApprovalCenter />)
    await screen.findByText(seat)
    expect(screen.getAllByText(seat)).toHaveLength(1)
  })

  it('la carte dit ce qui bloque, le droit requis et que le coût n’est pas mesuré (#2382.2)', async () => {
    list.mockResolvedValue([message({ view: 'blocked', blockers: ['opted_out'], risks: ['stale_contact'] })])
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: /Bloqués/ }))
    expect(await screen.findByText('A demandé à ne plus être contacté')).toBeInTheDocument()
    expect(screen.getByText('A probablement quitté l’entreprise')).toBeInTheDocument()
    expect(screen.getByText('Envoi de messages (le tien)')).toBeInTheDocument()
    expect(screen.getByText('Non mesuré')).toBeInTheDocument()
    // Un bloqué ne se valide pas.
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  // #3419 (recette prod 02/10) — l'écran ne montrait ni le message « Votre
  // plateforme data » ni son motif : la vue ouverte d'office était « À valider »,
  // et le bloqué dormait derrière une pastille. Un message bloqué ne se valide
  // pas, il se corrige : c'est la première chose à voir.
  it('ouvre d’office sur les bloqués, avec le message et son motif (#3419)', async () => {
    list.mockResolvedValue([
      message({ id: '00000000-0000-4000-8000-0000000000a1', subject: 'Relance Acme', view: 'to_review' }),
      message({
        id: '00000000-0000-4000-8000-0000000000a2',
        subject: 'Votre plateforme data',
        view: 'blocked',
        blockers: ['unverified_tech_claim'],
      }),
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Votre plateforme data')).toBeInTheDocument()
    expect(screen.getByText(/Une technologie est affirmée sans être confirmée/)).toBeInTheDocument()
    expect(screen.queryByText('Relance Acme')).toBeNull()
    // Les autres vues restent à un clic, comptées.
    fireEvent.click(screen.getByRole('button', { name: /À valider/ }))
    expect(await screen.findByText('Relance Acme')).toBeInTheDocument()
  })

  it('sans message bloqué, la vue ouverte reste « À valider » (#3419)', async () => {
    list.mockResolvedValue([message({ subject: 'Relance Acme' })])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Relance Acme')).toBeInTheDocument()
  })

  it('le diff surligne ce qui entre et ce qui sort (#2382.3)', async () => {
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Comparer les versions' }))
    expect(screen.getByText(/Nous avons une mission\./)).toHaveClass('line-through')
    expect(screen.getByText(/Votre DSI recrute\./, { selector: 'li' })).toBeInTheDocument()
  })

  it('pas de bouton de validation sans le droit (#2382.7)', async () => {
    list.mockResolvedValue([message({ can_approve: false, required_permission: 'team:manage' })])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Gestion d’équipe (message d’un autre membre)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Valider les/ })).not.toBeInTheDocument()
  })

  it('« valider tout » envoie chaque message avec la version AFFICHÉE (#2382.9)', async () => {
    list.mockResolvedValue([
      message(),
      message({ id: '00000000-0000-4000-8000-000000000002', current_version: 3, view: 'to_review' }),
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Valider les 2 conformes affichés' }))
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({
        items: [
          { id: '00000000-0000-4000-8000-000000000001', version: 2 },
          { id: '00000000-0000-4000-8000-000000000002', version: 3 },
        ],
      }),
    )
  })
  it('nomme l’état du message parmi les quinze (#2366.4)', async () => {
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-000000000009' })])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(
      await screen.findByText('À relire', { selector: '[data-testid="outreach-message-status"]' }),
    ).toBeInTheDocument()
  })

  it('modifier envoie la version VUE et crée une version (#2366.10)', async () => {
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-00000000000a' })])
    revise.mockResolvedValue(message({ id: '00000000-0000-4000-8000-00000000000a', current_version: 3 }))
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Nouveau texte' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer une nouvelle version' }))
    await waitFor(() =>
      // Le client de requêtes du rendu de test est partagé : l'identifiant peut venir du cache.
      expect(revise).toHaveBeenCalledWith(expect.any(String), {
        subject: 'Bonjour Marie',
        body: 'Nouveau texte',
        base_version: 2,
      }),
    )
  })

  // #3419.3 — « Autres accroches » propose, le commercial choisit ; rien n'est écrit sans son clic.
  it('« Autres accroches » demande une autre ouverture ; l’accepter remplit le champ SANS créer de version (#3419.3)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-0000000000d1' })])
    alternativeHooks.mockResolvedValue({
      body: 'Bonjour Marie\nAccroche A sur votre migration cloud.',
      rationale: 'signal cloud',
    })
    revise.mockResolvedValue(message({ current_version: 3 }))
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Autres accroches' }))
    expect(await screen.findByText(/Accroche A sur votre migration cloud\./)).toBeInTheDocument()
    // La consigne porte le message en cours d'édition, le contact et le canal du message.
    expect(alternativeHooks).toHaveBeenCalledWith({
      contactId: '00000000-0000-4000-8000-0000000000c1',
      channel: 'email',
      currentBody: 'Bonjour Marie\nVotre DSI recrute.',
      previousHooks: [],
    })
    // Proposer n'écrit rien.
    expect(revise).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser cette accroche' }))
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(
      'Bonjour Marie\nAccroche A sur votre migration cloud.',
    )
    // Choisir remplit le champ ; la version ne naît qu'au clic d'enregistrement.
    expect(revise).not.toHaveBeenCalled()
  })

  it('« Autres accroches » est sur la CARTE, sans passer par Modifier, et charge la proposition (#3419.3, recette Z7)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-0000000000d3' })])
    alternativeHooks.mockResolvedValue({ body: 'Accroche C directe.' })
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Autres accroches' }))
    expect(await screen.findByText('Accroche C directe.')).toBeInTheDocument()
    expect(revise).not.toHaveBeenCalled()
  })

  it('« Autres accroches » sans autre élément sourcé : le dit, ne propose rien (#3419.3)', async () => {
    // Cache du QueryClient partagé : sans remise à zéro, la liste périmée du test précédent
    // s'affiche d'abord puis remonte le formulaire, et l'état local des accroches se perd.
    resetTestQueryClient()
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-0000000000d2' })])
    // Le moteur rend le message tel quel : il n'a pas d'autre élément réel.
    alternativeHooks.mockResolvedValue({ body: 'Bonjour Marie\nVotre DSI recrute.' })
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Autres accroches' }))
    expect(await screen.findByText(/Aucune accroche alternative sourcée/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Utiliser cette accroche' })).toBeNull()
  })

  it('l’appel porte son propre état, distinct du message (#2366.5)', async () => {
    list.mockResolvedValue([message({ id: '00000000-0000-4000-8000-00000000000b' })])
    listCalls.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-0000000000ca',
        contact_id: '00000000-0000-4000-8000-0000000000c1',
        contact_name: 'Marie Dubois',
        reason: 'A demandé à être rappelée',
        objective: 'Caler un rendez-vous',
        pitch: null,
        expected_outcome: null,
        status: 'callback',
        source: 'today',
        scheduled_at: null,
        created_at: '2026-09-22T10:00:00.000Z',
      },
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Rappel convenu')).toBeInTheDocument()
  })

  // RÉFUTÉ en prod le 23/09 (#2366.5) — la section « Appels » a sa PROPRE
  // source de données (`listCalls`, indépendante des messages), mais le
  // composant entier se taisait dès que `messages.length === 0`, avant même
  // d'atteindre le rendu de cette section : un appel réel restait invisible
  // sur un compte sans aucun message canonique préparé.
  it('un appel à passer reste visible même sans aucun message préparé (#2366.5 réfuté 23/09)', async () => {
    // Dernier test du fichier : le cache du QueryClient partagé (voir le
    // commentaire en tête de `describe`) porterait sinon les messages/appels
    // des tests précédents et rendrait ce cas impossible à observer.
    resetTestQueryClient()
    list.mockResolvedValue([])
    listCalls.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-0000000000ca',
        contact_id: '00000000-0000-4000-8000-0000000000c1',
        contact_name: 'Marie Dubois',
        reason: 'A demandé à être rappelée',
        objective: 'Caler un rendez-vous',
        pitch: null,
        expected_outcome: null,
        status: 'callback',
        source: 'today',
        scheduled_at: null,
        created_at: '2026-09-22T10:00:00.000Z',
      },
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Rappel convenu')).toBeInTheDocument()
  })

  // #2366.5 — la machine d'états de l'appel se JOUE à l'écran : l'issue d'un
  // appel (sans réponse, rappel convenu, qualifié…) se pose d'un geste, et
  // seules les transitions permises par `CALL_TASK_TRANSITIONS` sont offertes.
  it('l’issue d’un appel se pose d’un geste, parmi les transitions permises (#2366.5)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([])
    const started = {
      id: '00000000-0000-4000-8000-0000000000cb',
      contact_id: '00000000-0000-4000-8000-0000000000c1',
      contact_name: 'Marie Dubois',
      reason: 'Migration annoncée',
      objective: 'Qualifier le besoin',
      pitch: null,
      expected_outcome: null,
      status: 'started',
      source: 'contacts',
      scheduled_at: null,
      created_at: '2026-09-22T10:00:00.000Z',
    }
    listCalls.mockResolvedValue([started])
    transitionCall.mockResolvedValue({ ...started, status: 'qualified' })
    renderWithRouter(<OutreachApprovalCenter />)

    fireEvent.click(await screen.findByRole('button', { name: /marquer « qualifié »/i }))
    await waitFor(() =>
      expect(transitionCall).toHaveBeenCalledWith(
        started.id,
        expect.objectContaining({ to: 'qualified', proof: null }),
      ),
    )
    // SAIT DIRE NON : « Proposé » n'est pas une transition permise depuis « En cours ».
    expect(screen.queryByRole('button', { name: /marquer « proposé »/i })).not.toBeInTheDocument()
  })

  // #2877 (#2385.4) — le relecteur DÉCLARE un problème de qualité ; rien n'est
  // deviné en lisant le corps du message.
  it('signale un faux fait : la nature DÉCLARÉE part avec le message, sans rien valider (#2385.4)', async () => {
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    const toggle = await screen.findByRole('button', { name: 'Signaler un problème' })
    expect(screen.queryByRole('button', { name: 'Faux fait' })).toBeNull()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Faux fait' }))
    await waitFor(() =>
      expect(flagQuality).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', { kind: 'wrong_fact' }),
    )
    expect(approve).not.toHaveBeenCalled()
    expect(revise).not.toHaveBeenCalled()
  })

  it('propose les trois natures et seulement elles — CTA et persona incorrects (#2385.4)', async () => {
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Signaler un problème' }))
    expect(screen.getByRole('button', { name: 'Appel à l’action incorrect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mauvais interlocuteur' })).toBeInTheDocument()
  })

  it('relit sur la carte ce que le relecteur a déjà déclaré — pas seulement un toast (#2385.4)', async () => {
    list.mockResolvedValue([message({ my_quality_flags: ['wrong_fact'] })])
    renderWithRouter(<OutreachApprovalCenter />)
    const toggle = await screen.findByRole('button', { name: 'Signalé : Faux fait' })
    fireEvent.click(toggle)
    const done = screen.getByRole('button', { name: 'Faux fait' })
    expect(done).toBeDisabled()
    expect(done).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mauvais interlocuteur' })).toBeEnabled()
  })

  it('sans déclaration, le bouton garde son libellé neutre (aucune ligne pour une absence)', async () => {
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByRole('button', { name: 'Signaler un problème' })).toBeInTheDocument()
    expect(screen.queryByText(/Signalé :/)).toBeNull()
  })

  // #3752.7 (recette 06/10) — la source documentaire se voit SUR la carte, sans ouvrir « Variables ».
  it('nomme le document cité par une variable : « Source : <titre> » (#3752.7)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message()])
    variables.mockResolvedValue([
      {
        id: 'v1',
        name: 'Exploitation',
        value: 'Délai divisé par quatre',
        source: 'Document de l’espace : Cas client WMS',
      },
      { id: 'v2', name: 'Annonce', value: 'Refonte data', source: 'Communication publique de la banque' },
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByText('Source : Cas client WMS')).toBeInTheDocument()
    expect(screen.queryByText(/Communication publique/)).toBeNull()
  })

  it('aucune variable sourcée sur un document → aucune ligne « Source » (#3752.7)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    await screen.findByText(/Votre DSI recrute/)
    await waitFor(() => expect(variables).toHaveBeenCalled())
    expect(screen.queryByTestId('outreach-document-source')).toBeNull()
  })

  // #2877 / #3419.4 — « la mémoire marché ne produit jamais seule une
  // affirmation nominative » : l'extrait se voit SUR la carte, sans ouvrir
  // « Variables » — même mécanisme que la source documentaire (#3752.7).
  it('nomme l’extrait de mémoire marché cité par une variable (#2877 / #3419.4)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message()])
    variables.mockResolvedValue([
      {
        id: 'v1',
        name: 'Ancien poste',
        value: 'A quitté son poste de DSI',
        source: 'Mémoire marché : observation-industrie-2026-09',
      },
      { id: 'v2', name: 'Annonce', value: 'Refonte data', source: 'Communication publique de la banque' },
    ])
    renderWithRouter(<OutreachApprovalCenter />)
    expect(await screen.findByTestId('outreach-market-memory-source')).toHaveTextContent(
      'observation-industrie-2026-09',
    )
    expect(screen.queryByText(/Communication publique/)).toBeNull()
  })

  it('aucune variable sourcée sur la mémoire marché → aucune ligne (#2877 / #3419.4)', async () => {
    resetTestQueryClient()
    list.mockResolvedValue([message()])
    renderWithRouter(<OutreachApprovalCenter />)
    await screen.findByText(/Votre DSI recrute/)
    await waitFor(() => expect(variables).toHaveBeenCalled())
    expect(screen.queryByTestId('outreach-market-memory-source')).toBeNull()
  })
})
