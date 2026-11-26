import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ResultsToolbar } from './ResultsToolbar'
import { chooseOption, optionValues, selectedValue } from '@/test/select'
import { normalizeDiscoverResponse } from '@/features/discover/lib/discover-normalize'
import { hiddenCandidatesBreakdown } from '@/features/discover/lib/discover-presentation'

function renderToolbar(over: Partial<Parameters<typeof ResultsToolbar>[0]> = {}, open = true) {
  const props = {
    shown: 12,
    hidden: 0,
    hiddenBreakdown: { excluded: 0, owned: 0, worked: 0, dismissed: 0 },
    matched: null,
    highPotential: 0,
    highPotentialOnly: false,
    onToggleHighPotential: () => {},
    sort: 'score' as const,
    onSortChange: () => {},
    family: 'any' as const,
    onFamilyChange: () => {},
    accessClass: 'any' as const,
    onAccessClassChange: () => {},
    hideOwned: false,
    onHideOwnedChange: () => {},
    hideWorked: false,
    onHideWorkedChange: () => {},
    roleFamily: 'any' as const,
    onRoleFamilyChange: () => {},
    signalNature: 'any' as const,
    onSignalNatureChange: () => {},
    directSignalsOnly: false,
    onDirectSignalsOnlyChange: () => {},
    dismissedCount: 0,
    onRestoreDismissed: () => {},
    onExport: () => {},
    canExport: true,
    ...over,
  }
  render(<ResultsToolbar {...props} />)
  // Lot U — les filtres secondaires vivent derrière le bouton « Filtres » : on ouvre la feuille.
  if (open) fireEvent.click(screen.getByRole('button', { name: /^Filtres/ }))
  return props
}

