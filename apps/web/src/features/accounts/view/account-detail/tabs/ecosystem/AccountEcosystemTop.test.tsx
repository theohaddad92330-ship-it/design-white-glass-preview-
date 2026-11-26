import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ECOSYSTEM_RELATION_ACTIONS, type Account, type AccountPartner } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { AccountEcosystemTop } from './AccountEcosystemTop'

/**
 * #2122.12-.19 / .33 / .35 / .46 / .48-.52 / .53-.55 / .59 / .62 / .63 — LA TÊTE
 * DE LA SECTION « ÉCOSYSTÈME & ACCÈS », RENDUE.
 *
 * Le modèle est testé à part (`ecosystemRelations.test.ts`). Ce qui se garde
 * ICI est ce qu'un test de modèle ne peut pas voir : que les blocs PROMIS par
 * la section existent, que chaque carte porte son action, que « déduit » est
 * séparé de « sourcé », qu'une divergence s'affiche EN ENTIER, et qu'une
 * correction humaine se voit tout de suite avec son auteur.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}))

const ACCOUNT = { id: 'acc-eco', company_name: 'NOVA LOGISTIQUE' } as Account

function partner(over: Partial<AccountPartner> = {}): AccountPartner {
  return {
    id: 'p1',
    account_id: 'acc-eco',
    entity_id: null,
    name: 'Vertex Systèmes (exemple)',
    rank: 'unknown',
    relationship: 'unknown',
    note: null,
    source: 'analysis',
    placements: 0,
    certainty: 'moyenne',
    scope: null,
    detected_at: '2026-08-20T09:00:00.000Z',
    created_at: '2026-08-20T09:00:00.000Z',
    ...over,
  }
}

function render(partners: AccountPartner[], activeTab: TabId = 'partners') {
  mockFetch.mockResolvedValue({ partners, recommendations: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return renderWithRouter(
    <QueryClientProvider client={client}>
      <AccountEcosystemTop account={ACCOUNT} activeTab={activeTab} onTabChange={onTabChange} />
    </QueryClientProvider>,
  )
}

const onTabChange = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  onTabChange.mockReset()
})

describe('#2122.12-.19 — les blocs que la section promet', () => {
  it('nomme « Lecture rapide » et les trois questions auxquelles la section répond', async () => {
    render([partner({ relationship: 'competitor', detected_at: null, certainty: null })])

    expect(await screen.findByRole('heading', { name: 'Lecture rapide' })).toBeInTheDocument()
    expect(screen.getByText('Qui gravite autour de ce compte')).toBeInTheDocument()
    expect(screen.getByText('Ce que ça change')).toBeInTheDocument()
    expect(screen.getByText('Par où entrer')).toBeInTheDocument()
  })

  // #2122.48 / .52 — le bloc « Actions » ne fait plus partie de la liste : ses
  // deux boutons sont posés SUR chaque relation. Un bloc de section qui répète
  // une action de relation est le doublon de la loi 4 du tome 7.
  it('nomme les blocs « Concurrents ou partenaires possibles » et « Informations à qualifier »', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    expect(await screen.findByRole('heading', { name: 'Concurrents ou partenaires possibles' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Informations à qualifier' })).toBeInTheDocument()
  })
})

describe('#2122.62 — « N relations » et « aucune » lisent la même dérivation', () => {
  it('aucune relation prouvée : la phrase dit « rien de prouvé », jamais « 0 »', async () => {
    render([partner({ relationship: 'competitor', detected_at: null, certainty: null })])

    const lecture = await screen.findByText(/Aucune relation avérée/)
    expect(lecture).toBeInTheDocument()
    expect(screen.queryByText(/0 relation/)).not.toBeInTheDocument()
  })

  it('une relation prouvée : le compte apparaît, et la phrase de négation disparaît', async () => {
    render([partner({ evidence_origins: ['market_observation'], market_observation_count: 6 })])

    expect(await screen.findByText(/1 relation avérée/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune relation avérée/)).not.toBeInTheDocument()
  })
})

describe('#2316.15 — « N observées » ET « aucune actuelle » se réconcilient', () => {
  it('tout est historique : la phrase de réconciliation apparaît', async () => {
    render([partner({ evidence_origins: ['market_observation'], market_observation_count: 6 })])

    expect(await screen.findByText(/Les relations avérées sont historiques/)).toBeInTheDocument()
  })

  it('une relation ACTUELLE : la phrase de réconciliation disparaît', async () => {
    render([partner({ source: 'declared', evidence_origins: ['workspace_declared'] })])

    await screen.findByText(/1 relation avérée/)
    expect(screen.queryByText(/Les relations avérées sont historiques/)).not.toBeInTheDocument()
  })
})

describe('#2122.33 — la déduction est SÉPARÉE du fait sourcé', () => {
  it('étiquette la seule ligne déduite, et n’étiquette pas celle qui ne l’est pas', async () => {
    render([
      // Une source actuelle SANS date : elle ne prouve rien, donc elle reste une
      // hypothèse — et elle est DÉDUITE.
      partner({ id: 'p1', evidence_origins: ['current_inference'], detected_at: null, relationship: 'partner' }),
      // Aucune origine : une hypothèse, mais rien n'a été déduit de personne.
      partner({
        id: 'p2',
        name: 'Orsan Conseil (exemple)',
        relationship: 'competitor',
        detected_at: null,
        certainty: null,
      }),
    ])

    // Le nom du produit passe par `{{brand}}` (GA-252) : la garde refuse qu'il
    // soit écrit en dur dans une traduction, et la marque est réglable.
    const deduites = await screen.findAllByText(/^Déduit par /)
    expect(deduites).toHaveLength(1)
    expect(screen.getByText('Orsan Conseil (exemple)')).toBeInTheDocument()
  })
})

describe('#2122.35 — une divergence s’affiche EN ENTIER, avec sa demande de qualification', () => {
  it('rend les deux évaluations et ne tranche pas', async () => {
    render([
      partner({
        evidence_origins: ['market_observation', 'current_inference'],
        certainty: 'faible',
        market_observation_count: 9,
      }),
    ])

    expect(await screen.findByText(/Source actuelle : confiance faible/)).toBeInTheDocument()
    expect(screen.getByText(/Observations du marché : confiance forte/)).toBeInTheDocument()
  })
})

describe('#2122.46 / .48-.52 / .63 — chaque carte porte son action', () => {
  it('rend le type, la confiance et au moins une action par relation affichée', async () => {
    render([partner({ relationship: 'competitor', detected_at: null, certainty: null })])

    expect(await screen.findByText('Concurrent potentiel')).toBeInTheDocument()
    // « Non évaluée », jamais « 0 » ni un vide (GA-18/19).
    expect(screen.getByText('Confiance non évaluée')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Qualifier/ })).toBeInTheDocument()
  })

  // La liste des six vit dans les contrats (`ECOSYSTEM_RELATION_ACTIONS`) : la
  // recopier ici ferait deux listes, et c'est toujours la même qui perdrait une
  // action — « Marquer non pertinent », la seule qui ferme une carte.
  const LABELS: Record<(typeof ECOSYSTEM_RELATION_ACTIONS)[number], string> = {
    qualify: 'Qualifier',
    find_sales_reps: 'Trouver les commerciaux concernés',
    prepare_partner_approach: 'Préparer une approche partenaire',
    mark_competitor: 'Marquer concurrent',
    mark_irrelevant: 'Marquer non pertinent',
    add_field_note: 'Ajouter une information terrain',
  }

  it('rend les six actions nommées par les contrats, et aucune autre', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    await screen.findByRole('heading', { name: 'Concurrents ou partenaires possibles' })
    expect(Object.keys(LABELS)).toEqual([...ECOSYSTEM_RELATION_ACTIONS])
    for (const action of ECOSYSTEM_RELATION_ACTIONS) {
      expect(screen.getAllByRole('button', { name: new RegExp(LABELS[action]) }).length).toBeGreaterThan(0)
    }
  })

  it('« Trouver les commerciaux concernés » ouvre la sous-section Contacts', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    fireEvent.click(await screen.findByRole('button', { name: /Trouver les commerciaux concernés/ }))
    expect(onTabChange).toHaveBeenCalledWith('contacts')
  })

  /**
   * #2122.48 / #2122.52 — PAR RELATION, PAS POUR LA SECTION.
   *
   * Les deux libellés existaient et étaient rendus — mais UNE FOIS, dans un
   * bloc « Actions » qui parle de la section entière. Sur deux relations, le
   * commercial lisait donc un seul « Trouver les commerciaux concernés » sans
   * savoir DUQUEL des deux il parlait. Le retour demande la même action posée
   * SUR chaque relation.
   */
  it('.48 / .52 — deux relations : chacune porte SES six actions, aucune au niveau de la section', async () => {
    render([
      partner({ id: 'p1', name: 'Alpha Systèmes (exemple)', relationship: 'partner', detected_at: null }),
      partner({ id: 'p2', name: 'Bêta Services (exemple)', relationship: 'competitor', detected_at: null }),
    ])

    await screen.findByText('Alpha Systèmes (exemple)')
    for (const label of [LABELS.find_sales_reps, LABELS.add_field_note]) {
      expect(screen.getAllByRole('button', { name: new RegExp(label) })).toHaveLength(2)
    }
    // Le bloc « Actions » de section disparaît : la même action écrite deux fois
    // sous deux portées est exactement ce que la loi 4 du tome 7 refuse.
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('.52 / #3406 — « Ajouter une information terrain » OUVRE un dialogue et enregistre la note du compte', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une information terrain/ }))
    const champ = await screen.findByRole('textbox')
    fireEvent.change(champ, { target: { value: 'Ils ont perdu leur rang 1 en juin.' } })
    mockFetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/notes',
          method: 'POST',
          body: expect.objectContaining({ entityType: 'account', body: expect.stringContaining('rang 1 en juin') }),
        }),
      ),
    )
  })

  it('#3406 — une note vide ne s’envoie pas', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    fireEvent.click(await screen.findByRole('button', { name: /Ajouter une information terrain/ }))
    await screen.findByRole('textbox')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })
})

