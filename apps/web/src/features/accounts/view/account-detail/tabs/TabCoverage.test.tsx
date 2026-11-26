import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, CoverageGapsResponse } from '@bellum/contracts'
import { TabCoverage } from './TabCoverage'

const mockUseCoverageGaps = vi.fn()
const mockEnrichMutate = vi.fn()

vi.mock('@/features/accounts/hooks/useCoverageGaps', () => ({
  useCoverageGaps: (...args: unknown[]) => mockUseCoverageGaps(...args),
}))

// Le rerun ciblé d'une zone blanche passe par la mutation `enrich-contacts`
// existante ; on la remplace ici pour observer le scope envoyé.
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: mockEnrichMutate, isPending: false }),
}))

const ACCOUNT = { id: 'acc-1' } as Account

/**
 * #1885 — la carte de couverture est repliée par défaut. Les tests qui portent
 * sur SON contenu (niveaux, familles, matrice, filtre par entité) l'ouvrent
 * d'abord : c'est un geste de plus, pas une assertion de moins.
 */
function ouvrirLaCarteDeCouverture() {
  fireEvent.click(screen.getByRole('button', { name: 'La carte de couverture' }))
}

/** Idem pour les familles de rôles observées (#1610), repliées elles aussi. */
function ouvrirLesFamillesObservees() {
  fireEvent.click(screen.getByRole('button', { name: 'Familles de rôles observées' }))
}

/** Minimal-but-valid coverage payload; each test overrides what it exercises. */
function coverage(overrides: Partial<CoverageGapsResponse> = {}): CoverageGapsResponse {
  return {
    account_id: 'acc-1',
    score: 0.5,
    contacts_total: 4,
    classified_contacts: 3,
    target_contacts: 12,
    families: [
      { family: 'it', label: 'IT / DSI', covered: true, contact_count: 2, is_target: true },
      { family: 'cyber', label: 'Cyber / Sécurité', covered: false, contact_count: 0, is_target: true },
      { family: 'pmo', label: 'PMO / Projet', covered: true, contact_count: 1, is_target: false },
    ],
    families_covered: 1,
    families_target: 3,
    levels: [
      { level: 'c_level', label: 'C-Level (sponsor)', covered: false, contact_count: 0 },
      { level: 'n1', label: 'N-1 (décideur)', covered: true, contact_count: 1 },
      { level: 'n2', label: 'N-2 (relais)', covered: true, contact_count: 2 },
    ],
    levels_covered: 2,
    levels_target: 3,
    champion_count: 1,
    single_champion_risk: true,
    gaps: [
      {
        family: 'it',
        family_label: 'IT / DSI',
        level: 'c_level',
        level_label: 'C-Level (sponsor)',
        label: 'IT / DSI — DSI / CIO (C-Level)',
        suggested_titles: 'DSI / CIO',
        reason: 'Aucun sponsor exécutif — sécuriser un relais C-Level au-dessus des contacts actuels.',
        priority: 1,
      },
      {
        family: 'cyber',
        family_label: 'Cyber / Sécurité',
        level: 'n1',
        level_label: 'N-1 (décideur)',
        label: 'Cyber / Sécurité — RSSI (N-1)',
        suggested_titles: 'RSSI / Directeur Cybersécurité',
        reason: 'Aucun contact dans cette famille — engager le décideur pour ouvrir le compte.',
        priority: 2,
      },
    ],
    ...overrides,
  }
}

