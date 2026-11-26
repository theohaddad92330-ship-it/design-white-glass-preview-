import type { ProjectReadRow } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { QualificationLeadsQueue } from './QualificationLeadsQueue'

/**
 * #2172 — LA FILE, RENDUE.
 *
 * La dérivation est testée à part (`qualificationLeads.test.ts`). Ce qui se
 * garde ICI est ce qu'un test de modèle ne voit pas : que l'écran DIT que rien
 * n'est confirmé, que chaque chiffre du résumé ouvre sa liste, qu'un rang sans
 * assez d'axes n'écrit pas « 0 », et qu'un écartement part avec son motif.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

// #3679 reste — « Préparer l'approche » ouvre le composer existant, pas la
// préparation de conversion : même double mock que `AccountMissions.test.tsx`.
const contactsState = vi.hoisted(() => ({
  value: [] as Array<{ id: string; full_name: string; title: string | null }>,
}))
vi.mock('@/features/contacts/hooks/useContactsByAccount', () => ({
  useContactsByAccount: () => ({ data: contactsState.value, isLoading: false }),
}))

const openEngagement = vi.hoisted(() => vi.fn())
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

const row = (over: Partial<ProjectReadRow>): ProjectReadRow =>
  ({
    account_id: 'acc-1',
    company_name: 'Transports Aurignac',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'signal',
    label: 'Ouverture d’un second entrepôt automatisé',
    detail: null,
    offer: null,
    source: 'Communiqué de presse',
    confidence: null,
    urgency: null,
    stage: 'detected',
    stage_entered_at: '2026-09-03T00:00:00.000Z',
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    id: 'lead-1',
    ...over,
  }) as ProjectReadRow

type Decision = {
  lead_key: string
  decision: 'dismissed' | 'snoozed'
  reason: string | null
  note: string | null
  decided_at: string
  snoozed_until: string | null
}

function render(
  rows: ProjectReadRow[],
  decisions: Decision[] = [],
  contactCount = 0,
  ownDomainCodes: readonly string[] = [],
  onOpenTab: (tab: 'overview' | 'contacts', contactSeed?: string) => void = () => {},
) {
  // ⚠️ Défensif : `renderWithRouter` monte une racine qui appelle `apiFetch`
  // pour d'autres écrans. Un aiguillage qui suppose la forme de l'argument
  // tombe sur le premier appel étranger, et le test rougit pour une raison qui
  // n'est pas la sienne.
  mockFetch.mockImplementation((args?: { path?: string; method?: string }) => {
    const path = typeof args?.path === 'string' ? args.path : ''
    if (path.includes('qualification-leads')) return Promise.resolve(decisions)
    if (path.startsWith('/projects')) return Promise.resolve(rows)
    return Promise.resolve({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <QualificationLeadsQueue
        accountId="acc-1"
        contactCount={contactCount}
        ownDomainCodes={ownDomainCodes}
        onOpenTab={onOpenTab}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockFetch.mockReset()
  openEngagement.mockReset()
  contactsState.value = []
})

describe('#2172.2/.3 — l’écran dit ce qu’il est', () => {
  it('annonce que rien n’est confirmé, au-dessus de la file', async () => {
    render([row({})])
    // #4328.1 (call refonte UX 19/10, Théo : « Vérifier. Hypothèse… je ne comprends rien ») — le
    // titre dit CE QUE sont les lignes, en mots du métier ; l'intro dit qu'aucune n'est confirmée.
    expect(await screen.findByText('Projets possibles, à confirmer')).toBeInTheDocument()
    expect(screen.getByText(/Aucun n’est confirmé par le client/)).toBeInTheDocument()
    expect(screen.queryByText(/Hypothèse/)).not.toBeInTheDocument()
  })

  it('se TAIT quand le dossier n’a rien à qualifier — jamais « 0 piste »', async () => {
    render([row({ stage: 'negotiation', kind: 'pain' })])
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByText('Projets possibles, à confirmer')).not.toBeInTheDocument()
  })
})

describe('#3676.6 — la nature de la ligne', () => {
  it('chaque piste se dit « Piste à explorer »', async () => {
    render([row({})])
    expect(await screen.findByTestId('line-nature')).toHaveTextContent('Piste à explorer')
  })
})

// #4433.9 — fiche Accor > Veille affichait « En veille (0) », « Écartées (0) » : une absence ne fait aucune ligne.
describe('#4433.9 — un seau vide ne s’écrit pas « (0) »', () => {
  it('« En veille » et « Écartées » sans piste restent des libellés SEULS ; « À confirmer » garde son compte', async () => {
    render([row({ id: 'lead-1' })])
    expect(await screen.findByText('À confirmer (1)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En veille' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Écartées' })).toBeInTheDocument()
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument()
  })
})

describe('#2172.50/.56 — chaque chiffre ouvre sa liste', () => {
  it('bascule sur les écartées, et nomme ce que les compteurs comptent', async () => {
    const user = userEvent.setup()
    render(
      [row({ id: 'lead-1' }), row({ id: 'lead-2', label: 'Nomination d’un DSI' })],
      [
        {
          lead_key: 'lead-2',
          decision: 'dismissed',
          reason: 'bad_timing',
          note: null,
          decided_at: '2026-09-12T00:00:00.000Z',
          snoozed_until: null,
        },
      ],
    )

    expect(await screen.findByText(/À confirmer \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/projets possibles lus sur ce dossier/)).toBeInTheDocument()
    // La piste écartée n'est PAS dans la file active…
    expect(screen.queryByText('Nomination d’un DSI')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Écartées \(1\)/ }))

    // …mais elle reste consultable, avec son motif et sa date.
    expect(await screen.findByText('Nomination d’un DSI')).toBeInTheDocument()
    expect(screen.getByText(/Motif : Mauvais timing/)).toBeInTheDocument()
  })
})

describe('#2172.13/.20-.25 — ce qu’on ne sait pas est NOMMÉ, jamais « 0 »', () => {
  it('une piste sans date affiche son absence, pas un tiret', async () => {
    render([row({ first_detected_at: '' })])
    expect(await screen.findByText(/Fait non daté/)).toBeInTheDocument()
  })

  // #2692.1 — retour bêta : « corrige la mise en forme ». Mesuré : la ligne dense
  // (logo · niveau de preuve · date · libellé) tient tout son texte muet en
  // `text-xs` (le badge de preuve, la date connue) — sauf l'absence de date, qui
  // rendait à `text-sm` (taille par défaut de `UnknownValue`), la même taille que
  // le LIBELLÉ de la piste. Une ligne qui doit se lire d'un coup d'œil ne peut
  // pas avoir une valeur d'axe deux fois plus grande visuellement que sa voisine
  // datée pour la même position.
  it('#2692.1 — l’absence de date se lit à la taille de la date qu’elle remplace (xs), pas à celle du libellé', async () => {
    render([row({ first_detected_at: '' })])
    const undated = await screen.findByText(/Fait non daté/)
    expect(undated.className).toMatch(/\btext-xs\b/)
    expect(undated.className).not.toMatch(/\btext-sm\b/)
  })

  it('#3679 — plus de « Pourquoi ce rang ? » ni de menu à huit gestes dans la liste', async () => {
    render([row({})])
    await screen.findByText('Ouverture d’un second entrepôt automatisé')

    expect(screen.queryByRole('button', { name: 'Pourquoi ce rang ?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Que faire de cette piste ?' })).not.toBeInTheDocument()
    // Le rang trie, il ne s'expose pas : ni axes, ni « non mesuré ».
    expect(screen.queryByText(/Adéquation avec l’offre/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Non évalué|Non mesuré/i)).not.toBeInTheDocument()
  })

  it('#3679 — une piste sans interlocuteur propose « Identifier le responsable » et y mène', async () => {
    const user = userEvent.setup()
    const onOpenTab = vi.fn()
    mockFetch.mockImplementation(() => Promise.resolve([row({})]))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithRouter(
      <QueryClientProvider client={client}>
        <QualificationLeadsQueue accountId="acc-1" contactCount={0} onOpenTab={onOpenTab} />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Identifier le responsable' }))
    expect(onOpenTab).toHaveBeenCalledWith('contacts')
  })

  // #3678 (recette prod 06/10) — 22 pistes sans rôle montraient « Voir la demande ».
  it('#3678 — une piste SANS rôle nommé propose « Identifier le responsable », même avec des contacts', async () => {
    render([row({})], [], 3)
    expect(await screen.findByRole('button', { name: 'Identifier le responsable' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voir la demande' })).toBeNull()
  })

  // #3683 (recette prod 06/10) — seul « Travailler dans le pipe » (qui écrit) existait.
  it('#3683 — une piste liée à un projet propose « Ouvrir dans le Pipe » (lien, sans écrire)', async () => {
    const user = userEvent.setup()
    render([row({})])
    await user.click(await screen.findByRole('button', { name: 'Autres options' }))
    const link = screen.getByRole('link', { name: 'Ouvrir dans le Pipe' })
    // #3683.6 — l'origine (compte + onglet) voyage dans l'URL, comme sur TabProjects.tsx / TabNeeds.tsx.
    expect(link).toHaveAttribute('href', '/projects/lead-1?from=account&fromId=acc-1&fromTab=veille')
    expect(mockFetch.mock.calls.some(([args]) => (args as { method?: string })?.method === 'POST')).toBe(false)
  })

  it('#3679 — sinon l’action principale est « Voir la demande » et ouvre le détail, sans ligne vide', async () => {
    const user = userEvent.setup()
    // Un rôle nommé ET des contacts : plus rien à identifier (#3678).
    render([row({ source: 'Communiqué de presse', btmmp: { management: 'DSI' } } as Partial<ProjectReadRow>)], [], 3)
    expect(await screen.findByRole('button', { name: 'Voir la demande' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Autres options' }))
    await user.click(screen.getByRole('button', { name: 'Voir le détail' }))

    expect(screen.getByText('Ce sur quoi elle repose :')).toBeInTheDocument()
    // Une absence ne fait aucune ligne dans le détail non plus.
    expect(screen.queryByText(/non mesuré/i)).not.toBeInTheDocument()
  })
})

describe('#3678 — la ligne dit le fait, la réserve, et ce que ça change', () => {
  it('date de DÉTECTION nommée, réserve visible avant dépliage, rien de répété dans le détail', async () => {
    const user = userEvent.setup()
    render([row({})])
    expect(await screen.findByText(/Détectée le/)).toBeInTheDocument()
    expect(screen.getByText(/Réserve : Aucun interlocuteur identifié/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Autres options' }))
    await user.click(screen.getByRole('button', { name: 'Voir le détail' }))
    // La réserve est dite une fois (sur la ligne), pas répétée dans « Ce qui manque ».
    expect(screen.getAllByText(/Aucun interlocuteur identifié/)).toHaveLength(1)
  })

  // #3678.2 (recette démo 10/10) — « Touche ton expertise : esn_it. » : la clé brute du pack.
  it('#3678.2 — l’expertise touchée est un libellé humain, jamais le code du pack', async () => {
    render([row({ primary_domain_code: 'esn_it' })], [], 0, ['esn_it'])
    expect(await screen.findByText(/Touche ton expertise : Informatique et numérique\./)).toBeInTheDocument()
    expect(screen.queryByText(/esn_it/)).not.toBeInTheDocument()
  })

  // #3678.2 — la ligne d'impact porte son intitulé « Ce que ça change », pas une phrase nue.
  it('#3678.2 — la ligne d’impact est introduite par « Ce que ça change »', async () => {
    render([row({ primary_domain_code: 'esn_it' })], [], 0, ['esn_it'])
    expect(await screen.findByText('Ce que ça change')).toBeInTheDocument()
  })

  // #3678.2/.3 (recette R8a, EDF, 14/10) — 1 piste sur 3 seulement portait
  // « Ce que ça change » ; les deux autres (`leadImpact` = `unknown`, aucun
  // domaine d'offre classé sur le signal) n'écrivaient RIEN — une case vide
  // silencieuse. Chaque piste doit porter la ligne, ou dire pourquoi elle
  // manque : jamais un silence qui se confond avec « hors de ton offre ».
  it('#3678.2/.3 — un domaine non classé dit « Ce que ça change » sans jamais rester silencieux', async () => {
    render([row({ primary_domain_code: null })], [], 0, ['esn_it'])
    expect(await screen.findByText('Ce que ça change')).toBeInTheDocument()
    expect(screen.getByText(/pas encore classé/i)).toBeInTheDocument()
    // Ne se confond jamais avec le texte d'un signal réellement hors cible.
    expect(screen.queryByText(/Hors de ton offre connue/)).not.toBeInTheDocument()
  })

  // #3678.6 (recette démo 10/10) — « Réserve » et « À faire » identiques sur 30 pistes = un
  // énoncé unique au-dessus de la liste (GA-26), pas 30 répétitions.
  it('#3678.6 — une réserve et une action IDENTIQUES sur toutes les pistes se disent UNE fois', async () => {
    render([
      row({ id: 'a', label: 'Signal A' }),
      row({ id: 'b', label: 'Signal B' }),
      row({ id: 'c', label: 'Signal C' }),
    ])
    await screen.findByText('Signal A')
    expect(screen.getAllByText(/Réserve : Aucun interlocuteur identifié/)).toHaveLength(1)
    expect(screen.getAllByText(/À faire :/)).toHaveLength(1)
  })

  // #3678.6 (recette G4 11/10, lot RAX) — la liste complète diffère par UNE piste cachée derrière
  // « Voir les N autres » : plus rien n'était regroupé et les 3 pistes AFFICHÉES répétaient chacune
  // la même Réserve / À faire. Le regroupement se juge sur ce qui est affiché.
  it('#3678.6 — les 3 pistes affichées identiques se disent une fois, même si une piste cachée diffère', async () => {
    render(
      [
        row({ id: 'a', label: 'Signal A' }),
        row({ id: 'b', label: 'Signal B' }),
        row({ id: 'c', label: 'Signal C' }),
        row({
          id: 'd',
          label: 'Signal D',
          first_detected_at: '2020-01-01T00:00:00.000Z',
          stage_entered_at: '2020-01-01T00:00:00.000Z',
          updated_at: '2020-01-01T00:00:00.000Z',
          btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'],
        }),
      ],
      [],
      2,
    )
    await screen.findByText('Signal A')
    expect(screen.queryByText('Signal D')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Réserve :/)).toHaveLength(1)
    expect(screen.getAllByText(/À faire :/)).toHaveLength(1)
  })

  it('une affaire ouverte du même domaine → « Ouvrir l’opportunité existante », lien vers elle', async () => {
    render([
      row({ primary_domain_code: 'esn_it' }),
      row({ id: 'opp-9', kind: 'pain', stage: 'negotiation', primary_domain_code: 'esn_it', label: 'Refonte SI' }),
    ])
    const link = await screen.findByRole('link', { name: 'Ouvrir l’opportunité existante' })
    // #3683.6 — même origine que « Ouvrir dans le Pipe ».
    expect(link).toHaveAttribute('href', '/projects/opp-9?from=account&fromId=acc-1&fromTab=veille')
  })
})

/**
 * #3679 reste — « Préparer l'approche » ouvrait la préparation de conversion
 * (`ConvertForm`, stage/porteur/objectif/prochaine action) au lieu d'un
 * brouillon de message. Elle ouvre désormais le MÊME composer que
 * `AccountMissions` (#3823.2), avec le contact dont le titre recoupe le rôle.
 */