describe('#2316.10 — un rang 2 sans preuve reste nommé « Rang 2 potentiel »', () => {
  it('rend « Rang 2 potentiel » dans le bloc des hypothèses, jamais « Partenaire potentiel »', async () => {
    render([partner({ rank: 'rank2', relationship: 'partner', detected_at: null, certainty: null })])

    expect(await screen.findByText('Rang 2 potentiel')).toBeInTheDocument()
    expect(screen.queryByText('Partenaire potentiel')).not.toBeInTheDocument()
  })
})

describe('#2122.53-.55 — la correction humaine domine, est attribuée, et n’efface rien', () => {
  it('« Marquer concurrent » change le type TOUT DE SUITE et garde l’observation', async () => {
    render([partner({ relationship: 'partner', detected_at: null, certainty: null })])

    await screen.findByText('Partenaire potentiel')
    fireEvent.click(screen.getByRole('button', { name: /Marquer concurrent/ }))

    await waitFor(() => expect(screen.getByText('Concurrent potentiel')).toBeInTheDocument())
    // Ce qu'on avait lu ne disparaît pas : il est nommé à côté de la correction.
    expect(screen.getByText(/Avant correction : Partenaire potentiel/)).toBeInTheDocument()
    // #2122.54 — QUI et QUAND. Sans auteur connu, c'est l'équipe de l'espace.
    expect(screen.getByText(/Corrigé le .* par l’équipe de l’espace/)).toBeInTheDocument()
  })
})

