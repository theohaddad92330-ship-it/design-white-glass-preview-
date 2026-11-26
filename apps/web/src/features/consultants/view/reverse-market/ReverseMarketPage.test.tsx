import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as PermissionsModule from '@/lib/permissions'
import type {
  MarketContextMatch,
  MarketContextSearchRead,
  MarketMemoryCoverage,
  ReverseMarket,
} from '@bellum/contracts'

const {
  useConsultant,
  useReverseMarket,
  useMarketContextSearch,
  inverse,
  useContactsByAccount,
  useContactRanking,
  useMarketVerificationPlan,
  useMarketVerificationStates,
  useLaunchMarketVerifications,
  useReverseMarketDismissedCompanies,
  useSetReverseMarketDismissed,
  setDismissedMutate,
  useCreateTargetFromAccount,
  createTargetMutate,
  launchMutate,
  navigateSpy,
  useUserPermissions,
} = vi.hoisted(() => ({
  useConsultant: vi.fn(),
  useReverseMarket: vi.fn(),
  useMarketContextSearch: vi.fn(),
  inverse: vi.fn(),
  useContactsByAccount: vi.fn(),
  useContactRanking: vi.fn(),
  useMarketVerificationPlan: vi.fn(),
  useMarketVerificationStates: vi.fn(),
  useLaunchMarketVerifications: vi.fn(),
  useReverseMarketDismissedCompanies: vi.fn(),
  useSetReverseMarketDismissed: vi.fn(),
  setDismissedMutate: vi.fn(),
  useCreateTargetFromAccount: vi.fn(),
  createTargetMutate: vi.fn(),
  useUserPermissions: vi.fn(),
  launchMutate: vi.fn(),
  navigateSpy: vi.fn(),
}))
// Refonte Théo — la ligne de statut lit les compétences de la fiche (trois étiquettes).
vi.mock('../../talent-api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../talent-api')>()),
  useTalentSkills: () => ({ data: referentialSkills }),
}))
// Les compétences du référentiel de la fiche ; vide = repli sur la stack déclarée.
let referentialSkills: { id: string; skill: string; rawLabel?: string }[] = [
  { id: 's1', skill: 'owasp', rawLabel: 'OWASP' },
]
vi.mock('../../hooks', () => ({
  useConsultant,
  useReverseMarket,
  useMarketVerificationPlan,
  useMarketVerificationStates,
  useLaunchMarketVerifications,
  useReverseMarketDismissedCompanies,
  useSetReverseMarketDismissed,
}))
// #2288.2 — qui a le droit de lancer. Le reste du module (`hasPermissions`) est
// le VRAI : le test pilote le rôle, pas la règle.
vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof PermissionsModule>()),
  useUserPermissions,
}))
vi.mock('@/features/search/hooks/useMarketContextSearch', () => ({ useMarketContextSearch }))
vi.mock('@/features/matching/api', () => ({ matchingApi: { inverse } }))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({ useContactsByAccount }))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({ useContactRanking }))
vi.mock('@/features/target-lists/useCreateTargetFromAccount', () => ({ useCreateTargetFromAccount }))
// Le formulaire a ses propres tests (`CreateProjectDialog.test.tsx`) : ici, un
// double qui ne garde que le geste — visible ou non.
vi.mock('@/features/projects/view/CreateProjectDialog', () => ({
  CreateProjectDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="create-project-dialog" /> : null),
}))
vi.mock('@/features/matching/view/TransparencyBanner', () => ({
  TransparencyBanner: () => <div data-testid="transparency-banner" />,
}))
// La coque à plat : l'en-tête (h1, phrase, actions) puis le corps — l'ordre de `CustomerPageContent`.
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({
    children,
    pageTitle,
    pageSubtitle,
    headerActions,
  }: {
    children: React.ReactNode
    pageTitle?: string
    pageSubtitle?: string
    headerActions?: React.ReactNode
  }) => (
    <div>
      <header data-testid="page-head">
        <h1>{pageTitle}</h1>
        {pageSubtitle ? <p>{pageSubtitle}</p> : null}
        {headerActions}
      </header>
      <div data-testid="page-body">{children}</div>
    </div>
  ),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    search?: Record<string, string>
  }) => (
    <a
      href="/"
      data-to={to}
      data-params={params ? JSON.stringify(params) : undefined}
      data-search={search ? JSON.stringify(search) : undefined}
    >
      {children}
    </a>
  ),
  // #2288.2 — la vérification rend la main à l'écran de lancement ; le test
  // n'observe pas la navigation, il observe qu'elle n'a pas lieu toute seule.
  useNavigate: () => navigateSpy,
}))

// Le devis a ses propres tests (`VerificationPlanDialog.test.tsx`) : ici, un
// double qui ne garde que le geste — confirmer.
vi.mock('./VerificationPlanDialog', () => ({
  VerificationPlanDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        confirmer-le-devis
      </button>
    ) : null,
}))

// #5029 — « Proposer ce profil » a ses propres tests (`ProposeProfileButton.test.tsx`) : ici, un
// double qui ne garde que ce que l'écran lui passe (le consultant, le compte, le besoin).
vi.mock('./ProposeProfileButton', () => ({
  ProposeProfileButton: (props: { consultantId: string; accountId: string; accountContext: string | null }) => (
    <button type="button" data-testid="propose-profile" data-props={JSON.stringify(props)}>
      Proposer ce profil
    </button>
  ),
}))

const { ReverseMarketPage } = await import('./ReverseMarketPage')

/**
 * « Où placer ce profil ? » — la prospection inversée vue depuis un consultant.
 *
 * Deux sections, deux gardes distinctes : « Besoins internes » ne se déclenche
 * QUE sur un clic (le run journalise), « Marché externe » se charge seul
 * (lecture pure). Le calcul lui-même (les fonctions pures de `reverse-market.ts`
 * et la géométrie du radar) a ses propres tests ; celui-ci vérifie le RENDU —
 * la leçon du PDF 2 : un composant testé isolément peut être inerte une fois
 * monté.
 */
function market(over: Partial<ReverseMarket> = {}): ReverseMarket {
  return {
    consultantId: 'c1',
    zones: ['69'],
    departments: ['69'],
    unresolvedZones: [],
    skillTerms: ['kubernetes'],
    unavailableReason: null,
    demand: [],
    recruiters: [],
    consentState: 'valid',
    ...over,
  }
}

