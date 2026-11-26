/**
 * ⚠️ #2613 — CE FICHIER A BASCULÉ. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * Les assertions « se nomme non mesuré » ci-dessous ont été RETOURNÉES.
 * ⚠️ Ce qui TIENT encore, et qu'on ne rouvre pas : l'absence ne devient
 * JAMAIS « 0 » — c'est le sujet même des deux tests, et il reste vérifié.
 * Une cellule vide et un « 0 » ne se disent pas la même chose ; la première
 * ne prétend rien, le second affirme une mesure.
 *
 * ⚠️ Et « mesuré à ZÉRO » n'est pas « NON mesuré » : « Aucun contact connu »
 * reste dit, parce qu'on a cherché. Ne confonds pas les deux en nettoyant.
 *
 * Si tu lis ceci en croyant à une régression : ce n'en est pas une, c'est le
 * renversement. Garde : `apps/web/src/architecture/
 * une-absence-ne-fait-pas-une-ligne.test.ts`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CallListResults } from './CallListResults'

// #3819 — la confirmation (`EnrichConfirmDialog`) lit le mode démo via la session.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
import { emptyCallListFilters, type DiscoverCallListRow } from '@/features/discover/lib/discover-call-list'

/* ------------------------------------------------------------------ */
/*  #2545.1-.4 — le tableau d'appels : rendu, filtres, actions, export.  */
/* ------------------------------------------------------------------ */

// #2375.1 — `CallListResults` monte désormais `ProspectingSessionDialog`
// (« Préparer une session ») dans son arbre, fermé ou pas : celui-ci appelle
// `useMutation` (`activitiesApi.log`) inconditionnellement dès le montage,
// donc TOUT rendu de `CallListResults` a besoin d'un `QueryClient` — même les
// tests qui n'ouvrent jamais le compilateur de session.
function renderWithClient(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function row(overrides: Partial<DiscoverCallListRow> = {}): DiscoverCallListRow {
  return {
    key: '552120222:c1',
    siren: '552120222',
    accountId: null,
    portfolioState: 'new',
    company: 'Société Générale',
    website: 'https://www.societegenerale.com',
    reason: 'Modernisation du SI',
    signal: { type: 'hiring', label: 'Recrute un DSI', date: '2026-09-01' },
    city: 'Paris',
    department: '75',
    contactLocation: null,
    confidence: 72,
    contactId: 'c1',
    fullName: 'Jeanne Dupont',
    title: 'Directrice des Systèmes d’Information',
    level: null,
    expertise: null,
    email: 'jeanne.dupont@example.com',
    phone: '+33612345678',
    unknown: [],
    ...overrides,
  }
}

const funnel = { detected: 30, verified: 25, relevant: 2, enriched: 1 }

function noop() {}

// #4634 — les champs du tableau (Entreprise #3879.2, Fonction LC.9…) vivent dans le volet : `ProjectionSearchFields.test.tsx`.
describe('CallListResults — aucun contrôle de filtre sous les résultats (#4634)', () => {
  it('le tableau ne rend ni champ ni liste déroulante de filtre : ils sont dans le volet', () => {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByTestId('call-list-filter-company')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Joignable' })).toBeNull()
  })
})

describe('CallListResults — rendu du tableau (#2545.1)', () => {
  it('affiche la ligne entreprise + personne, colonnes du client', () => {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )

    expect(screen.getByText('Société Générale')).toBeInTheDocument()
    expect(screen.getByText('Jeanne Dupont')).toBeInTheDocument()
    expect(screen.getByText('jeanne.dupont@example.com')).toBeInTheDocument()
    expect(screen.getByText('+33612345678')).toBeInTheDocument()
  })

  it('nomme « aucun contact connu », jamais une cellule vide, quand la personne manque', () => {
    renderWithClient(
      <CallListResults
        rows={[
          row({
            key: '552120222:none',
            contactId: null,
            fullName: null,
            title: null,
            email: null,
            phone: null,
            unknown: ['person'],
          }),
        ]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )

    expect(screen.getByText(/aucun contact connu/i)).toBeInTheDocument()
  })

  // #2613 — une confiance absente laisse la cellule VIDE : ni « non mesuré », ni 0.
  it('un score de confiance ABSENT laisse la cellule muette, jamais 0', () => {
    renderWithClient(
      <CallListResults
        rows={[row({ confidence: null })]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )

    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/i)).not.toBeInTheDocument()
  })

  // #2613 — un étage non mesuré ne laisse pas un libellé orphelin : l'étage
  // entier disparaît. Les étages MESURÉS restent, eux.
  it('la chute (#2545.4) ne montre que ses étages mesurés quand `coverage` manque', () => {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={{ detected: null, verified: null, relevant: 1, enriched: 1 }}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )

    expect(screen.queryByText(/non mesuré/i)).not.toBeInTheDocument()
    // Les deux étages absents emportent leur libellé avec eux…
    expect(screen.queryByText(/détectées/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/vérifiées/i)).not.toBeInTheDocument()
    // …et les deux étages mesurés restent dits.
    expect(screen.getByText(/pertinentes/i)).toBeInTheDocument()
    expect(screen.getByText(/enrichies/i)).toBeInTheDocument()
  })

  it('exporte les lignes visibles au clic sur « Exporter »', () => {
    const onExport = vi.fn()
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        onExport={onExport}
        onExportSelection={noop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /exporter/i }))
    expect(onExport).toHaveBeenCalledWith([row()])
  })

  it('déclenche « Suivre » sur la ligne, geste déjà existant réutilisé', () => {
    const onToggleFollow = vi.fn()
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={onToggleFollow}
        onDismiss={noop}
        onExport={noop}
        onExportSelection={noop}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /^suivre/i })[0] as HTMLElement)
    expect(onToggleFollow).toHaveBeenCalledWith(row())
  })

  // #2375.1 — l'APPELANT réel du compilateur de session : ce bouton est ce
  // qui transforme « Prépare-moi une heure de prospection » en écran, sur
  // la liste d'appels DÉJÀ filtrée — pas une brique testée seule et jamais
  // branchée.
  it('« Préparer une session » ouvre le compilateur de session sur les lignes visibles (#2375.1)', () => {
    renderWithClient(
      <CallListResults
        rows={[row()]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
      />,
    )

    expect(screen.queryByText('Préparer une session de prospection')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer une session' }))
    expect(screen.getByText('Préparer une session de prospection')).toBeInTheDocument()
  })
})

