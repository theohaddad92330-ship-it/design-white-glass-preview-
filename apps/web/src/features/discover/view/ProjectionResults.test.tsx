import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactsResults, NeedsResults, PartnersResults } from './ProjectionResults'
import { needRowsFromCandidates, type DiscoverPartnersProjection } from '@/features/discover/lib/discover-result-rows'
import type { RelationChipImpact } from '@/features/discover/lib/discover-filters'
import type { DiscoverCandidate, DiscoverSignal } from '@/features/discover/lib/discover-types'
import { emptyContactFilters, type DiscoverContactRow } from '@/features/discover/lib/discover-contact-rows'

/**
 * #2165.17 (18/09/2026) — « où positionner un consultant » ne se construit PAS
 * dans Découvrir : pas d'écran, pas de sélecteur de consultant ici. La
 * capacité existe déjà (`/consultants/$id/reverse-market`, ouverte depuis le
 * vivier) — Découvrir se contente d'un LIEN vers elle, à l'endroit où la
 * question se pose naturellement : la lecture « Partenaires / ESN », qui
 * montre déjà qui joue sur ce marché.
 */
describe('PartnersResults — lien vers le marché inversé (#2165.17)', () => {
  const emptyProjection: DiscoverPartnersProjection = { rows: [], unresolvedNaf: 0 }

  it('porte un lien vers le vivier — jamais un sélecteur de consultant construit ici', async () => {
    renderWithRouter(<PartnersResults projection={emptyProjection} onQualify={vi.fn()} />)
    const link = await screen.findByRole('link', { name: /consultant/i })
    expect(link).toHaveAttribute('href', '/consultants')
  })
})

/**
 * #2151.33 / #2151.34 — défaut mesuré en prod le 18/09 : preset « Trouver des
 * partenaires ou ESN » trouvait 7 ESN, le chip « Relation déjà qualifiée » les
 * retirait toutes (relation `unknown` partout) et l'écran rendait
 * `partners.empty` (« aucune ESN dans cette recherche : aucun des codes
 * d'activité résolus n'en désigne une ») — un mensonge : la recherche EN
 * avait trouvé 7, c'est le filtre qui les a retirées.
 */
describe('PartnersResults — le filtre dit ce qu’il a retiré, inconnu ≠ non (#2151.33 / #2151.34)', () => {
  const emptyProjection: DiscoverPartnersProjection = { rows: [], unresolvedNaf: 0 }

  it('sans chip actif, ne montre aucune ligne d’impact', async () => {
    renderWithRouter(<PartnersResults projection={emptyProjection} onQualify={vi.fn()} relationChipImpacts={[]} />)
    await screen.findByText(/résultat/i)
    expect(screen.queryByText(/retiré/)).not.toBeInTheDocument()
  })

  it('nomme le chip, dit combien il a retiré, et combien faute de savoir', async () => {
    const impacts: RelationChipImpact[] = [{ key: 'existingRelationship', removedCount: 7, unknownCount: 7 }]
    renderWithRouter(
      <PartnersResults
        projection={emptyProjection}
        onQualify={vi.fn()}
        relationChipImpacts={impacts}
        emptiedByRelationChips
      />,
    )
    await screen.findByText(/résultat/i)
    expect(screen.getByText(/Relation déjà qualifiée/)).toBeInTheDocument()
    expect(screen.getByText(/7 ESN/)).toBeInTheDocument()
    expect(screen.getByText(/faute de savoir/)).toBeInTheDocument()
  })

  it('offre un bouton qui désactive le chip nommé — cible tabulable, jamais un lien caché', async () => {
    const user = userEvent.setup()
    const onDisableRelationChip = vi.fn()
    const impacts: RelationChipImpact[] = [{ key: 'rank2Opening', removedCount: 3, unknownCount: 1 }]
    renderWithRouter(
      <PartnersResults
        projection={emptyProjection}
        onQualify={vi.fn()}
        relationChipImpacts={impacts}
        emptiedByRelationChips
        onDisableRelationChip={onDisableRelationChip}
      />,
    )
    const button = await screen.findByRole('button', { name: /retirer/i })
    await user.click(button)
    expect(onDisableRelationChip).toHaveBeenCalledWith('rank2Opening')
  })

  it('remplace partners.empty quand la liste est vide À CAUSE des chips', async () => {
    const impacts: RelationChipImpact[] = [{ key: 'existingRelationship', removedCount: 7, unknownCount: 7 }]
    renderWithRouter(
      <PartnersResults
        projection={emptyProjection}
        onQualify={vi.fn()}
        relationChipImpacts={impacts}
        emptiedByRelationChips
      />,
    )
    await screen.findByText(/résultat/i)
    expect(screen.queryByText(/aucune esn dans cette recherche/i)).not.toBeInTheDocument()
  })

  it('partners.empty reste affiché quand la recherche elle-même n’a rien trouvé — aucun chip actif', async () => {
    renderWithRouter(<PartnersResults projection={emptyProjection} onQualify={vi.fn()} relationChipImpacts={[]} />)
    expect(await screen.findByText(/aucune esn dans cette recherche/i)).toBeInTheDocument()
  })
})