beforeEach(() => {
  referentialSkills = [{ id: 's1', skill: 'owasp', rawLabel: 'OWASP' }]
  useConsultant.mockReset().mockReturnValue({
    data: { id: 'c1', full_name: 'Camille Roussel', stack: ['Java'], zones: ['Lyon'], title: 'Ingénieur data' },
  })
  // #2288.2 — par défaut, AUCUN état de conservation n'est connu : c'est
  // l'écran d'un espace qui n'a jamais rien vérifié, et tout doit y marcher.
  useMarketVerificationPlan.mockReset().mockReturnValue({ data: undefined, isFetching: false, isError: false })
  useMarketVerificationStates.mockReset().mockReturnValue({ data: undefined, isFetching: false, isError: false })
  useUserPermissions.mockReset().mockReturnValue({
    status: 'known',
    role: 'sales',
    extraPermissions: [],
    permissions: ['analysis:run', 'records:write'],
  })
  launchMutate.mockReset()
  useLaunchMarketVerifications.mockReset().mockReturnValue({ mutate: launchMutate, isPending: false })
  navigateSpy.mockReset()
  useReverseMarket.mockReset().mockReturnValue({ data: market(), isLoading: false })
  useMarketContextSearch.mockReset().mockReturnValue({ data: { status: 'ok', matches: [] }, isLoading: false })
  // #2968 — par défaut, aucune entreprise n'est masquée.
  useReverseMarketDismissedCompanies.mockReset().mockReturnValue({ data: { companies: [] } })
  setDismissedMutate.mockReset()
  useSetReverseMarketDismissed.mockReset().mockReturnValue({ mutate: setDismissedMutate })
  createTargetMutate.mockReset()
  useCreateTargetFromAccount.mockReset().mockReturnValue({ mutate: createTargetMutate, isPending: false })
  inverse.mockReset().mockResolvedValue({ needs: [] })
  useContactsByAccount.mockReset().mockReturnValue({ data: undefined, isLoading: false })
  useContactRanking.mockReset().mockReturnValue({ data: undefined, isLoading: false, isError: false })
})
afterEach(cleanup)

/** Une entreprise remontée par la mémoire marché — toujours ≥ 3 parcours
 *  (contrat), jamais construite ici avec moins : ce n'est pas ce que ce bloc
 *  a le droit de simuler, le seuil est tenu par le serveur. */
function coverage(over: Partial<MarketMemoryCoverage> = {}): MarketMemoryCoverage {
  return {
    covered: true,
    marketPaths: 14,
    esnObserved: [],
    observedStack: [{ techno: 'Java', persons: 4 }],
    roleFamilies: [{ family: 'Data', persons: 3 }],
    exEsnPresent: null,
    observedZone: null,
    ...over,
  }
}

function contextMatch(companyName: string, over: Partial<MarketMemoryCoverage> = {}): MarketContextMatch {
  return { companyName, coverage: coverage(over) }
}

function contextRead(matches: readonly MarketContextMatch[]): MarketContextSearchRead {
  return { status: 'ok', matches: [...matches] }
}

