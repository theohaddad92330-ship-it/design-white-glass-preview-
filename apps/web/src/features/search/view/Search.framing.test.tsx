import { SOFT_BRAKE_CONTACT_HREF } from '@/features/credits/lib/soft-brake'
import { fireEvent, screen, within } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

/**
 * Théo B r1-recherche — la PAGE DE CADRAGE : trois étapes, ce que Bellum sait déjà, le run en vol, les dossiers récents,
 * le frein doux sans chiffre, les onglets Entreprise / Contact / Besoin, les feuilles d'aide et de personnalisation.
 */
const h = vi.hoisted(() => ({
  plan: null as unknown,
  canAnalyze: true,
  known: false,
  locked: false,
  recents: [] as { id: string; company_name: string; last_analyzed_at?: string | null }[],
  account: null as Account | null,
  navigate: vi.fn(),
}))

vi.mock('@/features/search/hooks/useLaunchPlan', () => ({
  useLaunchPlan: () => ({ plan: h.plan, loading: false }),
}))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({
  useCreditGate: () => ({ canAnalyze: h.canAnalyze, known: h.known, locked: h.locked }),
}))
vi.mock('../components/RecentDossiers', async importActual => {
  const actual = await importActual<typeof import('../components/RecentDossiers')>()
  return { ...actual, useRecentDossiers: () => h.recents }
})
vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: (id: string) => ({ account: id ? h.account : null, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: null,
    percent: null,
    accountId: null,
    error: null,
    startAnalysis: vi.fn(),
    reset: vi.fn(),
  }),
}))
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({ suggestions: [], loading: false, search: vi.fn(), clearSuggestions: vi.fn() }),
  MIN_QUERY_LENGTH: 2,
}))
vi.mock('@/features/crm-core/hooks/useRecordEdit', () => ({ useRecordHistory: () => ({ data: undefined }) }))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))
vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => h.navigate, useSearch: () => ({}) }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  h.plan = null
  h.canAnalyze = true
  h.known = false
  h.locked = false
  h.recents = []
  h.account = null
  h.navigate.mockReset()
})

async function renderPage() {
  renderWithRouter(<Search />)
  return screen.findByPlaceholderText(/Recherche une entreprise/)
}