function needSignal(overrides: Partial<DiscoverSignal> = {}): DiscoverSignal {
  return { type: 'hiring', label: 'besoin', date: '2026-09-01', ...overrides }
}

function needCandidate(overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'Acme',
    siren: '111111111',
    nafCode: '30.30Z',
    sector: 'Industrie',
    city: 'Toulouse',
    department: '31',
    headcountRange: '50-249',
    creationDate: '2005-01-01',
    score: 50,
    scoreMax: 80,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...overrides,
  } as DiscoverCandidate
}

/**
 * #2165.44 / #2165.48 — RÉFUTÉ en prod le 19/09/2026 : sur
 * /discover?type=needs, poser une fenêtre de 30 jours ou un département ne
 * changeait RIEN à la liste (40 → 40 dans les deux cas). Ces tests rendent le
 * COMPOSANT (pas seulement `filterNeedRows`) pour prouver que la ligne hors
 * fenêtre / hors zone disparaît de l'écran, et que le nombre retiré s'affiche.
 */
/**
 * #2941 / #2169.9 — la file « Pistes à qualifier » doit être accessible DEPUIS
 * Découvrir, pas seulement depuis le Pipe (`ProjectsPage.tsx`, qui l'ouvre déjà
 * localement via `onOpenIntake`). `routes/projects/index.tsx` déclare un
 * paramètre `lens` prêt à être visé depuis l'extérieur — mesuré le 26/09/2026 :
 * aucun écran de Découvrir ne le posait encore. Même emplacement et même forme
 * que le lien « Où positionner un consultant ? » ci-dessus (GA-26 : un même
 * geste — un lien de sortie vers une autre section — ne se réinvente pas).
 */
describe('NeedsResults — lien vers la file « Pistes à qualifier » (#2941, #2169.9)', () => {
  const emptyProjection = needRowsFromCandidates([])

  it('porte un lien vers la lentille portefeuille des Opportunités', async () => {
    renderWithRouter(
      <NeedsResults
        projection={emptyProjection}
        nature="any"
        directOnly={false}
        company=""
        sinceDays={null}
        departments={[]}
        onQualify={vi.fn()}
      />,
    )
    const link = await screen.findByRole('link', { name: /pistes à qualifier/i })
    expect(link.getAttribute('href')).toMatch(/^\/projects\?pistes=1$/) // #4545
  })

  it('#4634 — la liste des besoins ne rend AUCUN contrôle de filtre : ils vivent dans le volet', async () => {
    renderWithRouter(
      <NeedsResults
        projection={emptyProjection}
        nature="any"
        directOnly={false}
        company=""
        sinceDays={null}
        departments={[]}
        onQualify={vi.fn()}
      />,
    )
    await screen.findByRole('link', { name: /pistes à qualifier/i })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /preuve directe/i })).toBeNull()
  })
})