describe('refonte Théo — la rangée de la liste', () => {
  it('le tri et le filtre texte d’abord ; le reste derrière « Filtres », fermé par défaut', () => {
    render(
      <ResultsToolbar
        {...({
          shown: 12,
          hidden: 0,
          hiddenBreakdown: { excluded: 0, owned: 0, worked: 0, dismissed: 0 },
          matched: null,
          highPotential: 0,
          highPotentialOnly: false,
          onToggleHighPotential: () => {},
          sort: 'score',
          onSortChange: () => {},
          family: 'any',
          onFamilyChange: () => {},
          accessClass: 'any',
          onAccessClassChange: () => {},
          hideOwned: false,
          onHideOwnedChange: () => {},
          hideWorked: false,
          onHideWorkedChange: () => {},
          roleFamily: 'any',
          onRoleFamilyChange: () => {},
          signalNature: 'any',
          onSignalNatureChange: () => {},
          directSignalsOnly: false,
          onDirectSignalsOnlyChange: () => {},
          dismissedCount: 2,
          onRestoreDismissed: () => {},
          canExport: true,
          textFilter: '',
          onTextFilterChange: () => {},
          pageSelection: 'some',
          onTogglePageSelection: () => {},
        } as Parameters<typeof ResultsToolbar>[0])}
      />,
    )
    expect(screen.getByRole('searchbox', { name: 'Filtrer les résultats affichés' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Trier par' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /classe d.accès/i })).toBeNull()
    // GA-18/19 — aucun filtre actif : le bouton ne porte AUCUN nombre, jamais « 0 ».
    const more = screen.getByRole('button', { name: 'Filtres' })
    expect(more.textContent).not.toMatch(/\d/)
    fireEvent.click(more)
    expect(screen.getByRole('combobox', { name: /classe d.accès/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Cette page' })).toHaveProperty('indeterminate', true)
  })
})

describe('lot U — Filtres · n et puces retirables', () => {
  it('chaque filtre actif : une puce retirable sous la barre, et le bouton en porte le nombre', () => {
    const onHideOwnedChange = vi.fn()
    const props = renderToolbar({ hideOwned: true, directSignalsOnly: true, onHideOwnedChange }, false)
    expect(props).toBeDefined()
    expect(screen.getByRole('button', { name: /^Filtres\s*2$/ })).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /Retirer le filtre : Masquer les comptes dont je suis responsable/ }),
    )
    expect(onHideOwnedChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: /Retirer le filtre : Preuve directe uniquement/ })).toBeInTheDocument()
  })
})

describe('ResultsToolbar', () => {
  // #3597.4 — plus de bascule liste/cartes : une seule liste.
  it('n’expose plus de bascule grille / liste', () => {
    renderToolbar({})
    expect(screen.queryByRole('button', { name: /grille/i })).toBeNull()
    expect(screen.queryByRole('group', { name: /disposition/i })).toBeNull()
  })

  it('affiche le volume détecté quand il dépasse l’affiché — compteur d’impact réel', () => {
    renderToolbar({ shown: 12, matched: 340 })
    expect(screen.getByText(/340 correspondent au total/i)).toBeInTheDocument()
  })

  // Recette prod 01/11 (lot M, point 3) : « 144 correspondent au total » sous une
  // liste VIDE contredisait la liste. Zéro affiché ⇒ le volume se dit « avant filtres ».
  it('lot M — zéro entreprise affichée : le volume se dit « avant filtres », jamais « correspondent au total »', () => {
    renderToolbar({ shown: 0, matched: 144 })
    expect(screen.queryByText(/correspondent au total/i)).not.toBeInTheDocument()
    expect(screen.getByText(/144 avant filtres/i)).toBeInTheDocument()
  })

  it('n’invente aucun volume : rien quand le backend ne le renvoie pas ou qu’il n’ajoute rien', () => {
    renderToolbar({ shown: 12, matched: null })
    expect(screen.queryByText(/correspond/i)).not.toBeInTheDocument()
    renderToolbar({ shown: 12, matched: 12 })
    expect(screen.queryByText(/correspond/i)).not.toBeInTheDocument()
  })

  /**
   * #3877 — RÉFUTÉ en recette prod le 08/10/2026 : le compteur de base dit
   * « N entreprises TROUVÉES » même quand `matched` est `null` (le backend
   * registre ne sait pas dire le total réel, `discoverCoverageSchema` est
   * absent de ce chemin par construction — « chemin non borné »,
   * `packages/contracts/src/schemas/discover.ts:780`). « Trouvées » affirme un
   * total qu'on ne mesure pas : la recherche a pu en rendre beaucoup plus que
   * les 24/25 chargés. Le libellé de base ne doit jamais dépasser ce qu'il
   * SAIT (GA-259 : un taux de couverture mesure ce qu'on SAIT, jamais ce que
   * le marché FAIT) — le total réel, quand il existe, reste le rôle du
   * volume détecté juste à côté (`matchedVolume`), jamais du compteur de base.
   */
  it('#3877 — le compteur de base ne prétend jamais être un total', () => {
    renderToolbar({ shown: 25, matched: null })
    expect(screen.queryByText(/trouvée/i)).not.toBeInTheDocument()
  })
})

/**
 * #2740 — en production (1512 px), ces libellés se compressaient (ex.
 * « Trier par » à 30 px sur 2 lignes) au profit du `SelectField` voisin dans
 * le même `flex items-center gap-1.5`. Ils ne doivent ni rétrécir ni
 * s'enrouler.
 */
describe('#2740 — les libellés de la barre de filtres ne rétrécissent pas', () => {
  it.each([
    ['Trier par', 'results.sortLabel'],
    ["Classe d'accès", 'barrier.filter'],
    // #2740 (suite, 23/09) — « Famille » (`family.filter`) était resté hors
    // de la liste corrigée le 23/09 : seule « Famille de rôles »
    // (`filters.roleFamily`, un filtre DIFFÉRENT) avait été couverte.
    ['Famille', 'family.filter'],
    ['Famille de rôles', 'filters.roleFamily'],
    ['Nature du besoin', 'filters.signalNature'],
  ])('%s (%s) porte shrink-0 whitespace-nowrap', label => {
    renderToolbar()
    const el = screen.getByText(label)
    expect(el.className).toContain('shrink-0')
    expect(el.className).toContain('whitespace-nowrap')
  })
})

/**
 * Manque C du 30/08 — « N masquées » ne disait pas pourquoi. Modèle :
 * `CoverageNotice`, qui nomme chaque écart plutôt que d'afficher un total nu.
 */
describe('« N masquées » nomme désormais SES motifs', () => {
  it('un compte déjà possédé et un compte écarté : les deux motifs sont nommés', () => {
    renderToolbar({ hidden: 3, hiddenBreakdown: { excluded: 0, owned: 2, worked: 0, dismissed: 1 } })
    expect(screen.getByText(/3 masquées/i)).toBeInTheDocument()
    expect(screen.getByText(/2.*portefeuille/i)).toBeInTheDocument()
    expect(screen.getByText(/1.*écartée/i)).toBeInTheDocument()
  })

  it('un seul motif actif : l’autre ne s’affiche PAS à zéro — « 0 écartées » ne serait pas un motif', () => {
    renderToolbar({ hidden: 2, hiddenBreakdown: { excluded: 0, owned: 2, worked: 0, dismissed: 0 } })
    expect(screen.getByText(/2.*portefeuille/i)).toBeInTheDocument()
    expect(screen.queryByText(/écartée/i)).not.toBeInTheDocument()
  })

  it('symétriquement pour « écarté » seul', () => {
    renderToolbar({ hidden: 1, hiddenBreakdown: { excluded: 0, owned: 0, worked: 0, dismissed: 1 } })
    expect(screen.getByText(/1.*écartée/i)).toBeInTheDocument()
    expect(screen.queryByText(/portefeuille/i)).not.toBeInTheDocument()
  })

  it('rien à masquer, rien à afficher', () => {
    renderToolbar({ hidden: 0, hiddenBreakdown: { excluded: 0, owned: 0, worked: 0, dismissed: 0 } })
    expect(screen.queryByText(/\d+ masquée/i)).not.toBeInTheDocument()
  })

  // #2614.1 — un compte exclu par le conseil de qualification est nommé,
  // comme les trois autres motifs, jamais fondu dans « masquées ».
  it('un compte exclu par le conseil de qualification est nommé à part', () => {
    renderToolbar({ hidden: 1, hiddenBreakdown: { excluded: 1, owned: 0, worked: 0, dismissed: 0 } })
    expect(screen.getByText(/1 masquée/i)).toBeInTheDocument()
    expect(screen.getByText(/1.*exclu/i)).toBeInTheDocument()
  })

  it('exclu ET déjà possédé : les deux motifs sont nommés ensemble', () => {
    renderToolbar({ hidden: 2, hiddenBreakdown: { excluded: 1, owned: 1, worked: 0, dismissed: 0 } })
    expect(screen.getByText(/1.*exclu/i)).toBeInTheDocument()
    expect(screen.getByText(/1.*portefeuille/i)).toBeInTheDocument()
  })
})

/**
 * #2614.1 — mesuré en production le 20/09 : les cinq sous-onglets de
 * Découvrir n'affichaient JAMAIS « N exclues », alors que les tests
 * ci-dessus (qui posent `hiddenBreakdown` À LA MAIN) étaient tous verts.
 * La coupure était en amont — `discover-normalize.ts` ne lisait jamais le
 * `qualification` que l'IA pose sur chaque candidat (`discover.py:1382`).
 *
 * Ce test exerce donc la VRAIE chaîne — réponse API brute → normalisation →
 * `hiddenCandidatesBreakdown` → rendu — au lieu de fabriquer la répartition
 * à la main : c'est la seule façon de mordre sur une régression de la
 * normalisation elle-même.
 */
describe('#2614.1 — la chaîne complète, de la réponse API brute à l’écran', () => {
  it('un candidat EXCLU par le conseil de qualification est nommé à l’écran, pas fondu en silence', () => {
    const response = normalizeDiscoverResponse({
      candidates: [
        {
          name: 'Boulangerie du Coin',
          siren: '552100554',
          portfolioState: 'new',
          accountId: null,
          sources: [],
          qualification: { verdict: 'excluded', code: 'natural_person', reason: 'Personne physique', otherCodes: [] },
        },
      ],
      query: {},
      degraded: [],
    })
    const breakdown = hiddenCandidatesBreakdown(response.candidates, { hideOwned: false, dismissed: new Set() })
    const hidden = breakdown.excluded + breakdown.owned + breakdown.worked + breakdown.dismissed

    renderToolbar({ shown: 0, hidden, hiddenBreakdown: breakdown })

    expect(screen.getByText(/1 masquée/i)).toBeInTheDocument()
    expect(screen.getByText(/1.*exclu/i)).toBeInTheDocument()
  })
})

describe("le filtre de classe d'accès (tome 3)", () => {
  it('propose les quatre classes et « toutes » par défaut', async () => {
    renderToolbar()
    const select = screen.getByRole('combobox', { name: /classe d.accès/i })
    expect(await selectedValue(select)).toBe('any')
    // Quatre classes + « toutes ».
    // Quatre classes + « toutes », lues dans la liste ouverte.
    expect(await optionValues(select)).toHaveLength(5)
  })

  it('remonte la classe choisie', async () => {
    const props = renderToolbar()
    const spy = vi.fn()
    props.onAccessClassChange = spy
    renderToolbar({ onAccessClassChange: spy })
    await chooseOption(screen.getAllByLabelText(/classe d.accès/i)[1]!, 'C')
    expect(spy).toHaveBeenCalledWith('C')
  })
})

// #2165.26 — « Déjà travaillé » : une case À PART de « déjà à moi », jamais
// fondue dedans (voir `isWorkedByRep` / `hiddenCandidatesBreakdown`).
describe('ResultsToolbar — « Déjà travaillé »', () => {
  it('rend une case décochée par défaut, distincte de « déjà à moi »', () => {
    renderToolbar()
    const worked = screen.getByRole('checkbox', { name: /déjà clients ou déjà analysés dans l.espace/i })
    const owned = screen.getByRole('checkbox', { name: /dont je suis responsable/i })
    expect(worked).not.toBe(owned)
    expect(worked).not.toBeChecked()
  })

  // #3879.5 — deux cases qui ressemblaient à s'y méprendre (« ce que je travaille déjà » / « ce qui est déjà
  // travaillé ») : les deux réalités sont maintenant NOMMÉES précisément, chacune avec son périmètre.
  it('#3879.5 — les deux libellés disent chacun leur réalité, et n’emploient plus le même verbe', () => {
    renderToolbar()
    const labels = screen
      .getAllByRole('checkbox')
      .map(box => box.getAttribute('aria-label') ?? box.closest('label')?.textContent ?? '')
    const joined = labels.join(' | ')
    expect(joined).toMatch(/responsable/i)
    expect(joined).toMatch(/clients ou déjà analysés/i)
    expect(joined).not.toMatch(/travaill/i)
  })

  it('remonte le changement, sans toucher à hideOwned', async () => {
    const spy = vi.fn()
    renderToolbar({ onHideWorkedChange: spy })
    await userEvent.click(screen.getByRole('checkbox', { name: /déjà clients ou déjà analysés/i }))
    expect(spy).toHaveBeenCalledWith(true)
  })

  it('affiche le motif « déjà cliente ou analysée » quand la répartition le porte', () => {
    renderToolbar({ hidden: 1, hiddenBreakdown: { excluded: 0, owned: 0, worked: 1, dismissed: 0 } })
    expect(screen.getByText(/déjà cliente ou analysée dans l.espace/i)).toBeInTheDocument()
  })
})

/** VU.4 / #3819.10 (18/10) — le menu de tri tronquait « Équil… », « Conf… », « Sign… », « Taille… ». */
describe('menu de tri : jamais de libellé tronqué', () => {
  it('le déclencheur garde une largeur plancher (le menu prend sa largeur)', () => {
    renderToolbar({}, false)
    const trigger = screen.getByRole('combobox', { name: 'Trier par' })
    expect(trigger.className).toContain('min-w-[11rem]')
  })

  it('chaque option de tri passe à la ligne au lieu de tronquer', async () => {
    renderToolbar({}, false)
    await userEvent.click(screen.getByRole('combobox', { name: 'Trier par' }))
    for (const option of screen.getAllByRole('option')) {
      expect(option.querySelector('.truncate')).toBeNull()
    }
  })
})