describe('#3679 reste — « Préparer l’approche » ouvre un brouillon de message, pas la conversion', () => {
  function complet(id = 'a'): ProjectReadRow {
    return row({
      id,
      offer: 'Refonte SI',
      primary_domain_code: 'esn_it',
      btmmp: { management: 'DSI' } as ProjectReadRow['btmmp'],
    })
  }

  it('un contact dont le titre recoupe le rôle → le composer s’ouvre pour lui, jamais le formulaire de conversion', async () => {
    contactsState.value = [{ id: 'c-1', full_name: 'Inès Haddad', title: 'DSI' }]
    const user = userEvent.setup()
    render([complet()], [], 2, ['esn_it'])
    const button = await screen.findByRole('button', { name: 'Préparer l’approche' })
    await user.click(button)
    expect(openEngagement).toHaveBeenCalledWith([contactsState.value[0]], 'email')
    // Le formulaire de conversion (étape du pipe, porteur, objectif…) ne s’ouvre pas.
    expect(screen.queryByText('Étape de départ')).not.toBeInTheDocument()
  })

  it('sans contact dont le titre recoupe le rôle → ouvre l’onglet Contacts cherché sur le rôle, jamais un contact deviné', async () => {
    contactsState.value = [{ id: 'c-2', full_name: 'Paul Girard', title: 'Responsable achats' }]
    const onOpenTab = vi.fn()
    const user = userEvent.setup()
    render([complet()], [], 2, ['esn_it'], onOpenTab)
    const button = await screen.findByRole('button', { name: 'Préparer l’approche' })
    await user.click(button)
    expect(openEngagement).not.toHaveBeenCalled()
    expect(onOpenTab).toHaveBeenCalledWith('contacts', 'DSI')
  })
})

