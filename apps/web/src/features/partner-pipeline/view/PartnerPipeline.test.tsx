import type React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PARTNER_GOVERNANCE_DIMENSIONS as GOVERNANCE_DIMENSIONS } from '@bellum/contracts'
import { chooseOption, selectedValue } from '@/test/select'

const fetchPartnerRelations = vi.fn()
const fetchEsnOnMyAccounts = vi.fn()
const fetchPartnerProfileMatches = vi.fn()
const setPartnerStage = vi.fn()
const setPartnerNonSolicitation = vi.fn()
const createPartnerRelation = vi.fn()
const updatePartnerGovernance = vi.fn()
const useEsnProfile = vi.fn()
const fetchPartnerCvPushes = vi.fn()
const preparePartnerCvPush = vi.fn()
const declarePartnerCvPushSent = vi.fn()
const recordPartnerCvPushOutcome = vi.fn()

vi.mock('../api/partner-pipeline-api', () => ({
  PARTNER_PIPELINE_KEY: ['partners', 'pipeline'],
  PARTNER_ON_ACCOUNTS_KEY: ['partners', 'on-my-accounts'],
  partnerProfileMatchesKey: (zones: string[]) => ['partners', 'profile-matches', [...zones].sort()],
  partnerCvPushesKey: (id: string) => ['partners', id, 'cv-pushes'],
  fetchPartnerRelations: () => fetchPartnerRelations(),
  fetchEsnOnMyAccounts: () => fetchEsnOnMyAccounts(),
  fetchPartnerProfileMatches: () => fetchPartnerProfileMatches(),
  setPartnerStage: (id: string, stage: string) => setPartnerStage(id, stage),
  setPartnerNonSolicitation: (id: string, value: boolean | null) => setPartnerNonSolicitation(id, value),
  createPartnerRelation: (input: unknown) => createPartnerRelation(input),
  updatePartnerGovernance: (id: string, patch: unknown) => updatePartnerGovernance(id, patch),
  fetchPartnerCvPushes: (id: string) => fetchPartnerCvPushes(id),
  preparePartnerCvPush: (partnerId: string, consultantId: string) => preparePartnerCvPush(partnerId, consultantId),
  declarePartnerCvPushSent: (partnerId: string, pushId: string) => declarePartnerCvPushSent(partnerId, pushId),
  recordPartnerCvPushOutcome: (partnerId: string, pushId: string, outcome: string) =>
    recordPartnerCvPushOutcome(partnerId, pushId, outcome),
}))

vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => useEsnProfile(),
}))

