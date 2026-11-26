import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRex } from '../api'

/**
 * L'écran des retours d'expérience (`/pilotage/rex`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT N'ÉTAIT NI LA TABLE NI LE CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 * `rex_entries` existe depuis la migration `1789551204833`, la règle « une
 * mission FINIE et sans retour » est écrite et testée, et Laura sait déjà dire
 * « une mission s'est terminée il y a plus de deux semaines sans retour ». Ce
 * qui n'existait pas : l'endroit où l'on ÉCRIT ce retour. Le `POST
 * /capitalisation/rex` n'avait AUCUN appelant — le chemin d'écriture n'était
 * branché nulle part, et la file d'attente ne pouvait donc que grandir.
 *
 * Quatre propriétés sont gardées ici, chacune payée ailleurs dans ce dépôt :
 *
 * 1. **Un état vide OUVRE la porte qu'il nomme.** « Aucun retour » sans chemin
 *    vers l'endroit où l'on en crée un est un cul-de-sac — six retours d'un
 *    même matin venaient de là.
 * 2. **Une lecture en échec le DIT.** Un espace illisible et un espace sans
 *    retour se ressemblent, et l'un des deux est une panne.
 * 3. **Aucun nom inventé.** Un compte que l'espace ne porte pas reste sans nom ;
 *    « Compte inconnu » serait une donnée de remplissage.
 * 4. **On compte des objets, on ne juge pas.** Aucun taux, aucune moyenne :
 *    une moyenne sur un retour n'est pas une mesure, c'est un chiffre inventé.
 */