describe('ReverseMarketPage', () => {
  it('nomme le profil dans le titre — pas un identifiant technique', () => {
    render(<ReverseMarketPage talentId="c1" />)
    // Théo C talents-comptes.R1 — « Des comptes pour {prénom} ».
    expect(screen.getByRole('heading', { level: 1, name: 'Des comptes pour Camille' })).toBeInTheDocument()
  })

  it('ligne d’état — les étiquettes du talent sont le référentiel de la fiche, pas seulement la stack déclarée', () => {
    referentialSkills = [{ id: 's1', skill: 'owasp', rawLabel: 'OWASP' }]
    render(<ReverseMarketPage talentId="c1" />)
    const line = screen.getByTestId('reverse-market-status-line')
    expect(within(line).getByText('OWASP')).toBeInTheDocument()
    expect(within(line).queryByText('Java')).toBeNull()
  })

  it('ligne d’état — sans compétence au référentiel, la stack déclarée sert de repli', () => {
    referentialSkills = []
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(screen.getByTestId('reverse-market-status-line')).getByText('Java')).toBeInTheDocument()
  })

  it('Théo PR12 — en-tête (retour au profil), ligne d’état, puis la grille : classement à gauche, explication et consentement à droite', () => {
    render(<ReverseMarketPage talentId="c1" />)
    const head = screen.getByTestId('page-head')
    const back = within(head).getByRole('link', { name: /Retour à la fiche de/ })
    expect(back).toHaveAttribute('data-to', '/consultants/$id')
    expect(back).toHaveAttribute('data-params', JSON.stringify({ id: 'c1' }))
    const body = screen.getByTestId('page-body')
    // Un seul h1 : celui de l'en-tête — le corps n'en écrit pas un second (GA-347).
    expect(within(body).queryByRole('heading', { level: 1 })).toBeNull()
    const main = within(body).getByTestId('reverse-market-main')
    const aside = within(body).getByTestId('reverse-market-aside')
    expect(aside.tagName).toBe('ASIDE')
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Le classement puis le marché externe replié, dans la colonne principale.
    expect(within(main).getByTestId('reverse-market-external-fold')).toBeInTheDocument()
    // À droite, dans cet ordre : « Pourquoi ces rapprochements ? » puis « Avant de présenter ».
    const asideHeadings = within(aside)
      .getAllByRole('heading', { level: 2 })
      .map(h => h.textContent)
    expect(asideHeadings).toEqual(['Pourquoi ces rapprochements ?', 'Avant de présenter Camille'])
  })

  it('Théo C talents-comptes.A1/A2 — le marché externe est replié (gardé) et le consentement vit dans « Avant de présenter »', () => {
    render(<ReverseMarketPage talentId="c1" />)
    const fold = screen.getByTestId('reverse-market-external-fold')
    expect(fold.tagName).toBe('DETAILS')
    expect(fold).not.toHaveAttribute('open')
    const before = screen.getByTestId('before-presenting')
    expect(within(before).getByText('Avant de présenter Camille')).toBeInTheDocument()
  })

  it('« Besoins internes » ne lance RIEN sans un clic — le run journalise', () => {
    render(<ReverseMarketPage talentId="c1" />)
    expect(inverse).not.toHaveBeenCalled()
  })

  it('le clic sur « Lancer » déclenche le matching inverse EXISTANT, jamais un second moteur', async () => {
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await waitFor(() => expect(inverse).toHaveBeenCalledWith('c1', 'all'))
  })

  // #1933.5 — le chemin COMPLET : `?scope=mine` (le lien de Laura) doit changer
  // le classement RÉELLEMENT lancé, pas seulement l'apparence de la puce — sinon
  // c'est de nouveau un filtre déclaré qui disparaît à l'arrivée.
  it('`initialScope` amorce la portée SANS lancer le classement, et le clic la respecte', async () => {
    render(<ReverseMarketPage talentId="c1" initialScope="mine" />)
    expect(inverse).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await waitFor(() => expect(inverse).toHaveBeenCalledWith('c1', 'mine'))
  })

  // #2958.108 (recette recruteur, lot P04 09/10) — UN besoin classé : le radar
  // dit « il faut au moins deux profils », et la liste ne montrait que
  // « Interlocuteurs chez … » — ni le besoin, ni son score, ni ses axes, sous
  // un bandeau qui promet « chaque score est détaillé par axe ».
  it('#2958.108 — chaque besoin classé se nomme, avec ses scores et ses axes, même seul', async () => {
    const result = axesResult(80)
    result.axes = [
      { axis: 'must_have', score: 90, weight: 25, detail: '', evidence: [] },
      { axis: 'availability', score: 100, weight: 12, detail: '', evidence: [] },
      { axis: 'seniority', score: 70, weight: 10, detail: '', evidence: [] },
      { axis: 'language', score: null as unknown as number, weight: 5, detail: '', evidence: [] },
    ]
    inverse.mockResolvedValue({
      needs: [{ need: { needId: 'n1', role: 'Data Engineer Spark', accountName: 'EDF DSI' }, result }],
    })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    const score = await screen.findByTestId('inverse-need-score-n1')
    expect(score).toHaveTextContent('Data Engineer Spark · EDF DSI')
    // Théo : la correspondance s'écrit en clair, jamais en points.
    expect(score).toHaveTextContent('Correspond : Compétences obligatoires, Disponibilité, Séniorité')
    expect(score).toHaveTextContent('Manque : Rien de net pour l’instant')
    expect(score).not.toHaveTextContent(/\/100/)
    expect(score).toHaveTextContent('Non évaluable : Langue')
  })

  it('Théo C talents-comptes.R2/R3/A4 — UN classement de comptes : rang, état, raison, Explorer / Préparer avec Laura, menu « … »', async () => {
    inverse.mockResolvedValue({
      needs: [
        {
          need: { needId: 'n1', role: 'Ingénieur plateforme', accountName: 'Nordiq', accountId: 'a1' },
          result: axesResult(90),
        },
        {
          need: { needId: null, role: 'Architecte cloud', accountName: 'Atlas', accountId: null },
          result: axesResult(50),
        },
      ],
    })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    const first = await screen.findByTestId('account-for-talent-a1')
    expect(within(first).getByText('01')).toBeInTheDocument()
    expect(within(first).getByText('Besoin enregistré')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Préparer avec Laura' })).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: /autres actions pour nordiq/i })).toBeInTheDocument()
    const second = screen.getByTestId('account-for-talent-name:atlas')
    expect(within(second).getByText('Demande à qualifier')).toBeInTheDocument()
    // Sans identifiant de compte vérifiable : ni « Explorer le compte », ni menu — jamais un compte deviné.
    expect(within(second).queryByText('Explorer le compte')).toBeNull()
    expect(within(second).queryByRole('button', { name: /autres actions/i })).toBeNull()
  })

  it('Théo C projects-rapprochement.HT-7 — « Besoin → consultants » propose les besoins du classement, vers la fiche du besoin', async () => {
    inverse.mockResolvedValue({
      needs: [
        {
          need: { needId: 'n1', role: 'Ingénieur plateforme', accountName: 'Nordiq', accountId: 'a1' },
          result: axesResult(90),
        },
      ],
    })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await screen.findByTestId('account-for-talent-a1')
    fireEvent.click(screen.getByRole('button', { name: 'Besoin → consultants' }))
    const picker = screen.getByTestId('match-direction-picker')
    const link = picker.querySelector('a')
    expect(link).toHaveTextContent('Ingénieur plateforme · Nordiq')
    expect(link?.getAttribute('data-to')).toBe('/projects/needs/$needId')
  })

  it('affiche le radar dès que le classement rend au moins deux besoins', async () => {
    inverse.mockResolvedValue({
      needs: [
        { need: { role: 'Ingénieur plateforme', accountName: 'Nordiq' }, result: axesResult(70) },
        { need: { role: 'Architecte cloud', accountName: 'Atlas' }, result: axesResult(50) },
      ],
    })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await waitFor(() => expect(screen.getByRole('img', { name: /besoins internes/i })).toBeInTheDocument())
  })

  /**
   * #2712.1 — LE PLAFOND DU RADAR N'EST PAS CELUI DE LA LISTE.
   *
   * `RADAR_MAX_PROFILES` (radarGeometry.ts) borne le RADAR à 4 profils
   * superposés — légitime, documenté (« au-delà, on ne lit plus rien »). Mais
   * la LISTE des interlocuteurs juste en dessous appliquait le MÊME plafond,
   * sans le dire : un consultant avec 5 besoins ou plus n'en voyait que 4, et
   * rien n'affichait le total. Retour bêta #2712 : « ne remonte pas assez de
   * besoins » — la cause n'était pas le SERVICE (sans seuil), c'était l'ÉCRAN.
   */
  it('montre PLUS de 4 besoins dans la liste quand le classement en rend plus, et nomme le total', async () => {
    inverse.mockResolvedValue({
      needs: [
        { need: { needId: 'n1', role: 'Ingénieur plateforme', accountName: 'Nordiq' }, result: axesResult(90) },
        { need: { needId: 'n2', role: 'Architecte cloud', accountName: 'Atlas' }, result: axesResult(85) },
        { need: { needId: 'n3', role: 'Data engineer', accountName: 'Voxel' }, result: axesResult(80) },
        { need: { needId: 'n4', role: 'DevOps', accountName: 'Krypton' }, result: axesResult(75) },
        { need: { needId: 'n5', role: 'SRE', accountName: 'Lumia' }, result: axesResult(70) },
      ],
    })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^account-interlocutors-/)).toHaveLength(5))
    expect(screen.getByText(/5.*trouvé/i)).toBeInTheDocument()
  })

  it('un consentement EXPIRÉ avertit sur le POSITIONNEMENT, pas sur la lecture du marché', () => {
    useReverseMarket.mockReturnValue({ data: market({ consentState: 'expired' }), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/ne doit pas être positionnée/)
  })

  it('un consentement jamais recueilli AVERTIT et laisse le marché lisible (c45)', () => {
    useReverseMarket.mockReturnValue({ data: market({ consentState: 'none' }), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByText(/jamais été recueilli|jamais recueilli/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un consentement VALIDE n’affiche aucun bandeau', () => {
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.queryByText(/consentement/i)).not.toBeInTheDocument()
  })

  it.each([
    ['zones_missing', /Aucune zone/],
    ['skills_missing', /Aucune compétence/],
    ['no_snapshot', /rien relevé/],
  ] as const)('nomme la raison « %s » — jamais une liste vide silencieuse', (reason, expected) => {
    useReverseMarket.mockReturnValue({ data: market({ unavailableReason: reason }), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('NOMME la zone non résolue plutôt que de rendre une liste vide muette', () => {
    useReverseMarket.mockReturnValue({
      data: market({ unavailableReason: 'zones_unresolved', unresolvedZones: ['IDF', 'remote'] }),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByText(/IDF, remote/)).toBeInTheDocument()
  })

  // LUD.4 bis — « Où placer ce profil ? » pour un métier hors informatique : les entreprises cibles.
  describe('placementTargets (espace non-IT)', () => {
    const searched = { roles: ['Coordinateur de chantier'], zones: ['Lyon'], offerDomain: 'industrial_engineering' }

    it('affiche entreprise, département, offre DATÉE et interlocuteurs connus — et pas le tableau des ESN', () => {
      useReverseMarket.mockReturnValue({
        data: market({
          placementTargets: {
            searched,
            companies: [
              {
                name: 'Vinci Construction',
                siren: '123456789',
                department: '69',
                offers: [{ label: 'Coordinateur travaux télécom', date: '2026-10-12', url: 'https://offre.example/1' }],
                knownContacts: [{ name: 'Marc Durand', title: 'Directeur travaux' }],
              },
            ],
          },
        }),
        isLoading: false,
      })
      render(<ReverseMarketPage talentId="c1" />)
      const row = screen.getByRole('row', { name: /Vinci Construction/ })
      expect(within(row).getByText('69')).toBeInTheDocument()
      expect(within(row).getByText(/Coordinateur travaux télécom/)).toBeInTheDocument()
      expect(within(row).getByText(/Marc Durand/)).toBeInTheDocument()
      expect(screen.queryByText(/Les ESN qui recrutent/)).not.toBeInTheDocument()
    })

    it('SAIT DIRE NON : une entreprise sans interlocuteur connu n’en invente aucun', () => {
      useReverseMarket.mockReturnValue({
        data: market({
          placementTargets: {
            searched,
            companies: [
              {
                name: 'Eiffage Énergie',
                siren: null,
                department: null,
                offers: [{ label: 'Chef de chantier', date: '2026-10-01', url: null }],
                knownContacts: [],
              },
            ],
          },
        }),
        isLoading: false,
      })
      render(<ReverseMarketPage talentId="c1" />)
      const row = screen.getByRole('row', { name: /Eiffage Énergie/ })
      expect(within(row).getByText(/Aucun interlocuteur connu/)).toBeInTheDocument()
    })

    it('état vide : NOMME le métier et la zone cherchés', () => {
      useReverseMarket.mockReturnValue({
        data: market({ placementTargets: { searched, companies: [] } }),
        isLoading: false,
      })
      render(<ReverseMarketPage talentId="c1" />)
      expect(screen.getByText(/Coordinateur de chantier/)).toBeInTheDocument()
      // La ligne de statut (refonte Théo) cite aussi la ville de la fiche : c'est l'état vide qui doit la NOMMER.
      expect(
        screen.getAllByText(/Lyon/).some(node => !node.closest('[data-testid="reverse-market-status-line"]')),
      ).toBe(true)
      expect(screen.getByText(/Aucune entreprise/)).toBeInTheDocument()
    })

    it('NON-RÉGRESSION IT : sans placementTargets, le tableau des ESN reste (rien de neuf à l’écran)', () => {
      useReverseMarket.mockReturnValue({
        data: market({
          recruiters: [
            {
              name: 'Alten',
              siren: null,
              department: '69',
              offers: 4,
              baseline: null,
              openToSubcontracting: null,
            } as unknown as ReverseMarket['recruiters'][number],
          ],
        }),
        isLoading: false,
      })
      render(<ReverseMarketPage talentId="c1" />)
      expect(screen.getByText(/Les ESN qui recrutent/)).toBeInTheDocument()
      expect(screen.queryByText(/Où placer ce profil/)).not.toBeInTheDocument()
    })
  })

  it('n’écrit jamais « 0 » sur une source publique muette — « non mesuré », pas un compte inventé', () => {
    useReverseMarket.mockReturnValue({
      data: market({
        demand: [
          {
            department: '69',
            observedOn: '2026-08-24',
            offers: null,
            matchedTechnologies: [],
            technologiesRanked: 4,
          },
        ],
      }),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const row = screen.getByRole('row', { name: /69/ })
    expect(within(row).queryByText('0')).not.toBeInTheDocument()
    expect(within(row).getByText(/non mesuré/i)).toBeInTheDocument()
  })

  it('l’habitude d’une ESN reste « pas assez de relevés », jamais 0', () => {
    useReverseMarket.mockReturnValue({
      data: market({
        recruiters: [
          {
            name: 'Nordiq',
            department: '69',
            observedOn: '2026-08-24',
            offers: 12,
            baseline: null,
            openToSubcontracting: null,
          },
        ],
      }),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByText(/pas assez de relevés/i)).toBeInTheDocument()
    // Trois états pour l'ouverture au rang 2, jamais un simple booléen.
    expect(screen.getByText('Jamais déclaré')).toBeInTheDocument()
  })

  it('la source PUBLIQUE et sa date voyagent sur chaque ligne du marché', () => {
    useReverseMarket.mockReturnValue({
      data: market({
        demand: [
          { department: '69', observedOn: '2026-08-24', offers: 40, matchedTechnologies: [], technologiesRanked: 3 },
        ],
      }),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(screen.getByText(/source publique/i)).toBeInTheDocument()
  })
})

/**
 * #1625 — « Environnements structurellement compatibles », la troisième
 * lecture. Les trois tests qui comptent : aucun mot d'actualité, aucun
 * critère protégé dans la charge utile, rien sous 3 observations.
 */
describe('« Environnements structurellement compatibles »', () => {
  function section() {
    return screen.getByTestId('compatible-environments-section')
  }

  it('ne dit JAMAIS « besoin », « recrute » ou « client » — c’est une lecture STRUCTURELLE, pas une actualité', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        contextMatch('Thales', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
        contextMatch('Atos'),
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const text = section().textContent ?? ''
    expect(text).not.toMatch(/besoin/i)
    expect(text).not.toMatch(/recrute/i)
    expect(text).not.toMatch(/client/i)
  })

  it('titre le bloc « Environnements structurellement compatibles » — jamais « Besoins »', () => {
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Environnements structurellement compatibles')).toBeInTheDocument()
  })

  it('envoie la ZONE du consultant comme discriminant serveur — jamais son nom ni sa photo', () => {
    render(<ReverseMarketPage talentId="c1" />)
    expect(useMarketContextSearch).toHaveBeenCalledWith({ location: 'Lyon' })
  })

  it('sans zone ni compétence, n’appelle PAS le moteur et le dit', () => {
    useConsultant.mockReturnValue({ data: { full_name: 'Camille Roussel', stack: [], zones: [], title: null } })
    render(<ReverseMarketPage talentId="c1" />)
    expect(useMarketContextSearch).toHaveBeenCalledWith(null)
    expect(within(section()).getByText(/Aucune compétence ni zone/)).toBeInTheDocument()
  })

  it('« Fit expertise » n’a que DEUX états, jamais « Fort » ni « Moyen »', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales', { observedStack: [{ techno: 'Java', persons: 4 }] })]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const text = section().textContent ?? ''
    expect(text).not.toMatch(/\bFort\b/)
    expect(text).not.toMatch(/\bMoyen\b/)
    expect(within(section()).getByText(/Recoupe ses compétences : Java/)).toBeInTheDocument()
  })

  it('#2968 — la liste des compétences recoupées revient à la ligne : elle n’étire pas le tableau', () => {
    // Recette démo 29/09 : une pilule mono-ligne portant toute la liste
    // faisait 799 px et poussait le tableau à 2 138 px dans 1 172 px.
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales', { observedStack: [{ techno: 'Java', persons: 4 }] })]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const fit = within(section()).getByText(/Recoupe ses compétences : Java/)
    expect(fit.className).not.toMatch(/whitespace-nowrap/)
    expect(fit.className).toMatch(/max-w-/)
  })

  it('« Fit expertise » rend « Non mesuré » sans recoupement — jamais un score à zéro', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Atos', { observedStack: [], roleFamilies: [] })]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Non mesuré')).toBeInTheDocument()
  })

  it('« Recours externe » dit « Observé », jamais « Non observé »', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        contextMatch('Thales', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Observé')).toBeInTheDocument()
    expect(within(section()).queryByText(/non observé/i)).not.toBeInTheDocument()
  })

  it('« Recours externe » dit « Inconnu » sans observation — jamais « Non »', () => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Atos')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getAllByText('Inconnu').length).toBeGreaterThan(0)
  })

  it('« Accès » ne dit JAMAIS « Ouvert » — au mieux « Chemin potentiel »', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        contextMatch('Thales', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Chemin potentiel')).toBeInTheDocument()
    expect(within(section()).queryByText(/ouvert/i)).not.toBeInTheDocument()
  })

  it('« Signal actuel » n’est JAMAIS un chiffre — elle NOMME son absence, sur CHAQUE ligne, jamais un total', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales'), contextMatch('Atos')]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    // #2288.1 — « Aucun signal actuel » (jamais la phrase générique de
    // méthodologie recopiée avant sa mesure) : la même NOMMÉE, jamais un chiffre.
    const unmeasured = within(section()).getAllByTitle(/Aucun signal actuel/)
    expect(unmeasured).toHaveLength(2)
    expect(section().textContent ?? '').not.toMatch(/\d+ signaux?/)
  })

  it('« Signal actuel » garde une largeur de lecture — sa raison nommée n’étire pas chaque ligne (#2968, recette 29/09)', () => {
    // Recette prod 29/09 : colonne comprimée à ~90 px, la raison « Aucun signal
    // actuel… » passait sur 6 lignes et étirait les 20 lignes du tableau à 777 px.
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Thales')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    const header = within(section()).getByRole('columnheader', { name: /Signal actuel/ })
    expect(header.className).toMatch(/min-w-48/)
    const cell = within(section())
      .getByTitle(/Aucun signal actuel/)
      .closest('td')
    expect(cell?.className ?? '').toMatch(/min-w-48/)
  })

  it('« Compte suivi » n’est JAMAIS deviné — aucun identifiant commun avec les comptes', () => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Thales')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByTitle(/Aucun identifiant commun/)).toBeInTheDocument()
  })

  it('ne rend JAMAIS plus de lignes que ce que le serveur a rendu — rien sous le seuil ne s’invente ici', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales'), contextMatch('Atos'), contextMatch('Capgemini')]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText(/3 compatibles/)).toBeInTheDocument()
    // Une ligne de contenu par entreprise, jamais plus (le seuil ≥ 3 parcours
    // est tenu par le serveur, ce bloc ne fait qu'afficher ce qu'il reçoit).
    const rows = within(section()).getAllByRole('row')
    expect(rows).toHaveLength(1 /* entête */ + 3)
  })

  it('#2288.5 / #2968 — CINQ seaux : compatibles/vérifiés/avec accès/en réserve/priorité, jamais un total unique', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        contextMatch('Thales', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
        contextMatch('Atos'),
        contextMatch('Capgemini'),
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const buckets = within(section()).getByTestId('compatible-buckets')
    expect(within(buckets).getByText('3 compatibles')).toBeInTheDocument()
    expect(within(buckets).getByText('1 avec accès')).toBeInTheDocument()
    expect(within(buckets).getByText('2 en réserve')).toBeInTheDocument()
    // Aucun signal actuel dans ce fixtures : PRIORITÉ exige signal ET accès ensemble.
    expect(within(buckets).getByText('0 en priorité')).toBeInTheDocument()
  })

  it('#2288.5 — « vérifiés » NOMME son absence de mesure — jamais « 0 vérifiés »', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales'), contextMatch('Atos')]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const buckets = within(section()).getByTestId('compatible-buckets')
    expect(within(buckets).queryByText(/0 vérifiés?/)).not.toBeInTheDocument()
    expect(within(buckets).getByText('Vérifiés :')).toBeInTheDocument()
    expect(within(buckets).getByTitle(/Aucune vérification n’a été demandée/)).toBeInTheDocument()
  })

  it('le CTA « Voir les 5 » réduit l’affichage aux cinq premiers, triés fit d’abord', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        contextMatch('A'),
        contextMatch('B'),
        contextMatch('C'),
        contextMatch('D'),
        contextMatch('E'),
        contextMatch('F'),
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getAllByRole('row')).toHaveLength(1 + 6)
    fireEvent.click(within(section()).getByRole('button', { name: /voir les 5/i }))
    expect(within(section()).getAllByRole('row')).toHaveLength(1 + 5)
  })

  it('rend « non mesurée » quand la lecture échoue — jamais une liste vide silencieuse', () => {
    useMarketContextSearch.mockReturnValue({ data: { status: 'unavailable', reason: 'read_failed' }, isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText(/n’ont pas pu être lues/)).toBeInTheDocument()
  })

  // #2968 — LES CINQ VERDICTS NOMMÉS, DEPUIS LES DEUX AXES DÉJÀ AFFICHÉS ICI.
  it('affiche le verdict PRIORITÉ quand le signal actuel ET l’accès sont connus ensemble', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([
        {
          companyName: 'Thales',
          coverage: coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
          currentSignal: { nature: 'own', observedOn: '2026-09-01T00:00:00.000Z' },
        },
      ]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Priorité')).toBeInTheDocument()
  })

  it('replie sur COMPATIBLE STRUCTURELLEMENT sans signal ni accès connus — le verdict par défaut', () => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Atos')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Compatible structurellement')).toBeInTheDocument()
  })

  // #2336.5 / #2336.12-.15 — la restriction déclarée (§8.3), rejointe à la
  // stack observée : un AVERTISSEMENT, jamais une exclusion.
  it('« Restriction déclarée » nomme la techno évitée observée dans l’environnement', () => {
    useConsultant.mockReturnValue({
      data: {
        id: 'c1',
        full_name: 'Camille Roussel',
        stack: ['Java'],
        zones: ['Lyon'],
        title: 'Ingénieur data',
        preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: ['COBOL'], wantedContractKinds: [] },
      },
    })
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales', { observedStack: [{ techno: 'COBOL', persons: 5 }] })]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Techno évitée observée : COBOL')).toBeInTheDocument()
  })

  it('« Restriction déclarée » dit « Aucune connue » sans recoupement — jamais une exclusion de la ligne', () => {
    useConsultant.mockReturnValue({
      data: {
        id: 'c1',
        full_name: 'Camille Roussel',
        stack: ['Java'],
        zones: ['Lyon'],
        title: 'Ingénieur data',
        preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: ['COBOL'], wantedContractKinds: [] },
      },
    })
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Atos')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Aucune connue')).toBeInTheDocument()
    // La ligne reste affichée : un avertissement, jamais une exclusion.
    expect(within(section()).getByText('Atos')).toBeInTheDocument()
  })

  it('« Restriction déclarée » dit « Aucune connue » quand aucune préférence n’a été renseignée', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales', { observedStack: [{ techno: 'COBOL', persons: 5 }] })]),
      isLoading: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Aucune connue')).toBeInTheDocument()
  })
})