vi.mock('@/features/consultants/api', () => ({
  consultantsApi: { list: () => Promise.resolve([]) },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { PartnerPipeline } = await import('./PartnerPipeline')

/** Les deux axes que rien ne peut nourrir, tels que l'API les nomme. */
const notCollected = [
  { axis: 'marge', why: 'Aucune mission n’est rattachable à un partenaire précis : le canal est une catégorie.' },
  { axis: 'acces', why: 'Rien n’enregistre qu’un partenaire nous a ouvert un compte que nous n’avions pas.' },
]

function relation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    siren: null,
    name: 'Astréa Conseil',
    stage: 'flux_actif',
    roles: ['client'],
    contactName: null,
    notes: null,
    needsReceived90d: 7,
    needsGiven90d: 2,
    placementsActive: 3,
    placementsTotal: 6,
    lastActivityAt: null,
    nonSolicitation: null,
    notCollected,
    score: {
      score: 62,
      scoreMax: 55,
      axes: [
        { axis: 'volume', points: 14, max: 25, evidence: '7 besoin(s) confié(s) sur douze mois' },
        { axis: 'fiabilite', points: 10, max: 20, evidence: '3 mission(s) menée(s) à terme sur 6' },
        { axis: 'marge', points: null, max: 20, evidence: 'Marge non connue' },
        { axis: 'acces', points: null, max: 25, evidence: 'Comptes ouverts par ce partenaire non recensés' },
        { axis: 'reciprocite', points: 4, max: 10, evidence: '2 besoin(s) confié(s) en retour' },
      ],
      unmeasured: ['marge', 'acces'],
      reason: null,
      recommendation: 'maintenir',
      rank1Blocked: 'Ce partenaire est aussi notre client — on ne le contourne pas.',
      ...(overrides['score'] as Record<string, unknown> | undefined),
    },
    // #3270 — une relation par défaut n'a RIEN de cadré : c'est l'état réel
    // de toute ligne créée avant ce lot (deploy-skew), et le risque bloquant
    // qui en découle honnêtement.
    governanceStatus: 'observed',
    governanceReadiness: {
      framed: [],
      missing: GOVERNANCE_DIMENSIONS,
      risk: 'blocking',
      accountsConcerned: [],
      profilesConcerned: [],
      nextValidation: 'accounts_accessible',
    },
    ...overrides,
  }
}

/** Rend l'écran ET attend que la liste soit là. Sans cette attente, une
 *  assertion synchrone lirait un écran encore vide et passerait — ou
 *  échouerait — pour une raison qui n'a rien à voir avec ce qu'elle teste. */
async function look(rows: unknown[]) {
  fetchPartnerRelations.mockResolvedValue(rows)
  fetchEsnOnMyAccounts.mockResolvedValue([])
  useEsnProfile.mockReturnValue({ data: { geo_zones: [] } })
  fetchPartnerProfileMatches.mockResolvedValue({ status: 'no_geo_signal', reason: 'unset', geoZones: [], matches: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PartnerPipeline />
    </QueryClientProvider>,
  )
  await screen.findByText('Astréa Conseil')
}

/** Le même rendu, mais sans exiger de ligne : l'ajout doit être atteignable
 *  quand la liste est VIDE — c'est même le seul moment où elle l'est. */
async function lookAtEmpty() {
  fetchPartnerRelations.mockResolvedValue([])
  fetchEsnOnMyAccounts.mockResolvedValue([])
  useEsnProfile.mockReturnValue({ data: { geo_zones: [] } })
  fetchPartnerProfileMatches.mockResolvedValue({ status: 'no_geo_signal', reason: 'unset', geoZones: [], matches: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PartnerPipeline />
    </QueryClientProvider>,
  )
  await screen.findByText(/Aucun partenaire enregistré/)
}

describe('l’écran Partenaires — un score n’est jamais nu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ne montre plus une note seule : ses axes sont là, avec leur dénominateur réel', async () => {
    await look([relation()])
    // Le dénominateur RÉEL : 55, pas 100. Les deux axes non mesurés sont
    // SORTIS du calcul — l'afficher sur 100 mesurerait la complétude de nos
    // données et pas la qualité du partenaire.
    expect(await screen.findByText(/62/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /axes/i }))
    expect(screen.getByText(/7 besoin\(s\) confié\(s\) sur douze mois/)).toBeInTheDocument()
  })

  // #2374.7 — recette écran 27/09 : « suivi partenaire » restait bloqué car
  // le contact de la relation, déjà rendu par l'API (`PartnerRelationView
  // .contactName`, `partner-pipeline.service.ts:148`), n'avait AUCUN rendu
  // sur cet écran — `RelationCard` (le type de la carte) ne le portait même
  // pas, donc TypeScript le laissait tomber en silence avant même le JSX.
  // Même défaut de forme que #1428 (compteurs de placement) juste au-dessus.
  it('nomme le contact de la relation quand l’espace le connaît (#2374.7)', async () => {
    await look([relation({ contactName: 'Julie Perrin' })])
    expect(await screen.findByText(/Julie Perrin/)).toBeInTheDocument()
  })

  it('n’invente aucun contact quand l’espace ne le connaît pas (#2374.7)', async () => {
    await look([relation({ contactName: null })])
    await screen.findByText('Astréa Conseil')
    expect(screen.queryByText('Julie Perrin')).not.toBeInTheDocument()
  })

  it('NOMME les deux axes que personne ne peut renseigner, et dit pourquoi', async () => {
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /axes/i }))
    // « Non collecté » et « pas encore mesuré » ne mènent pas au même geste :
    // le premier demande de construire une collecte, le second d'attendre.
    expect(screen.getByText(/Aucune mission n’est rattachable à un partenaire précis/)).toBeInTheDocument()
    expect(screen.getByText(/Rien n’enregistre qu’un partenaire nous a ouvert un compte/)).toBeInTheDocument()
  })

  /**
   * #1319.4 — « au minimum une ligne de lecture visuelle des axes évalués ».
   */
  it('donne une barre aux axes MESURÉS, et à eux seuls (#1319.4)', async () => {
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /axes/i }))

    // Trois axes mesurés sur cinq : volume 14/25, fiabilité 10/20,
    // réciprocité 4/10.
    expect(screen.getByRole('img', { name: /14 sur 25/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /10 sur 20/ })).toBeInTheDocument()

    // La garde sait dire NON : une barre vide sous un axe NON évaluable le
    // peindrait à zéro — exactement le contraire de ce que la carte dit à côté.
    //
    // ⚠️ Le nom est ANCRÉ : `/0 sur 20/` attrapait « 1(0 sur 20) », donc la
    // barre d'un axe bel et bien mesuré. Un test qui échoue sur la bonne
    // valeur ne garde rien.
    expect(screen.queryByRole('img', { name: 'Marge : 0 sur 20' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Accès : 0 sur 25' })).not.toBeInTheDocument()
    // Cinq axes, trois barres : les deux non évaluables n'en ont aucune.
    expect(screen.getAllByRole('img', { name: / sur / })).toHaveLength(3)
  })

  /**
   * #1319.5 — « les tags sont utiles, mais posés sans mise en scène ».
   */
  it('affirme l’étape COURANTE et relègue les autres derrière une commande (#1319.5)', async () => {
    await look([relation()])

    expect(await screen.findByText('Étape : Flux actif')).toBeInTheDocument()
    // Huit boutons alignés donnaient huit fois le même poids : l'étape
    // courante, qui est l'INFORMATION, se lisait comme les sept gestes.
    expect(screen.queryByRole('button', { name: 'Dormant' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Changer d’étape' }))

    // Reléguer n'est pas retirer : les sept autres restent atteignables — un
    // retour en arrière est un geste légitime.
    expect(screen.getByRole('button', { name: 'Dormant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Identifié' })).toBeInTheDocument()
    // Sauf l'étape courante, qui n'est pas un geste vers elle-même.
    expect(screen.queryByRole('button', { name: 'Flux actif' })).not.toBeInTheDocument()
  })

  it('DIT la garde dure qui bloque « viser le rang 1 »', async () => {
    await look([relation()])
    expect(await screen.findByText(/on ne le contourne pas/)).toBeInTheDocument()
  })

  it('« non déclarée » est l’état de départ, et il se voit', async () => {
    await look([relation({ nonSolicitation: null })])
    expect(await selectedValue(await screen.findByRole('combobox', { name: /non-sollicitation/i }))).toBe('unknown')
  })

  it('« pas de clause » est un état DIFFÉRENT — il a été déclaré', async () => {
    // Les deux n'autorisent pas le même geste : l'un dit « va vérifier avant de
    // contourner », l'autre dit « quelqu'un a vérifié, tu peux ».
    await look([relation({ nonSolicitation: false })])
    expect(await selectedValue(await screen.findByRole('combobox', { name: /non-sollicitation/i }))).toBe('no')
  })

  it('enregistre la déclaration de clause', async () => {
    setPartnerNonSolicitation.mockResolvedValue(relation({ nonSolicitation: true }))
    await look([relation()])
    await chooseOption(await screen.findByRole('combobox', { name: /non-sollicitation/i }), 'yes')
    await waitFor(() => expect(setPartnerNonSolicitation).toHaveBeenCalledWith('p1', true))
  })

  it('n’invente aucun score sur une relation sans histoire', async () => {
    await look([
      relation({
        placementsTotal: 1,
        score: {
          score: null,
          scoreMax: 0,
          axes: [],
          unmeasured: ['volume', 'fiabilite', 'marge', 'acces', 'reciprocite'],
          reason: 'Pas encore assez d’historique — 1 placement(s) sur les 3 nécessaires.',
          recommendation: null,
          rank1Blocked: null,
        },
      }),
    ])
    const reason = await screen.findByText(/Pas encore assez d’historique/)
    expect(reason).toBeInTheDocument()
    /* ⚠️ L'assertion porte sur LA CARTE, plus sur l'écran entier.
       Elle balayait tout le document, ce qui était juste tant que l'écran ne
       contenait que des cartes. Le bandeau de synthèse (#1431) y a ajouté le
       compte de chaque étape, zéros compris — et ces zéros-là sont MESURÉS :
       « aucun cadre signé » est précisément l'information qu'un dirigeant vient
       chercher, alors que le « 0 » d'un compteur que personne n'écrit est un
       mensonge (`partnerFlow.ts`). Deux zéros de natures opposées : la garde
       doit viser celui qu'elle protège. */
    const card = (reason.closest('[data-slot="card"]') as HTMLElement | null) ?? reason.parentElement!
    expect(within(card).queryByText(/^0/)).not.toBeInTheDocument()
  })
})

/**
 * #3270 (BEL-SC-241) — PARTNER READINESS : le statut, ce qui manque, et la
 * prochaine validation — jamais un score nu (doctrine).
 */
describe('l’écran Partenaires — PARTNER READINESS (#3270)', () => {
  it('une relation neuve affiche « Observé » et nomme la prochaine validation', async () => {
    await look([relation()])
    expect(screen.getByText('Observé')).toBeInTheDocument()
    expect(screen.getByText(/Prochaine validation : Comptes accessibles/)).toBeInTheDocument()
  })

  it('déplie la liste NOMMÉE de ce qui manque, sur un clic', async () => {
    const user = userEvent.setup()
    await look([relation()])
    await user.click(screen.getByRole('button', { name: /Voir ce qui manque/ }))
    expect(screen.getByText('Marge plancher')).toBeInTheDocument()
    expect(screen.getByText('Non-contournement')).toBeInTheDocument()
  })

  it('un cadre complet affiche « Actif » et ne propose aucune validation restante', async () => {
    await look([
      relation({
        governanceStatus: 'active',
        governanceReadiness: {
          framed: [...GOVERNANCE_DIMENSIONS],
          missing: [],
          risk: 'none',
          accountsConcerned: ['Société Générale'],
          profilesConcerned: ['Data engineer senior'],
          nextValidation: null,
        },
      }),
    ])
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.queryByText(/Prochaine validation/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Voir ce qui manque/ })).not.toBeInTheDocument()
  })
})