describe('NeedsResults — la fenêtre et la zone retirent des LIGNES, et le disent (#2165.44 / #2165.46 / #2165.48)', () => {
  const NOW = Date.parse('2026-09-19T12:00:00Z')
  const projection = needRowsFromCandidates([
    needCandidate({
      name: 'Dans la fenêtre et la zone',
      department: '31',
      signals: [needSignal({ label: 'frais', date: '2026-09-10' })],
    }),
    needCandidate({
      siren: '222',
      name: 'Trop vieux',
      department: '31',
      signals: [needSignal({ label: 'vieux', date: '2023-06-07' })],
    }),
    needCandidate({
      siren: '333',
      name: 'Hors zone',
      department: '69',
      signals: [needSignal({ label: 'lyon', date: '2026-09-10' })],
    }),
  ])

  it('une ligne hors fenêtre ET une ligne hors zone disparaissent, et chacune est comptée à part', async () => {
    renderWithRouter(
      <NeedsResults
        projection={projection}
        nature="any"
        directOnly={false}
        company=""
        sinceDays={30}
        departments={['31']}
        nowMs={NOW}
        onQualify={vi.fn()}
      />,
    )
    expect(await screen.findByText('Dans la fenêtre et la zone')).toBeInTheDocument()
    expect(screen.queryByText('Trop vieux')).not.toBeInTheDocument()
    expect(screen.queryByText('Hors zone')).not.toBeInTheDocument()
    expect(screen.getByText(/1 besoin masqué, hors de la fenêtre de fraîcheur choisie/)).toBeInTheDocument()
    expect(screen.getByText(/1 besoin masqué, hors des départements choisis/)).toBeInTheDocument()
  })

  it('sans fenêtre ni zone posées, rien n’est masqué et aucun compteur ne s’affiche', async () => {
    renderWithRouter(
      <NeedsResults
        projection={projection}
        nature="any"
        directOnly={false}
        company=""
        sinceDays={null}
        departments={[]}
        nowMs={NOW}
        onQualify={vi.fn()}
      />,
    )
    expect(await screen.findByText('Dans la fenêtre et la zone')).toBeInTheDocument()
    expect(screen.getByText('Trop vieux')).toBeInTheDocument()
    expect(screen.getByText('Hors zone')).toBeInTheDocument()
    expect(screen.queryByText(/masqué/)).not.toBeInTheDocument()
  })
})

/**
 * #4045.9 — recette prod 11/10 : « pas de groupes par famille, seulement une étiquette par carte ».
 * Les besoins sont rangés par FAMILLE de signal (celles de la ligne « Pourquoi maintenant »), chacune
 * sous son intitulé ; une famille sans besoin n'a ni intitulé ni ligne.
 */
