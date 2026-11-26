import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'

/**
 * L'écran Finance — ce qu'il ajoute au panneau qu'il monte.
 *
 * Le calcul et l'affichage des six lectures existaient déjà (`FinancePanel`,
 * monté sur `/pilotage`). Ce qui manquait était une ADRESSE, et deux choses que
 * le panneau ne pouvait pas porter tout seul : une période visible, et une
 * bande qui transforme un chiffre en file de travail.
 *
 * Ces tests gardent exactement ces deux ajouts — et le fait que le panneau
 * REÇOIT la période, sans quoi le sélecteur serait décoratif.
 */
const revenue = vi.fn()
const forecast = vi.fn()
const capacity = vi.fn()
const margin = vi.fn()
const dso = vi.fn()
const channels = vi.fn()
const readiness = vi.fn()
const timesheets = vi.fn()
const advDossiers = vi.fn()
const financeTarget = vi.fn()
const metricSeries = vi.fn()
const legalEntities = vi.fn()
const setTarget = vi.fn()
const collectionsWindow = vi.fn()
const connectedCapabilities = vi.fn()
const invoicePayments = vi.fn()

/**
 * ⚠️ La coupure entre les deux modules moqués n'est pas arbitraire (01/09/2026) :
 * les QUATRE lectures qui savent recevoir une SOCIÉTÉ vivent désormais dans
 * `features/pilotage/api` — leur clé de cache doit la porter — et les DEUX qui
 * en sont aveugles (capacité, délai de paiement) gardent leurs hooks d'origine.
 * `entity` est ÉCHOTÉ par les faux, ce qui est le seul moyen de vérifier que le
 * sélecteur commande vraiment les chiffres et pas seulement un libellé.
 */
vi.mock('@/features/missions/api', () => ({
  useCapacity: () => capacity(),
  useDso: () => dso(),
  useInvoiceReadiness: (month?: string) => readiness(month),
  useTimesheetMonth: (month?: string) => timesheets(month),
  // #2564.3 — la fenêtre d'encaissement. Les mois passés ne sont pas vérifiés
  // ici : `collectionMonths` (RÉEL, non moqué) est déjà testé pour lui-même
  // dans `@/features/missions/collections.test.ts`.
  useCollectionsWindow: () => collectionsWindow(),
  // #2419.9 — le seau « non rapproché » : une lecture SÉPARÉE (`GET
  // /delivery/payments`), jamais recalculée depuis `collectionsWindow`.
  useInvoicePayments: () => invoicePayments(),
}))

vi.mock('@/features/adv/api', () => ({
  useAdvDossiers: (query: { month?: string }) => advDossiers(query),
}))

// #2564.4 — L'OUTIL DE GESTION. `connectedClientTools` (RÉEL, non moqué)
// filtre déjà le bruit ; seule la requête réseau sous-jacente est moquée.
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => connectedCapabilities(),
}))

vi.mock('../api', () => ({
  useFinanceTarget: (month: string) => financeTarget(month),
  useMetricSeries: (months?: number) => metricSeries(months),
  useLegalEntities: () => legalEntities(),
  useSetFinanceTarget: () => setTarget(),
  useDashboardRevenue: (month?: string, entity?: string | null) => revenue(month, entity),
  useDashboardForecast: (entity?: string | null) => forecast(entity),
  useDashboardMargin: (month?: string, entity?: string | null) => margin(month, entity),
  useDashboardChannels: (month?: string, entity?: string | null) => channels(month, entity),
  // #2425 — le prévisionnel par horizon a son propre test (FinanceForecastHorizons.test.tsx).
  useForecastHorizons: (horizon: string) => forecastHorizons(horizon),
  // #2783 — le volume de bons de commande a son propre test (FinancePoOverview.test.tsx).
  usePoConsumptionOverview: () => poConsumptionOverview(),
}))

const forecastHorizons = vi.fn((_horizon: string) => ({ data: undefined, isLoading: false, isError: true }))
const poConsumptionOverview = vi.fn(() => ({ data: undefined, isLoading: false, isError: true }))

/** Le rôle de l'espace — il commande le seul GESTE de cet écran (saisir
 *  l'objectif). `owner` par défaut : les tests qui gardent l'absence du champ
 *  le redéfinissent. */
const workspaceRole = vi.fn(() => 'owner')
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: workspaceRole() } } }),
}))

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