describe('la section se tait quand elle n’a rien à dire', () => {
  it('aucune ligne : aucun bloc de relation, et aucune phrase inventée', async () => {
    render([])

    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Lecture rapide' })).not.toBeInTheDocument()
  })

  // #3473 — recette prod 02/10 : « PAR OÙ ENTRER » promettait des voies d'accès
  // « plus bas » alors qu'elles vivent dans l'AUTRE sous-onglet (une seule
  // sous-section est rendue à la fois, #dossier-access n'existait pas). La
  // promesse devient un geste : un bouton qui ouvre le sous-onglet Accès.
  it('« Par où entrer » ouvre le sous-onglet Accès au lieu de promettre « plus bas »', async () => {
    render([partner()], 'partners')
    const open = await screen.findByTestId('ecosystem-open-access')
    expect(screen.queryByText(/plus bas/i)).toBeNull()
    fireEvent.click(open)
    expect(onTabChange).toHaveBeenCalledWith('access')
  })

  // #3473 (recette Y20) — « renvoi sous-onglet Accès absent » sur ?tab=access : la condition
  // `activeTab !== 'access'` retirait tout le renvoi (un renvoi vers l'endroit où l'on est
  // serait mort). Mais un écran sans renvoi laisse la section à sens unique : sur Accès, le
  // renvoi existe, DANS L'AUTRE SENS — vers Partenaires — et ne s'adresse jamais à lui-même.
  it('#3473 — sur Accès, le renvoi reste visible et pointe vers Partenaires, jamais vers Accès', async () => {
    render([partner()], 'access')
    await screen.findByText('Lecture rapide')
    expect(screen.queryByTestId('ecosystem-open-access')).toBeNull()
    expect(screen.getByText('Par où entrer')).toBeInTheDocument()
    expect(screen.getByText(/se lisent dans le sous-onglet « Sociétés de services reliées »/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ecosystem-open-partners'))
    expect(onTabChange).toHaveBeenCalledWith('partners')
  })

  it('#3473 — sur Partenaires, le renvoi vers Accès est visible et ne pointe pas vers Partenaires', async () => {
    render([partner()], 'partners')
    await screen.findByText('Lecture rapide')
    expect(screen.getByText('Par où entrer')).toBeInTheDocument()
    expect(screen.getByText(/se lisent dans le sous-onglet « Accès »/)).toBeInTheDocument()
    expect(screen.queryByTestId('ecosystem-open-partners')).toBeNull()
  })
})