/**
 * #2968 — « Masquer » : personnel, gratuit, archivé jamais supprimé. Une
 * ligne masquée quitte le tableau (« on n'affiche pas ce qu'on n'a pas »
 * dans une LISTE) et rejoint un tiroir replié, où elle porte le verdict
 * ÉCARTÉ et un geste « Restaurer ».
 */
describe('« Masquer » un environnement compatible (#2968)', () => {
  function section() {
    return screen.getByTestId('compatible-environments-section')
  }

  it('cliquer « Masquer » appelle la mutation avec le bon libellé', () => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Thales')]), isLoading: false })
    render(<ReverseMarketPage talentId="c1" />)
    // Accessible name = l'aria-label nommé (« Masquer Thales — … »), pas le seul texte visible.
    fireEvent.click(within(section()).getByRole('button', { name: /^Masquer Thales/ }))
    expect(setDismissedMutate).toHaveBeenCalledWith({ companyName: 'Thales', dismissed: true })
  })

  it('une entreprise déjà masquée quitte le tableau principal et se compte dans le repli « masqués »', () => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales'), contextMatch('Atos')]),
      isLoading: false,
    })
    useReverseMarketDismissedCompanies.mockReturnValue({ data: { companies: ['Thales'] } })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).queryByRole('cell', { name: 'Thales' })).not.toBeInTheDocument()
    expect(within(block).getByText('Atos')).toBeInTheDocument()
    expect(within(block).getByText('1 masqué')).toBeInTheDocument()
    // Masquée, elle sort aussi du compte « compatibles » — pas seulement de l'affichage.
    expect(within(within(block).getByTestId('compatible-buckets')).getByText('1 compatibles')).toBeInTheDocument()
  })

  it('ouvrir le tiroir affiche la ligne masquée avec le verdict ÉCARTÉ, et « Restaurer » démasque', () => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Thales')]), isLoading: false })
    useReverseMarketDismissedCompanies.mockReturnValue({ data: { companies: ['Thales'] } })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(within(section()).getByRole('button', { name: '1 masqué' }))
    const drawer = within(section()).getByTestId('dismissed-environments')
    expect(within(drawer).getByText('Thales')).toBeInTheDocument()
    expect(within(drawer).getByText('Écarté')).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Restaurer' }))
    expect(setDismissedMutate).toHaveBeenCalledWith({ companyName: 'Thales', dismissed: false })
  })
})