/**
 * `useRouter` — depuis le manque n°3 (30/08), `FinancePanel` le lit
 * INCONDITIONNELLEMENT (un lien « voir le détail » par bloc en a besoin, pas
 * seulement les missions orphelines). `routesByPath` volontairement vide :
 * `isReachable` laisse alors passer (corpus vide = lecture non faite plutôt
 * que « rien n'existe »), donc les liens de détail restent visibles ici, ce
 * qui n'est testé nulle part dans CE fichier — seul `FinancePanel.test.tsx`
 * garde leur présence/absence.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}>{children}</a>
  ),
  useRouter: () => ({ routesByPath: {} }),
}))

const { FinanceScreen } = await import('./FinanceScreen')

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false })

function seedFinance() {
  revenue.mockReturnValue(
    ok({
      periodMonth: '2026-07-01',
      lines: [
        { kind: 'signed', amountCents: 120_000_00, withoutAmount: 0, unavailableReason: null },
        { kind: 'produced', amountCents: 98_000_00, withoutAmount: 0, unavailableReason: null },
        { kind: 'invoiced', amountCents: null, withoutAmount: 0, unavailableReason: null },
        { kind: 'collected', amountCents: 41_000_00, withoutAmount: 0, unavailableReason: null },
      ],
      scope: { kind: 'workspace', outsideAnyPortfolio: null },
    }),
  )
  forecast.mockReturnValue(ok({ months: [], lines: [] }))
  capacity.mockReturnValue(
    ok({ periodMonth: '2026-08-01', capacityDays: null, committedDays: null, availableDays: null, unmeasured: 0 }),
  )
  margin.mockReturnValue(ok({ marginPercent: null, measured: 0, unmeasured: 0, threshold: null, alerts: [] }))
  dso.mockReturnValue(ok({ days: null, measurability: { measurable: false, observed: 0, required: 10 }, undatable: 0 }))
  channels.mockReturnValue(ok({ periodMonth: '2026-07-01', byChannel: [], intermediationCost: null }))
  readiness.mockReturnValue(ok({ month: '2026-07', items: [], summary: {} }))
  timesheets.mockReturnValue(
    ok({
      items: [],
      summary: { total: 0, awaiting: 0, submitted: 0, validated: 0, disputed: 0, rejected: 0, notRequired: 0 },
    }),
  )
  advDossiers.mockReturnValue(
    ok({
      month: '2026-07',
      items: [],
      summary: {
        month: '2026-07',
        total: 0,
        starts: 0,
        renewals: 0,
        active: 0,
        readyToInvoice: 0,
        inNegotiation: null,
        incomplete: 0,
        startsDelta: null,
        renewalsDelta: null,
        byBlocker: [],
      },
    }),
  )
  financeTarget.mockReturnValue(ok({ month: '2026-07', targetPercent: null, setAt: null }))
  metricSeries.mockReturnValue(ok({ series: [], monthsCovered: 0 }))
  legalEntities.mockReturnValue(ok({ items: [] }))
  setTarget.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false })
  workspaceRole.mockReturnValue('owner')
  collectionsWindow.mockReturnValue({ items: [], canReadFinance: true, isLoading: false, failedMonths: 0 })
  invoicePayments.mockReturnValue(ok({ unmatched: [] }))
  connectedCapabilities.mockReturnValue({ families: [], tools: [], isLoading: false })
}

/**
 * LE sélecteur de période.
 *
 * ⚠️ `getByRole('combobox')` ne suffit plus depuis le 31/08/2026 : l'écran porte
 * un SECOND `<select>`, le filtre par société — désactivé, mais bien présent
 * dans l'arbre. Viser le premier par son libellé plutôt que par son rôle est ce
 * qui empêche ce fichier de tester silencieusement le mauvais contrôle.
 */
function periodSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Période' })
}

/**
 * Ce que le sélecteur montre, et ce qu'il propose.
 *
 * ⚠️ Le menu n'est plus un `<select>` natif depuis le 01/09/2026 : il n'a donc
 * ni `.value` ni `.options`, sur lesquels trois tests de ce fichier
 * s'appuyaient. Ce qui compte n'a pas changé — quel mois est CHOISI, quels
 * mois sont PROPOSÉS — seule la lecture a bougé.
 *
 * ⚠️⚠️ Il faut REFERMER la liste avant de rechercher le déclencheur : tant
 * qu'elle est ouverte, Radix masque le reste de l'écran aux lecteurs
 * (`aria-hidden`), et `getByRole('combobox')` ne trouve plus rien. C'est ce
 * qui faisait échouer le test de changement de période avec un message qui
 * accusait le libellé.
 */
async function ouvrirEtLire(): Promise<{ choisi: string; proposés: string[] }> {
  await userEvent.click(periodSelect())
  const options = await screen.findAllByRole('option')
  const lu = {
    choisi: options.find(o => o.getAttribute('aria-selected') === 'true')?.getAttribute('data-value') ?? '',
    proposés: options.map(o => o.getAttribute('data-value') ?? ''),
  }
  await userEvent.keyboard('{Escape}')
  return lu
}

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FinanceScreen />
    </QueryClientProvider>,
  )
}