// #2708.1 (re-mesure 22/09 soir) — le clamp posé directement sur l'item flex
// de la ligne dense ne portait pas (`webkitLineClamp` = "none" en prod, sur
// les 18 lignes). jsdom ne rend aucun pixel (GA-385 le documente déjà) : ce
// test ne peut donc pas voir la hauteur réelle, seulement que la balise porte
// bien sa classe de troncature ET son repli — la preuve de HAUTEUR reste une
// mesure ÉCRAN, en recette.
describe('#2708.1 — un libellé sans borne de longueur porte sa classe de clamp et son repli', () => {
  it('un libellé de 469 caractères porte line-clamp-2 et son title intégral', async () => {
    const longLabel =
      "L'activité omnicanale nécessite une refonte du système d'information pour synchroniser les stocks entre points de vente physiques et plateformes de vente en ligne, avec un chantier d'intégration estimé à plusieurs mois et une équipe dédiée côté direction des systèmes d'information, actuellement en phase de cadrage budgétaire avant lancement officiel du programme prévu pour le prochain exercice fiscal selon la communication interne, confirmée en comité de direction."
    expect(longLabel).toHaveLength(469)

    render([row({ label: longLabel })])

    const rendered = await screen.findByText(longLabel)
    expect(rendered.className).toMatch(/\bline-clamp-2\b/)
    expect(rendered.getAttribute('title')).toBe(longLabel)
  })
})