/**
 * #2551.4 — les interlocuteurs du compte compatible, sous chaque besoin du
 * radar. Même patron de jointure que `PriorityPathSection` (ranked + contacts,
 * `useContactsByAccount` + `useContactRanking`), 3 personnes maximum, et les
 * mêmes trois doctrines : jamais « 0 », un rang jamais nu, aucun critère
 * protégé.
 */
describe('« Interlocuteurs » du compte compatible (#2551.4)', () => {
  function need(over: Partial<Record<string, unknown>> = {}) {
    return {
      needId: 'need-1',
      role: 'Ingénieur plateforme',
      accountName: 'Nordiq',
      accountId: 'acc-1',
      ...over,
    }
  }

  function contact(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'c1',
      full_name: 'Camille Roux',
      title: 'Responsable Data',
      decision_role: 'user',
      email: null,
      phone: null,
      ...over,
    }
  }

  function ranked(over: Partial<Record<string, unknown>> = {}) {
    return {
      contact_id: 'c1',
      position: 1,
      score: 35,
      max: 45,
      axes: [
        { key: 'perimeter', points: 20, max: 20, reason: 'perimeter_p1' },
        { key: 'subject', points: 15, max: 15, reason: 'subject_match' },
        { key: 'offer', points: null, max: 10, reason: 'no_offer' },
      ],
      confidence: 'high',
      access_path: { kind: 'verified_email', missing_reason: null },
      last_interaction_at: null,
      ...over,
    }
  }

  async function launchWithOneNeed(needOverride: Partial<Record<string, unknown>> = {}) {
    inverse.mockResolvedValue({ needs: [{ need: need(needOverride), result: axesResult(70) }] })
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /lancer le classement/i }))
    await waitFor(() => expect(inverse).toHaveBeenCalled())
  }

  it('joint le classement et les contacts du compte — 3 personnes maximum, jamais recalculées ici', async () => {
    useContactsByAccount.mockReturnValue({
      data: [
        contact({ id: 'c1', full_name: 'Camille Roux' }),
        contact({ id: 'c2', full_name: 'Sacha Petit' }),
        contact({ id: 'c3', full_name: 'Dana Faure' }),
        contact({ id: 'c4', full_name: 'Noé Girard' }),
      ],
      isLoading: false,
    })
    useContactRanking.mockReturnValue({
      data: {
        ranked: [
          ranked({ contact_id: 'c1', position: 1 }),
          ranked({ contact_id: 'c2', position: 2 }),
          ranked({ contact_id: 'c3', position: 3 }),
          ranked({ contact_id: 'c4', position: 4 }),
        ],
        total: 4,
        scored: 4,
        context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
      },
      isLoading: false,
      isError: false,
    })
    await launchWithOneNeed()
    expect(screen.getByText('Camille Roux')).toBeInTheDocument()
    expect(screen.getByText('Sacha Petit')).toBeInTheDocument()
    expect(screen.getByText('Dana Faure')).toBeInTheDocument()
    expect(screen.queryByText('Noé Girard')).not.toBeInTheDocument()
    expect(useContactsByAccount).toHaveBeenCalledWith('acc-1')
    expect(useContactRanking).toHaveBeenCalledWith('acc-1', {})
  })

  it('un rang n’est jamais nu : la raison qui fait monter un interlocuteur se nomme, et l’axe non évaluable aussi', async () => {
    useContactsByAccount.mockReturnValue({ data: [contact()], isLoading: false })
    useContactRanking.mockReturnValue({
      data: {
        ranked: [ranked()],
        total: 1,
        scored: 1,
        context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
      },
      isLoading: false,
      isError: false,
    })
    await launchWithOneNeed()
    // Ce qui a fait monter le rang — les axes ÉVALUÉS, avec leur raison.
    expect(screen.getByText(/périmètre prioritaire/i)).toBeInTheDocument()
    expect(screen.getByText(/intitulé lié au sujet/i)).toBeInTheDocument()
    // Ce qui n'a pas pu être évalué — nommé, jamais tu.
    expect(screen.getByText(/Non évaluable ?: Offre/)).toBeInTheDocument()
  })

  it('zéro interlocuteur connu se DIT — jamais « 0 »', async () => {
    useContactsByAccount.mockReturnValue({ data: [], isLoading: false })
    useContactRanking.mockReturnValue({
      data: {
        ranked: [],
        total: 0,
        scored: 0,
        context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
      },
      isLoading: false,
      isError: false,
    })
    await launchWithOneNeed()
    const card = screen.getByTestId('account-interlocutors-need-1')
    expect(within(card).getByText(/aucun interlocuteur connu/i)).toBeInTheDocument()
    expect(within(card).queryByText(/^0$/)).not.toBeInTheDocument()
  })

  it('sans accountId vérifiable, le défaut se nomme au lieu d’ouvrir un compte au hasard', async () => {
    await launchWithOneNeed({ accountId: null, accountName: 'Sherpa Digital' })
    expect(screen.getByText(/aucun compte vérifiable/i)).toBeInTheDocument()
    expect(useContactsByAccount).toHaveBeenCalledWith(null)
  })

  it('propose un lien vers l’onglet Contacts du compte pour la voie d’accès complète', async () => {
    useContactsByAccount.mockReturnValue({ data: [contact()], isLoading: false })
    useContactRanking.mockReturnValue({
      data: {
        ranked: [ranked()],
        total: 1,
        scored: 1,
        context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
      },
      isLoading: false,
      isError: false,
    })
    await launchWithOneNeed()
    const link = screen.getByText(/fiche compte/i).closest('a') as HTMLAnchorElement
    expect(link.getAttribute('data-to')).toBe('/accounts/$id')
    expect(link.getAttribute('data-params')).toBe(JSON.stringify({ id: 'acc-1' }))
    expect(link.getAttribute('data-search')).toBe(JSON.stringify({ tab: 'contacts' }))
  })

  // #2968 — les deux gestes de #2188 (ACTIONS) qui manquaient sur cette carte.
  it('« Créer une cible » appelle le geste EXISTANT (#2164.44), avec ce compte', async () => {
    await launchWithOneNeed()
    const card = screen.getByTestId('account-interlocutors-need-1')
    fireEvent.click(within(card).getByRole('button', { name: 'Créer une cible' }))
    expect(createTargetMutate).toHaveBeenCalledWith({ accountId: 'acc-1', companyName: 'Nordiq' })
  })

  it('« Créer une opportunité » ouvre le formulaire EXISTANT (#2195.33), pré-rempli sur ce compte', async () => {
    await launchWithOneNeed()
    const card = screen.getByTestId('account-interlocutors-need-1')
    expect(within(card).queryByTestId('create-project-dialog')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Créer une opportunité' }))
    expect(within(card).getByTestId('create-project-dialog')).toBeInTheDocument()
  })

  it('sans accountId vérifiable, ni « Créer une cible » ni « Créer une opportunité » ne s’affichent', async () => {
    await launchWithOneNeed({ accountId: null, accountName: 'Sherpa Digital' })
    expect(screen.queryByRole('button', { name: 'Créer une cible' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Créer une opportunité' })).not.toBeInTheDocument()
  })

  it('#5029.1 — « Proposer ce profil » vit sur la ligne du compte : CE consultant, CE compte, le besoin comme contexte', async () => {
    await launchWithOneNeed()
    const card = screen.getByTestId('account-interlocutors-need-1')
    const props = JSON.parse(within(card).getByTestId('propose-profile').getAttribute('data-props') ?? '{}')
    expect(props).toMatchObject({ consultantId: 'c1', accountId: need().accountId, accountContext: need().role })
  })

  it('#5029.1 — sans compte vérifiable, aucune proposition de profil', async () => {
    await launchWithOneNeed({ accountId: null, accountName: 'Sherpa Digital' })
    expect(screen.queryByTestId('propose-profile')).not.toBeInTheDocument()
  })
})

function axesResult(score: number) {
  const AXES = [
    'must_have',
    'nice_to_have',
    'seniority',
    'sector',
    'environment',
    'language',
    'location',
    'availability',
    'contract_status',
    'rate',
    'evidence_quality',
    'client_constraints',
  ] as const
  return {
    consultantId: 'c1',
    axes: AXES.map(axis => ({ axis, score, weight: 8, detail: '', evidence: [] })),
    correspondenceScore: score,
    pushableScore: score,
    bucket: 'borderline' as const,
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
  }
}

/**
 * #2288.2 / #2288.3 / #2288.4 — LA VÉRIFICATION À LA DEMANDE, VUE DE L'ÉCRAN.
 *
 * Les trois points tiennent ou tombent ICI : le flux à trois étapes, le fait
 * que la vérification reste FACULTATIVE, et le coût annoncé AVANT. Les
 * fonctions pures ont leurs propres tests ; ce bloc vérifie que l'écran les
 * APPELLE — la leçon du dépôt, du code juste que personne n'appelle.
 */
describe('#2288 — présélection → vérification → conservation, à l’écran', () => {
  function section() {
    return screen.getByTestId('compatible-environments-section')
  }

  function withMatches(names: readonly string[] = ['Thales', 'Atos']) {
    useMarketContextSearch.mockReturnValue({
      data: contextRead(names.map(name => contextMatch(name))),
      isLoading: false,
    })
  }

  // ── #2288.3 — LA VÉRIFICATION EST FACULTATIVE ────────────────────────────
  it('sans AUCUNE vérification, le tableau se lit entièrement et le DIT', () => {
    withMatches()
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).getByText('Thales')).toBeInTheDocument()
    expect(within(block).getByText('Atos')).toBeInTheDocument()
    // Le geste qui fait avancer reste accessible sans avoir rien payé.
    expect(within(block).getAllByRole('link', { name: 'Analyser' })).toHaveLength(2)
    expect(within(block).getByText(/La vérification reste facultative/)).toBeInTheDocument()
  })

  it('n’affiche AUCUN bouton de vérification tant que rien n’est présélectionné', () => {
    withMatches()
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).queryByRole('button', { name: /Vérifier aujourd/ })).not.toBeInTheDocument()
  })

  it('une entreprise non vérifiée s’affiche, dit qu’elle ne l’est pas, et n’est jamais bloquée', () => {
    withMatches(['Thales'])
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'to_verify' }] },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).getByText('Non vérifié')).toBeInTheDocument()
    expect(within(block).getByRole('link', { name: 'Analyser' })).toBeInTheDocument()
  })

  // #2968 — RÉSERVE : une vérification a existé, puis a vieilli (« stale »).
  // Ni signal ni accès connus par ailleurs — sans le fait périmé, cette ligne
  // retomberait en COMPATIBLE STRUCTURELLEMENT (voir `reverseMarketVerdictFor`).
  it('affiche le verdict RÉSERVE quand une vérification a existé puis a vieilli', () => {
    withMatches(['Thales'])
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'stale' }] },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('En réserve')).toBeInTheDocument()
  })

  // ── #2288.2 — TROIS ÉTAPES, CHACUNE AVEC SON ÉTAT ────────────────────────
  it('cocher une ligne ne débite RIEN et n’inscrit RIEN — la présélection est gratuite', () => {
    withMatches(['Thales'])
    render(<ReverseMarketPage talentId="c1" />)
    fireEvent.click(within(section()).getByRole('checkbox', { name: /Présélectionner Thales/ }))
    expect(launchMutate).not.toHaveBeenCalled()
    expect(navigateSpy).not.toHaveBeenCalled()
    expect(within(section()).getByRole('button', { name: /Vérifier aujourd/ })).toBeInTheDocument()
  })

  it('une vérification conservée se dit « Vérifié » et COMPTE dans le seau', () => {
    withMatches(['Thales', 'Atos'])
    useMarketVerificationStates.mockReturnValue({
      data: {
        states: [
          { companyName: 'Thales', state: 'kept', verifiedAt: '2026-09-16T10:00:00.000Z' },
          { companyName: 'Atos', state: 'to_verify' },
        ],
      },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    // La date est DITE : « Vérifié le … », jamais un « Vérifié » sans âge.
    expect(within(block).getByText('Vérifié le 16/09/2026')).toBeInTheDocument()
    expect(within(within(block).getByTestId('compatible-buckets')).getByText('1 vérifiés')).toBeInTheDocument()
  })

  it('une vérification PÉRIMÉE redevient inconnue — jamais « vérifié », jamais « 0 »', () => {
    withMatches(['Thales'])
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'stale', verifiedAt: '2026-06-01T10:00:00.000Z' }] },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).getByText('À revérifier le 01/06/2026')).toBeInTheDocument()
    expect(within(block).queryByText('Vérifié')).not.toBeInTheDocument()
    expect(within(within(block).getByTestId('compatible-buckets')).getByText('0 vérifiés')).toBeInTheDocument()
  })

  it('un temps dépassé dit « Non mesuré » et ne relance rien tout seul', () => {
    withMatches(['Thales'])
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'unknown' }] },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByText('Non mesuré')).toBeInTheDocument()
    expect(launchMutate).not.toHaveBeenCalled()
  })

  it('tant que les états ne sont pas arrivés, la colonne reste MUETTE — pas « non vérifié » par défaut', () => {
    withMatches(['Thales'])
    useMarketVerificationStates.mockReturnValue({ data: undefined, isFetching: true, isError: false })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).queryByText('Non vérifié')).not.toBeInTheDocument()
  })
})