/**
 * ⚠️ Le faux `Link` INTERPOLE `params`, il ne le jette pas.
 *
 * Sa première version rendait `href={to}` tel quel : depuis que le libellé d'un
 * retour est une mention (D200), elle produisait `/missions/$id` — une adresse
 * que le vrai routeur ne rendrait jamais, et un test qui l'accepterait
 * vérifierait le mock au lieu du composant.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: { children: React.ReactNode; to: string; params?: Record<string, string> } & Record<string, unknown>) => (
    <a
      href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)}
      {...(rest as Record<string, string>)}
    >
      {children}
    </a>
  ),
}))

// #3295 — la section d'apprentissage a son propre test ; ici `useQuery` est un
// mock unique que ses trois lectures recevraient à tort.
vi.mock('./LostDealLearningSection', () => ({
  LostDealLearningSection: ({ view }: { view?: string }) => (
    <section data-testid="lost-deal-section" data-view={view}>
      Règles apprises
    </section>
  ),
  useLostDealLearningCounts: () => ({ losses: 2, rules: 1 }),
}))

const useQuery = vi.fn()
const mutate = vi.fn()
const useMutation = vi.fn((_options: unknown) => ({ mutate, isPending: false }))
const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQuery(options),
  useMutation: (options: unknown) => useMutation(options),
  useQueryClient: () => ({ invalidateQueries }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspace = vi.fn()
const collect = vi.fn()
vi.mock('../api', async importOriginal => {
  // `REX_KEY` reste la VRAIE constante : le test vérifie que l'écran lit sous
  // cette clé-là, et une clé recopiée dans le mock ne prouverait plus rien.
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, rexApi: { workspace, collect } }
})

let role = 'owner'
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: { workspace: { role } } }) }))

const { RexScreen } = await import('./RexScreen')
const { REX_KEY } = await import('../api')

function pending(over: Partial<WorkspaceRex['pending'][number]> = {}): WorkspaceRex['pending'][number] {
  return {
    mission_id: 'm-1',
    label: 'Migration du socle applicatif — lot 1',
    account_id: 'a-1',
    account_label: 'Vinci Énergies',
    ended_on: '2026-06-30T00:00:00.000Z',
    ...over,
  }
}

function collected(over: Partial<WorkspaceRex['collected'][number]> = {}): WorkspaceRex['collected'][number] {
  return {
    id: 'r-1',
    mission_id: 'm-9',
    mission_label: 'Refonte du portail client',
    account_id: 'a-2',
    account_label: 'Groupe Atlantic',
    summary: 'Livré dans les temps, périmètre tenu.',
    what_worked: 'Le binôme architecte et développeur',
    what_failed: null,
    team: null,
    skills: null,
    constraints: null,
    offer: null,
    expertise: null,
    access_path: null,
    first_door: null,
    proof_used: null,
    cycle_duration: null,
    partner: null,
    strategy: null,
    buying_model: null,
    organisation: null,
    collected_at: '2026-07-02T09:00:00.000Z',
    ...over,
  }
}

const served = (data: WorkspaceRex) => ({ data, isLoading: false, isError: false })

beforeEach(() => {
  role = 'owner'
  useQuery.mockReset()
  useMutation.mockReset().mockReturnValue({ mutate, isPending: false })
  mutate.mockReset()
  invalidateQueries.mockReset()
  workspace.mockReset()
  collect.mockReset()
})

describe('l’écran des retours d’expérience', () => {
  // #3295 (recette 05/10 : « Règles apprises des pertes » à 866 px sous un pli de 861) — la section ouvre
  // l'écran : AVANT les files, donc sa position ne dépend plus de leur longueur.
  it('#3295 / Théo PR12 — « Pertes documentées » et « Règles apprises » sont des onglets au-dessus de toute liste, quel que soit l’état', () => {
    for (const rex of [
      { pending: [pending(), pending({ mission_id: 'm-2' })], collected: [] },
      { pending: [], collected: [] },
    ]) {
      useQuery.mockReturnValue(served(rex))
      const { container } = render(<RexScreen />)
      const tablist = screen.getByRole('tablist', { name: 'Retours d’expérience' })
      expect(
        within(tablist)
          .getAllByRole('tab')
          .map(tab => tab.textContent),
      ).toEqual([
        expect.stringMatching(/^À recueillir/),
        expect.stringMatching(/^Retours recueillis/),
        'Pertes documentées2',
        'Règles apprises1',
      ])
      for (const el of Array.from(container.querySelectorAll('ul, table'))) {
        expect(tablist.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
      cleanup()
    }
  })

  it('Théo PR12 — un onglet n’affiche QUE son contenu : jamais des blocs empilés', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [collected()] }))
    render(<RexScreen />)
    expect(screen.queryByTestId('lost-deal-section')).toBeNull()
    expect(screen.queryByText('Livré dans les temps, périmètre tenu.')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Règles apprises/ }))
    expect(screen.getByTestId('lost-deal-section')).toHaveAttribute('data-view', 'rules')
    expect(screen.queryByText('Migration du socle applicatif — lot 1')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /Pertes documentées/ }))
    expect(screen.getByTestId('lost-deal-section')).toHaveAttribute('data-view', 'losses')
    fireEvent.click(screen.getByRole('tab', { name: /Retours recueillis/ }))
    expect(screen.getByText('Livré dans les temps, périmètre tenu.')).toBeInTheDocument()
    expect(screen.queryByTestId('lost-deal-section')).toBeNull()
  })

  it('Théo PR12 — la file « À recueillir » est le tableau commun : Mission · Fin · Attend', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
    expect(headers.map(h => h.textContent)).toEqual(['Mission', 'Fin', 'Attend', ''])
    expect(screen.getByText(/^depuis \d+ jours?$/)).toBeInTheDocument()
  })

  it('Théo PR12 — la question du haut ouvre le formulaire du retour le plus ancien', () => {
    useQuery.mockReturnValue(
      served({
        pending: [
          pending({ mission_id: 'm-new', label: 'Récente', ended_on: new Date(Date.now() - 3 * 864e5).toISOString() }),
          pending({
            mission_id: 'm-old',
            label: 'Ancienne',
            ended_on: new Date(Date.now() - 40 * 864e5).toISOString(),
          }),
        ],
        collected: [],
      }),
    )
    render(<RexScreen />)
    const question = screen.getByTestId('rex-question')
    expect(question).toHaveTextContent('Celui de « Ancienne » attend depuis 40 jours.')
    fireEvent.click(within(question).getByRole('button', { name: 'Recueillir ce retour' }))
    expect(screen.getByRole('dialog', { name: 'Retour sur « Ancienne »' })).toBeInTheDocument()
  })

  // #3295.7 (18/10) — la bulle flottante de Laura (fixed, bas droite) recouvrait « Recueillir le retour »,
  // dernière ligne de la liste : l'écran réserve sous sa dernière ligne la place de la bulle.
  it('#3295.7 — la racine réserve du bas de page pour la bulle de Laura', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    const { container } = render(<RexScreen />)
    expect((container.firstElementChild as HTMLElement).className).toMatch(/\bpb-24\b/)
  })

  it('lit l’espace sous la clé PARTAGÉE, jamais une clé recopiée à la main', () => {
    useQuery.mockReturnValue(served({ pending: [], collected: [] }))
    render(<RexScreen />)
    const options = useQuery.mock.calls[0]?.[0] as { queryKey: unknown; queryFn: unknown }
    expect(options.queryKey).toEqual(REX_KEY)
    expect(options.queryFn).toBe(workspace)
  })

  it('liste chaque mission terminée sans retour, avec son compte et sa date de fin', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    const { container } = render(<RexScreen />)
    expect(container.textContent).toContain('Migration du socle applicatif — lot 1')
    expect(container.textContent).toContain('Vinci Énergies')
    // Le format est écrit en clair : recalculé, l'attendu suivrait le runtime.
    expect(container.textContent).toContain('30/06/2026')
  })

  it('n’invente AUCUN nom de compte — un compte hors de l’espace se dit non retrouvé', () => {
    useQuery.mockReturnValue(served({ pending: [pending({ account_label: null })], collected: [] }))
    const { container } = render(<RexScreen />)
    expect(container.textContent).toContain('compte non retrouvé')
    expect(container.textContent).not.toContain('Compte inconnu')
  })

  it('affiche un retour recueilli avec sa date, et n’ouvre pas de rubrique vide', () => {
    useQuery.mockReturnValue(served({ pending: [], collected: [collected()] }))
    const { container } = render(<RexScreen />)
    expect(container.textContent).toContain('Livré dans les temps, périmètre tenu.')
    expect(container.textContent).toContain('Le binôme architecte et développeur')
    expect(container.textContent).toContain('02/07/2026')
    // `what_failed` est absent : la rubrique ne s'affiche pas avec un vide en
    // dessous — elle promettrait un contenu qui n'existe pas.
    expect(container.textContent).not.toContain('Ce qui a coincé')
  })

  it('un espace SANS mission terminée ouvre la porte qu’il nomme', () => {
    useQuery.mockReturnValue(served({ pending: [], collected: [] }))
    const { container } = render(<RexScreen />)
    // La phrase dit d'où viendront les retours…
    expect(container.textContent).toContain('mission terminée')
    // …et le lien y mène vraiment.
    expect(screen.getByRole('link').getAttribute('href')).toBe('/missions')
  })

  it('une file d’attente VIDE avec des retours déjà là ne fabrique aucune porte', () => {
    useQuery.mockReturnValue(served({ pending: [], collected: [collected()] }))
    const { container } = render(<RexScreen />)
    // Théo PR12 — sans file d'attente, l'écran s'ouvre sur « Retours recueillis » ; l'onglet « À recueillir » le dit.
    expect(screen.getByRole('tab', { name: /Retours recueillis/ })).toHaveAttribute('aria-selected', 'true')
    const hrefsCollected = screen.queryAllByRole('link').map(link => link.getAttribute('href'))
    expect(hrefsCollected).toEqual(['/missions/m-9'])
    fireEvent.click(screen.getByRole('tab', { name: /À recueillir/ }))
    expect(container.textContent).toContain('Aucune mission terminée n’attend son retour')
    // ⚠️ Ce qu'on refuse est la PORTE D'ÉTAT VIDE — « va voir tes missions »
    // au-dessus d'un écran qui en montre déjà : `/missions`, exactement le lien
    // du test précédent. Depuis le 30/08/2026 (D200), le libellé d'un retour
    // collecté est une MENTION qui ouvre le dossier de sa mission : c'est un
    // lien, et c'en est un bon. Compter « zéro lien » confondait les deux.
    const hrefs = screen.queryAllByRole('link').map(link => link.getAttribute('href'))
    expect(hrefs).not.toContain('/missions')
  })

  it('une lecture en échec le DIT — ce n’est pas « aucun retour »', () => {
    useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { container } = render(<RexScreen />)
    expect(container.textContent).toContain('Lecture impossible')
    // Surtout pas un compteur à zéro : un espace illisible et un espace vide se
    // ressemblent, et l'un des deux est une panne.
    expect(container.textContent).not.toContain('0 mission')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('ne montre AUCUN taux ni aucune moyenne — on compte des objets', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [collected()] }))
    const { container } = render(<RexScreen />)
    // Une moyenne sur un retour n'est pas une mesure. Un pourcentage de
    // couverture de retours en serait une autre forme.
    expect(container.textContent).not.toContain('%')
    expect(container.textContent).toContain('1 mission terminée attend son retour')
  })

  /**
   * D40 (28/08/2026) — l'écran est désormais atteint par MISSIONS, donc par un
   * non-responsable. Ce qu'il voit en arrivant est la question qui restait.
   *
   * `sales` est la persona exacte de la décision : le commercial qui revient de
   * mission. Il n'a ni `team:manage` ni le cockpit — et il a `records:write`.
   * Rien sur cet écran n'est réservé au responsable : ni la file d'attente, ni
   * les retours recueillis, ni le geste qui les écrit.
   */
  it('un COMMERCIAL — ni responsable, ni cockpit — voit tout l’écran ET peut écrire', () => {
    role = 'sales'
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [collected()] }))
    const { container } = render(<RexScreen />)
    expect(screen.queryByRole('button', { name: /Recueillir le retour/ })).not.toBeNull()
    expect(container.textContent).toContain('Migration du socle applicatif — lot 1')
    // Aucune moitié ne disparaît en silence : le bandeau « pas le droit » est
    // celui du lecteur seul, et il ne s'affiche pas ici.
    expect(container.textContent).not.toContain('n’a pas le droit')
  })

  it('n’offre PAS d’écrire à qui n’en a pas le droit, et dit pourquoi', () => {
    role = 'viewer'
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    const { container } = render(<RexScreen />)
    expect(screen.queryByRole('button', { name: /Recueillir le retour/ })).toBeNull()
    expect(container.textContent).toContain('n’a pas le droit')
    // La ligne RESTE : on retire le geste, pas l'information.
    expect(container.textContent).toContain('Migration du socle applicatif — lot 1')
  })

  it('ouvre un formulaire au clic, et poste le retour sur la mission choisie', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)

    // Le `mutationFn` est la fonction d'API elle-même : une closure ferait
    // passer une garde qui ne vérifie plus quel chemin serveur est appelé.
    const options = useMutation.mock.calls[0]?.[0] as { mutationFn: unknown }
    expect(options.mutationFn).toBe(collect)

    fireEvent.click(screen.getByRole('button', { name: /Recueillir le retour/ }))
    const summary = screen.getByLabelText(/Ce que la mission a appris/)
    fireEvent.change(summary, { target: { value: 'Le sponsor a changé au bout de deux mois.' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(mutate).toHaveBeenCalledWith({
      mission_id: 'm-1',
      account_id: 'a-1',
      summary: 'Le sponsor a changé au bout de deux mois.',
      what_worked: null,
      what_failed: null,
      team: null,
      skills: null,
      constraints: null,
      offer: null,
      expertise: null,
      access_path: null,
      first_door: null,
      proof_used: null,
      cycle_duration: null,
      partner: null,
      strategy: null,
      buying_model: null,
      organisation: null,
    })
  })

  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes) : le seul appelant de `POST /capitalisation/rex` les porte.
  it('poste l’équipe, les compétences et les contraintes quand elles sont saisies', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)

    fireEvent.click(screen.getByRole('button', { name: /Recueillir le retour/ }))
    fireEvent.change(screen.getByLabelText(/Ce que la mission a appris/), {
      target: { value: 'Le sponsor a changé au bout de deux mois.' },
    })
    fireEvent.change(screen.getByLabelText(/Équipe impliquée/), { target: { value: 'Julie, Marc' } })
    fireEvent.change(screen.getByLabelText(/Compétences mobilisées/), { target: { value: 'React' } })
    fireEvent.change(screen.getByLabelText(/Contraintes rencontrées/), { target: { value: 'Budget serré' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ team: 'Julie, Marc', skills: 'React', constraints: 'Budget serré' }),
    )
  })

  // #3210.2 (épopée #3246) — sept des douze champs restants d'un cas validé
  // (offre, expertise, voie d'accès, première porte, preuve mobilisée, durée
  // du cycle, partenaire), désormais le seul appelant de `POST /capitalisation/rex`.
  it('poste les sept champs restants d’un cas validé quand ils sont saisis', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)

    fireEvent.click(screen.getByRole('button', { name: /Recueillir le retour/ }))
    fireEvent.change(screen.getByLabelText(/Ce que la mission a appris/), {
      target: { value: 'Le sponsor a changé au bout de deux mois.' },
    })
    fireEvent.change(screen.getByLabelText(/Offre proposée/), { target: { value: 'Audit puis TMA' } })
    fireEvent.change(screen.getByLabelText(/Expertise mobilisée/), { target: { value: 'Cloud, DevOps' } })
    fireEvent.change(screen.getByLabelText(/Voie d’accès/), { target: { value: 'Référencement panel' } })
    fireEvent.change(screen.getByLabelText(/Première porte/), { target: { value: 'DSI' } })
    fireEvent.change(screen.getByLabelText(/Preuve mobilisée/), { target: { value: 'Référence comparable' } })
    fireEvent.change(screen.getByLabelText(/Durée du cycle/), { target: { value: '4 mois' } })
    fireEvent.change(screen.getByLabelText(/Partenaire impliqué/), { target: { value: 'ACME Conseil' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: 'Audit puis TMA',
        expertise: 'Cloud, DevOps',
        access_path: 'Référencement panel',
        first_door: 'DSI',
        proof_used: 'Référence comparable',
        cycle_duration: '4 mois',
        partner: 'ACME Conseil',
      }),
    )
  })

  it('affiche les sept champs restants d’un cas validé sur un retour déjà recueilli', () => {
    useQuery.mockReturnValue(
      served({
        pending: [],
        collected: [
          collected({
            offer: 'Audit puis TMA',
            expertise: 'Cloud, DevOps',
            access_path: 'Référencement panel',
            first_door: 'DSI',
            proof_used: 'Référence comparable',
            cycle_duration: '4 mois',
            partner: 'ACME Conseil',
          }),
        ],
      }),
    )
    const { container } = render(<RexScreen />)
    for (const value of [
      'Audit puis TMA',
      'Cloud, DevOps',
      'Référencement panel',
      'DSI',
      'Référence comparable',
      '4 mois',
      'ACME Conseil',
    ]) {
      expect(container.textContent).toContain(value)
    }
  })

  it('refuse d’enregistrer un retour vide — un retour sans texte ne rapporte rien', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Recueillir le retour/ }))
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })
})

