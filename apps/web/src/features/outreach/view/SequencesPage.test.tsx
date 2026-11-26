import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequencesPage } from './SequencesPage'

// #2386.9 — la télémétrie PAR PARCOURS : mockée à vide par défaut, pour que
// les suites existantes (qui ne la testent pas) restent inchangées.
const useProspectingSessionMetricsMock = vi.fn()
vi.mock('@/features/prospecting-session/api', () => ({
  useProspectingSessionMetrics: () => useProspectingSessionMetricsMock(),
}))

/**
 * #2382.1/.2/.3 — RÉFUTÉ en prod le 23/09 (2e recette, sur d61bf2983) : le
 * centre d'approbation et cette liste partent en DEUX requêtes indépendantes
 * du même rendu. `GET /outreach/sequences` rattrape désormais le message
 * canonique d'une séquence née avant ce lien (côté serveur), mais rien ne
 * disait au centre d'approbation de RELIRE une fois ce rattrapage fait — sans
 * ce second passage, l'écran restait muet jusqu'au rechargement suivant.
 * `invalidateQueries` est espionné plutôt qu'exécuté pour de vrai : les autres
 * tests de ce fichier ne mockent ni `../api` ni la session, et l'écran
 * d'approbation doit y rester silencieux comme avant.
 */
const invalidateQueriesMock = vi.fn()
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }) }
})

/**
 * L'ÉCRAN SÉQUENCES (#1509→#1515).
 *
 * Chaque test protège une lecture FAUSSE que l'écran produirait sans lui :
 *
 *  · un état vide qui NOMME une porte sans la poser — le défaut d'origine ;
 *  · un compteur qui promet un filtre qu'il ne tient pas ;
 *  · un canal annoncé que le moteur ne connaît pas ;
 *  · un nom d'éditeur là où le produit nomme des capacités ;
 *  · une ligne qui ne mène nulle part sur un écran qui liste ce qui attend.
 */
const useOutreachSequencesMock = vi.fn()
const useMailboxStatusMock = vi.fn()
const useSequenceTemplatesMock = vi.fn()
const useRouteAccessMock = vi.fn()