/**
 * #2288.2 (décision Louis, 18/09/2026) — LE VIEWER LIT, IL NE PAIE PAS.
 */
describe('#2288 — le viewer voit la colonne, jamais le geste payant', () => {
  function section() {
    return screen.getByTestId('compatible-environments-section')
  }

  beforeEach(() => {
    useMarketContextSearch.mockReturnValue({ data: contextRead([contextMatch('Thales')]), isLoading: false })
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'kept', verifiedAt: '2026-09-16T10:00:00.000Z' }] },
      isFetching: false,
      isError: false,
    })
  })

  it('un VIEWER voit l’état ET sa date', () => {
    useUserPermissions.mockReturnValue({ status: 'known', role: 'viewer', extraPermissions: [], permissions: [] })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).getByText(/Vérifié/)).toBeInTheDocument()
    expect(within(block).getByText(/16\/09\/2026/)).toBeInTheDocument()
  })

  it('un VIEWER ne voit ni case à cocher ni bouton payant', () => {
    useUserPermissions.mockReturnValue({ status: 'known', role: 'viewer', extraPermissions: [], permissions: [] })
    render(<ReverseMarketPage talentId="c1" />)
    const block = section()
    expect(within(block).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: /Vérifier aujourd/ })).not.toBeInTheDocument()
  })

  it('tant que le rôle n’est pas connu, le geste payant n’est pas proposé — on ne devine pas un droit', () => {
    useUserPermissions.mockReturnValue({ status: 'unknown' })
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('qui peut lancer voit la case à cocher', () => {
    render(<ReverseMarketPage talentId="c1" />)
    expect(within(section()).getByRole('checkbox', { name: /Présélectionner Thales/ })).toBeInTheDocument()
  })
})