describe('NeedsResults — les besoins sont groupés par famille (#4045.9)', () => {
  const NOW = Date.parse('2026-10-12T12:00:00Z')
  const render = (candidates: DiscoverCandidate[]) =>
    renderWithRouter(
      <NeedsResults
        projection={needRowsFromCandidates(candidates)}
        nature="any"
        directOnly={false}
        company=""
        sinceDays={null}
        departments={[]}
        nowMs={NOW}
        onQualify={vi.fn()}
      />,
    )

  it('un intitulé par famille, dans l’ordre, avec ses besoins dessous et eux seuls', async () => {
    render([
      needCandidate({ siren: '1', name: 'Alpha', signals: [needSignal({ type: 'legal', label: 'cession de fonds' })] }),
      needCandidate({ siren: '2', name: 'Beta', signals: [needSignal({ type: 'hiring', label: 'Dev Java' })] }),
      needCandidate({
        siren: '3',
        name: 'Gamma',
        signals: [needSignal({ type: 'business', label: 'nouvelle usine' })],
      }),
      needCandidate({ siren: '4', name: 'Delta', signals: [needSignal({ type: 'tender', label: 'AO cloud' })] }),
    ])
    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map(h => h.textContent)).toEqual([
      'Recrutements',
      'Projets et vie de l’entreprise',
      'Marchés et vie juridique',
    ])
    const hiring = screen.getByRole('group', { name: 'Recrutements' })
    expect(within(hiring).getByText('Beta')).toBeInTheDocument()
    expect(within(hiring).queryByText('Alpha')).not.toBeInTheDocument()
    const other = screen.getByRole('group', { name: 'Marchés et vie juridique' })
    expect(within(other).getByText('Alpha')).toBeInTheDocument()
    expect(within(other).getByText('Delta')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — une famille sans besoin n’a ni intitulé ni ligne', async () => {
    render([needCandidate({ siren: '2', name: 'Beta', signals: [needSignal({ type: 'hiring', label: 'Dev Java' })] })])
    await screen.findByRole('heading', { level: 3, name: 'Recrutements' })
    expect(screen.queryByText('Projets et vie de l’entreprise')).not.toBeInTheDocument()
    expect(screen.queryByText('Marchés et vie juridique')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — aucun besoin : aucun intitulé de groupe', async () => {
    render([])
    await screen.findByText(/aucun/i)
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })
})

/**
 * #2621.1 — RÉFUTÉ en mesure le 21/09/2026 : `contacts.service.ts` porte un
 * `country` brut (Apollo) jamais rapproché du marché du workspace — chercher
 * « DHL » dans Découvrir pouvait montrer des contacts DHL hors France sans
 * qu'aucun réglage ne le dise. Ces tests rendent le COMPOSANT (pas seulement
 * `filterContactRows`) pour prouver que la ligne hors pays disparaît de
 * l'écran, et que la bascule qui la rétablit est un geste explicite.
 */
describe('ContactsResults — le pays du workspace par défaut, bascule « monde » (#2621.1)', () => {
  function row(overrides: Partial<DiscoverContactRow> = {}): DiscoverContactRow {
    return {
      id: 'row-1',
      fullName: 'Alex Martin',
      company: 'DHL',
      title: 'Directeur des achats',
      entity: null,
      decisionRole: null,
      level: null,
      expertise: null,
      channels: { email: true, phone: false },
      location: null,
      reason: null,
      provenance: { sourceTag: null, seenAt: null },
      unknown: [],
      relation: 'new',
      accountId: null,
      ...overrides,
    }
  }

  const rows = [
    row({ id: 'fr', fullName: 'En France', location: 'Paris, France' }),
    row({ id: 'de', fullName: 'En Allemagne', location: 'Berlin, Germany' }),
    row({ id: 'unk', fullName: 'Lieu inconnu' }),
  ]

  it('par défaut, ne montre que les personnes du pays du workspace', async () => {
    renderWithRouter(
      <ContactsResults
        rows={rows}
        filters={emptyContactFilters()}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
        workspaceCountryName="France"
      />,
    )
    expect(await screen.findByText('En France')).toBeInTheDocument()
    expect(screen.queryByText('En Allemagne')).not.toBeInTheDocument()
    expect(screen.queryByText('Lieu inconnu')).not.toBeInTheDocument()
  })

  it('bascule posée, plus aucune contrainte de pays — connues et inconnues comprises', async () => {
    renderWithRouter(
      <ContactsResults
        rows={rows}
        filters={{ ...emptyContactFilters(), worldwide: true }}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
        workspaceCountryName="France"
      />,
    )
    expect(await screen.findByText('En France')).toBeInTheDocument()
    expect(screen.getByText('En Allemagne')).toBeInTheDocument()
    expect(screen.getByText('Lieu inconnu')).toBeInTheDocument()
  })
})

/**
 * #2166.57 — RÉFUTÉ en prod (a9be6403d) : « Chercher les contacts » depuis une
 * sélection de DEUX comptes (D.HANTSCH, CBM CAR ET BUS MAINTENANCE) posait
 * bien `filters.companies` (OR, `discover-contact-rows.ts:278`), mais rien à
 * l'écran ne le MONTRAIT — le champ « Entité » restait vide, et l'écran
 * rendait « 0 résultat » sans dire que c'était PARCE QUE ces deux comptes
 * n'ont encore aucun contact connu. Un filtre actif invisible + un zéro muet.
 */
describe('ContactsResults — le filtre multi-entreprises de la sélection se VOIT (#2166.57)', () => {
  it('zéro résultat SUR CE FILTRE nomme les entreprises cherchées — jamais un « 0 » muet', async () => {
    renderWithRouter(
      <ContactsResults
        rows={[]}
        filters={{ ...emptyContactFilters(), companies: ['D.HANTSCH', 'CBM CAR ET BUS MAINTENANCE'] }}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )
    expect(
      await screen.findByText('Aucun contact connu pour D.HANTSCH, CBM CAR ET BUS MAINTENANCE dans ton espace.'),
    ).toBeInTheDocument()
    // Le message générique (sans nommer la sélection) ne doit PAS être celui rendu.
    expect(screen.queryByText('Aucune personne de ton espace ne correspond à ces critères.')).not.toBeInTheDocument()
    // Chaque entreprise porte un lien vers sa fiche pour y lancer une recherche.
    const link = screen.getByRole('link', { name: /D\.HANTSCH/i })
    expect(link.getAttribute('href')).toBe('/accounts?q=D.HANTSCH')
  })

  it('sans sélection multi-entreprises, le message générique reste inchangé', async () => {
    renderWithRouter(
      <ContactsResults
        rows={[]}
        filters={emptyContactFilters()}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )
    expect(await screen.findByText('Aucune personne de ton espace ne correspond à ces critères.')).toBeInTheDocument()
  })

  it('SIMON-FIX S.11 — une recherche de personnes sans résultat propose « Élargir la zone », comme l’onglet Comptes', async () => {
    const onWiden = vi.fn()
    renderWithRouter(
      <ContactsResults
        rows={[]}
        filters={emptyContactFilters()}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
        onWiden={onWiden}
      />,
    )
    const bouton = await screen.findByRole('button', { name: 'Élargir la zone' })
    await userEvent.click(bouton)
    expect(onWiden).toHaveBeenCalledTimes(1)
  })

  it('#4634 — la liste de personnes ne rend AUCUN contrôle de filtre, ni la portée : tout est dans le volet', async () => {
    renderWithRouter(
      <ContactsResults
        rows={[]}
        filters={{ ...emptyContactFilters(), company: 'DHL', companies: ['D.HANTSCH'] }}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
        workspaceCountryName="France"
      />,
    )
    await screen.findByText(/Aucun contact connu pour D\.HANTSCH/)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /monde/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /D\.HANTSCH/i })).toBeNull()
  })

  it('SIMON-FIX S.11 — sans geste d’élargissement fourni, aucun bouton muet', async () => {
    renderWithRouter(
      <ContactsResults
        rows={[]}
        filters={emptyContactFilters()}
        isFetching={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )
    await screen.findByText('Aucune personne de ton espace ne correspond à ces critères.')
    expect(screen.queryByRole('button', { name: 'Élargir la zone' })).toBeNull()
  })
})