describe('#2172.42-.49/.54 — écarter dit jusqu’où ça porte', () => {
  it('exige un motif, puis envoie la décision avec sa portée d’espace', async () => {
    const user = userEvent.setup()
    render([row({})])

    await user.click(await screen.findByRole('button', { name: 'Autres options' }))
    await user.click(screen.getByRole('button', { name: 'Écarter' }))

    // Sans motif, le geste ne part pas : « écartée sans raison » ne se relit pas.
    const confirm = screen.getAllByRole('button', { name: 'Écarter' }).at(-1)
    expect(confirm).toBeDisabled()
    expect(screen.getByText(/n’écrit rien dans la donnée marché/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pas d’accès' }))
    await user.click(screen.getAllByRole('button', { name: 'Écarter' }).at(-1) as HTMLElement)

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          body: { decision: 'dismissed', reason: 'no_access', note: null },
        }),
      ),
    )
    // ⚠️ Aucune portée n'est envoyée par l'écran : elle est POSÉE par l'API.
    const call = mockFetch.mock.calls.find(args => args[0]?.method === 'POST')
    expect(call?.[0]?.body).not.toHaveProperty('scope')
  })
})

describe('#3499 — chaque piste dit d’où elle vient et quoi faire ; trois d’abord', () => {
  it('nomme la source et la prochaine vérification', async () => {
    render([row({})])
    expect(await screen.findByText(/D’où ça vient : Communiqué de presse/)).toBeInTheDocument()
    expect(screen.getByText(/À faire :/)).toBeInTheDocument()
  })

  it('montre les trois premières, le reste derrière « Voir les N autres »', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 5 }, (_, index) => row({ id: `lead-${index}`, label: `Signal numéro ${index}` }))
    render(rows)
    expect(await screen.findAllByText(/^Signal numéro/)).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Voir les 2 autres projets' }))
    expect(screen.getAllByText(/^Signal numéro/)).toHaveLength(5)
  })
})