/**
 * #2288.2 (décision Louis, 18/09/2026) — CONFIRMER LANCE TOUT CE QUI EST COCHÉ.
 */
describe('#2288 — confirmer lance toutes les entreprises cochées', () => {
  function section() {
    return screen.getByTestId('compatible-environments-section')
  }

  function tickAndConfirm(names: readonly string[]) {
    for (const name of names) {
      fireEvent.click(within(section()).getByRole('checkbox', { name: new RegExp(`Présélectionner ${name}`) }))
    }
    fireEvent.click(within(section()).getByRole('button', { name: /Vérifier aujourd/ }))
    fireEvent.click(screen.getByRole('button', { name: 'confirmer-le-devis' }))
  }

  beforeEach(() => {
    useMarketContextSearch.mockReturnValue({
      data: contextRead([contextMatch('Thales'), contextMatch('Atos'), contextMatch('Capgemini')]),
      isLoading: false,
    })
  })

  it('3 cochées → UN geste qui lance les 3, pas la première seule', () => {
    render(<ReverseMarketPage talentId="c1" />)
    tickAndConfirm(['Thales', 'Atos', 'Capgemini'])
    expect(launchMutate).toHaveBeenCalledTimes(1)
    expect(launchMutate.mock.calls[0]?.[0]?.companies).toEqual(['Thales', 'Atos', 'Capgemini'])
  })

  // #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION.
  it('transmet le SIREN connu (lu depuis la colonne « Vérification ») au lanceur', () => {
    useMarketVerificationStates.mockReturnValue({
      data: { states: [{ companyName: 'Thales', state: 'to_verify', siren: '552081317' }] },
      isFetching: false,
      isError: false,
    })
    render(<ReverseMarketPage talentId="c1" />)
    tickAndConfirm(['Thales'])
    const knownSirens = launchMutate.mock.calls[0]?.[0]?.knownSirens as Map<string, string>
    expect(knownSirens.get('thales')).toBe('552081317')
  })

  type LaunchMutateArg = { companies: readonly string[]; knownSirens?: ReadonlyMap<string, string> }

  it('un échec au milieu est NOMMÉ, et aucun succès global n’est annoncé', async () => {
    launchMutate.mockImplementation((_arg: LaunchMutateArg, options: { onSuccess: (r: unknown) => void }) =>
      options.onSuccess([
        { companyName: 'Thales', outcome: 'launched' },
        { companyName: 'Atos', outcome: 'failed' },
        { companyName: 'Capgemini', outcome: 'launched' },
      ]),
    )
    render(<ReverseMarketPage talentId="c1" />)
    tickAndConfirm(['Thales', 'Atos', 'Capgemini'])
    const report = await within(section()).findByTestId('verification-launch-report')
    expect(within(report).getByRole('alert')).toHaveTextContent('Pas lancées : Atos')
    expect(report).toHaveTextContent('2 vérifications lancées')
    // Celle qui a échoué reste cochée, les autres sortent de la présélection.
    expect(within(section()).getByRole('checkbox', { name: /Présélectionner Atos/ })).toBeChecked()
    expect(within(section()).getByRole('checkbox', { name: /Présélectionner Thales/ })).not.toBeChecked()
  })

  it('un temps dépassé est dit « non mesuré », et n’est pas relancé', async () => {
    launchMutate.mockImplementation((_arg: LaunchMutateArg, options: { onSuccess: (r: unknown) => void }) =>
      options.onSuccess([{ companyName: 'Atos', outcome: 'unknown' }]),
    )
    render(<ReverseMarketPage talentId="c1" />)
    tickAndConfirm(['Atos'])
    const report = await within(section()).findByTestId('verification-launch-report')
    expect(within(report).getByRole('note')).toHaveTextContent('Non mesuré : Atos')
    expect(launchMutate).toHaveBeenCalledTimes(1)
  })

  it('quand TOUT est parti, pas de compte rendu d’échec', () => {
    launchMutate.mockImplementation((_arg: LaunchMutateArg, options: { onSuccess: (r: unknown) => void }) =>
      options.onSuccess([{ companyName: 'Thales', outcome: 'launched' }]),
    )
    render(<ReverseMarketPage talentId="c1" />)
    tickAndConfirm(['Thales'])
    expect(within(section()).queryByTestId('verification-launch-report')).not.toBeInTheDocument()
  })
})