describe('TabCoverage', () => {
  beforeEach(() => {
    mockUseCoverageGaps.mockReset()
    mockEnrichMutate.mockReset()
  })

  it('renders the coverage map, score and prioritized zones blanches (FR default)', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    // Header + score meter. #2121.42 — le bloc de Personnes pose LA question.
    expect(screen.getByText('Qui nous manque pour avancer ?')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    // Single-champion dependency warning is surfaced.
    expect(screen.getByText('Dépendance à un contact unique')).toBeInTheDocument()

    // Levels + families maps (present-only, from the payload). "C-Level (sponsor)"
    // shows both in the levels map and on the P1 gap that targets it.
    ouvrirLaCarteDeCouverture()
    expect(screen.getAllByText('C-Level (sponsor)').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('N-2 (relais)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('IT / DSI').length).toBeGreaterThanOrEqual(2)
    // Covered support family (not a target) is still surfaced as bonus context.
    expect(screen.getByText('PMO / Projet')).toBeInTheDocument()

    // Actionable gaps: who to target + why + priority.
    expect(screen.getByText('Interlocuteurs manquants')).toBeInTheDocument()
    expect(screen.getByText('Cibler : DSI / CIO')).toBeInTheDocument()
    expect(screen.getByText('Cibler : RSSI / Directeur Cybersécurité')).toBeInTheDocument()
    expect(
      screen.getByText('Aucun contact dans cette famille — engager le décideur pour ouvrir le compte.'),
    ).toBeInTheDocument()
    expect(screen.getByText('P1')).toBeInTheDocument()
    expect(screen.getByText('P2')).toBeInTheDocument()
  })

  it("#4923.12 — chaque case vide d'une famille cible se NOMME et porte « Chercher ce rôle » (famille × niveau)", () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
    ouvrirLaCarteDeCouverture()

    // Jamais « absent chez le client » (GA-259) : on dit ce que LA RECHERCHE a su.
    expect(screen.queryByText(/absent chez/i)).not.toBeInTheDocument()
    // Case vide SANS gap rangé par le serveur : elle a quand même son geste.
    fireEvent.click(screen.getByRole('button', { name: 'Chercher ce rôle : Cyber / Sécurité — N-2 (relais)' }))
    expect(mockEnrichMutate).toHaveBeenCalledWith({ family: 'cyber', level: 'n2' }, expect.anything())
    // Une case « à vérifier » ou d'une famille support n'est pas une case vide à chercher.
    expect(screen.queryByRole('button', { name: /Chercher ce rôle : PMO/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chercher ce rôle : IT \/ DSI — N-1/ })).not.toBeInTheDocument()
  })

  it('renders the families × levels grid with one honest cell per intersection', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    // 3 displayed families × (3 levels + la colonne « Action recommandée »).
    expect(screen.getAllByRole('gridcell')).toHaveLength(12)
    // The P1 gap cell is flagged as a zone blanche…
    expect(screen.getByLabelText('IT / DSI — C-Level (sponsor) : non trouvé par cette recherche')).toBeInTheDocument()
    // …a family with no contact is empty everywhere…
    expect(
      screen.getByLabelText('Cyber / Sécurité — N-2 (relais) : non trouvé par cette recherche'),
    ).toBeInTheDocument()
    // …et sans matrice dans la réponse (payload d'avant `cells`), une intersection
    // « famille peuplée × niveau peuplé » reste « à vérifier » : possible, non prouvée.
    expect(screen.getByLabelText('IT / DSI — N-1 (décideur) : à vérifier')).toBeInTheDocument()
  })

  it('affiche une cellule COUVERTE, avec son nombre de contacts, quand le serveur la prouve', () => {
    // La maquette p33 demande une matrice qui dit « couvert », pas « possible ».
    mockUseCoverageGaps.mockReturnValue({
      data: { ...coverage(), cells: [{ family: 'it', level: 'n1', contact_count: 2 }] },
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    expect(screen.getByLabelText('IT / DSI — N-1 (décideur) : couvert')).toBeInTheDocument()
    expect(screen.getByText('couvert · 2')).toBeInTheDocument()
  })

  it('makes every gap actionable: the CTA hands the suggested title to the contacts search', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })
    const onFindContact = vi.fn()

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} onFindContact={onFindContact} />)

    const ctas = screen.getAllByRole('button', { name: /Chercher ce profil/ })
    expect(ctas).toHaveLength(2) // one per ranked gap

    // Ranked P1 first → its first suggested title seeds the contacts search.
    fireEvent.click(ctas[0])
    expect(onFindContact).toHaveBeenCalledWith('DSI')
    fireEvent.click(ctas[1])
    expect(onFindContact).toHaveBeenCalledWith('RSSI')
  })

  it('relance une recherche ciblée sur la seule case famille × niveau de la zone blanche', () => {
    // Annexe organigramme §6 : combler une zone blanche ne doit pas rejouer le
    // dossier — on relance la découverte contacts scopée sur CETTE case.
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    // #2121.50 — le geste porte le nom du besoin : « Trouver ce rôle ».
    const ctas = screen.getAllByRole('button', { name: /Trouver ce rôle/ })
    expect(ctas).toHaveLength(2) // une par zone blanche, même sans handler de recherche locale

    fireEvent.click(ctas[1])
    expect(mockEnrichMutate).toHaveBeenCalledWith({ family: 'cyber', level: 'n1' }, expect.anything())
  })

  it('nomme les dix axes de « qui nous manque », chacun avec son état (#2121.48)', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ roles_target: 8, roles_covered: 7, roles_missing: ['sponsor'] }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    const list = screen.getByRole('list', { name: 'Les dix axes de ce qui nous manque' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(10)
    const sponsor = items.find(item => item.textContent?.includes('Sponsor'))
    expect(sponsor).toHaveTextContent('Manque')
    // La prochaine action n'est pas mesurée ici : dit, jamais « tenu » par défaut.
    const nextAction = items.find(item => item.textContent?.includes('Prochaine action'))
    expect(nextAction).toHaveTextContent('Non mesuré')
  })

  // #4324.1 — un compte sans DSI connu dit POURQUOI, et propose l'enrichissement ciblé existant.
  it('#4324.1 — référent technique manquant : le motif est dit, et « Chercher un DSI » relance la découverte ciblée', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        roles_target: 8,
        roles_covered: 7,
        roles_missing: ['technical'],
        technical_gap: { reason: 'it_below_director', it_contacts: 3 },
      }),
      isLoading: false,
      isError: false,
    })
    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    const list = screen.getByRole('list', { name: 'Les dix axes de ce qui nous manque' })
    const technical = within(list)
      .getAllByRole('listitem')
      .find(item => item.textContent?.includes('Référent technique'))
    expect(technical).toHaveTextContent(/3 contacts IT, aucun au niveau direction/)
    fireEvent.click(within(technical as HTMLElement).getByRole('button', { name: /Chercher un DSI/ }))
    expect(mockEnrichMutate).toHaveBeenCalledWith({ family: 'it', level: 'n1' }, expect.anything())
  })

  it('#4324.1 — aucun contact IT collecté : « aucun contact IT collecté », et sans motif du serveur rien n’est inventé', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        roles_target: 8,
        roles_covered: 7,
        roles_missing: ['technical'],
        technical_gap: { reason: 'no_it_contact', it_contacts: 0 },
      }),
      isLoading: false,
      isError: false,
    })
    const { unmount } = render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
    expect(screen.getByTestId('technical-gap-reason')).toHaveTextContent(/Aucun contact IT collecté/)
    unmount()
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ roles_target: 8, roles_covered: 7, roles_missing: ['technical'] }),
      isLoading: false,
      isError: false,
    })
    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
    expect(screen.queryByTestId('technical-gap-reason')).toBeNull()
  })

  it('omits the gap CTA when no search handler is wired (read-only usage)', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Chercher ce profil/ })).not.toBeInTheDocument()
    // The gaps themselves are still rendered.
    expect(screen.getByText('Cibler : DSI / CIO')).toBeInTheDocument()
  })

  it('shows a positive full-coverage empty state when there is no gap', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ score: 1, single_champion_risk: false, gaps: [] }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    // Section still renders, but with the positive empty state instead of a list.
    expect(screen.getByText('Interlocuteurs manquants')).toBeInTheDocument()
    expect(screen.getByText('Couverture complète')).toBeInTheDocument()
    expect(screen.queryByText('Cibler : DSI / CIO')).not.toBeInTheDocument()
  })

  it('détaille les 5 composants de la confiance (p29), pas seulement leur moyenne', () => {
    // Un « 61/100 » seul ne dit pas au commercial quoi corriger : chaque composant
    // porte son nom métier et sa valeur, dénominateur compris.
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        confidence: { score: 61, identity: 80, freshness: 40, coverage: 50, sources: 95, consistency: 20 },
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('Pourquoi cette confiance ?')).toBeInTheDocument()
    expect(screen.getByText('61/100')).toBeInTheDocument() // la tuile de synthèse
    for (const label of ['Identité', 'Fraîcheur', 'Couverture', 'Sources', 'Cohérence']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('80/100')).toBeInTheDocument()
    expect(screen.getByText('40/100')).toBeInTheDocument()
    expect(screen.getByText('20/100')).toBeInTheDocument()
  })

  it('affiche « personnes vérifiées » à part, comme un diagnostic hors moyenne (#2307.7)', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        confidence: {
          score: 61,
          identity: 80,
          freshness: 40,
          coverage: 50,
          sources: 95,
          consistency: 20,
          verified: 25,
        },
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('Personnes vérifiées')).toBeInTheDocument()
    expect(screen.getByText('25/100')).toBeInTheDocument()
  })

  it('sans `verified` dans le payload (réponse mise en cache), aucun 0 inventé pour cet axe', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        confidence: { score: 61, identity: 80, freshness: 40, coverage: 50, sources: 95, consistency: 20 },
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText('Personnes vérifiées')).not.toBeInTheDocument()
  })

  it("n'affiche pas un composant absent du payload (jamais un 0 inventé)", () => {
    // Réponse mise en cache avant l'ajout d'un composant : on montre ce qu'on sait.
    // Le cast dit exactement ça — un payload émis par une version ANTÉRIEURE du
    // contrat, donc incomplet au regard du type d'aujourd'hui. C'est le sujet du
    // test : l'écran ne doit pas inventer un 0 pour un composant qu'il ne reçoit pas.
    const stalePayload = { score: 55, identity: 80, coverage: 50, sources: 95 } as CoverageGapsResponse['confidence']
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        confidence: stalePayload,
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('Identité')).toBeInTheDocument()
    expect(screen.queryByText('Fraîcheur')).not.toBeInTheDocument()
    expect(screen.queryByText('Cohérence')).not.toBeInTheDocument()
  })

  it('sans confiance calculée, aucun bloc de détail', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText('Pourquoi cette confiance ?')).not.toBeInTheDocument()
  })

  // ── Maquette p19 : le cockpit de couverture ───────────────────────────────

  it('nomme les entités couvertes et celles qui restent à ouvrir, pas seulement « 2/7 »', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        entities_covered: 2,
        entities_total: 4,
        entities_covered_names: ['TF1 SA', 'TF1 Pub'],
        entities_uncovered_names: ['TF1+', 'Studio TF1'],
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('2/4')).toBeInTheDocument()
    expect(screen.getByText('TF1 SA, TF1 Pub')).toBeInTheDocument()
    expect(screen.getByText('À ouvrir : TF1+, Studio TF1')).toBeInTheDocument()
  })

  it('DIT ce qui a été écarté du décompte — une personne n’est pas une entité', () => {
    // Recette live du 29/08/2026, ROCHE : « Entités couvertes 26/27 · À ouvrir :
    // Wafaa Mamilli — Chief Digital Technology Officer ». Le dénominateur est
    // corrigé côté serveur ; l'écran doit dire POURQUOI il a changé, sinon
    // « 26/26 » est un chiffre que personne ne peut expliquer.
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        entities_covered: 1,
        entities_total: 2,
        entities_covered_names: ['Roche Diagnostics France'],
        entities_uncovered_names: ['Roche Pharma'],
        entities_excluded_names: ['Wafaa Mamilli — Chief Digital Technology Officer'],
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Écarté du décompte : Wafaa Mamilli — Chief Digital Technology Officer — une personne, pas une entité.',
      ),
    ).toBeInTheDocument()
  })

  // #2091 — `entities_covered` est optionnel INDÉPENDAMMENT de `entities_total`
  // (packages/contracts/src/schemas/coverage.ts:136). `?? 0` faisait lire
  // « 0/7 » — aucune entité couverte — quand le numérateur n'a simplement pas
  // été calculé. « Si cette valeur est absente, 0 est-il VRAI ? » Non : on ne
  // sait pas.
  it('#2091 — numérateur entités absent : NOMME l’absence, n’écrit jamais 0/N', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ entities_covered: undefined, entities_total: 7 }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText('0/7')).not.toBeInTheDocument()
    expect(screen.getByText('non mesuré/7')).toBeInTheDocument()
  })

  it('ne dit rien quand rien n’a été écarté', () => {
    // Une ligne d'explication permanente serait du bruit sur les comptes sains.
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ entities_covered: 1, entities_total: 1, entities_covered_names: ['Alpha'] }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText(/Écarté du décompte/)).not.toBeInTheDocument()
  })

  it('dit QUELS rôles du comité manquent derrière le ratio', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ roles_covered: 2, roles_target: 8, roles_missing: ['procurement', 'sponsor'] }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('2/8')).toBeInTheDocument()
    expect(screen.getByText(/Non identifiés : Achats, Sponsor/)).toBeInTheDocument()
  })

  // #4324.1 (recette 25/10) — « Non identifiés : Référent technique, Sponsor — pas trouvés, pas forcément absents »
  // ne disait pas POURQUOI. La raison vient de ce que le dossier porte : aucun contact, ou aucun contact qui tient le rôle.
  it('#4324.1 — « non identifiés » dit la RAISON : aucun des contacts ne tient le rôle, intitulés non reconnus', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        contacts_total: 4,
        roles_covered: 6,
        roles_target: 8,
        roles_missing: ['technical', 'sponsor'],
      }),
      isLoading: false,
      isError: false,
    })
    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
    const reason = screen.getByTestId('roles-missing-reason')
    expect(reason).toHaveTextContent(/Aucun des 4 contacts n’a ce rôle posé/)
    expect(reason).toHaveTextContent(/intitulé reconnu comme DSI ou RSSI/)
  })

  it('#4324.1 — aucun rôle manquant : aucune raison à dire', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ roles_covered: 8, roles_target: 8, roles_missing: [] }),
      isLoading: false,
      isError: false,
    })
    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
    expect(screen.queryByTestId('roles-missing-reason')).toBeNull()
  })

  // #2091 — même défaut que les entités : `roles_covered` optionnel indépendamment
  // de `roles_target`.
  it('#2091 — numérateur rôles absent : NOMME l’absence, n’écrit jamais 0/N', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ roles_covered: undefined, roles_target: 8 }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText('0/8')).not.toBeInTheDocument()
    expect(screen.getByText('non mesuré/8')).toBeInTheDocument()
  })

  it('affiche le nombre de champions identifiés (calculé mais jamais montré jusqu’ici)', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ champion_count: 3, classified_contacts: 5 }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('Champions identifiés')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  /**
   * R15-13 (recette du 15/09/2026, prod `5ca597d5a`, QONTO) — LE CHIFFRE DE
   * TÊTE PORTE LE NOM DE CE QU'IL COMPTE.
   *
   * « Couverture décisionnelle 99 % » surplombait cinq axes qui disaient
   * « Manque », et le mot qui expliquait le chiffre — « largeur et profondeur »
   * — vivait tout en bas, dans « Pourquoi cette confiance ? ». Le calcul intègre
   * désormais les rôles critiques du comité (voir `coverage.service.ts`) ; la
   * phrase sous le compteur nomme les trois axes et la règle qui les borne.
   */
  it('nomme les TROIS axes du taux, et la règle qui l’empêche d’atteindre 100 %', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    const hint = screen.getByText(/Largeur \(familles\)/)
    expect(hint).toHaveTextContent('profondeur (niveaux)')
    expect(hint).toHaveTextContent('rôles critiques du comité')
    expect(hint).toHaveTextContent(/empêche le 100/)
  })

  it('ne promet plus les sponsors sous « Champions identifiés » — ils ont leur axe', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ champion_count: 3, classified_contacts: 5 }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.queryByText(/champions ou sponsors/i)).not.toBeInTheDocument()
  })

  it("met l'action recommandée AU BOUT de la ligne qu'elle répare, et elle est cliquable", () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    expect(screen.getByText('Action recommandée')).toBeInTheDocument()
    const action = screen.getByRole('button', {
      name: 'IT / DSI — C-Level (sponsor) : chercher DSI / CIO',
    })
    fireEvent.click(action)
    expect(mockEnrichMutate).toHaveBeenCalledWith({ family: 'it', level: 'c_level' }, expect.anything())
  })

  it('scope la matrice sur une entité : « couvert » au groupe redevient vide dans la filiale', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        cells: [{ family: 'it', level: 'n1', contact_count: 2 }],
        entity_cells: [{ entity: 'TF1 SA', family: 'it', level: 'n1', contact_count: 2 }],
        entities_covered_names: ['TF1 SA'],
        entities_uncovered_names: ['TF1 Pub'],
        entities_covered: 1,
        entities_total: 2,
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    // Vue groupe : la cellule est prouvée couverte.
    expect(screen.getByLabelText('IT / DSI — N-1 (décideur) : couvert')).toBeInTheDocument()

    // Une entité sans aucun contact est proposée au filtre — c'est LA question
    // « quelle entité viser ? » du rapport p32.
    fireEvent.click(screen.getByRole('button', { name: 'TF1 Pub (aucun contact)' }))

    expect(screen.getByLabelText('IT / DSI — N-1 (décideur) : non trouvé par cette recherche')).toBeInTheDocument()
    expect(screen.queryByLabelText('IT / DSI — N-1 (décideur) : couvert')).not.toBeInTheDocument()
  })

  it("n'offre aucun filtre par entité quand le serveur n'a pas émis la matrice par entité", () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    expect(screen.queryByText('Toutes les entités')).not.toBeInTheDocument()
  })

  // #2308.45 — la matrice était déjà filtrable par SCOPE (entité, ci-dessus) ;
  // il manquait le filtre par OBJECTIF (familles CIBLE de la couverture
  // stratégique vs. familles SUPPORT, `family.is_target`, déjà porté par
  // `CoverageGridRow.isTarget`, jamais recalculé ici).
  it('filtre la matrice par OBJECTIF : « familles cible » masque les familles support (#2308.45)', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    const grid = () => within(screen.getByRole('grid', { name: 'Grille de couverture familles × niveaux' }))

    // Par défaut : cible ET support à l'écran (la fixture porte 'pmo', support).
    expect(grid().getByText('PMO / Projet')).toBeInTheDocument()
    expect(grid().getByText('IT / DSI')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Familles cible' }))

    expect(grid().queryByText('PMO / Projet')).not.toBeInTheDocument()
    expect(grid().getByText('IT / DSI')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Familles support' }))

    expect(grid().getByText('PMO / Projet')).toBeInTheDocument()
    expect(grid().queryByText('IT / DSI')).not.toBeInTheDocument()
  })

  it("n'offre aucun filtre par objectif quand aucune famille support n'est présente", () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({
        families: [
          { family: 'it', label: 'IT / DSI', covered: true, contact_count: 2, is_target: true },
          { family: 'cyber', label: 'Cyber / Sécurité', covered: false, contact_count: 0, is_target: true },
        ],
      }),
      isLoading: false,
      isError: false,
    })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    ouvrirLaCarteDeCouverture()

    expect(screen.queryByRole('button', { name: 'Familles cible' })).not.toBeInTheDocument()
  })

  it('ordonne les zones blanches et désigne la prochaine meilleure action', () => {
    mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    // Un rang explicite : le commercial sait par quoi commencer, pas seulement
    // qu'une case est rouge.
    expect(screen.getByLabelText('Action 1 sur 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Action 2 sur 2')).toBeInTheDocument()
    expect(screen.getByText('Prochaine meilleure action')).toBeInTheDocument()
  })

  it('shows the no-contact empty state and routes to contacts', () => {
    mockUseCoverageGaps.mockReturnValue({
      data: coverage({ contacts_total: 0, classified_contacts: 0 }),
      isLoading: false,
      isError: false,
    })
    const onTabChange = vi.fn()

    render(<TabCoverage account={ACCOUNT} onTabChange={onTabChange} />)

    expect(screen.getByText('Aucun contact à cartographier')).toBeInTheDocument()
    // The coverage map is not rendered when there is nothing to map.
    expect(screen.queryByText('Interlocuteurs manquants')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Voir les contacts/ }))
    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  it('renders an explicit error state when the coverage read fails', () => {
    mockUseCoverageGaps.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

    expect(screen.getByText('Couverture indisponible')).toBeInTheDocument()
  })

  /* ── #1610 — les familles de rôles observées par la mémoire marché ──────── */

  describe('les familles de rôles observées (#1610)', () => {
    it('les affiche avec le libellé imposé — jamais « Non couvert »', () => {
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({
          market_role_families_observed: [
            { family: 'Direction / Conseil', persons: 5 },
            { family: 'Développement', persons: 12 },
          ],
        }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.getByText('Familles de rôles observées')).toBeInTheDocument()
      ouvrirLesFamillesObservees()
      expect(screen.getByText('Direction / Conseil')).toBeInTheDocument()
      expect(screen.getByText('Développement')).toBeInTheDocument()
      // Le libellé VERBATIM de l'issue, sur chaque ligne — jamais « Non couvert ».
      expect(screen.getAllByText('Famille observée sans contact actuel identifié')).toHaveLength(2)
      expect(screen.queryByText('Non couvert')).not.toBeInTheDocument()
    })

    // #4322.1 — « Autre 36 » ne s'écrit qu'UNE fois (GA-26) : « Autres intitulés », dans le contexte du dossier.
    it('ne répète pas « Autre » : le résiduel vit dans le contexte canonique, pas ici', () => {
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({
          market_role_families_observed: [
            { family: 'Développement', persons: 12 },
            { family: 'Autre', persons: 36 },
          ],
        }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)
      ouvrirLesFamillesObservees()

      expect(screen.getByText('Développement')).toBeInTheDocument()
      expect(screen.queryByText('Autre')).not.toBeInTheDocument()
    })

    it('un corpus qui ne range que dans « Autre » ne laisse pas un bloc vide', () => {
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({ market_role_families_observed: [{ family: 'Autre', persons: 36 }] }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.queryByText('Familles de rôles observées')).not.toBeInTheDocument()
    })

    it('n’affiche RIEN quand la mémoire marché n’a rien à dire', () => {
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({ market_role_families_observed: [] }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.queryByText('Familles de rôles observées')).not.toBeInTheDocument()
    })

    it('n’affiche RIEN quand le champ est absent — payload d’avant ce lot', () => {
      mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.queryByText('Familles de rôles observées')).not.toBeInTheDocument()
    })

    it('ne modifie JAMAIS le score de couverture affiché', () => {
      // Même score qu'avec des familles observées ou sans — la carte est un
      // AJOUT, jamais un axe du calcul.
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({ market_role_families_observed: [{ family: 'RH', persons: 4 }] }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })

  /* ── #1885 — « replier certaines parties pour gagner en visibilité » ─────── */

  describe('ce qui se replie, et ce qui ne se replie JAMAIS (#1885)', () => {
    it('la carte de couverture est repliée à l’arrivée, derrière un vrai bouton', () => {
      mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      const toggle = screen.getByRole('button', { name: 'La carte de couverture' })
      expect(toggle).toHaveAttribute('type', 'button')
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      // Rendu conditionnel : la matrice est ABSENTE du DOM, pas masquée par une
      // classe qu'une feuille de style pourrait rouvrir.
      expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
      expect(screen.queryByText('Niveaux hiérarchiques')).not.toBeInTheDocument()
    })

    it('les zones blanches restent OUVERTES — ouvert = ce qui appelle une action', () => {
      mockUseCoverageGaps.mockReturnValue({ data: coverage(), isLoading: false, isError: false })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      // Sans aucun clic : le seul bloc qui porte des gestes est lisible d'emblée.
      expect(screen.getByText('Cibler : DSI / CIO')).toBeInTheDocument()
      expect(screen.getByText('Prochaine meilleure action')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Trouver ce rôle/ })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Interlocuteurs manquants' })).not.toBeInTheDocument()
    })

    it('⚠️ replier ne rend rien faux : chaque chiffre garde SON dénominateur sous les yeux', () => {
      // La garde qui compte. « Familles couvertes 1 » et « Niveaux couverts 2 »
      // seraient illisibles si le « sur 3 » vivait dans le bloc replié — et « 1 »
      // se lirait « 1 sur tout ». Les dénominateurs sont sur les tuiles, hors
      // repli ; la matrice n'en porte aucun, elle ne porte que le détail.
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({
          confidence: { score: 61, identity: 80, freshness: 40, coverage: 50, sources: 95, consistency: 20 },
        }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.getByText('sur 3 visées')).toBeInTheDocument()
      expect(screen.getByText('sur 3 (C-Level / N-1 / N-2)')).toBeInTheDocument()
      // Le détail de la confiance ne se replie pas non plus : il DIT quoi corriger
      // derrière un « 61/100 » qui, seul, n'est pas actionnable.
      expect(screen.getByText('Pourquoi cette confiance ?')).toBeInTheDocument()
      expect(screen.getByText('Identité')).toBeInTheDocument()
    })

    it('la mise en garde des familles observées reste lisible REPLIÉE', () => {
      // Le déclencheur porte son titre ET sa phrase : « n'entre dans aucun calcul
      // de couverture ci-dessus » ne peut pas disparaître avec le contenu.
      mockUseCoverageGaps.mockReturnValue({
        data: coverage({ market_role_families_observed: [{ family: 'RH', persons: 4 }] }),
        isLoading: false,
        isError: false,
      })

      render(<TabCoverage account={ACCOUNT} onTabChange={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Familles de rôles observées' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(screen.getByText(/N'entre dans aucun calcul de couverture ci-dessus/)).toBeInTheDocument()
      // Et le libellé imposé n'apparaît PAS tant que la section est fermée : il
      // vit avec les familles qu'il qualifie, jamais seul.
      expect(screen.queryByText('Famille observée sans contact actuel identifié')).not.toBeInTheDocument()
    })
  })
})