/**
 * #3397.3 (LOT C06 30/09, beta-feedback) — « Qualifier la route rang 2 »
 * ouvre CETTE relation, jamais la liste nue.
 */
describe('l’écran Partenaires — arrivée depuis Laura (#3397.3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('un `highlightPartnerId` qui matche une relation ouvre déjà son formulaire de cadre', async () => {
    fetchPartnerRelations.mockResolvedValue([relation({ id: 'p1' }), relation({ id: 'p2', name: 'Kelia' })])
    fetchEsnOnMyAccounts.mockResolvedValue([])
    useEsnProfile.mockReturnValue({ data: { geo_zones: [] } })
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'no_geo_signal',
      reason: 'unset',
      geoZones: [],
      matches: [],
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <PartnerPipeline highlightPartnerId="p1" />
      </QueryClientProvider>,
    )
    await screen.findByText('Astréa Conseil')
    expect(screen.getByRole('dialog', { name: /Astréa Conseil/ })).toBeInTheDocument()
  })

  it('sans `highlightPartnerId`, aucun formulaire de cadre ne s’ouvre tout seul', async () => {
    await look([relation()])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

/**
 * recette 10/09 (#1799 résidu) — LA PHRASE-RÈGLE SE DIT UNE FOIS POUR LA LISTE.
 *
 * Mesuré en production : 7 partenaires sans histoire répétaient chacun le même
 * paragraphe de 45 mots. La phrase est JUSTE — elle explique une RÈGLE, pas un
 * fait de ce partenaire précis, et c'est la seule chose qui empêche de lire un
 * tiret comme un zéro. Elle n'est donc jamais SUPPRIMÉE : elle DÉMÉNAGE, une
 * fois, au-dessus de la liste. Chaque carte garde un état court.
 *
 * ⚠️ `partnerFlow` rend `uncounted` pour TOUT LE MONDE tant qu'aucun chemin
 * n'écrit les quatre compteurs (`partnerFlow.ts`) — la répétition n'était donc
 * pas un cas limite, c'était le cas NOMINAL.
 */
describe('l’écran Partenaires — la règle « non compté » se dit une fois, pas par carte', () => {
  const uncounted = { needsReceived90d: 0, needsGiven90d: 0, placementsActive: 0, placementsTotal: 0 }

  it('deux partenaires SANS HISTOIRE : l’explication complète apparaît UNE SEULE FOIS', async () => {
    await look([
      relation({ id: 'p1', name: 'Astréa Conseil', ...uncounted }),
      relation({ id: 'p2', name: 'Sopra', ...uncounted }),
    ])

    expect(await screen.findAllByText(/Personne ne compte encore les échanges/)).toHaveLength(1)
    // Chaque carte garde néanmoins un état, sans le paragraphe entier.
    expect(screen.getAllByText('Non mesuré')).toHaveLength(2)
  })

  it('trois partenaires tous non comptés : toujours UNE seule explication', async () => {
    await look([
      relation({ id: 'p1', name: 'Astréa Conseil', ...uncounted }),
      relation({ id: 'p2', name: 'Klanik', ...uncounted }),
      relation({ id: 'p3', name: 'Talan', ...uncounted }),
    ])
    expect(await screen.findByText('Klanik')).toBeInTheDocument()
    expect(screen.getByText('Talan')).toBeInTheDocument()

    expect(screen.getAllByText(/Personne ne compte encore les échanges avec ce partenaire/)).toHaveLength(1)
  })

  it('ne s’affiche PAS quand aucun partenaire visible n’est sans histoire', async () => {
    await look([relation({ id: 'p1', name: 'Astréa Conseil' })])

    expect(screen.queryByText(/Personne ne compte encore les échanges/)).not.toBeInTheDocument()
  })
})

describe('l’écran Partenaires — le bandeau de synthèse (#1431)', () => {
  it('compte par ÉTAPE, dit son dénominateur, et filtre la liste', async () => {
    await look([
      // `look` attend « Astréa Conseil » : la relation par défaut reste dans
      // le lot, sinon l'attente expire pour une raison sans rapport.
      relation({ id: 'p1', stage: 'flux_actif' }),
      relation({ id: 'p2', name: 'Sopra', stage: 'dormant' }),
      relation({ id: 'p3', name: 'Devoteam', stage: 'dormant' }),
    ])

    // Le dénominateur est écrit : `GET /partners` n'est pas paginé, ce total
    // est celui de l'espace et non celui d'une page.
    expect(await screen.findByText(/3 partenaires enregistrés/)).toBeInTheDocument()

    const dormant = await screen.findByRole('button', { name: /Dormant\s*2/ })
    await userEvent.click(dormant)

    expect(dormant).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Astréa Conseil')).not.toBeInTheDocument()
    expect(screen.getByText('Sopra')).toBeInTheDocument()
    expect(screen.getByText('Devoteam')).toBeInTheDocument()

    // Re-cliquer la pastille rend la liste entière : un filtre qu'on ne peut
    // pas retirer est un cul-de-sac.
    await userEvent.click(dormant)
    expect(await screen.findByText('Astréa Conseil')).toBeInTheDocument()
  })

  it('affiche une étape à zéro, désactivée — « aucun cadre signé » est une information', async () => {
    await look([relation({ stage: 'flux_actif' })])
    expect(await screen.findByRole('button', { name: /Cadre signé\s*0/ })).toBeDisabled()
  })
})

/**
 * AJOUTER un partenaire (Louis, 01/09/2026).
 *
 * `POST /partners` existait, gardé par `records:write`, testé côté service — et
 * aucun écran ne l'appelait. La liste ne se remplissait donc que par ce que
 * l'analyse détectait : « un partenaire, c'est une ESN à qui tu confies des
 * besoins » se lisait sur un écran où on ne pouvait en déclarer aucune.
 */
describe('l’écran Partenaires — déclarer une relation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offre l’ajout LÀ OÙ la liste est vide — c’est là que la question se pose', async () => {
    await lookAtEmpty()
    expect(screen.getByRole('button', { name: /Ajouter un partenaire/i })).toBeInTheDocument()
  })

  it('enregistre le nom, le rôle et l’étape saisis', async () => {
    createPartnerRelation.mockResolvedValue(relation({ id: 'p2', name: 'Klanik' }))
    await lookAtEmpty()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter un partenaire/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /Nom de l’ESN/i }), 'Klanik')
    await chooseOption(screen.getByRole('combobox', { name: /Rôle/i }), 'fournisseur')
    await chooseOption(screen.getByRole('combobox', { name: /Étape/i }), 'contacte')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() =>
      expect(createPartnerRelation).toHaveBeenCalledWith({
        name: 'Klanik',
        roles: ['fournisseur'],
        stage: 'contacte',
      }),
    )
  })

  it('n’envoie rien sans nom — une relation sans nom ne désigne personne', async () => {
    await lookAtEmpty()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter un partenaire/i }))
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/i }))

    expect(createPartnerRelation).not.toHaveBeenCalled()
  })

  it('referme la saisie une fois la relation créée', async () => {
    createPartnerRelation.mockResolvedValue(relation({ id: 'p2', name: 'Klanik' }))
    await lookAtEmpty()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter un partenaire/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /Nom de l’ESN/i }), 'Klanik')
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Nom de l’ESN/i })).toBeNull())
  })
})