/**
 * Refonte Théo (maquette `c/talents-comptes`, 23/10/2026) — LA STRUCTURE. Sait
 * dire NON : le retour hors de l'en-tête, la ligne de statut absente, ou
 * l'explication du classement renvoyée dans la liste fait tomber la suite.
 */
describe('Des comptes pour … — la structure de la maquette Théo', () => {
  const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('en-tête (titre + retour au profil) → ligne de statut → classement, avec l’explication et « Avant de présenter » en colonne', () => {
    render(<ReverseMarketPage talentId="c1" />)
    const title = screen.getByRole('heading', { level: 1 })
    const status = screen.getByTestId('reverse-market-status-line')
    // Les deux branches de la refonte ont posé la même colonne : elle se repère par son testid (`<aside>`, garde PR12).
    const aside = screen.getByTestId('reverse-market-aside')
    expect(follows(title, status)).toBe(true)
    expect(within(aside).getByTestId('why-these-matches')).toBeInTheDocument()
    expect(within(aside).getByTestId('before-presenting')).toBeInTheDocument()
    expect(screen.getByTestId('reverse-market-external-fold').closest('aside')).toBeNull()
    // La ligne de statut porte les compétences de la fiche (la pile du talent, version PR12 conservée).
    expect(status).toHaveTextContent('OWASP')
  })
})