/**
 * #3680.6 (reste, épopée #3777) — le chiffre du filtre (« À confirmer (N) »)
 * et la liste tronquée à trois ne doivent jamais se lire comme deux comptes
 * qui se contredisent : même convention que WatchOverviewStats (#3680.2).
 */
describe('#3680.6 — filtre et liste tronquée ne se contredisent jamais', () => {
  it('liste tronquée → « X affichées sur Y » apparaît, et disparaît une fois tout affiché', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 5 }, (_, index) => row({ id: `lead-${index}`, label: `Signal numéro ${index}` }))
    render(rows)
    expect(await screen.findByText('3 affichés sur 5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Voir les 2 autres projets' }))
    expect(screen.queryByText('3 affichés sur 5')).not.toBeInTheDocument()
  })

  it('liste non tronquée (≤ 3 pistes) → aucun « affichées sur », rien à désambiguïser', async () => {
    render([row({ id: 'lead-1' }), row({ id: 'lead-2' })])
    await screen.findByText('Projets possibles, à confirmer')
    expect(screen.queryByText(/affichés sur/)).not.toBeInTheDocument()
  })
})

// #3678.2 (recette G5, prod c88361b4ba) — « Ce que ça change » : 0 occurrence en démo SNCF alors que
// RAQ/RAX étaient servis. Les lignes ont la FORME de `detectedSignals` (demo-dataset.ts) : 6 signaux,
// dont 3 seulement portent un domaine (esn_it ×2, finance ×1) ; source 'signal'.
describe('#3678.2 — forme de donnée SNCF (démo)', () => {
  const sncf = (id: string, label: string, daysAgo: number, domain?: 'esn_it' | 'finance') =>
    row({
      id,
      label,
      source: 'signal',
      first_detected_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      stage_entered_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      primary_domain_code: domain ?? null,
    })
  const rows = [
    sncf('s1', 'Poste ouvert — exploitation des systèmes temps réel', 12),
    sncf('s2', 'Gouvernance numérique recomposée par entités', 29),
    sncf('s3', 'Poste ouvert — ingénieur plateforme data', 9, 'esn_it'),
    sncf('s4', 'Résilience numérique — opérateur d’importance vitale', 17, 'esn_it'),
    sncf('s5', 'Le dossier du compte décrit un groupe piloté par entités', 4),
    sncf('s6', 'Refonte de la politique de trésorerie groupe', 21, 'finance'),
  ]

  it('affiche « Ce que ça change » sur les pistes affichées, profil esn_it connu', async () => {
    render(rows, [], 5, ['esn_it'])
    await screen.findByText('Projets possibles, à confirmer')
    expect(screen.getAllByText('Ce que ça change').length).toBeGreaterThan(0)
  })
})