/**
 * #1798 — « juste le listing des ESN qui collent avec le profil, ne plus
 * passer par le territoire ». Le calcul ne part QUE quand l'onglet s'ouvre
 * (c'est la borne de coût posée côté écran) et NOMME pourquoi il est vide
 * plutôt que de rendre un silence — la même règle que « non mesuré n'est
 * jamais 0 » appliquée à une liste.
 */
describe('l’écran Partenaires — À découvrir (#1798)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ne calcule RIEN tant que l’onglet n’est pas ouvert — c’est la borne de coût', async () => {
    await look([relation()])
    expect(fetchPartnerProfileMatches).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))
    await waitFor(() => expect(fetchPartnerProfileMatches).toHaveBeenCalledTimes(1))
  })

  it('NOMME la cause quand aucune zone n’est déclarée — jamais un silence', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'no_geo_signal',
      reason: 'unset',
      geoZones: [],
      matches: [],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))

    expect(await screen.findByText(/profil ne précise pas encore de zone/)).toBeInTheDocument()
  })

  it('NOMME la cause quand les zones ne désignent aucun territoire précis', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'no_geo_signal',
      reason: 'unmappable',
      geoZones: ['International'],
      matches: [],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))

    expect(await screen.findByText(/International/)).toBeInTheDocument()
  })

  it('liste les ESN dont le siège tombe dans la zone du profil, avec un chemin d’analyse', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'matched',
      reason: null,
      geoZones: ['Lyon & Auvergne-Rhône-Alpes'],
      matches: [{ name: 'Klanik', city: 'Lyon', department: '69', sizeClass: 'pme', openToSubcontracting: 'oui' }],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))

    expect(await screen.findByText('Klanik')).toBeInTheDocument()
    expect(screen.getByText('Lyon (69)')).toBeInTheDocument()
    expect(screen.getByText('ouverte à la sous-traitance')).toBeInTheDocument()
    // Le mock de `Link` (haut de fichier) ne relaie ni `search` ni
    // `aria-label` — seul `href` est vérifiable ici, comme pour les autres
    // liens « Analyser » de cet écran.
    const analyse = screen.getByRole('link', { name: 'Analyser cette ESN' })
    expect(analyse).toHaveAttribute('href', '/search')
  })

  it('dit qu’aucune ESN n’est trouvée dans la zone — pas un écran muet', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'matched',
      reason: null,
      geoZones: ['Lyon & Auvergne-Rhône-Alpes'],
      matches: [],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))

    expect(await screen.findByText(/Aucune ESN du référentiel/)).toBeInTheDocument()
  })

  it('offre TOUJOURS un chemin de recherche plus précise, à la main de l’utilisateur', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'no_geo_signal',
      reason: 'unset',
      geoZones: [],
      matches: [],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))

    // #1823 — le territoire a été FUSIONNÉ dans Découvrir, puis sa lecture en
    // est sortie (#2486, 16/09/2026) : le lien vise toujours Découvrir, mais il
    // ne promet plus ni « l'écran Territoire » ni un rayon, que plus rien ne
    // propose. Il nomme ce que Découvrir filtre vraiment.
    const lien = await screen.findByRole('link', { name: /découvrir/i })
    expect(lien).toHaveAttribute('href', '/discover')
    expect(screen.queryByRole('link', { name: /territoire/i })).toBeNull()
    expect(screen.queryAllByText(/rayon/i)).toHaveLength(0)
    expect(screen.getByText(/département, une région, une ville/i)).toBeInTheDocument()
  })

  it('un geste ACTUALISER relance le calcul — la borne n’est pas un cul-de-sac', async () => {
    await look([relation()])
    fetchPartnerProfileMatches.mockResolvedValue({
      status: 'no_geo_signal',
      reason: 'unset',
      geoZones: [],
      matches: [],
    })

    await userEvent.click(screen.getByRole('tab', { name: 'À découvrir' }))
    await waitFor(() => expect(fetchPartnerProfileMatches).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole('button', { name: /Actualiser/i }))
    await waitFor(() => expect(fetchPartnerProfileMatches).toHaveBeenCalledTimes(2))
  })
})