/**
 * #1828 — « supprime ce titre ». Comme #1826 et #1829, ce qui était pointé
 * est un SOUS-TITRE ORPHELIN : `rex.intro` posé tout en haut du corps, sans
 * aucun titre au-dessus de lui (l'onglet actif « Débriefer une mission »
 * nomme déjà l'écran, `PageHeader` masque le sien).
 *
 * Ici la phrase REJOINT un titre qui existe déjà plus bas sur CE MÊME écran
 * — `rex.pending.title` (« À recueillir ») — au lieu d'en recevoir un
 * nouveau : le propos de la phrase (l'urgence de recueillir un retour à
 * chaud) est exactement celui de la file « À recueillir », pas un propos
 * général sur tout l'écran. Rien n'est perdu ni dupliqué (loi 4).
 */
describe('l’écran des retours d’expérience — le sous-titre rejoint son titre (#1828)', () => {
  it('la phrase de doctrine est sous le titre « À recueillir », pas orpheline en tête d’écran', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)
    // Théo PR12 — la phrase vit DANS le panneau de l'onglet « À recueillir » (pas en tête d'écran, pas ailleurs).
    const panel = screen.getByRole('tabpanel', { name: /^À recueillir/ })
    const intro = screen.getByText(/Un retour se recueille à chaud/)
    expect(panel).toContainElement(intro)
    expect(within(panel).getByRole('heading', { level: 2, name: 'À recueillir' })).toBeInTheDocument()
  })

  it('ne perd rien de la phrase — recueillie à chaud, introuvable trois mois plus tard', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)
    expect(
      screen.getByText(
        'Un retour se recueille à chaud, en deux minutes. Trois mois plus tard il est introuvable, et avec lui la seule matière d’où une preuve peut sortir.',
      ),
    ).toBeInTheDocument()
  })
})