describe('#4329.1 — le seuil de preuve : sans source datée, un projet possible est REPLIÉ', () => {
  it('en tête : les projets à source datée ; replié : les autres, comptés et atteignables', async () => {
    const user = userEvent.setup()
    render([
      row({ id: 'proven', label: 'Ambition 2026 — modernisation du SI' }),
      row({ id: 'generic-1', source: null, label: 'Cette activité implique des systèmes critiques' }),
      row({ id: 'generic-2', source: null, label: 'Cette activité implique des données sensibles' }),
    ])
    expect(await screen.findByText('Ambition 2026 — modernisation du SI')).toBeVisible()
    const folded = screen.getByTestId('leads-unproven')
    expect(folded).not.toHaveAttribute('open')
    expect(screen.getByText('2 projets possibles sans source datée')).toBeInTheDocument()
    expect(screen.getByText('Cette activité implique des systèmes critiques')).not.toBeVisible()
    await user.click(screen.getByText('2 projets possibles sans source datée'))
    expect(folded).toHaveAttribute('open')
    expect(screen.getByText('Cette activité implique des systèmes critiques')).toBeVisible()
  })

  it('le compteur du filtre compte TOUTES les pistes actives (rien ne disparaît des comptes)', async () => {
    render([row({ id: 'proven' }), row({ id: 'generic', source: null, label: 'Généralité sectorielle' })])
    expect(await screen.findByText('À confirmer (2)')).toBeInTheDocument()
  })

  it('aucun repli quand toutes passent le seuil — jamais « 0 projet sans source »', async () => {
    render([row({ id: 'proven' })])
    await screen.findByText('Projets possibles, à confirmer')
    expect(screen.queryByTestId('leads-unproven')).not.toBeInTheDocument()
  })

  it('aucune ne passe le seuil : une phrase le dit, les pistes restent repliées dessous', async () => {
    render([row({ id: 'generic', source: null, label: 'Généralité sectorielle' })])
    expect(await screen.findByText('Aucun projet possible ne repose encore sur une source datée.')).toBeInTheDocument()
    expect(screen.getByText('1 projet possible sans source datée')).toBeInTheDocument()
  })
})