describe('NeedsResults — « Uniquement freelance » (#4999.2)', () => {
  it('quand AUCUN signal ne dit freelance, l’écran le DIT au lieu de rester muet', async () => {
    const projection = needRowsFromCandidates([
      needCandidate({
        signals: [{ type: 'hiring', label: 'CDI data', date: '2026-09-01', contractType: 'CDI' }],
      }),
    ])
    renderWithRouter(
      <NeedsResults
        projection={projection}
        nature="any"
        directOnly={false}
        freelanceOnly
        company=""
        sinceDays={null}
        departments={[]}
        onQualify={vi.fn()}
      />,
    )
    expect(await screen.findByText(/Aucun signal freelance dans cette recherche/)).toBeInTheDocument()
  })

  it('#4999.1 — un filtre qui masque tout ne fait pas dire « coche un signal » : le motif suffit', async () => {
    const projection = needRowsFromCandidates([
      needCandidate({
        signals: [{ type: 'hiring', label: 'CDI data', date: '2026-09-01', contractType: 'CDI' }],
      }),
    ])
    renderWithRouter(
      <NeedsResults
        projection={projection}
        nature="any"
        directOnly={false}
        freelanceOnly
        company=""
        sinceDays={null}
        departments={[]}
        onQualify={vi.fn()}
      />,
    )
    await screen.findByText(/Aucun signal freelance dans cette recherche/)
    expect(screen.queryByText(/Aucun signal daté dans cette recherche/)).toBeNull()
  })
})