describe('Search — la page de cadrage de Théo', () => {
  it('R1 — trois étapes numérotées, visibles ensemble', async () => {
    await renderPage()
    for (const name of ['Commence par une entreprise', 'Ce que tu veux obtenir', 'Ton cadrage']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Plusieurs choix possibles')).toBeInTheDocument()
  })

  // #4512 — la page de la maquette V22, dans son ordre : en-tête, carte (1 · 2 · 3 · barre), puis « Récemment ».
  it('#4512 — l’ordre de la maquette : en-tête, trois étapes, barre « Préparer l’analyse », puis « Récemment »', async () => {
    h.recents = [
      { id: 'a1', company_name: 'Airbus' },
      { id: 'a2', company_name: 'EDF' },
      { id: 'a3', company_name: 'Renault' },
    ]
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Quel compte veux-tu comprendre ?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mes analyses' })).toBeInTheDocument()
    const order = ['header', 'company', 'purpose', 'cadrage', 'footer', 'recent']
    const nodes = order.map(key => document.querySelector(`[data-analyze-section="${key}"]`))
    expect(nodes.every(Boolean)).toBe(true)
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i - 1]!.compareDocumentPosition(nodes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const footer = document.querySelector('[data-analyze-section="footer"]') as HTMLElement
    expect(within(footer).getByText('Tu vérifies le cadrage avant d’ouvrir le dossier.')).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: /Préparer l'analyse/ })).toBeInTheDocument()
    // « Récemment » : UNE analyse, même quand l'espace en a plusieurs.
    const recent = screen.getByRole('region', { name: 'Récemment' })
    expect(within(recent).getAllByRole('button')).toHaveLength(1)
    expect(within(recent).getByRole('button', { name: /Airbus/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ce que tu retrouveras/ })).toBeInTheDocument()
    // Étape 1 : « Ou essaie un dossier » avec 3 comptes, et plus aucun exemple de saisie.
    const step1 = screen.getByRole('region', { name: 'Commence par une entreprise' })
    expect(within(step1).getByText('Ou essaie un dossier :')).toBeInTheDocument()
    for (const name of ['Airbus', 'EDF', 'Renault'])
      expect(within(step1).getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByText(/Essaie par exemple/)).not.toBeInTheDocument()
  })

  it('#4512 — étape 3 : Personnalisation repliée, sans panneau « Affiner » à part', async () => {
    await renderPage()
    const step3 = screen.getByRole('region', { name: 'Ton cadrage' })
    expect(within(step3).getByRole('button', { name: /^Personnalisation/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(step3).queryByText('Affiner')).not.toBeInTheDocument()
    expect(within(step3).queryByText('Niveau de contact')).not.toBeInTheDocument()
    expect(within(step3).getByRole('button', { name: /Périmètre/ })).toBeInTheDocument()
    expect(within(step3).getByRole('combobox', { name: 'Profondeur' })).toBeInTheDocument()
    expect(within(step3).getByRole('button', { name: /Ajouter un document/ })).toBeInTheDocument()
  })

  // #4468 — sait dire NON : aucun crédit, aucun solde, aucun prix, nulle part sur la page.
  it('n’affiche AUCUN crédit sur la page de cadrage', async () => {
    await renderPage()
    expect(document.body.textContent).not.toMatch(/crédit/i)
  })

  // Maquette Théo analyser-laura : la profondeur est une liste déroulante de la colonne « Ton cadrage », plus deux
  // boutons radio — le comportement (DEUX paliers, Approfondie par défaut, aucun « Ciblée ») est celui de PR11.
  it('R8 — DEUX profondeurs seulement, Approfondie par défaut', async () => {
    await renderPage()
    const depth = screen.getByRole('combobox', { name: 'Profondeur' })
    expect(depth).toHaveTextContent('Approfondie')
    fireEvent.click(depth)
    const options = await screen.findAllByRole('option')
    expect(options.map(option => option.textContent)).toEqual(expect.arrayContaining(['Rapide', 'Approfondie']))
    expect(options).toHaveLength(2)
    expect(screen.queryByText('Ciblée')).not.toBeInTheDocument()
  })

  // Maquette Théo : les modes sont des onglets « Une entreprise / Un contact / Un besoin », et le volet d'un contact
  // ou d'un besoin renvoie vers son écran (Contacts, Besoins) avec la saisie en amorce — jamais dupliqué ici.
  it('A1 — Entreprise / Contact / Besoin : les deux derniers renvoient vers leurs propres écrans', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Un contact' }))
    fireEvent.change(await screen.findByPlaceholderText(/Prénom Nom/), { target: { value: 'Inès Martin' } })
    fireEvent.click(screen.getByRole('button', { name: /Vérifier dans Contacts/ }))
    expect(h.navigate).toHaveBeenCalledWith({ to: '/contacts', search: { q: 'Inès Martin' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Un besoin' }))
    fireEvent.change(await screen.findByPlaceholderText(/Fiche de poste/), { target: { value: 'Data engineer' } })
    fireEvent.click(screen.getByRole('button', { name: /Vérifier dans Besoins/ }))
    expect(h.navigate).toHaveBeenCalledWith({ to: '/projects/needs', search: { q: 'Data engineer' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Une entreprise' }))
    expect(await screen.findByPlaceholderText(/Recherche une entreprise/)).toBeInTheDocument()
  })

  it('N5 — « Ce que tu retrouveras » ouvre l’aide, avec ce qui est inclus et aucun crédit', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Ce que tu retrouveras/ }))
    expect(await screen.findByText('Un dossier de compte, pas une nouvelle conversation')).toBeInTheDocument()
    expect(screen.getByText('Déjà inclus / gratuit')).toBeInTheDocument()
    expect(screen.getByText('Registre entreprise')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\d+ crédit/i)
  })

  it('R6 — « Personnalisation » déplie « Le contexte de cette analyse »', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^Personnalisation/ }))
    expect(await screen.findByText('Le contexte de cette analyse')).toBeInTheDocument()
    expect(screen.getByText(/Ce choix ne modifie pas ton profil permanent/)).toBeInTheDocument()
  })

  // Maquette Théo : l'historique est une vue de la même route (`?vue=historique`, `AnalysesHistory`).
  it('N2 — « Mes analyses » mène à l’historique des analyses de l’espace', async () => {
    await renderPage()
    expect(screen.getByRole('link', { name: 'Mes analyses' })).toHaveAttribute('href', '/search?vue=historique')
  })

  describe('dossiers récents (R11/N4)', () => {
    it('« Ou essaie un dossier » préremplit le champ sans rien lancer', async () => {
      h.recents = [
        { id: 'a1', company_name: 'Groupe BPCE', last_analyzed_at: '2026-09-03T08:00:00.000Z' },
        { id: 'a2', company_name: 'SNCF' },
      ]
      const input = (await renderPage()) as HTMLInputElement
      // Maquette Théo : le même dossier peut aussi figurer dans « Récemment » (où il ROUVRE son cadrage) — la
      // pastille se lit dans l'étape 1.
      const step1 = screen.getByRole('region', { name: 'Commence par une entreprise' })
      fireEvent.click(within(step1).getByRole('button', { name: 'SNCF' }))
      expect(input.value).toBe('SNCF')
      expect(screen.queryByText(/Confirme le périmètre avant de lancer/)).not.toBeInTheDocument()
    })

    // Maquette Théo : « Récemment » est la rangée du bas — le dossier se REPREND en un clic (son cadrage rouvert
    // pour préparer l'approche), « Tout voir » ouvre l'historique des analyses.
    it('« Récemment » nomme le dernier dossier, « Préparer une approche » et « Tout voir »', async () => {
      h.recents = [{ id: 'a1', company_name: 'Groupe BPCE', last_analyzed_at: '2026-09-03T08:00:00.000Z' }]
      await renderPage()
      const block = screen.getByRole('region', { name: 'Récemment' })
      expect(block).toHaveTextContent('Groupe BPCE')
      fireEvent.click(within(block).getByRole('button', { name: /Groupe BPCE/ }))
      expect(h.navigate).toHaveBeenCalledWith({ to: '/search', search: { accountId: 'a1' } })
      expect(screen.getByRole('link', { name: 'Tout voir' })).toHaveAttribute('href', '/search?vue=historique')
    })

    it('espace sans dossier : ni pastille ni bloc « Récemment » (on n’affiche pas ce qu’on n’a pas)', async () => {
      await renderPage()
      expect(screen.queryByRole('region', { name: 'Récemment' })).not.toBeInTheDocument()
      expect(screen.queryByText('Ou essaie un dossier :')).not.toBeInTheDocument()
    })
  })

  describe('A3 — ce que Bellum sait déjà', () => {
    it('un nom qui est celui d’un dossier connu : la ligne résumée nomme la dernière analyse', async () => {
      h.recents = [{ id: 'a1', company_name: 'Groupe BPCE' }]
      h.account = { id: 'a1', company_name: 'Groupe BPCE', last_analyzed_at: '2026-09-03T08:00:00.000Z' } as Account
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'Groupe BPCE' } })
      const card = await screen.findByRole('region', { name: /Ce que .* sait déjà/ })
      expect(card).toHaveTextContent(/Analysé le/)
      expect(screen.getByRole('button', { name: 'Voir le détail' })).toBeInTheDocument()
    })

    it('sait dire NON : un nom inconnu n’affiche aucune ligne « sait déjà »', async () => {
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'Entreprise Inconnue' } })
      expect(screen.queryByRole('region', { name: /Ce que .* sait déjà/ })).not.toBeInTheDocument()
    })
  })

  describe('A12 — analyse déjà en cours', () => {
    it('nomme qui l’a lancée et propose de la suivre', async () => {
      h.plan = {
        scenario: 'fresh',
        credits: 10,
        inFlight: { accountId: 'acc-live', companyName: 'BPCE', startedBy: { firstName: 'Inès' } },
      }
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'BPCE' } })
      expect(await screen.findByText('Analyse déjà en cours, lancée par Inès.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Suivre son analyse' }))
      expect(h.navigate).toHaveBeenCalledWith({ to: '/accounts/$id', params: { id: 'acc-live' } })
    })

    it('sans lanceur nommé (son propre run) : la phrase reste honnête, sans prénom', async () => {
      h.plan = { scenario: 'fresh', credits: 10, inFlight: { accountId: 'acc-live', companyName: 'BPCE' } }
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'BPCE' } })
      expect(await screen.findByText('Analyse déjà en cours sur ce compte.')).toBeInTheDocument()
    })

    // #4598.7 — l'analyse d'un collègue que l'on suit est une analyse en cours : l'écran la montre, la rangée des modes
    // n'est donc pas dans le DOM (comme pour la sienne) ; sans analyse en vol, elle reste là.
    it('#4598.7 — pendant l’analyse d’un collègue suivie, la rangée « Ce que tu analyses » est absente du DOM', async () => {
      h.plan = {
        scenario: 'fresh',
        credits: 10,
        inFlight: { accountId: 'acc-live', companyName: 'BPCE', startedBy: { firstName: 'Inès' } },
      }
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'BPCE' } })
      expect(await screen.findByText('Analyse déjà en cours, lancée par Inès.')).toBeInTheDocument()
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(document.querySelector('[data-analyze-section="modes"]')).toBeNull()
    })

    it('#4598.7 — sait dire NON : un plan sans analyse en vol garde la rangée', async () => {
      h.plan = { scenario: 'fresh', credits: 10 }
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'BPCE' } })
      expect(await screen.findByRole('tablist', { name: 'Ce que tu analyses' })).toBeInTheDocument()
    })
  })

  describe('dossier récent déjà là (cache_hit)', () => {
    it('propose d’ouvrir le dossier ou de l’actualiser — sans un mot de crédit', async () => {
      h.plan = { scenario: 'cache_hit', accountId: 'acc-1', companyName: 'TF1' }
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'TF1' } })
      expect(await screen.findByRole('button', { name: 'Ouvrir le dossier' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Actualiser l.analyse/ })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/crédit/i)
    })
  })

  describe('frein doux, sans chiffre (#4468)', () => {
    it('quota atteint : le lancement est verrouillé, le pied de page le dit sans aucun nombre', async () => {
      h.canAnalyze = false
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'TF1' } })
      expect(screen.getByRole('button', { name: /Préparer l'analyse/ })).toBeDisabled()
      const note = screen.getByRole('status')
      expect(note).toHaveTextContent('Ton quota d’analyses est atteint pour le moment.')
      expect(note.textContent).not.toMatch(/\d/)
    })

    /**
     * #4464.2 — mesuré en production (espace à quota épuisé, 0 `mailto` sur toute la page). CAUSE : le frein n'est
     * monté que si `gate.known && !gate.locked` ; un espace VERROUILLÉ (essai terminé, quota atteint) tombait dans
     * l'autre branche, qui n'avait que le texte nu — aucun moyen de joindre l'équipe. Le refus reste identique.
     */
    it.each([
      ['espace verrouillé', { known: true, locked: true }],
      ['solde épuisé, non verrouillé', { known: true, locked: false }],
    ])('quota atteint (%s) : un moyen de contacter l’équipe est rendu, sans chiffre', async (_label, gate) => {
      h.canAnalyze = false
      h.known = gate.known
      h.locked = gate.locked
      const input = await renderPage()
      fireEvent.change(input, { target: { value: 'TF1' } })
      const contact = document.querySelector('a[href^="mailto:"]')
      expect(contact, 'aucun lien mailto sur l’écran').not.toBeNull()
      expect(contact).toHaveAttribute('href', SOFT_BRAKE_CONTACT_HREF)
      expect(document.body.textContent).not.toMatch(/crédit|recharg/i)
      for (const note of screen.getAllByRole('status')) expect(note.textContent).not.toMatch(/\d|%/)
    })

    it('quota disponible : le pied de page rappelle le contrôle avant l’ouverture du dossier', async () => {
      await renderPage()
      expect(screen.getByText('Tu vérifies le cadrage avant d’ouvrir le dossier.')).toBeInTheDocument()
    })
  })
})