describe('#2887 (#2371.8) — la revue d’un CV poussé à un partenaire', () => {
  beforeEach(() => vi.clearAllMocks())

  const push = (overrides: Record<string, unknown> = {}) => ({
    id: 'push-1',
    partnerRelationId: 'p1',
    consultantId: 'c1',
    brief: { consultantName: 'Ada Lovelace', title: 'Architecte data', seniority: 'senior', yearsExperience: 9 },
    economics: { tjm: 650, marginSharePct: null },
    status: 'preparee',
    outcome: 'en_attente',
    createdAt: '2026-09-28T10:00:00Z',
    sentDeclaredAt: null,
    ...overrides,
  })

  it('reste replié par défaut — la revue ne charge rien tant que personne ne l’ouvre', async () => {
    await look([relation()])
    expect(fetchPartnerCvPushes).not.toHaveBeenCalled()
  })

  it('affiche le vide à dessein quand personne n’a encore poussé de CV', async () => {
    fetchPartnerCvPushes.mockResolvedValue([])
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /CV proposés à ce partenaire/i }))
    expect(await screen.findByText(/Aucun CV proposé à ce partenaire/i)).toBeInTheDocument()
  })

  it('affiche le brief et le TJM réels, jamais dupliqués, jamais une preuve d’envoi', async () => {
    fetchPartnerCvPushes.mockResolvedValue([push()])
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /CV proposés à ce partenaire/i }))
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/TJM 650/)).toBeInTheDocument()
    expect(screen.getByText('Préparé')).toBeInTheDocument()
    // Un partage non déclaré ne fait AUCUNE ligne (GA-18/GA-19).
    expect(screen.queryByText(/Partage négocié/)).not.toBeInTheDocument()
  })

  it('déclare un envoi — un geste, jamais une preuve technique', async () => {
    fetchPartnerCvPushes.mockResolvedValue([push()])
    declarePartnerCvPushSent.mockResolvedValue(push({ status: 'envoyee_declaree' }))
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /CV proposés à ce partenaire/i }))
    await screen.findByText('Ada Lovelace')

    await userEvent.click(screen.getByRole('button', { name: 'Déclarer envoyé' }))
    await waitFor(() => expect(declarePartnerCvPushSent).toHaveBeenCalledWith('p1', 'push-1'))
  })

  it('propose de préparer une revue pour un consultant choisi', async () => {
    fetchPartnerCvPushes.mockResolvedValue([])
    preparePartnerCvPush.mockResolvedValue(push())
    await look([relation()])
    await userEvent.click(screen.getByRole('button', { name: /CV proposés à ce partenaire/i }))
    await screen.findByText(/Aucun CV proposé à ce partenaire/i)

    expect(screen.getByRole('button', { name: 'Préparer la revue' })).toBeDisabled()
  })
})