// #3246 / #3210.3 (lot W9) — stratégie et modèle d'achat : deux choix FERMÉS.
describe('RexScreen — stratégie et modèle d’achat (#3246)', () => {
  it('le formulaire propose les trois listes, nommées pour un lecteur d’écran', () => {
    useQuery.mockReturnValue(served({ pending: [pending()], collected: [] }))
    render(<RexScreen />)
    fireEvent.click(screen.getByRole('button', { name: /Recueillir le retour/ }))
    expect(screen.getByRole('combobox', { name: /Stratégie d’approche/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Modèle d’achat/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: /Organisation de la décision/ })).toBeTruthy()
  })

  it('un retour recueilli nomme les trois choix par leur libellé, pas par leur code', () => {
    useQuery.mockReturnValue(
      served({
        pending: [],
        collected: [
          { ...collected(), strategy: 'via_partenaire', buying_model: 'appel_offres', organisation: 'comite_elargi' },
        ],
      }),
    )
    render(<RexScreen />)
    expect(screen.getByText('Via un partenaire')).toBeTruthy()
    expect(screen.getByText('Appel d’offres')).toBeTruthy()
    expect(screen.getByText('Comité élargi')).toBeTruthy()
    expect(screen.queryByText('via_partenaire')).toBeNull()
  })

  it('un retour sans ces choix n’affiche AUCUNE rubrique vide', () => {
    useQuery.mockReturnValue(served({ pending: [], collected: [collected()] }))
    render(<RexScreen />)
    expect(screen.queryByText(/Stratégie d’approche/)).toBeNull()
    expect(screen.queryByText(/Modèle d’achat/)).toBeNull()
    expect(screen.queryByText(/Organisation de la décision/)).toBeNull()
  })
})