/* #2545 / #3819 (démo Ludovic 08/10) — « Trouver 10 personnes à appeler » :
 * annoncé GRATUIT avant de partir, par entreprise ou pour toute la liste. */
describe('CallListResults — trouver des personnes (#3819)', () => {
  const empty = row({
    key: '552120222:none',
    contactId: null,
    fullName: null,
    title: null,
    email: null,
    phone: null,
    unknown: ['person'],
  })

  function renderFind(onFindForCompany = vi.fn(), onFindForAll = vi.fn()) {
    renderWithClient(
      <CallListResults
        rows={[empty, row({ key: '111:c9', siren: '111', company: 'Arquus', fullName: 'Claire Martin' })]}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
        findPeople={{ pending: new Set(), progress: null, onFindForCompany, onFindForAll }}
      />,
    )
    return { onFindForCompany, onFindForAll }
  }

  it("propose le geste sur la ligne sans personne, et ne part qu'après la confirmation", () => {
    const { onFindForCompany } = renderFind()
    fireEvent.click(screen.getByRole('button', { name: 'Trouver 10 personnes à appeler' }))
    expect(onFindForCompany).not.toHaveBeenCalled()
    // #3819 — la modale nomme l'entreprise et n'écrit aucune durée non mesurée.
    expect(screen.getByText(/Lancer une recherche de contacts pour .+ \?/)).toBeInTheDocument()
    expect(screen.queryByText(/Durée/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la recherche' }))
    expect(onFindForCompany).toHaveBeenCalledWith(expect.objectContaining({ siren: '552120222' }))
  })

  it('« pour toute la liste » ne vise QUE les entreprises sans personne', () => {
    const { onFindForAll } = renderFind()
    fireEvent.click(screen.getByRole('button', { name: /pour 1 entreprise/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la recherche' }))
    expect(onFindForAll).toHaveBeenCalledWith([expect.objectContaining({ siren: '552120222' })])
  })
})

// LUDOVIC-C LC.4 / LC.9 — recette prod 19/10 : 0 téléphone sur 28 lignes sans un mot, colonne Nom à 109 px,
// filtres « Entreprise » en ligne et « Fonction » pleine largeur.
describe('CallListResults — LC.4 téléphone dit, LC.9 mise en page', () => {
  const renderRows = (rows: DiscoverCallListRow[]) =>
    renderWithClient(
      <CallListResults
        rows={rows}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
      />,
    )

  it('LC.4 — une personne sans numéro dit « Téléphone non trouvé », jamais un vide muet', () => {
    renderRows([row({ phone: null })])
    expect(screen.getByTestId('call-list-phone-missing')).toHaveTextContent('Téléphone non trouvé')
  })

  it('LC.4 — dit NON : un numéro connu ne porte aucune mention, une ligne sans personne non plus', () => {
    renderRows([row(), row({ key: 'k2', contactId: null, fullName: null, phone: null })])
    expect(screen.queryByTestId('call-list-phone-missing')).not.toBeInTheDocument()
  })

  // LC.9 — la part « Entreprise et Fonction, même largeur » a suivi les champs dans le volet (#4634).
  it('LC.9 — Nom et E-mail ont une largeur minimale', () => {
    renderRows([row()])
    // LUDOVIC-F F.2 — Nom resserré à 10 rem pour que la somme tienne dans les 926 px (voir `.columns.test`).
    expect(screen.getByRole('columnheader', { name: 'Nom' }).className).toContain('min-w-[10rem]')
    expect(screen.getByRole('columnheader', { name: 'E-mail' }).className).toContain('min-w-[12rem]')
  })

  // LUDOVIC-E LC.4 → LUDOVIC-F F.2 — un seul plancher par colonne (l'en-tête) : la somme tient dans 926 px
  // (`CallListResults.columns.test`) ; l'Action garde 7,5 rem pour ses libellés entiers, repliée sous 768 px.
  it('LC.4 — Entreprise et Action ont une largeur minimale en en-tête, aucun plancher en plus sur la cellule', () => {
    renderRows([row()])
    expect(screen.getByRole('columnheader', { name: 'Entreprise' }).className).toContain('min-w-[10rem]')
    expect(screen.getByRole('columnheader', { name: 'Action' }).className).toContain('min-w-[7.5rem]')
    const actionCell = screen.getByRole('button', { name: /Écarter/ }).closest('td')!
    expect(actionCell.className).not.toMatch(/(^|\s)min-w-/)
  })
})

// LUDOVIC-F F.3 (LC.1, Ludovic 20/10 17 h 45) — « Localisation : BELLEY (01) » identique sur les 9 lignes Enedis :
// le lieu de l'ENTREPRISE répété, lu comme celui de chaque personne.
describe('CallListResults — le lieu du contact n’est pas celui de l’entreprise (LUDOVIC-F F.3)', () => {
  const renderRows = (rows: DiscoverCallListRow[]) =>
    renderWithClient(
      <CallListResults
        rows={rows}
        filters={emptyCallListFilters()}
        funnel={funnel}
        truncatedCompanies={0}
        excludedCompanies={0}
        isFetching={false}
        isError={false}
        onRetry={noop}
        followed={new Set()}
        onToggleFollow={noop}
        onDismiss={noop}
      />,
    )
  const enedis = { siren: '444608442', company: 'ENEDIS', city: 'BELLEY', department: '01' }

  it('SAIT DIRE NON : deux contacts sans lieu propre → aucun « Localisation » par ligne, le site une seule fois', () => {
    renderRows([
      row({ ...enedis, key: 'a', contactId: 'a', fullName: 'Claudie Grossetete' }),
      row({ ...enedis, key: 'b', contactId: 'b', fullName: 'Marc Petit' }),
    ])
    expect(screen.queryByText(/Localisation/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Site : BELLEY (01)')).toHaveLength(1)
  })

  it('le lieu du contact, quand on le connaît, s’écrit sur SA ligne seulement', () => {
    renderRows([
      row({ ...enedis, key: 'a', contactId: 'a', fullName: 'Claudie Grossetete', contactLocation: 'Lyon, France' }),
      row({ ...enedis, key: 'b', contactId: 'b', fullName: 'Marc Petit' }),
    ])
    expect(screen.getAllByText(/Localisation/)).toHaveLength(1)
    expect(screen.getByText('Localisation : Lyon, France')).toBeInTheDocument()
  })

  it('deux entreprises différentes ont chacune leur site ; une entreprise sans site n’écrit aucune ligne', () => {
    renderRows([
      row({ ...enedis, key: 'a', contactId: 'a' }),
      row({ siren: '552120222', company: 'Société Générale', city: null, department: null, key: 'c', contactId: 'c' }),
    ])
    expect(screen.getAllByText(/^Site :/)).toHaveLength(1)
  })
})