describe('l’écran Partenaires — la synthèse par étape accepte plusieurs étapes (refonte Théo)', () => {
  it('deux pastilles actives = la liste de DEUX étapes ; en retirer une élargit sans tout vider', async () => {
    await look([
      relation({ id: 'p1', stage: 'flux_actif' }),
      relation({ id: 'p2', name: 'Sopra', stage: 'dormant' }),
      relation({ id: 'p3', name: 'Devoteam', stage: 'cadre_signe' }),
    ])
    await screen.findByText(/3 partenaires enregistrés/)
    const dormant = await screen.findByRole('button', { name: /Dormant\s*1/ })
    const framed = await screen.findByRole('button', { name: /Cadre signé\s*1/ })
    await userEvent.click(dormant)
    await userEvent.click(framed)
    expect(dormant).toHaveAttribute('aria-pressed', 'true')
    expect(framed).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Sopra')).toBeInTheDocument()
    expect(screen.getByText('Devoteam')).toBeInTheDocument()
    expect(screen.queryByText('Astréa Conseil')).not.toBeInTheDocument()
    await userEvent.click(dormant)
    expect(screen.queryByText('Sopra')).not.toBeInTheDocument()
    expect(screen.getByText('Devoteam')).toBeInTheDocument()
  })

  it('les sous-onglets sont de vrais onglets (rôle tab, un seul sélectionné)', async () => {
    await look([relation({ stage: 'flux_actif' })])
    const tabs = await screen.findAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.filter(tab => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)
  })
})

