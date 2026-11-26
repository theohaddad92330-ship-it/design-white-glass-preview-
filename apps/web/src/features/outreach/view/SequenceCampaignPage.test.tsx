import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequenceCampaignPage } from './SequenceCampaignPage'

/**
 * Théo C sequences-detail — la page d'une CAMPAGNE : toute l'audience qui partage l'étiquette, les messages de la
 * cadence, l'essai à blanc, « Arrêter pour ce contact » sans arrêter les autres, et « Modifier la séquence » qui
 * rouvre le détail complet d'une personne (rien n'est retiré).
 */

const mutateAsync = vi.fn()
const askLaura = vi.fn()

vi.mock('../hooks/useOutreachMutations', () => ({
  useOutreachSequenceAction: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('../hooks/useAskLauraAction', () => ({ useAskLauraAction: () => askLaura }))
vi.mock('./DeliverabilityBlock', () => ({ DeliverabilityBlock: () => <div>[délivrabilité]</div> }))
vi.mock('./SequenceDetailSheet', () => ({
  SequenceDetailSheet: ({ sequence, layout }: { sequence: { contact_name: string | null }; layout: string }) => (
    <div>
      [détail {layout} {sequence.contact_name}]
    </div>
  ),
}))

// La date « aujourd'hui » des fixtures : figée pour que « à valider aujourd'hui » soit stable.
const TODAY = new Date()
const iso = (offsetDays: number) => {
  const date = new Date(TODAY)
  date.setDate(date.getDate() + offsetDays)
  date.setHours(9, 0, 0, 0)
  return date.toISOString()
}

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s-${Math.random()}`,
    sequence_id: 'seq',
    position: 0,
    due_at: iso(7),
    kind: 'email',
    payload: { label: 'Premier message' },
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function seq(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step()]
  return {
    id: `q-${Math.random()}`,
    contact_id: `c-${Math.random()}`,
    contact_name: 'Clémence Aubry',
    contact_role: 'Responsable achats prestations IT',
    account_id: null,
    account_name: 'SNCF Voyageurs',
    name: 'Ouverture Data · SNCF',
    campaign_label: 'Ouverture Data · SNCF',
    template_key: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: iso(-9),
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  } as OutreachSequence
}

function audience() {
  const cadence = (first: Partial<OutreachSequenceStep>, second: Partial<OutreachSequenceStep>) => [
    step({
      position: 0,
      status: 'done',
      done_at: iso(-9),
      payload: {
        label: 'Premier message',
        email_draft: { subject: 'Le bon interlocuteur', body: 'Bonjour Clémence, je cherche à identifier l’équipe.' },
      },
      ...first,
    }),
    step({ position: 1, kind: 'email', due_at: iso(0), payload: { label: 'Reprendre la question' }, ...second }),
  ]
  return [
    seq({ id: 'a', contact_id: 'ca', contact_name: 'Clémence Aubry', steps: cadence({}, {}) }),
    seq({
      id: 'b',
      contact_id: 'cb',
      contact_name: 'Élise Varennes',
      contact_replied: true,
      steps: cadence({}, { status: 'skipped' }),
    }),
    seq({
      id: 'c',
      contact_id: 'cc',
      contact_name: 'Inès Morvan',
      status: 'cancelled',
      cancel_reason: 'opt_out',
      steps: cadence({}, { status: 'skipped' }),
    }),
    seq({ id: 'd', contact_id: 'cd', contact_name: 'Hakim Barreau', steps: cadence({}, { kind: 'call' }) }),
  ]
}

async function setup(sequences: OutreachSequence[] = audience(), openId = 'a') {
  const sequence = sequences.find(candidate => candidate.id === openId)!
  renderWithRouter(<SequenceCampaignPage sequence={sequence} all={sequences} />)
  await screen.findByTestId('sequence-campaign')
}

beforeEach(async () => {
  vi.clearAllMocks()
  mutateAsync.mockResolvedValue({})
  await i18n.changeLanguage('fr')
})

describe('SequenceCampaignPage', () => {
  it('porte le nom de la campagne en titre, avec le retour et les pastilles (contacts, étapes, démarrage)', async () => {
    await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Ouverture Data · SNCF' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Retour aux séquences/ })).toHaveAttribute('href', '/actions/sequences')
    const badges = screen.getByTestId('campaign-badges')
    expect(badges).toHaveTextContent('4 contacts')
    expect(badges).toHaveTextContent('2 étapes')
    expect(badges).toHaveTextContent(/Démarrée le/)
  })

  it('lit TOUTE l’audience : une ligne par personne, chacune avec son état en clair', async () => {
    await setup()
    const people = screen.getByTestId('campaign-audience')
    expect(within(people).getAllByRole('listitem')).toHaveLength(4)
    expect(within(screen.getByTestId('campaign-person-b')).getByText('A répondu')).toBeInTheDocument()
    expect(within(screen.getByTestId('campaign-person-c')).getByText('Arrêtée · opposition')).toBeInTheDocument()
    expect(within(screen.getByTestId('campaign-person-a')).getByText(/à valider/)).toBeInTheDocument()
  })

  it('« Arrêter pour ce contact » arrête CETTE personne seulement, et pas celles qui ont déjà répondu ou sont arrêtées', async () => {
    await setup()
    expect(within(screen.getByTestId('campaign-person-b')).queryByRole('button', { name: /Arrêter pour/ })).toBeNull()
    expect(within(screen.getByTestId('campaign-person-c')).queryByRole('button', { name: /Arrêter pour/ })).toBeNull()
    await userEvent
      .setup()
      .click(
        within(screen.getByTestId('campaign-person-a')).getByRole('button', { name: 'Arrêter pour Clémence Aubry' }),
      )
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'a', action: 'cancel' })
  })

  it('montre chaque message de la cadence : le texte rédigé quand il existe, ce que fait l’étape sinon, et ses compteurs', async () => {
    await setup()
    const first = screen.getByTestId('campaign-step-0')
    expect(within(first).getByText('Le bon interlocuteur')).toBeInTheDocument()
    expect(within(first).getByText(/identifier l’équipe/)).toBeInTheDocument()
    expect(within(first).getByText(/Faite · 4 contacts/)).toBeInTheDocument()
    const second = screen.getByTestId('campaign-step-1')
    expect(within(second).getByText(/À valider aujourd’hui · 2 contacts/)).toBeInTheDocument()
    expect(within(second).getByText(/Ignorée pour 2/)).toBeInTheDocument()
  })

  it('« Préparer les brouillons » demande à Laura un brouillon par destinataire, question pré-remplie', async () => {
    await setup()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Préparer les brouillons de « Reprendre la question »/ }))
    expect(askLaura).toHaveBeenCalledTimes(1)
    expect(askLaura.mock.calls[0]?.[0]).toContain('Clémence Aubry')
    expect(askLaura.mock.calls[0]?.[0]).toContain('Hakim Barreau')
    expect(askLaura.mock.calls[0]?.[0]).not.toContain('Élise Varennes')
  })

  it('le pont dit les étapes faites, les réponses et les personnes arrêtées ; « Messages & réponses » ouvre les trois listes', async () => {
    await setup()
    expect(screen.getByTestId('campaign-bridge-figures')).toHaveTextContent(
      '4 étapes réalisées · 1 réponse · 1 contact arrêté',
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Messages & réponses' }))
    const list = await screen.findByTestId('campaign-replies-list')
    expect(within(list).getByText('Élise Varennes')).toBeInTheDocument()
    expect(within(list).getByText('Inès Morvan')).toBeInTheDocument()
    expect(within(list).queryByText('Clémence Aubry')).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Préparés/ }))
    const prepared = await screen.findByTestId('campaign-replies-list')
    expect(within(prepared).getByText('Clémence Aubry')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la messagerie' })).toHaveAttribute('href', '/mailbox')
  })

  it('l’essai à blanc liste ce qui sera préparé, pour qui et quand, sans rien créer', async () => {
    await setup()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Faire un essai à blanc' }))
    const list = await screen.findByTestId('dry-run-list')
    expect(list).toHaveTextContent('Clémence Aubry')
    expect(list).toHaveTextContent('Hakim Barreau')
    expect(list).not.toHaveTextContent('Élise Varennes')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('« Mettre en pause » demande confirmation puis met en pause toute l’audience vivante', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(mutateAsync).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mettre en pause' }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls.map(call => call[0])).toEqual([
      { id: 'a', action: 'pause' },
      { id: 'd', action: 'pause' },
    ])
  })

  it('« Arrêter la séquence… » (menu ⋯) arrête les personnes vivantes après confirmation', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Arrêter la séquence…' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Arrêter la séquence' }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync.mock.calls.every(call => call[0].action === 'cancel')).toBe(true)
  })

  it('une campagne en pause propose « Reprendre » au lieu de « Mettre en pause »', async () => {
    const sequences = audience().map(sequence => ({ ...sequence, status: 'paused' as const }))
    await setup(sequences)
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(4))
    expect(mutateAsync.mock.calls.every(call => call[0].action === 'resume')).toBe(true)
  })

  it('« Dupliquer… » ouvre l’assistant avec le nom de la copie et la cadence', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Dupliquer…' }))
    const go = await screen.findByRole('link', { name: 'Dupliquer et choisir l’audience' })
    const href = go.getAttribute('href') ?? ''
    const params = new URL(href, 'http://localhost').searchParams
    expect(params.get('parcours')).toBe('1')
    expect(params.get('cadence')).toMatch(/^email\.\d+,email\.\d+$/)
    expect(params.get('nom')).toBe('Ouverture Data · SNCF (copie)')
  })

  it('« Modifier la séquence » déplie le détail complet d’une personne, au choix', async () => {
    await setup()
    expect(screen.queryByTestId('campaign-edit')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Modifier la séquence' }))
    const edit = await screen.findByTestId('campaign-edit')
    expect(within(edit).getByText('[détail embedded Clémence Aubry]')).toBeInTheDocument()
  })

  it('les appels à passer ont leur carte, « Préparer l’appel » passe par Laura et « Consigner l’issue » ouvre la personne', async () => {
    await setup()
    const calls = screen.getByTestId('campaign-calls')
    expect(calls).toHaveTextContent('Hakim Barreau')
    const user = userEvent.setup()
    await user.click(within(calls).getByRole('button', { name: 'Préparer l’appel' }))
    expect(askLaura.mock.calls[0]?.[0]).toContain('Hakim Barreau')
    await user.click(within(calls).getByRole('button', { name: 'Consigner l’issue' }))
    expect(await screen.findByText('[détail embedded Hakim Barreau]')).toBeInTheDocument()
  })

  it('sans appel à passer, la carte des appels n’existe pas (une absence ne fait aucune ligne)', async () => {
    await setup(audience().filter(sequence => sequence.id !== 'd'))
    expect(screen.queryByTestId('campaign-calls')).toBeNull()
  })

  it('une séquence lancée seule est sa propre campagne', async () => {
    const solo = seq({ id: 's', campaign_label: null, name: 'Compte froid — email' })
    await setup([solo], 's')
    expect(screen.getByRole('heading', { level: 1, name: 'Compte froid — email' })).toBeInTheDocument()
    expect(screen.getByTestId('campaign-badges')).toHaveTextContent('1 contact')
  })
})

describe('Théo C sequences-detail — la STRUCTURE de la maquette, dans son ordre', () => {
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('pont « messages » · en-tête · pastilles · messages · audience | essai à blanc · cadre · appels · délivrabilité · modifier', async () => {
    await setup()
    const bridge = screen.getByTestId('campaign-bridge')
    const head = screen.getByTestId('sequences-page-head')
    // Le pont vers la file passe AVANT l'en-tête, comme la maquette.
    expect(before(bridge, head)).toBe(true)
    expect(within(head).getByRole('heading', { level: 1, name: 'Ouverture Data · SNCF' })).toBeInTheDocument()
    expect(within(head).getByText('Audience, contenu et suivi dans le même dossier de campagne.')).toBeInTheDocument()
    // [Retour aux séquences] [Mettre en pause] [⋯ Plus d'actions]
    expect(within(head).getByRole('link', { name: /Retour aux séquences|Tes séquences/ })).toHaveAttribute(
      'href',
      '/actions/sequences',
    )
    expect(within(head).getByRole('button', { name: /Mettre en pause/ })).toBeInTheDocument()
    expect(within(head).getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument()

    const main = [
      screen.getByTestId('campaign-badges'),
      screen.getByTestId('campaign-messages'),
      screen.getByTestId('campaign-audience'),
    ]
    const aside = screen.getByTestId('campaign-aside')
    main.slice(1).forEach((node, index) => expect(before(main[index] as Element, node)).toBe(true))
    expect(before(main[2] as Element, aside)).toBe(true)
    const asideOrder = [
      within(aside).getByTestId('campaign-dry-feature'),
      within(aside).getByTestId('sequence-frame'),
      within(aside).getByTestId('campaign-calls'),
      within(aside).getByText('[délivrabilité]'),
      within(aside).getByRole('button', { name: 'Modifier la séquence' }),
    ]
    asideOrder.slice(1).forEach((node, index) => expect(before(asideOrder[index] as Element, node)).toBe(true))
    expect(within(main[1] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Les messages de la séquence',
    )
    expect(within(main[2] as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent('Audience')
  })

  it('chaque étape : son jour, l’objet du message préparé et son texte en clair, ses résultats en pastilles', async () => {
    await setup()
    const first = screen.getByTestId('campaign-step-0')
    expect(within(first).getByText(/^J\d+$/)).toBeInTheDocument()
    expect(within(first).getByRole('heading', { level: 3, name: 'Le bon interlocuteur' })).toBeInTheDocument()
    expect(within(first).getByText(/je cherche à identifier l’équipe/)).toBeVisible()
  })
})