vi.mock('../hooks/useOutreachSequences', () => ({
  useEnrollmentEligibility: () => ({ data: undefined }),
  useOutreachSequences: () => useOutreachSequencesMock(),
}))
// #4426.7 — les campagnes importées sont des MODÈLES de la bibliothèque, pas des séquences : l'écran les lit ici.
vi.mock('../hooks/useSequenceLibrary', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks/useSequenceLibrary')>()),
  useSequenceTemplates: () => useSequenceTemplatesMock(),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => useMailboxStatusMock(),
}))
// #2222 — `'full'` n'est PAS un etat du contrat (ni `reason` un de ses champs) :
// les cinq etats sont `ready`, `plan_locked`, `permission`, `no_integration`,
// `degraded`, et la forme est `{ state, missing }`.
vi.mock('@/components/access/useRouteAccess', () => ({
  useRouteAccess: () => useRouteAccessMock(),
}))
vi.mock('@/components/access/CapabilityBanner', () => ({
  CapabilityBanner: ({ title }: { title?: string }) => (title ? <p data-testid="capability-title">{title}</p> : null),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Maëlle' }))
// La fenêtre de création a son propre fichier de test : la monter ici ferait de
// celui-ci une seconde vérification de son contenu.
vi.mock('./CreateSequenceDialog', () => ({
  CreateSequenceDialog: ({ open }: { open: boolean }) => (open ? <div>[fenêtre de création]</div> : null),
}))

// Lot L-C (#4166) — l'assistant a son propre fichier de test.
vi.mock('./PlaybookWizardDialog', () => ({
  PlaybookWizardDialog: ({ open, initialPlaybook }: { open: boolean; initialPlaybook?: string }) =>
    open ? <div>[assistant {initialPlaybook ?? 'libre'}]</div> : null,
}))
vi.mock('./PlaybookFromUrl', () => ({ PlaybookFromUrl: () => null }))

vi.mock('./SequenceJourney', () => ({
  SequenceJourney: ({
    initial,
    onLaunchManual,
    onClose,
  }: {
    initial: { step: string; trigger: string | null }
    onLaunchManual: (request: { contacts: { id: string }[]; name: string; template: string; customSteps: null }) => void
    onSaveDraft: (state: unknown) => void
    onClose: () => void
  }) => (
    <div>
      [parcours {initial.step} {initial.trigger ?? 'aucun'}]
      <button
        type="button"
        onClick={() => onLaunchManual({ contacts: [{ id: 'c1' }], name: '', template: 'nurturing', customSteps: null })}
      >
        [vérifier]
      </button>
      <button type="button" onClick={onClose}>
        [annuler]
      </button>
    </div>
  ),
}))

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s-${Math.random()}`,
    sequence_id: 'seq',
    position: 0,
    due_at: '2099-01-01T09:00:00.000Z',
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
    // #2203.32 — lancée seule : aucune campagne (`campaign-label.ts`).
    campaign_label: null,
    // #2378.6/.7 — composée à la main, pas une copie.
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
  useOutreachSequencesMock.mockReset()
  useMailboxStatusMock.mockReset()
  useSequenceTemplatesMock.mockReset()
  useRouteAccessMock.mockReset()
  useRouteAccessMock.mockReturnValue({ state: 'ready', missing: [] })
  useSequenceTemplatesMock.mockReturnValue({ data: [], isLoading: false })
  useOutreachSequencesMock.mockReturnValue({ data: [], isLoading: false })
  useMailboxStatusMock.mockReturnValue({ data: { connected: true } })
  useProspectingSessionMetricsMock.mockReset()
  useProspectingSessionMetricsMock.mockReturnValue({ data: { metrics: [] } })
  invalidateQueriesMock.mockClear()
  await i18n.changeLanguage('fr')
})

describe('#4426.7 — les campagnes importées sont visibles sur l’écran', () => {
  const template = (name: string) => ({
    id: name,
    name,
    sector: null,
    tier_label: null,
    visibility: 'team',
    created_by: 'u1',
    steps: [{ position: 0, delay_days: 0, subject: 'Objet', body: 'Corps' }],
  })

  it('sans séquence mais avec des campagnes importées : elles sont listées HORS du repli, avec leur nom', async () => {
    useSequenceTemplatesMock.mockReturnValue({
      data: [template('Campagne DSI'), template('Campagne DAF')],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    const library = await screen.findByTestId('sequence-library')
    expect(library.closest('details')).toBeNull()
    expect(within(library).getByText('Campagne DSI')).toBeInTheDocument()
    expect(within(library).getByText('Campagne DAF')).toBeInTheDocument()
  })

  it('avec une séquence ET des campagnes importées : la bibliothèque reste visible, hors du repli', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence()], isLoading: false })
    useSequenceTemplatesMock.mockReturnValue({ data: [template('Campagne DSI')], isLoading: false })
    renderWithRouter(<SequencesPage />)
    const library = await screen.findByTestId('sequence-library')
    expect(library.closest('details')).toBeNull()
    expect(within(library).getByText('Campagne DSI')).toBeInTheDocument()
  })

  it('sans messagerie mais avec des campagnes importées : le bandeau ne dit pas « aucun outil ne fournit ces données »', async () => {
    useRouteAccessMock.mockReturnValue({ state: 'no_integration', missing: ['email'] })
    useSequenceTemplatesMock.mockReturnValue({ data: [template('Campagne DSI')], isLoading: false })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByTestId('capability-title')).toHaveTextContent('Aucune messagerie connectée')
  })

  it('sans campagne importée : le bandeau garde sa phrase d’origine', async () => {
    useRouteAccessMock.mockReturnValue({ state: 'no_integration', missing: ['email'] })
    renderWithRouter(<SequencesPage />)
    await screen.findByTestId('sequence-library')
    expect(screen.queryByTestId('capability-title')).not.toBeInTheDocument()
  })

  it('sans campagne importée : la bibliothèque reste dans le repli, comme avant', async () => {
    renderWithRouter(<SequencesPage />)
    const library = await screen.findByTestId('sequence-library')
    expect(library.closest('details')).not.toBeNull()
  })
})

describe('l’écran vide', () => {
  it('propose de créer et de choisir des contacts quand la messagerie est connectée', async () => {
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/Tu n’as encore aucune séquence/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Choisir des contacts/ })).toHaveAttribute('href', '/contacts')
  })

  it('mène vers les intégrations quand la messagerie manque — l’autre cause, l’autre porte', async () => {
    useMailboxStatusMock.mockReturnValue({ data: { connected: false } })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/Connecte ta messagerie/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /messagerie/i })[0]).toHaveAttribute('href', '/integrations')
  })

  it('n’affiche PAS d’état vide tant que la liste charge — on ne sait pas encore quoi proposer', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: undefined, isLoading: true })
    useMailboxStatusMock.mockReturnValue({ data: undefined })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText('Je charge tes séquences…')).toBeInTheDocument()
    expect(screen.queryByText(/Tu n’as encore aucune séquence/)).not.toBeInTheDocument()
  })
})

describe('#1509 — le positionnement', () => {
  // Théo C sequences-liste.R1 — « Tes séquences » + une phrase + deux boutons ; plus de prénom dans le titre,
  // plus d'encart « c'est quoi » (décision Louis 22/10 : le titre et la phrase suffisent).
  it('R1 — titre « Tes séquences », une phrase, deux boutons ; l’encart « c’est quoi » a disparu', async () => {
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tes séquences' })).toBeInTheDocument()
    expect(screen.getByText(/Retrouve tes campagnes et avance étape par étape/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bibliothèque de modèles' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer une séquence' })).toBeInTheDocument()
    expect(screen.queryByText(/Ce qu’est une séquence/)).not.toBeInTheDocument()
  })

  it('#4355.1 — l’écran porte UN bouton « Créer une séquence » (les autres portes ont d’autres noms)', async () => {
    renderWithRouter(<SequencesPage />)
    expect(await screen.findAllByRole('button', { name: /Créer une séquence/ })).toHaveLength(1)
  })

  it('#4355.1 — « Créer une séquence » ouvre le PARCOURS pas à pas, à la place de l’écran (pas une fenêtre)', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer une séquence/ }))
    expect(screen.getByText(/\[parcours audience manual\]/)).toBeInTheDocument()
    expect(screen.queryByText('[fenêtre de création]')).not.toBeInTheDocument()
    // un écran par étape : le reste de la page n'est plus rendu pendant le parcours
    expect(screen.queryByText(/Tu n’as encore aucune séquence/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '[séquences sur signal]' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '[annuler]' }))
    expect(await screen.findByText(/Tu n’as encore aucune séquence/)).toBeInTheDocument()
  })

  it('#4355.1 — la fin du parcours « maintenant » ouvre la dernière vérification (la fenêtre de création)', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Créer une séquence/ }))
    fireEvent.click(screen.getByRole('button', { name: '[vérifier]' }))
    expect(screen.getByText('[fenêtre de création]')).toBeInTheDocument()
  })

  it('#4354.2 — `?parcours=signal` (« En faire une automatisation ») ouvre le parcours sur le déclencheur « sur signal »', async () => {
    renderWithRouter(<SequencesPage />, '/actions/sequences?parcours=signal')
    expect(await screen.findByText(/\[parcours audience signal\]/)).toBeInTheDocument()
  })

  it('Théo C actions-aujourdhui.R6 — les séquences sur signal ont leur ONGLET : l’écran y renvoie, sans en copier la liste', async () => {
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByRole('link', { name: /^Automatisations/ })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
    expect(screen.queryByRole('region', { name: '[séquences sur signal]' })).not.toBeInTheDocument()
  })
})

describe('#1511 — les canaux, sans rien promettre', () => {
  it('nomme les TROIS natures réelles du moteur, et dit qu’il n’y en a pas d’autres', async () => {
    renderWithRouter(<SequencesPage />)
    const bloc = (await screen.findByText(/Ce que le moteur sait faire/)).parentElement!
    expect(within(bloc).getByText('E-mail')).toBeInTheDocument()
    expect(within(bloc).getByText('Rappel')).toBeInTheDocument()
    expect(within(bloc).getByText('Tâche')).toBeInTheDocument()
    expect(bloc.textContent).toMatch(/n’est pas « bientôt » : il n’existe pas/)
  })

  it('n’annonce AUCUN canal que le moteur ne connaît pas', async () => {
    renderWithRouter(<SequencesPage />)
    await screen.findByText(/Ce que le moteur sait faire/)
    // Le retour demandait « SMS — non disponible » et « WhatsApp — non
    // disponible ». Les écrire aurait annoncé deux canaux, dans un tableau de
    // canaux, sur un produit qui n'en a jamais eu l'ombre.
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/SMS/)
    expect(texte).not.toMatch(/WhatsApp/i)
  })

  it('nomme la CAPACITÉ et jamais l’éditeur', async () => {
    renderWithRouter(<SequencesPage />)
    await screen.findByText(/Ce que le moteur sait faire/)
    expect(document.body.textContent ?? '').not.toMatch(/google|gmail|outlook|microsoft|workspace/i)
  })

  it('dit ce qui change quand la messagerie n’est pas connectée — sans crier à la panne', async () => {
    useMailboxStatusMock.mockReturnValue({ data: { connected: false } })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/se préparent quand même, et se copient/)).toBeInTheDocument()
  })
})

describe('#1509 + #1515 — les compteurs FILTRENT, et ne peuvent pas mentir', () => {
  const corpus = [
    sequence({ id: 'a' }),
    sequence({ id: 'b', contact_replied: true, name: 'Signal frais' }),
    sequence({ id: 'c', can_send: false, name: 'Push profil' }),
  ]

  it('affiche les quatre compteurs, et le clic RÉDUIT la liste à ce qu’ils comptent', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: corpus, isLoading: false })
    renderWithRouter(<SequencesPage />)
    await screen.findByText('Compte froid — email')

    // Trois lignes avant filtre.
    expect(screen.getAllByRole('link', { name: /^(Compte froid — email|Signal frais|Push profil)$/ })).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: /Réponses reçues/ }))
    // ⚠️ Le compte AFFICHÉ et le nombre de lignes RESTANTES, comparés — c'est
    // le défaut « compteur juste, filtre faux » qui ne se voit pas à l'œil.
    expect(screen.getByText('Signal frais')).toBeInTheDocument()
    expect(screen.queryByText('Compte froid — email')).not.toBeInTheDocument()
    expect(screen.queryByText('Push profil')).not.toBeInTheDocument()
  })

  it('un second clic RETIRE le filtre — un filtre qu’on ne peut pas lever est un piège', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: corpus, isLoading: false })
    renderWithRouter(<SequencesPage />)
    const bouton = await screen.findByRole('button', { name: /Réponses reçues/ })
    fireEvent.click(bouton)
    expect(screen.queryByText('Compte froid — email')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Réponses reçues/ }))
    expect(screen.getByText('Compte froid — email')).toBeInTheDocument()
  })
})

describe('#1515 — la ligne dit qui, chez qui, et où elle en est', () => {
  it('porte le contact, son poste, le compte et l’avancement', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence()], isLoading: false })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText('Marie Dubois')).toBeInTheDocument()
    // Théo C sequences-liste.R4 — poste et compte tiennent sur la même ligne d'audience.
    expect(screen.getByText(/Directrice des systèmes d’information/)).toBeInTheDocument()
    expect(screen.getByText(/NOVA LOGISTIQUE/)).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })

  // #2798 — recette écran 27/09 : la cadence nurturing est bien DISTINCTE de
  // l'outreach classique (#2374.4/.21, déjà livré), mais rien à l'écran des
  // séquences ne le MONTRE — `template_key` est en base depuis #2378.6/.7,
  // jamais rendu. Le badge de mode de campagne rend visible ce gabarit.
  it('#2798 — affiche le mode de campagne (gabarit) en badge sur la ligne', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [sequence({ template_key: 'nurturing' })],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/Nurturing/)).toBeInTheDocument()
  })

  it('#2798 — sans gabarit connu, aucun badge de mode n’est inventé', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [sequence({ template_key: null })],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    await screen.findByText('Marie Dubois')
    expect(screen.queryByText(/Nurturing/)).not.toBeInTheDocument()
  })

  it('un poste absent le DIT — un tiret se lirait comme une valeur', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [sequence({ contact_role: null, account_name: null })],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText(/Poste non renseigné · Sans entreprise/)).toBeInTheDocument()
  })

  // L'étape « due aujourd'hui » vs « en retard » est vérifiée sur le DÉTAIL lui-même (SequenceDetailSheet.test.tsx) :
  // la liste n'ouvre plus de feuille, elle mène à la page de la séquence (Théo C sequences-detail.R1).
  it('la ligne MÈNE à la page de la séquence — un vrai lien, qui se tabule', async () => {
    const seq = sequence({ id: 'seq-1' })
    useOutreachSequencesMock.mockReturnValue({ data: [seq], isLoading: false })
    renderWithRouter(<SequencesPage />)
    const link = await screen.findByRole('link', { name: 'Compte froid — email' })
    expect(link).toHaveAttribute('href', '/actions/sequences/seq-1')
  })

  it('« a répondu » se lit au premier coup d’œil, et la séquence n’est plus « active »', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence({ contact_replied: true })], isLoading: false })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByText('A répondu')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })
})

describe('#2382 — RÉFUTÉ en prod 23/09 (2e recette) : le centre d’approbation ne perd pas la course', () => {
  it('force un second passage sur les messages et les appels dès que les séquences répondent', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence()], isLoading: false })
    renderWithRouter(<SequencesPage />)
    await screen.findByText('Compte froid — email')
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['outreach', 'messages'] })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['outreach', 'call-tasks'] })
  })

  it('n’invalide rien tant qu’il n’y a aucune séquence — rien à rattraper', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [], isLoading: false })
    renderWithRouter(<SequencesPage />)
    await screen.findByText(/Tu n’as encore aucune séquence/)
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})

describe('#2386.1 — le fil de prospection, lu à l’arrivée', () => {
  it('affiche « étape suivante » vers la trace CRM quand l’écran est ouvert PAR le fil, avec le compte porté', async () => {
    renderWithRouter(<SequencesPage />, '/actions/sequences?prospecting_thread_step=send&prospecting_account_id=acc-1')
    const next = await screen.findByRole('link', { name: /Étape suivante/ })
    expect(next).toHaveAttribute('href', expect.stringContaining('/mailbox'))
    expect(next).toHaveAttribute('href', expect.stringContaining('prospecting_thread_step=issue'))
    expect(next).toHaveAttribute('href', expect.stringContaining('prospecting_account_id=acc-1'))
  })

  it('NON — un écran ouvert SANS le fil ne montre aucun bandeau', async () => {
    renderWithRouter(<SequencesPage />)
    await screen.findByText(/Tu n’as encore aucune séquence/)
    expect(screen.queryByRole('link', { name: /Étape suivante/ })).not.toBeInTheDocument()
  })
})

describe('#2386.9 — la télémétrie de prospection, PAR PARCOURS', () => {
  it('NON — aucun parcours mesuré ne rend AUCUN bloc, jamais une ligne à zéro', async () => {
    useProspectingSessionMetricsMock.mockReturnValue({ data: { metrics: [] } })
    renderWithRouter(<SequencesPage />)
    await screen.findByText(/Tu n’as encore aucune séquence/)
    expect(screen.queryByText('Télémétrie de prospection')).not.toBeInTheDocument()
  })

  it('affiche le compte de doublons évités, et « non mesuré » pour un fait qui n’a jamais eu lieu', async () => {
    useProspectingSessionMetricsMock.mockReturnValue({
      data: {
        metrics: [
          {
            journey: 'email',
            sessions: 5,
            timeToFirstMessageSeconds: null,
            modifiedMessageRate: null,
            connectorSuccessRate: null,
            duplicatesAvoided: 4,
          },
        ],
      },
    })
    renderWithRouter(<SequencesPage />)
    await screen.findByText('Télémétrie de prospection')
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getAllByText(/non mesuré/).length).toBeGreaterThan(0)
  })
})

describe('Théo C sequences-liste.R2 / R3 — « Préparer une campagne » et la bibliothèque', () => {
  it('R2 — le bandeau en quatre pastilles numérotées, et « Partir de zéro » ouvre le parcours', async () => {
    renderWithRouter(<SequencesPage />)
    const starters = await screen.findByTestId('sequence-starters')
    for (const name of ['Audience', 'Objectif', 'Messages', 'Relecture']) {
      expect(within(starters).getByText(name)).toBeInTheDocument()
    }
    expect(within(starters).getByText('01')).toBeInTheDocument()
    expect(within(starters).getByText('04')).toBeInTheDocument()
    fireEvent.click(within(starters).getByRole('button', { name: 'Partir de zéro' }))
    expect(screen.getByText(/\[parcours audience manual\]/)).toBeInTheDocument()
  })

  it('R3 — trois modèles de départ ; « Utiliser ce modèle » ouvre la création pré-remplie', async () => {
    renderWithRouter(<SequencesPage />)
    const starters = await screen.findByTestId('sequence-starters')
    expect(within(starters).getByText('Ouvrir une conversation')).toBeInTheDocument()
    expect(within(starters).getByText('Faire connaître une expertise')).toBeInTheDocument()
    expect(within(starters).getByText('Reprendre un échange')).toBeInTheDocument()
    expect(within(starters).getAllByRole('button', { name: /Utiliser le modèle/ })).toHaveLength(3)
    fireEvent.click(within(starters).getByRole('button', { name: 'Utiliser le modèle Ouvrir une conversation' }))
    expect(screen.getByText('[fenêtre de création]')).toBeInTheDocument()
  })

  it('R3 — « Explorer toute la bibliothèque » (et le bouton d’entête) ouvrent la bibliothèque, rien n’est retiré', async () => {
    renderWithRouter(<SequencesPage />)
    expect(screen.queryByTestId('sequence-library-view')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer toute la bibliothèque' }))
    expect(await screen.findByRole('heading', { name: 'Ta bibliothèque de modèles' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser le modèle Appel d’offres' }))
    expect(screen.getByText('[assistant tender]')).toBeInTheDocument()
  })

  it('A6 — « ⋯ » porte le mode vacances : il ouvre la fenêtre Du / Au', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence({ id: 'a' })], isLoading: false })
    renderWithRouter(<SequencesPage />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Plus d’options' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Mode vacances…' }))
    expect(await screen.findByRole('heading', { name: 'Pause vacances' })).toBeInTheDocument()
    expect(screen.getByLabelText('Du')).toBeDisabled()
  })

  it('A6 — sans séquence active, « Mode vacances… » est grisé : il n’y a rien à suspendre', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence({ id: 'a', status: 'completed' })], isLoading: false })
    renderWithRouter(<SequencesPage />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Plus d’options' }))
    expect(await screen.findByRole('menuitem', { name: 'Mode vacances…' })).toHaveAttribute('data-disabled')
  })

  it('#4492 — `?vue=modeles` ouvre « Modèles de séquence » directement, sans route de plus', async () => {
    renderWithRouter(<SequencesPage />, '/actions/sequences?vue=modeles')
    expect(await screen.findByTestId('sequence-library-view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ta bibliothèque de modèles' })).toBeInTheDocument()
    // La sortie reste la même : « Tes séquences » ramène à la liste.
    fireEvent.click(screen.getByRole('button', { name: 'Tes séquences' }))
    expect(screen.queryByTestId('sequence-library-view')).not.toBeInTheDocument()
  })

  it('#4492 — sans `vue`, la page s’ouvre sur la liste (le lien ne change rien pour les autres entrées)', async () => {
    renderWithRouter(<SequencesPage />, '/actions/sequences')
    expect(await screen.findByRole('heading', { name: 'Tes séquences' })).toBeInTheDocument()
    expect(screen.queryByTestId('sequence-library-view')).not.toBeInTheDocument()
  })

  it('R3 — « Tes séquences » ramène de la bibliothèque à la liste', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Bibliothèque de modèles' }))
    expect(await screen.findByTestId('sequence-library-view')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tes séquences' }))
    expect(screen.queryByTestId('sequence-library-view')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Tes séquences' })).toBeInTheDocument()
  })

  it('R3 — « Avec l’assistant guidé » (menu Créer mon modèle) ouvre l’assistant sans modèle imposé', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Bibliothèque de modèles' }))
    await userEvent.setup().click(await screen.findByRole('button', { name: /Créer mon modèle/ }))
    await userEvent.setup().click(await screen.findByRole('menuitem', { name: 'Avec l’assistant guidé' }))
    expect(screen.getByText('[assistant libre]')).toBeInTheDocument()
  })

  it('R3 — un gabarit d’avant figure dans la bibliothèque et ouvre toujours la fenêtre de création', async () => {
    renderWithRouter(<SequencesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explorer toute la bibliothèque' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser le modèle Compte froid — email' }))
    expect(screen.getByText('[fenêtre de création]')).toBeInTheDocument()
  })

  it('N2 — « Créer mon modèle » est un menu : de zéro, depuis une page web, avec l’assistant guidé — et à la main', async () => {
    renderWithRouter(<SequencesPage />)
    const trigger = await screen.findByRole('button', { name: /Créer mon modèle/ })
    await userEvent.setup().click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Partir de zéro' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Depuis une page web' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Avec l’assistant guidé' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Composer à la main' })).toBeInTheDocument()
  })

  it('N2 — « Partir de zéro » ouvre « Créer mon modèle », déjà rédigé ; « Préparer avec Laura » ouvre son objectif proposé', async () => {
    renderWithRouter(<SequencesPage />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Créer mon modèle/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Partir de zéro' }))
    const messages = await screen.findAllByRole('textbox', { name: 'Message' })
    expect(messages).toHaveLength(3)
    expect((messages[0] as HTMLTextAreaElement).value.length).toBeGreaterThan(20)
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    await user.click(screen.getByRole('button', { name: /Préparer avec/ }))
    expect((screen.getByRole('textbox', { name: 'Ton objectif' }) as HTMLTextAreaElement).value.length).toBeGreaterThan(
      20,
    )
  })
})

describe('Théo C sequences-liste.R4 — quatre colonnes, une ligne par audience', () => {
  const campaign = [
    sequence({
      id: 'g1',
      contact_id: 'c1',
      contact_name: 'Claire Martin',
      campaign_label: 'Refonte · SG',
      name: 'Refonte · SG',
    }),
    sequence({
      id: 'g2',
      contact_id: 'c2',
      contact_name: 'Léa Robert',
      campaign_label: 'Refonte · SG',
      name: 'Refonte · SG',
    }),
    sequence({ id: 's1', contact_id: 'c3', name: 'Seule', campaign_label: null }),
  ]

  it('n’a que les quatre colonnes de Théo : Séquence · Audience · Étapes · État', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: campaign, isLoading: false })
    renderWithRouter(<SequencesPage />)
    await screen.findByTestId('audience-group-row')
    const headers = screen.getAllByRole('columnheader').map(header => header.textContent)
    // Les quatre colonnes de Théo, plus la colonne du chevron (entête masquée « Ouvrir »).
    expect(headers).toEqual(['Séquence', 'Audience', 'Étapes', 'État', 'Ouvrir'])
  })

  it('réunit une campagne multi-contacts en UNE ligne « 2 contacts », dépliable sur chaque personne', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: campaign, isLoading: false })
    renderWithRouter(<SequencesPage />)
    const group = await screen.findByTestId('audience-group-row')
    expect(within(group).getByText('2 contacts')).toBeInTheDocument()
    expect(screen.queryByText('Claire Martin')).not.toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'Voir les personnes de Refonte · SG' }))
    expect(screen.getByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText('Léa Robert')).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'Refonte · SG' })
    // Le nom de la campagne ouvre la campagne (via sa première séquence) ; chaque personne a la sienne.
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/actions/sequences/g1',
      '/actions/sequences/g1',
      '/actions/sequences/g2',
    ])
  })

  it('le filtre d’état porte les onze états canoniques, à choix MULTIPLE, et réduit la liste', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [
        sequence({ id: 'a', name: 'En cours' }),
        sequence({ id: 'b', name: 'En pause ici', status: 'paused' }),
        sequence({ id: 'c', name: 'Finie là', status: 'completed' }),
      ],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Filtrer par état/ }))
    expect(await screen.findAllByRole('menuitemcheckbox')).toHaveLength(11)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'En pause' }))
    // Le menu reste ouvert : on coche un deuxième état sans le rouvrir.
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Terminée' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'En pause' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Escape}')
    expect(screen.getByText('En pause ici')).toBeInTheDocument()
    expect(screen.getByText('Finie là')).toBeInTheDocument()
    expect(screen.queryByText('En cours')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filtrer par état : 2 états' })).toBeInTheDocument()
  })

  it('A1 — avec des séquences listées, le renvoi vers l’onglet Automatisations reste là (la section vit dans l’onglet)', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence()], isLoading: false })
    renderWithRouter(<SequencesPage />)
    expect(await screen.findByRole('link', { name: /^Automatisations/ })).toHaveAttribute(
      'href',
      '/actions/automatisations',
    )
    expect(screen.queryByRole('region', { name: '[séquences sur signal]' })).not.toBeInTheDocument()
  })

  it('un seul bandeau en tête : la pause vacances passe avant le bandeau de Laura', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [sequence({ id: 'v', vacation_until: '2099-11-02T00:00:00.000Z', status: 'paused' })],
      isLoading: false,
    })
    renderWithRouter(
      <SequencesPage />,
      '/actions/sequences?contact_ids=44444444-4444-4444-4444-444444444444&objective=Relancer',
    )
    expect(await screen.findByTestId('vacation-banner')).toBeInTheDocument()
    expect(screen.queryByText(/Campagne préparée par/)).not.toBeInTheDocument()
  })

  it('sans pause vacances, le bandeau de Laura reprend l’emplacement', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence()], isLoading: false })
    renderWithRouter(
      <SequencesPage />,
      '/actions/sequences?contact_ids=44444444-4444-4444-4444-444444444444&objective=Relancer',
    )
    expect(await screen.findByText(/Campagne préparée par/)).toBeInTheDocument()
    expect(screen.queryByTestId('vacation-banner')).not.toBeInTheDocument()
  })
})

describe('Théo C sequences-liste — la STRUCTURE de la maquette, dans son ordre', () => {
  /** Rang d'un nœud dans le document : un ordre de sections se compare, il ne se devine pas. */
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('en-tête · bandeaux · héros · modèles · Tes campagnes · tableau · note Automatisations, puis le hors-maquette', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [
        sequence({ id: 'v', name: 'Pause', status: 'paused', vacation_until: '2099-11-02T00:00:00.000Z' }),
        sequence({ id: 'a', name: 'Ouverture Data', account_name: 'SNCF', template_key: 'prospection_3_touches' }),
      ],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    const head = await screen.findByTestId('sequences-page-head')
    expect(within(head).getByRole('heading', { level: 1, name: 'Tes séquences' })).toBeInTheDocument()
    expect(within(head).getByText(/Retrouve tes campagnes/)).toBeInTheDocument()
    // Les trois actions de la maquette, dans son ordre : ⋯, Bibliothèque de modèles, Créer une séquence.
    const actions = within(head)
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent)
    expect(actions).toEqual(['Plus d’options', 'Bibliothèque de modèles', 'Créer une séquence'])

    const vacation = screen.getByText(/Mode vacances|en pause jusqu/i)
    const intro = screen.getByTestId('sequence-intro')
    const models = screen.getByTestId('sequence-models')
    const campaigns = screen.getByTestId('sequence-campaigns')
    const table = screen.getByTestId('sequence-table')
    const note = screen.getByTestId('sequence-automations-note')
    const more = screen.getByTestId('sequence-more-options')
    const order = [head, vacation, intro, models, campaigns, table, note, more]
    order.slice(1).forEach((node, index) => expect(before(order[index] as Element, node)).toBe(true))

    expect(within(intro).getByRole('heading', { level: 2 })).toHaveTextContent(
      'Un parcours simple.Une approche qui reste la tienne.',
    )
    expect(
      within(intro)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual([
      '01AudienceLes bonnes personnes',
      '02ObjectifUne intention précise',
      '03MessagesUne cadence adaptée',
      '04RelectureAvant toute activation',
    ])
    expect(within(models).getByRole('heading', { level: 2, name: 'Commencer avec un modèle' })).toBeInTheDocument()
    expect(within(campaigns).getByRole('heading', { level: 2, name: 'Tes campagnes' })).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Séquence', 'Audience', 'Étapes', 'État', 'Ouvrir'])
  })

  it('« Plus de filtres » ouvre Modèle et Compte (choix multiple) ; un compte coché réduit la liste', async () => {
    useOutreachSequencesMock.mockReturnValue({
      data: [
        sequence({ id: 'a', name: 'Chez SNCF', account_name: 'SNCF', template_key: 'prospection_3_touches' }),
        sequence({ id: 'b', name: 'Chez Airbus', account_name: 'Airbus', template_key: 'nurturing' }),
      ],
      isLoading: false,
    })
    renderWithRouter(<SequencesPage />)
    expect(screen.queryByTestId('sequence-more-filters')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Plus de filtres/ }))
    const panel = screen.getByTestId('sequence-more-filters')
    expect(within(panel).getByText('Modèle')).toBeInTheDocument()
    expect(within(panel).getByText('Compte')).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /Airbus/ }))
    expect(screen.getByText('Chez Airbus')).toBeInTheDocument()
    expect(screen.queryByText('Chez SNCF')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /SNCF/ }))
    expect(screen.getByText('Chez SNCF')).toBeInTheDocument()
  })

  it('la ligne de synthèse dit les campagnes, sans jamais écrire « 0 »', async () => {
    useOutreachSequencesMock.mockReturnValue({ data: [sequence({ id: 'a' })], isLoading: false })
    renderWithRouter(<SequencesPage />)
    const summary = await screen.findByTestId('sequence-summary')
    expect(summary.textContent).toMatch(/^1 campagne/)
    expect(summary.textContent).not.toMatch(/\b0\b/)
  })
})