function renderPipeline() {
  fetchEsnOnMyAccounts.mockResolvedValue([])
  useEsnProfile.mockReturnValue({ data: { geo_zones: [] } })
  fetchPartnerProfileMatches.mockResolvedValue({ status: 'no_geo_signal', reason: 'unset', geoZones: [], matches: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PartnerPipeline />
    </QueryClientProvider>,
  )
}

describe('Partenaires — refonte Théo : onglets comptés et états nommés', () => {
  it('l’onglet « Mes partenaires » dit combien il en porte ; rien quand il n’y en a aucun', async () => {
    fetchPartnerRelations.mockResolvedValue([
      relation({ id: 'p1', name: 'Klanik' }),
      relation({ id: 'p2', name: 'Talan' }),
    ])
    renderPipeline()
    expect(await screen.findByTestId('partners-tab-count-mine')).toHaveTextContent('2')
    expect(screen.queryByTestId('partners-tab-count-discover')).toBeNull()
  })

  it('un échec de lecture se DIT — jamais une liste vide muette', async () => {
    fetchPartnerRelations.mockRejectedValue(new Error('boom'))
    renderPipeline()
    expect(await screen.findByText('Impossible de lire tes partenaires pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText(/Aucun partenaire enregistré/)).toBeNull()
  })
})