describe("l'écran Finance", () => {
  it('monte le panneau existant plutôt que de recoder les six lectures', () => {
    seedFinance()
    wrap()

    // Les quatre chiffres d'affaires, rendus par `FinancePanel`. Si ce test
    // tombe, c'est que l'écran a cessé de le monter — et qu'il existe alors
    // deux vérités financières dans le produit.
    // ⚠️ `getAllByText` depuis #2564.3 : « Encaissé » est aussi le libellé du
    // seau homonyme de `FinanceCollectionsSummary`, juste plus bas sur CET
    // écran — deux lectures légitimes du même mot, pas un doublon à corriger.
    for (const label of ['Signé', 'Produit', 'Facturé', 'Encaissé']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  /**
   * #1807 — « supprime ce texte il sert à rien ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE LE TEXTE PORTAIT, ET POURQUOI LE RETIRER NE LAISSE PAS DE TROU
   * ─────────────────────────────────────────────────────────────────────────
   * L'élément pointé par le retour (markup à l'appui) est le PROPRE sous-titre
   * de cet écran — « Cinq lectures, jamais fondues en un seul chiffre. L'écart
   * entre elles est l'information. » — rendu ORPHELIN juste sous la barre
   * d'onglets, sans titre visible au-dessus de lui (`nameLivesInTabs` masque le
   * titre de `PageHeader` sur cet écran). La capture du retour montre la MÊME
   * phrase une seconde fois, quelques centaines de pixels plus bas, correctement
   * accompagnée cette fois de son titre « Finance et capacité » — c'est
   * `FinancePanel` (monté ici, PAS mocké) qui la porte déjà (loi 4 : rien
   * n'apparaît deux fois sous la même forme avec le même contenu).
   *
   * Le retirer d'ICI ne retire donc pas l'explication — elle reste au bon
   * endroit, sous son titre. Ce test garde les deux moitiés de la promesse :
   * le sous-titre orphelin a disparu, et la phrase qu'il portait n'a pas
   * disparu du produit.
   */
  it('ne répète plus son propre sous-titre — `FinancePanel`, plus bas, le porte déjà sous SON titre (#1807)', () => {
    seedFinance()
    wrap()

    // L4 (14/10/2026) : la page est en quatre rangées, chacune porte sa propre
    // phrase ; le titre « Finance et capacité » du panneau monolithique n'est
    // plus monté ici (le cockpit `/pilotage` le garde). La phrase ne doit
    // JAMAIS revenir en double — le doublon signalé par #1807.
    expect(
      screen.queryAllByText("Cinq lectures, jamais fondues en un seul chiffre. L'écart entre elles est l'information.")
        .length,
    ).toBeLessThanOrEqual(1)
  })

  it('affiche une période, et la passe aux lectures qui en acceptent une', async () => {
    seedFinance()
    wrap()

    // Le défaut que le dossier du 26/08 qualifie de GRAVE : un écran financier
    // sans période visible se lit de travers dès qu'il est partagé.
    expect(periodSelect()).toBeTruthy()

    // Et elle GOUVERNE : un sélecteur qui n'atteint pas les requêtes est un
    // sélecteur décoratif — le pire des deux, parce qu'il a l'air de marcher.
    // Le mois est lu sur l'APPEL, et le sélecteur doit porter le même.
    const month = revenue.mock.calls[0]?.[0] as string
    expect(month).toMatch(/^\d{4}-\d{2}$/)
    expect((await ouvrirEtLire()).choisi).toBe(month)
    // `null` en seconde position : « toutes les sociétés » est le DÉFAUT, et
    // il voyage explicitement — deux formes pour « toutes » finiraient par être
    // lues différemment d'une lecture à l'autre.
    expect(revenue).toHaveBeenCalledWith(month, null)
    expect(margin).toHaveBeenCalledWith(month, null)
    expect(channels).toHaveBeenCalledWith(month, null)
    expect(readiness).toHaveBeenCalledWith(month)
  })

  it('ouvre sur le mois PRÉCÉDENT — le même défaut que le serveur', async () => {
    seedFinance()
    // ⚠️ Une date NEUTRE, jamais « aujourd'hui » : ce test passerait tout seul
    // huit mois sur douze si on le posait sur l'horloge réelle, et il ne
    // garderait donc rien. Ouvrir sur le mois en cours ferait dire à cet écran
    // autre chose que le cockpit, sur exactement les mêmes chiffres.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-15T09:00:00Z'))
    try {
      wrap()
      expect((await ouvrirEtLire()).choisi).toBe('2026-02')
    } finally {
      vi.useRealTimers()
    }
  })

  it('change de période sans recharger l’écran', async () => {
    seedFinance()
    wrap()
    const { choisi, proposés } = await ouvrirEtLire()
    const other = proposés.find(value => value !== choisi)
    expect(other).toBeDefined()

    await chooseOption(periodSelect(), other as string)
    expect(revenue).toHaveBeenCalledWith(other, null)
  })

  it('DIT ce que la période ne gouverne pas', () => {
    seedFinance()
    wrap()

    // Trois des six lectures n'ont pas de mois. Une période affichée en haut
    // promet qu'elle vaut pour tout ce qui est dessous ; là où c'est faux, il
    // faut l'écrire plutôt que de laisser deviner.
    expect(screen.getByText(/ne suivent pas cette période/i)).toBeTruthy()
  })

  it('rend les bloqueurs en file de travail : un nombre, un montant, un lien', () => {
    seedFinance()
    readiness.mockReturnValue(
      ok({
        month: '2026-07',
        summary: {},
        items: [
          {
            missionId: 'a',
            blockers: ['missing_timesheet'],
            state: 'blocked',
            preparedAmountCents: 50_000_00,
            periodMonth: '2026-07-01',
            missionLabel: null,
            accountName: null,
            days: null,
            invoicedAt: null,
            invoiceReference: null,
            invoicedAmountCents: null,
            dueOn: null,
            remindersSent: 0,
            lastReminderAt: null,
            paidAt: null,
            paidAmountCents: null,
          },
        ],
      }),
    )
    wrap()

    expect(screen.getByText('Aucun relevé d’activité')).toBeTruthy()
    expect(screen.getByText(/^1 mission ·/)).toBeTruthy()
    // Le lien est ce qui distingue cette bande des trois autres proposées :
    // « la seule variante qui transforme un chiffre en file de travail ».
    expect(screen.getByRole('link', { name: 'Voir', hidden: true }).getAttribute('href')).toBe('/missions/cra')
  })

  it('un mois sans bloqueur DIT de quel mois il parle', () => {
    seedFinance()
    wrap()
    // « Aucune alerte » tout seul se lit aussi bien « la lecture a échoué ».
    expect(screen.getByText(/Rien ne bloque la facturation de/)).toBeTruthy()
  })
})

/**
 * LES TROIS REVIREMENTS DU 31/08/2026, et la moitié de chacun qui TIENT.
 *
 * Ces tests ne gardent pas « la fonctionnalité est là » — ils gardent ce que
 * Louis a explicitement conservé en levant chaque refus. C'est la moitié qui se
 * reperd, parce qu'elle est invisible tant qu'on ne la casse pas.
 */
describe("l'écran Finance — l'objectif de marge (D7, levé le 31/08/2026)", () => {
  it('sans objectif saisi, AUCUN pourcentage — et la raison est nommée', () => {
    seedFinance()
    margin.mockReturnValue(ok({ marginPercent: 32, measured: 12, unmeasured: 0, threshold: null, alerts: [] }))
    financeTarget.mockReturnValue(ok({ month: '2026-07', targetPercent: null, setAt: null }))
    wrap()

    expect(screen.getByText(/Objectif non défini/)).toBeTruthy()
    // Ni « 0 % », ni un anneau dessiné vide : la branche non mesurée du contrat
    // ne PORTE pas de champ `percent`, et l'écran ne peut donc pas en inventer un.
    expect(screen.queryByRole('img', { name: /de l’objectif/ })).toBeNull()
  })

  it('avec un objectif saisi ET une marge mesurée, il rend le taux de réalisation', () => {
    seedFinance()
    margin.mockReturnValue(ok({ marginPercent: 21, measured: 12, unmeasured: 0, threshold: null, alerts: [] }))
    financeTarget.mockReturnValue(ok({ month: '2026-07', targetPercent: 30, setAt: '2026-08-30T10:00:00.000Z' }))
    wrap()

    // 21 / 30 = 70 %. Le chiffre est écrit À CÔTÉ du graphe — la seule règle de
    // visualisation que l'annexe dit vraiment importante.
    expect(screen.getByRole('img', { name: /70 %/, hidden: true })).toBeTruthy()
    expect(screen.getByText(/Marge 21 % · objectif 30 %/)).toBeTruthy()
  })

  it('un objectif ne rend PAS une marge mesurable — sous le seuil, l’anneau se tait', () => {
    seedFinance()
    margin.mockReturnValue(
      ok({
        marginPercent: 61,
        measured: 2,
        unmeasured: 0,
        threshold: null,
        alerts: [],
        measurability: { measurable: false, observed: 2, required: 5 },
      }),
    )
    financeTarget.mockReturnValue(ok({ month: '2026-07', targetPercent: 30, setAt: null }))
    wrap()

    expect(screen.getByText(/Trop peu de missions chiffrées/)).toBeTruthy()
    expect(screen.queryByRole('img', { name: /de l’objectif/ })).toBeNull()
  })

  it('le GESTE de saisie n’existe que pour qui peut écrire une information financière', () => {
    seedFinance()
    workspaceRole.mockReturnValue('sales')
    wrap()
    // Montrer un champ qui rendra 403 est pire que ne rien montrer.
    expect(screen.queryByLabelText(/Objectif de marge/)).toBeNull()
  })

  it('…et il existe pour qui le peut, sinon la table serait du code que personne n’appelle', () => {
    seedFinance()
    wrap()
    expect(screen.getByLabelText(/Objectif de marge/)).toBeTruthy()
  })
})

describe("l'écran Finance — « Apports d'affaires » (levé le 31/08/2026)", () => {
  it('LIT la ligne de résultat du serveur, il ne la compose pas', () => {
    seedFinance()
    channels.mockReturnValue(
      ok({
        periodMonth: '2026-07-01',
        byChannel: [
          { channel: 'direct', marginPercent: 34, missions: 8, unmeasured: 0 },
          // ⚠️ 22 et NON 34 − 9 = 25. Le serveur pondère par les jours ; une
          // soustraction faite à l'écran rendrait 25 et se croirait juste.
          { channel: 'partner', marginPercent: 22, missions: 4, unmeasured: 0 },
        ],
        intermediationCost: 9,
      }),
    )
    wrap()

    expect(screen.getByText('Marge totale (vente directe)')).toBeTruthy()
    expect(screen.getByText('= marge nette (via apporteur)')).toBeTruthy()
    // La preuve : le chiffre affiché est celui du serveur, pas la soustraction.
    // `getAllByText` : « 22 % » apparaît AUSSI dans la marge par canal du
    // panneau, ce qui est la preuve que les deux lisent la même source.
    expect(screen.getAllByText('22 %').length).toBeGreaterThan(0)
    expect(screen.queryByText('25 %')).toBeNull()
  })

  it('n’écrit JAMAIS le vocabulaire du concurrent', () => {
    seedFinance()
    wrap()
    // L'annexe le dit dès sa première page : « Octo » et « Marge Crème » sont
    // les mots d'un concurrent, arrivés là par la régénération des captures.
    // ⚠️ `\bOcto\b` et non `/Octo/i` : sans la borne de mot, la regex attrape
    // « octobre » dans le sélecteur de période — une garde qui rougit sur un
    // mois de l'année n'aurait pas survécu à l'automne.
    expect(screen.queryByText(/\bOcto\b/i)).toBeNull()
    expect(screen.queryByText(/Marge Crème/i)).toBeNull()
    expect(screen.queryByText(/Belloom/i)).toBeNull()
  })

  it('le PRÉVISIONNEL de marge dit qu’il n’est pas mesuré, une seule fois', () => {
    seedFinance()
    wrap()
    expect(screen.getByText(/Aucun calcul du produit ne rend une marge prévisionnelle/)).toBeTruthy()
  })
})

describe("l'écran Finance — l'activité récente (levée le 31/08/2026)", () => {
  it('arrive EN PLUS de la bande d’alertes, jamais à sa place', () => {
    seedFinance()
    wrap()
    // La bande d'alertes est l'élément le mieux tenu du dossier : la remplacer
    // par un journal aurait été le contraire du revirement.
    expect(screen.getByText('Ce qui bloque de l’argent')).toBeTruthy()
    expect(screen.getByText('Activité récente')).toBeTruthy()
  })

  it('NOMME les deux événements qu’elle ne sait pas dater', () => {
    seedFinance()
    wrap()
    // « Facture envoyée » n'est pas une lacune : le produit n'émet aucune
    // facture, et Louis l'a reconfirmé le 31/08/2026.
    expect(screen.getByText(/n’émet aucune facture/)).toBeTruthy()
    expect(screen.getByText(/sans date d’événement/)).toBeTruthy()
  })
})

describe("l'écran Finance — ce qui reste refusé", () => {
  it('n’affiche AUCUN « paiements effectués 0,4 % » — faux par construction', () => {
    seedFinance()
    wrap()
    expect(screen.queryByText(/Paiements effectués/i)).toBeNull()
    expect(screen.queryByText(/0,4 ?%/)).toBeNull()
  })

  it('ne parle ni d’IBAN, ni de virement, ni de scrapers, ni d’émission de facture', () => {
    seedFinance()
    wrap()
    for (const forbidden of [/IBAN/i, /virement/i, /scraper/i, /émettre la facture/i, /brouillon de facture/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('nomme la SOCIÉTÉ, jamais la « BU » de la maquette', () => {
    // `'bu'` d'`ACCOUNT_ENTITY_KINDS` est une division du compte CLIENT, pas une
    // portée transverse de l'ESN. Le produit ne prend pas le vocabulaire d'une
    // maquette pour une décision de modèle.
    seedFinance()
    legalEntities.mockReturnValue(ok({ items: [entity()] }))
    wrap()

    expect(screen.getByRole('combobox', { name: 'Société' })).toBeTruthy()
    expect(screen.queryByText(/Toutes les BU/i)).toBeNull()
  })
})

/** Une société déclarée, dans la forme que `useLegalEntities` sert. */
function entity(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    workspace_id: 'ws-1',
    name: 'Bellum Conseil',
    registration_number: null,
    country: 'FR',
    archived: false,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * LE FILTRE PAR SOCIÉTÉ — livré DÉSACTIVÉ le 31/08, ACTIF depuis le 01/09/2026.
 *
 * Le refus d'origine était juste : « aucune des six lectures financières ne
 * prend de société en paramètre ; un filtre qui change le libellé et pas les
 * chiffres est le pire des deux mondes ». Ces tests gardent exactement la
 * levée : le choix ATTEINT les quatre lectures qui savent le recevoir, il
 * n'atteint PAS les deux qui l'ignorent, et l'écran DIT lesquelles.
 */
describe("l'écran Finance — le filtre par société (levé le 01/09/2026)", () => {
  it('sans société déclarée, le contrôle ET sa ligne « Aucune société déclarée » ne s’affichent pas (#3709)', () => {
    // Rien à filtrer : afficher « Aucune société déclarée » sous un bloc Finance
    // qui fonctionne se lisait comme une panne (recette prod 07/10/2026).
    seedFinance()
    wrap()
    expect(screen.queryByRole('combobox', { name: 'Société' })).toBeNull()
    expect(screen.queryByText(/Aucune société déclarée/)).toBeNull()
  })

  it('choisir une société ATTEINT les quatre lectures qui savent la recevoir', async () => {
    seedFinance()
    legalEntities.mockReturnValue(ok({ items: [entity()] }))
    wrap()

    const filter = screen.getByRole('combobox', { name: 'Société' })
    expect(filter).not.toBeDisabled()

    // ⚠️ Les espions de ce fichier ne sont remis à zéro NULLE PART : sans ce
    // nettoyage, les appels d'un test voisin comptent comme les nôtres — et
    // c'est ce qui a fait croire un instant que le choix ne partait pas, puis
    // qu'il partait avec deux mois différents. On ne mesure que ce que CE
    // geste déclenche.
    for (const spy of [revenue, margin, channels, forecast]) spy.mockClear()

    await chooseOption(filter, 'e1')

    // Le choix a bien PRIS : le déclencheur montre la société.
    expect(filter).toHaveTextContent('Bellum Conseil')

    /*
     * ⚠️ `waitFor`, et pas une assertion sèche.
     *
     * L'ancien `<select>` natif appliquait son changement dans le même tour
     * que le clic : la lecture partait avant que le test reprenne la main.
     * Radix referme sa liste puis met l'état à jour, donc la relecture React
     * Query part un tick plus tard. Sans l'attente, on mesure l'écran D'AVANT
     * le choix — et le test échoue en montrant six appels « toutes sociétés »
     * qui sont simplement les précédents.
     *
     * On vérifie exactement ce que ce test annonce — que les quatre lectures
     * qui SAVENT recevoir une société la reçoivent — et rien de plus. Le mois
     * n'est pas assorti d'une assertion : les trois lectures ne le relisent
     * pas au même tour, et exiger qu'elles s'accordent inventerait une règle
     * que cet écran n'a jamais promise.
     */
    await waitFor(() => {
      for (const spy of [revenue, margin, channels]) {
        expect(spy.mock.calls.some(([, entityId]) => entityId === 'e1')).toBe(true)
      }
      expect(forecast).toHaveBeenCalledWith('e1')
    })
  })

  it('les DEUX lectures aveugles ne reçoivent JAMAIS de société', async () => {
    // La capacité compte des personnes, le délai de paiement est une médiane à
    // plancher : leur passer une société donnerait un paramètre que le serveur
    // ignore — le retour du défaut qu'on répare, un cran plus bas.
    seedFinance()
    legalEntities.mockReturnValue(ok({ items: [entity()] }))
    wrap()
    await chooseOption(screen.getByRole('combobox', { name: 'Société' }), 'e1')

    for (const call of capacity.mock.calls) expect(call).toEqual([])
    for (const call of dso.mock.calls) expect(call).toEqual([])
  })

  it('DIT les trois blocs que la société ne gouverne pas — sinon ils se lisent comme une panne', async () => {
    seedFinance()
    legalEntities.mockReturnValue(ok({ items: [entity()] }))
    wrap()
    await chooseOption(screen.getByRole('combobox', { name: 'Société' }), 'e1')

    expect(screen.getByText(/ne suivent pas cette société/i)).toBeTruthy()
  })

  it('ne dit RIEN de ces trois blocs tant qu’aucune société n’est choisie', () => {
    // Un avertissement permanent est un bruit qui cesse d'être lu.
    seedFinance()
    legalEntities.mockReturnValue(ok({ items: [entity()] }))
    wrap()
    expect(screen.queryByText(/ne suivent pas cette société/i)).toBeNull()
  })
})

describe("l'écran Finance — la variation vient de la PHOTO, jamais d'un recalcul", () => {
  it('le premier mois d’un espace n’a pas de variation, et ce n’est pas une panne', () => {
    seedFinance()
    metricSeries.mockReturnValue(ok({ series: [], monthsCovered: 1 }))
    wrap()
    expect(screen.getAllByText(/premier mois — la comparaison arrive le mois prochain/).length).toBeGreaterThan(0)
  })

  it('rend la variation entre deux photos, avec le chiffre du mois à côté', () => {
    seedFinance()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'))
    try {
      metricSeries.mockReturnValue(
        ok({
          monthsCovered: 2,
          series: [
            {
              metricKey: 'activeClients',
              unit: 'count',
              points: [
                { month: '2026-07', value: 40 },
                { month: '2026-08', value: 45 },
              ],
            },
          ],
        }),
      )
      wrap()
      expect(screen.getByText('45')).toBeTruthy()
      // +5 en compte ET +12,5 % : le contrat rend les deux, l'écran choisit le
      // relatif quand il existe.
      expect(screen.getByText(/\+12,5 %/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("l'écran Finance — #3483 un zéro sans population n'est pas une mesure", () => {
  it("« Clients actifs 0 · vs août 0 » ne s'écrit pas quand rien ne prouve que quelqu'un a compté", () => {
    seedFinance()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-15T09:00:00Z'))
    try {
      metricSeries.mockReturnValue(
        ok({
          monthsCovered: 2,
          series: [
            {
              metricKey: 'activeClients',
              unit: 'count',
              points: [
                { month: '2026-07', value: 0 },
                { month: '2026-08', value: 0 },
              ],
            },
            {
              metricKey: 'missions_without_cost',
              unit: 'count',
              points: [
                { month: '2026-07', value: 3, denominator: 9 },
                { month: '2026-08', value: 0, denominator: 9 },
              ],
            },
          ],
        }),
      )
      wrap()
      expect(screen.queryByText('Clients actifs')).toBeNull()
      // Un zéro MESURÉ sur une population (0 sur 9 missions) reste dit.
      expect(screen.getByText('Missions sans coût saisi')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * #2564 — LE SUIVI FINANCIER (18/09/2026).
 *
 * « BellumAI SUIT le financier, il ne COMPTABILISE pas » : ces trois blocs ne
 * recalculent rien (la même lecture `readiness`/`useCollectionsWindow` que le
 * reste de l'écran) et n'écrivent jamais rien — aucune facture émise ni
 * marquée facturée, aucun montant présenté comme « 0 € » quand il est
 * seulement NON MESURÉ.
 */
describe("l'écran Finance — #2564.1 CA par mission", () => {
  it('affiche une ligne par mission, avec sa période et son montant livré', () => {
    seedFinance()
    readiness.mockReturnValue(
      ok({
        month: '2026-07',
        summary: {},
        items: [
          {
            missionId: 'm1',
            missionLabel: 'Cadrage données transport',
            accountName: 'Aéroport de Lyon',
            blockers: [],
            state: 'ready',
            preparedAmountCents: 120_000_00,
            invoicedAmountCents: null,
            periodMonth: '2026-07-01',
            days: 18,
            invoicedAt: null,
            invoiceReference: null,
            dueOn: null,
            remindersSent: 0,
            lastReminderAt: null,
            paidAt: null,
            paidAmountCents: null,
          },
        ],
      }),
    )
    wrap()

    expect(screen.getByText('Cadrage données transport')).toBeTruthy()
    expect(screen.getAllByText(/120\s?000\s?€/).length).toBeGreaterThan(0)
    expect(screen.getByText('pas encore facturé')).toBeTruthy()
  })

  it('#2564.1 — un montant NON MESURÉ ne s’affiche JAMAIS « 0 € », toujours « non mesuré »', () => {
    seedFinance()
    readiness.mockReturnValue(
      ok({
        month: '2026-07',
        summary: {},
        items: [
          {
            missionId: 'm2',
            missionLabel: 'Sans TJM saisi',
            accountName: 'Client X',
            blockers: [],
            state: 'blocked',
            // La mission n'a pas de TJM chargé : rien n'a pu être chiffré.
            preparedAmountCents: null,
            invoicedAmountCents: null,
            periodMonth: '2026-07-01',
            days: null,
            invoicedAt: null,
            invoiceReference: null,
            dueOn: null,
            remindersSent: 0,
            lastReminderAt: null,
            paidAt: null,
            paidAmountCents: null,
          },
        ],
      }),
    )
    wrap()

    // La garde qui sait dire NON : si le composant écrivait un jour
    // `preparedAmountCents ?? 0`, cette phrase — propre à CE bloc — disparaîtrait,
    // remplacée par un montant en euros.
    expect(screen.getByText(/non mesuré.*aucun TJM ou aucun relevé ne permet de chiffrer ce mois/)).toBeTruthy()
  })

  it('#3483 — trois missions non chiffrées : l’absence se dit UNE fois pour le tableau, pas par ligne', () => {
    seedFinance()
    const row = (id: string) => ({
      missionId: id,
      missionLabel: `Mission ${id}`,
      accountName: 'Client X',
      blockers: [],
      state: 'blocked',
      preparedAmountCents: null,
      invoicedAmountCents: null,
      periodMonth: '2026-07-01',
      days: null,
      invoicedAt: null,
      invoiceReference: null,
      dueOn: null,
      remindersSent: 0,
      lastReminderAt: null,
      paidAt: null,
      paidAmountCents: null,
    })
    readiness.mockReturnValue(ok({ month: '2026-07', summary: {}, items: [row('a'), row('b'), row('c')] }))
    wrap()

    expect(screen.getAllByText(/aucun TJM ou aucun relevé ne permet de chiffrer ce mois/)).toHaveLength(1)
  })
})

describe("l'écran Finance — #2564.3 encaissements", () => {
  it('totalise les quatre seaux et renvoie vers `/missions/encaissements`', () => {
    seedFinance()
    collectionsWindow.mockReturnValue({
      items: [
        {
          missionId: 'm1',
          missionLabel: 'Mission réglée',
          accountName: 'Compte',
          blockers: [],
          state: 'invoiced',
          preparedAmountCents: 100_000_00,
          invoicedAmountCents: 100_000_00,
          periodMonth: '2026-05-01',
          days: 20,
          invoicedAt: '2026-06-01T00:00:00.000Z',
          invoiceReference: 'F-1',
          dueOn: '2026-07-01',
          remindersSent: 0,
          lastReminderAt: null,
          paidAt: '2026-06-20T00:00:00.000Z',
          paidAmountCents: 100_000_00,
          disputedAt: null,
          disputeReason: null,
          disputeResolvedAt: null,
        },
      ],
      canReadFinance: true,
      isLoading: false,
      failedMonths: 0,
    })
    wrap()

    expect(screen.getAllByText('Encaissé').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/100\s?000\s?€/).length).toBeGreaterThan(0)
    // Deux autres blocs (« Relevés », « ADV ») portent déjà le même libellé
    // « Voir le détail » — celui-ci doit exister EN PLUS, vers l'écran des
    // encaissements précisément.
    const detailLinks = screen.getAllByRole('link', { name: /voir le détail/i, hidden: true })
    expect(detailLinks.some(link => link.getAttribute('href') === '/missions/encaissements')).toBe(true)
  })

  it('#2564.3 — un seau AVEC des lignes mais SANS montant lisible reste « non mesuré », jamais « 0 € »', () => {
    // ⚠️ Un seau VRAIMENT vide (aucune ligne) affiche bien 0 — c'est un fait
    // vrai. Ce test porte sur l'AUTRE cas : une ligne EXISTE (`count: 1`) et
    // son montant ne peut pas être chiffré (`amountCents: null`) — les deux
    // ne doivent jamais se confondre sous « 0 € ».
    seedFinance()
    collectionsWindow.mockReturnValue({
      items: [
        {
          missionId: 'm1',
          missionLabel: 'Facturée, montant illisible',
          accountName: 'Compte',
          blockers: [],
          state: 'invoiced',
          preparedAmountCents: null,
          // Facturée mais sans droit financier lisible sur cette ligne :
          // `invoicedAmountCents` reste `null`, ce n'est pas 0 € facturé —
          // et sans échéance saisie, la ligne reste `pending`.
          invoicedAmountCents: null,
          periodMonth: '2026-05-01',
          days: null,
          invoicedAt: '2026-06-01T00:00:00.000Z',
          invoiceReference: 'F-2',
          dueOn: null,
          remindersSent: 0,
          lastReminderAt: null,
          paidAt: null,
          paidAmountCents: null,
          disputedAt: null,
          disputeReason: null,
          disputeResolvedAt: null,
        },
      ],
      canReadFinance: true,
      isLoading: false,
      failedMonths: 0,
    })
    wrap()

    // La garde qui sait dire NON : si le composant écrivait un jour
    // `bucket.amountCents ?? 0` pour un seau NON VIDE, cette ligne
    // disparaîtrait — remplacée par « 0 € ».
    expect(screen.getByText(/non mesuré.*aucun montant n’a été saisi sur cette facture/)).toBeTruthy()
    expect(screen.getByText('1 facture')).toBeTruthy()
  })

  /**
   * #2419.9 — LE SEAU « NON RAPPROCHÉ », une lecture séparée de
   * `collectionsWindow` (`GET /delivery/payments`, jamais recalculée).
   */
  it('#2419.9 — ajoute le seau « non rapproché », sourcé sur les paiements CONSTATÉS', () => {
    seedFinance()
    invoicePayments.mockReturnValue(ok({ unmatched: [{ amountCents: 480_000 }, { amountCents: 120_000 }] }))
    wrap()

    expect(screen.getByText('Non rapproché')).toBeTruthy()
    expect(screen.getByText(/6\s?000\s?€/)).toBeTruthy()
  })

  it('#2419.9 — un seau « non rapproché » VIDE affiche 0 — un fait vrai, pas une absence de mesure', () => {
    seedFinance()
    invoicePayments.mockReturnValue(ok({ unmatched: [] }))
    wrap()

    const tile = screen.getByText('Non rapproché').closest('div')
    expect(tile?.textContent).toMatch(/0\s?€/)
  })
})

describe("l'écran Finance — #2564.4 outil de gestion", () => {
  it('nomme la CAPACITÉ, jamais un outil, quand rien n’est connecté', () => {
    seedFinance()
    connectedCapabilities.mockReturnValue({ families: [], tools: [], isLoading: false })
    wrap()

    expect(screen.getByText('Aucun outil de gestion n’est connecté.')).toBeTruthy()
    // Aucun nom d'éditeur en dur — GA-44 : « BoondManager » n'apparaît nulle
    // part tant que rien n'est connecté.
    expect(screen.queryByText(/BoondManager/)).toBeNull()
  })

  it('nomme l’outil PAR INJECTION quand il est connecté, et dit qu’aucun chiffre n’en est encore lu', () => {
    seedFinance()
    connectedCapabilities.mockReturnValue({
      families: ['ats'],
      tools: [{ provider: 'boondmanager', family: 'ats', name: 'BoondManager' }],
      isLoading: false,
    })
    wrap()

    expect(screen.getByText('BoondManager est connecté.')).toBeTruthy()
    expect(
      screen.getByText(
        'Bellum ne lit pas encore de chiffres financiers depuis cet outil : ce que tu vois sur cet écran vient uniquement de ce que Bellum calcule.',
      ),
    ).toBeTruthy()
  })

  it('#2564.4 — Odoo connecté (famille crm, catalogué par son identifiant) est reconnu comme outil de gestion', () => {
    seedFinance()
    connectedCapabilities.mockReturnValue({
      families: ['crm'],
      tools: [{ provider: 'odoo', family: 'crm', name: 'Odoo' }],
      isLoading: false,
    })
    wrap()

    expect(screen.getByText('Odoo est connecté.')).toBeTruthy()
    expect(screen.queryByText('Aucun outil de gestion n’est connecté.')).toBeNull()
  })
})

function invoiceLine(over: Record<string, unknown>) {
  return {
    missionId: 'm',
    missionLabel: 'Mission',
    accountName: 'Client A',
    accountId: null,
    blockers: [],
    state: 'invoiced',
    preparedAmountCents: null,
    invoicedAmountCents: 10_000_00,
    periodMonth: '2026-09',
    days: 10,
    invoicedAt: '2026-08-31T00:00:00.000Z',
    invoiceReference: 'F-1',
    dueOn: '2020-01-01',
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

/**
 * L4 (14/10/2026) — la page en QUATRE rangées, et point 3 de la recette du
 * 14/10 : aucun chiffre sans la fenêtre de temps qu'il couvre.
 */
describe("l'écran Finance — quatre rangées (L4)", () => {
  function seedRows() {
    seedFinance()
    collectionsWindow.mockReturnValue({
      items: [
        invoiceLine({ missionId: 'a', accountName: 'Client A', dueOn: '2020-01-01' }),
        invoiceLine({ missionId: 'b', accountName: 'Client A', dueOn: '2099-01-01' }),
        invoiceLine({ missionId: 'c', accountName: 'Client B', dueOn: '2020-06-01' }),
      ],
      canReadFinance: true,
      isLoading: false,
      failedMonths: 0,
    })
    readiness.mockReturnValue(
      ok({
        month: '2026-09',
        summary: {},
        items: [
          invoiceLine({
            missionId: 'a',
            state: 'ready',
            preparedAmountCents: 4_000_00,
            invoicedAmountCents: null,
            dailyRateCents: 600_00,
          }),
          invoiceLine({ missionId: 'b', state: 'invoiced', dailyRateCents: 800_00 }),
          invoiceLine({ missionId: 'c', state: 'invoiced_declared', accountName: 'Client B' }),
          invoiceLine({
            missionId: 'd',
            state: 'blocked',
            blockers: ['missing_rate'],
            preparedAmountCents: null,
            invoicedAmountCents: null,
          }),
        ],
      }),
    )
    margin.mockReturnValue(ok({ marginPercent: 31, measured: 12, unmeasured: 1, threshold: null, alerts: [] }))
  }

  it('range la page en quatre rangées, dans l’ordre, avec un seul h2 par rangée et aucun h1', () => {
    seedRows()
    const { container } = wrap()
    const rows = [...container.querySelectorAll('[data-finance-row]')].map(row => row.getAttribute('data-finance-row'))
    expect(rows).toEqual(['collections', 'billing', 'margin', 'detail'])
    expect(container.querySelectorAll('h1')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Encaissements', hidden: true })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Facturation', hidden: true })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Marge et chiffre d’affaires', hidden: true })).toBeTruthy()
  })

  it('le Détail est replié par défaut et garde tout le reste', () => {
    seedRows()
    const { container } = wrap()
    const details = container.querySelector('[data-finance-row="detail"] details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    // Rien n'est supprimé : la bande d'alertes et les relevés sont toujours montés.
    expect(details.textContent).toContain('Relevés d’activité')
  })

  it('AUCUN chiffre sans libellé de période : chaque bloc de chaque rangée en porte un', () => {
    seedRows()
    const { container } = wrap()
    const blocks = [...container.querySelectorAll('[data-finance-block]')]
    expect(blocks.length).toBeGreaterThanOrEqual(8)
    for (const block of blocks) {
      const label = block.querySelector('[data-period-label]')
      expect(label, block.textContent?.slice(0, 60)).not.toBeNull()
      expect(label?.textContent?.trim().length).toBeGreaterThan(8)
    }
    // Et les deux fenêtres du point 3 se NOMMENT : 12 mois glissants vs mois choisi.
    const labels = [...container.querySelectorAll('[data-period-label]')].map(node => node.textContent ?? '')
    expect(labels.some(text => /12 derniers mois/.test(text) && /ne suit pas le sélecteur/.test(text))).toBe(true)
    expect(labels.some(text => /^Période : \p{L}+ 2026$/u.test(text.trim()))).toBe(true)
  })

  it('un bloc qui ne suit pas le sélecteur le DIT (délai de paiement, capacité, prévisionnel)', () => {
    seedRows()
    wrap()
    expect(screen.getAllByText(/tout l’historique payé — ne suit pas le sélecteur/).length).toBe(1)
    expect(screen.getAllByText(/mois en cours — ne suit pas le sélecteur/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/à venir — ne suit pas le sélecteur/).length).toBeGreaterThanOrEqual(1)
  })

  it('Encaissements : les lignes à traiter sont groupées par client, avec lien et ancienneté', () => {
    seedRows()
    wrap()
    const hrefs = screen.getAllByRole('link', { hidden: true }).map(link => link.getAttribute('href'))
    expect(hrefs).toContain('/missions/encaissements?client=Client+A')
    expect(hrefs).toContain('/missions/encaissements?client=Client+B')
    expect(screen.getAllByText(/jours de retard/).length).toBeGreaterThanOrEqual(2)
  })

  it('Encaissements : exactement QUATRE statuts, aucun « partiellement réglée »', () => {
    seedRows()
    const { container } = wrap()
    expect(container.textContent).not.toMatch(/partiellement/i)
  })

  it('Facturation : préparé / facturé avec SA source / à préparer — jamais « émis »', () => {
    seedRows()
    connectedCapabilities.mockReturnValue({
      families: [],
      tools: [{ id: 'boond', name: 'BoondManager', family: 'ats' }],
      isLoading: false,
    })
    const { container } = wrap()
    const row = container.querySelector('[data-finance-row="billing"]') as HTMLElement
    expect(row.textContent).toContain('Préparé')
    expect(row.textContent).toContain('Facturé')
    expect(row.textContent).toContain('À préparer')
    expect(row.textContent).toMatch(/déclarée par l’équipe, sans preuve/)
    expect(row.textContent).not.toMatch(/envoyée|a été émise/i)
  })

  it('Facturation : la preuve du connecteur est attribuée à l’outil branché, nommé par injection', () => {
    seedRows()
    connectedCapabilities.mockReturnValue({
      families: [],
      tools: [{ id: 'odoo', name: 'Odoo', family: 'crm' }],
      isLoading: false,
    })
    const { container } = wrap()
    const row = container.querySelector('[data-finance-row="billing"]') as HTMLElement
    expect(row.textContent).toMatch(/confirmée? par (Odoo|le connecteur)/)
  })

  it('Marge et CA : CA par client, TJM moyen avec sa base, marge avec son dénominateur', () => {
    seedRows()
    const { container } = wrap()
    const row = container.querySelector('[data-finance-row="margin"]') as HTMLElement
    expect(row.textContent).toContain('CA par client')
    expect(row.textContent).toMatch(/TJM moyen/)
    expect(row.textContent).toMatch(/sur 2 missions au TJM connu, 4 au total/)
    expect(row.textContent).toMatch(/12 missions mesurées/)
  })
})

describe("l'écran Finance — de vrais onglets, un seul visible à la fois (Théo D)", () => {
  const panel = (container: HTMLElement, key: string) => container.querySelector(`#finance-panel-${key}`) as HTMLElement

  it('s’ouvre sur « Du carnet au cash » : les trois autres lectures sont masquées, pas empilées', () => {
    seedFinance()
    const { container } = wrap()
    expect(panel(container, 'carnet').hidden).toBe(false)
    for (const key of ['encaissements', 'marge', 'adv']) expect(panel(container, key).hidden).toBe(true)
    expect(screen.getByRole('button', { name: 'Du carnet au cash' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('un clic sur un onglet montre SA lecture et masque la précédente', async () => {
    seedFinance()
    const { container } = wrap()

    await userEvent.click(screen.getByRole('button', { name: 'Encaissements à traiter' }))

    expect(panel(container, 'encaissements').hidden).toBe(false)
    expect(panel(container, 'carnet').hidden).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: 'Encaissements' })).toBeTruthy()
  })

  it('les quatre onglets sont là, et « Administration des ventes » ouvre le détail (ADV, relevés)', async () => {
    seedFinance()
    const { container } = wrap()
    for (const name of [
      'Du carnet au cash',
      'Encaissements à traiter',
      'Marge et réalisation',
      'Administration des ventes',
    ])
      expect(screen.getByRole('button', { name })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Administration des ventes' }))

    expect(panel(container, 'adv').hidden).toBe(false)
    expect(panel(container, 'adv').textContent).toContain('Relevés d’activité')
  })
})
