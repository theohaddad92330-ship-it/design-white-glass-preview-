import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { vi } from 'vitest'
import discoverFr from '@/i18n/locales/fr/discover.json'
import { buildRegistryQuery } from '@/features/discover/lib/discover-query'
import { FilterRail } from './FilterRail'
import { emptyUnifiedFilters, type UnifiedFilters } from '@/features/discover/lib/discover-filters'
import { FRAMING_SECTIONS, type FramingExtras } from '@/features/discover/lib/discover-framing'
import { SIZE_BANDS } from '@/features/discover/lib/discover-size-bounds'
import { chooseOption } from '@/test/select'
import { DEFAULT_BRAND_NAME, sectorCodesForGroup } from '@bellum/contracts'

vi.mock('@/features/profile/hooks/useOfferPortfolio', () => ({
  useOfferPortfolio: () => ({ data: undefined }),
}))

const EXTRAS: FramingExtras = {
  fit: 'any',
  minAccountsSeen: null,
  existingRelationshipOnly: false,
  rank2OpeningOnly: false,
  observedClientsOnly: false,
  expertiseKnownOnly: false,
  complementarityKnownOnly: false,
}

function props(over: Partial<Parameters<typeof FilterRail>[0]> = {}) {
  return {
    filters: emptyUnifiedFilters(),
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onApply: vi.fn(),
    loading: false,
    extras: EXTRAS,
    ...over,
  }
}

const F = discoverFr.framing
const withSector = (over: Partial<UnifiedFilters> = {}): UnifiedFilters => ({
  ...emptyUnifiedFilters(),
  sectors: ['software_tech'],
  ...over,
})

/** « Tous les filtres » ouvre « Cadrer la recherche » sur sa première rubrique (Entreprises). */
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /tous les filtres/i }))
  return within(screen.getByRole('dialog'))
}
function openSection(section: (typeof FRAMING_SECTIONS)[number]) {
  const dialog = openFilters()
  fireEvent.click(dialog.getByTestId(`framing-section-${section}`))
  return dialog
}
const applyButton = (dialog: ReturnType<typeof within>) => dialog.getByRole('button', { name: F.apply })

/* ------------------------------------------------------------------ */
/*  #4493 — la barre : un champ libre, « Explorer », les puces          */
/* ------------------------------------------------------------------ */

describe('FilterRail — la barre « Quel marché veux-tu explorer ? » (#4493)', () => {
  it('#4517.1 — pendant la recherche, le bouton est désactivé SANS second spinner (l’écran n’en montre qu’un)', () => {
    const { container } = render(<FilterRail {...props({ loading: true })} />)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('rend le champ libre, « Explorer » et les six puces dans l’ordre de la maquette appliquée (#4516)', () => {
    render(<FilterRail {...props()} />)
    expect(screen.getByRole('searchbox', { name: discoverFr.explore.label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: discoverFr.explore.submit })).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: discoverFr.chips.aria })).getAllByRole('button')
    expect(chips.map(chip => chip.textContent)).toEqual([
      discoverFr.chips.territoryAll,
      discoverFr.chips.sectorsAll,
      discoverFr.chips.sizesAll,
      discoverFr.chips.skills,
      discoverFr.chips.signals,
      discoverFr.rail.moreFilters,
    ])
  })

  it('a retiré la rangée d’avant : plus de « Rechercher avec ces critères »', () => {
    render(<FilterRail {...props()} />)
    expect(screen.queryByRole('button', { name: 'Rechercher avec ces critères' })).not.toBeInTheDocument()
  })

  /* #4516 (Louis 24/10) + maquette appliquée V22 — la puce « Toutes les tailles » DIT qu'aucune taille n'est posée, et
     ouvre « Cadrer la recherche » sur sa rubrique, vide. Une taille choisie se lit en codes maison (TPE/PME/ETI/GC). */
  it('#4516 — sans taille : « Toutes les tailles », et la rubrique Taille s’ouvre sans rien de coché', () => {
    render(<FilterRail {...props()} />)
    const chip = screen.getByTestId('discover-chip-size')
    expect(chip).toHaveTextContent(discoverFr.chips.sizesAll)
    fireEvent.click(chip)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('heading', { name: F.sizeTitle })).toBeInTheDocument()
    for (const band of SIZE_BANDS)
      expect(
        dialog.getByRole('button', { name: discoverFr.rail.sizeBand[band.code.toLowerCase() as 'tpe'] }),
      ).toHaveAttribute('aria-pressed', 'false')
  })

  it('#4516 — une taille CHOISIE se lit en codes maison : « ETI », puis « ETI +1 »', () => {
    const { rerender } = render(
      <FilterRail {...props({ filters: { ...emptyUnifiedFilters(), headcount: ['250-999'] } })} />,
    )
    expect(screen.getByTestId('discover-chip-size')).toHaveTextContent(/^ETI$/)
    rerender(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), headcount: ['250-999', '1000+'] } })} />)
    expect(screen.getByTestId('discover-chip-size')).toHaveTextContent('ETI +1')
    // La PME affinée (une seule de ses deux tranches) reste « PME » : une puce, pas une tranche.
    rerender(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), headcount: ['50-249'] } })} />)
    expect(screen.getByTestId('discover-chip-size')).toHaveTextContent(/^PME$/)
  })

  it('la saisie écrit `freetext` en direct, et « Explorer » lance', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { rerender } = render(<FilterRail {...props({ onChange, onSubmit })} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'SAP Lyon' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ freetext: 'SAP Lyon' }))
    rerender(<FilterRail {...props({ onChange, onSubmit, filters: { ...emptyUnifiedFilters(), freetext: 'SAP' } })} />)
    fireEvent.click(screen.getByRole('button', { name: discoverFr.explore.submit }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('#4490 — rien ne part sans critère : « Explorer » est grisé et dit pourquoi', () => {
    const onSubmit = vi.fn()
    render(<FilterRail {...props({ onSubmit })} />)
    expect(screen.getByRole('button', { name: discoverFr.explore.submit })).toBeDisabled()
    expect(screen.getByText(discoverFr.rail.needCriterion)).toBeInTheDocument()
    fireEvent.submit(screen.getByRole('search'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each([
    ['territory', 'territory'],
    ['sectors', 'companies'],
    ['skills', 'expertise'],
    ['signals', 'signals'],
    ['all', 'companies'],
  ] as const)('la puce « %s » ouvre la modale SUR SA RUBRIQUE (%s)', (chip, section) => {
    render(<FilterRail {...props()} />)
    fireEvent.click(screen.getByTestId(`discover-chip-${chip}`))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByTestId(`framing-section-${section}`)).toHaveAttribute('aria-current', 'step')
    expect(dialog.getByRole('heading', { name: F[`${section}Title` as const] })).toBeInTheDocument()
  })

  it('compte les critères posés sur « Tous les filtres » — un filtre rangé qui ne se compte pas se perd', () => {
    render(<FilterRail {...props({ filters: withSector({ city: 'Lyon' }) })} />)
    expect(screen.getByTestId('discover-chip-all')).toHaveTextContent(/2/)
  })

  // #4607.2 / #4607.3 — un seul lecteur : le badge de « Tous les filtres » et le pied de la modale disent la même chose.
  it('#4607.2 — le badge et le pied de la modale comptent pareil, affinage « fit » compris', () => {
    render(<FilterRail {...props({ extras: { ...EXTRAS, fit: 'high' } })} />)
    expect(screen.getByTestId('discover-chip-all')).toHaveTextContent('1')
    const dialog = openFilters()
    expect(dialog.getByTestId('framing-criteria-count')).toHaveTextContent(/^1 critère/)
  })

  it('#4607.2 — sans aucun critère : ni badge, ni « 1 » au pied', () => {
    render(<FilterRail {...props()} />)
    expect(screen.getByTestId('discover-chip-all')).not.toHaveTextContent(/\d/)
    expect(openFilters().getByTestId('framing-criteria-count')).toHaveTextContent(F.criteriaCount_zero)
  })

  it('#4579.6 — la puce de compétences nomme chaque compétence et ses écritures en infobulle', () => {
    render(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), city: 'Lille', keywords: 'vue, java' } })} />)
    const chip = screen.getByTestId('discover-chip-skills')
    expect(chip).toHaveTextContent('vue, java')
    expect(chip).toHaveAttribute(
      'title',
      'vue : vue.js, vuejs, vue 3, nuxt, nuxt.js · java : java 17, j2ee, jee, spring, spring boot, jakarta ee',
    )
  })

  it('#4607.1 — l’aide du rayon tombe dès qu’une ville est saisie, et revient sans ville', () => {
    const { unmount } = render(<FilterRail {...props()} />)
    expect(openSection('territory').getByText(discoverFr.rail.cityRadiusHint)).toBeInTheDocument()
    unmount()
    cleanup()
    render(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), city: 'Lille' } })} />)
    expect(openSection('territory').queryByText(discoverFr.rail.cityRadiusHint)).not.toBeInTheDocument()
  })

  it('les puces disent ce qui est posé (zone, secteur, compétence, signaux)', () => {
    render(
      <FilterRail
        {...props({
          filters: withSector({
            city: 'Lyon',
            keywords: 'SAP',
            technologiesObserved: 'SAP',
            signalSources: ['hiring'],
          }),
        })}
      />,
    )
    expect(screen.getByTestId('discover-chip-territory')).toHaveTextContent('Lyon')
    expect(screen.getByTestId('discover-chip-skills')).toHaveTextContent('SAP')
    expect(screen.getByTestId('discover-chip-signals')).toHaveTextContent('1 signal')
  })
})

/* ------------------------------------------------------------------ */
/*  #4494 — la modale « Cadrer la recherche »                           */
/* ------------------------------------------------------------------ */

describe('FilterRail — « Cadrer la recherche » : deux colonnes, six rubriques (#4494)', () => {
  it('à gauche TA RECHERCHE · N rubriques · parcours libre, les rubriques dans l’ordre, le compte et Réinitialiser', () => {
    render(<FilterRail {...props()} />)
    const dialog = openFilters()
    expect(dialog.getByRole('heading', { name: F.title })).toBeInTheDocument()
    expect(dialog.getByText(F.eyebrow)).toBeInTheDocument()
    expect(dialog.getByText('6 rubriques · parcours libre')).toBeInTheDocument()
    const nav = within(dialog.getByRole('navigation', { name: F.navAria }))
    expect(nav.getAllByTestId(/^framing-section-/).map(button => button.getAttribute('data-testid'))).toEqual(
      FRAMING_SECTIONS.map(section => `framing-section-${section}`),
    )
    // Les cinq rubriques de la maquette d'abord, puis celle ajoutée (taille).
    expect(FRAMING_SECTIONS.slice(0, 5)).toEqual(['companies', 'territory', 'expertise', 'signals', 'relation'])
    expect(dialog.getByTestId('framing-criteria-count')).toHaveTextContent(F.criteriaCount_zero)
    expect(dialog.getAllByRole('button', { name: F.reset }).length).toBeGreaterThan(0)
  })

  it('le pied porte « Annuler » et « Appliquer et explorer », jamais l’ancien « Appliquer » seul', () => {
    render(<FilterRail {...props({ filters: withSector() })} />)
    const dialog = openFilters()
    expect(dialog.getByRole('button', { name: F.cancel })).toBeInTheDocument()
    expect(applyButton(dialog)).toBeEnabled()
    expect(dialog.queryByRole('button', { name: /^appliquer$/i })).not.toBeInTheDocument()
  })

  it('Entreprises : plus de choix « type de compte » (il vit dans l’onglet Comptes / Autres acteurs, #4746.2) ; les secteurs par familles avec « Tout choisir »', () => {
    render(<FilterRail {...props()} />)
    const dialog = openFilters()
    expect(dialog.queryByRole('radiogroup')).toBeNull()
    expect(dialog.queryByText('Le type de compte')).toBeNull()
    expect(dialog.queryByText('ESN partenaires')).toBeNull()
    expect(dialog.getByText(F.includeSectors)).toBeInTheDocument()
    expect(dialog.getAllByRole('button', { name: /^tout choisir dans /i }).length).toBeGreaterThan(3)
  })

  it('« Continuer · Territoire » passe à la rubrique suivante, « Précédent » revient', () => {
    render(<FilterRail {...props()} />)
    const dialog = openFilters()
    fireEvent.click(dialog.getByRole('button', { name: 'Continuer · Territoire' }))
    expect(dialog.getByRole('heading', { name: F.territoryTitle })).toBeInTheDocument()
    expect(dialog.getByText('2 / 6')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: F.previous }))
    expect(dialog.getByRole('heading', { name: F.companiesTitle })).toBeInTheDocument()
  })
})

describe('FilterRail — un brouillon : rien ne bouge avant « Appliquer et explorer » (#4494)', () => {
  it('cocher dans la modale n’écrit RIEN à l’écran ; « Appliquer et explorer » envoie le brouillon et ferme', () => {
    const onChange = vi.fn()
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onChange, onApply })} />)
    const dialog = openFilters()
    fireEvent.click(dialog.getAllByRole('button', { name: /^tout choisir dans /i })[0] as HTMLElement)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledTimes(1)
    const applied = onApply.mock.calls[0]?.[0] as { sectors: string[] }
    expect(applied.sectors).toContain('software_tech')
    expect(applied.sectors.length).toBeGreaterThan(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('« Annuler » jette le brouillon : rouverte, la modale montre la recherche telle qu’elle était', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    let dialog = openFilters()
    fireEvent.click(dialog.getAllByRole('button', { name: /^tout choisir dans /i })[0] as HTMLElement)
    fireEvent.click(dialog.getByRole('button', { name: F.cancel }))
    expect(onApply).not.toHaveBeenCalled()
    dialog = openFilters()
    fireEvent.click(applyButton(dialog))
    expect((onApply.mock.calls[0]?.[0] as { sectors: string[] }).sectors).toEqual(['software_tech'])
  })

  it('« Réinitialiser les critères » vide le brouillon ; appliqué vide, il repart de zéro (onReset)', () => {
    const onReset = vi.fn()
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector({ city: 'Lyon' }), onReset, onApply })} />)
    const dialog = openFilters()
    expect(dialog.getByTestId('framing-criteria-count')).toHaveTextContent('2 critères sélectionnés')
    fireEvent.click(dialog.getAllByRole('button', { name: F.reset })[0] as HTMLElement)
    expect(dialog.getByTestId('framing-criteria-count')).toHaveTextContent(F.criteriaCount_zero)
    fireEvent.click(applyButton(dialog))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('les affinages d’écran (fit) voyagent avec le brouillon', async () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('relation')
    const fitField = dialog.getByText(discoverFr.rail.fitLabel).closest('div') as HTMLElement
    await chooseOption(within(fitField).getByRole('combobox'), discoverFr.rail.fit.high)
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(expect.anything(), { ...EXTRAS, fit: 'high' })
  })
})

// #4294.7 — « Déjà travaillées » se pose sous Entreprises (le rôle change l'ORDRE, jamais le CONTENU) et voyage AVEC le secteur déjà posé : un ET, pas une liste à part.
describe('FilterRail — Déjà travaillées (#4294.7)', () => {
  it('cocher la puce garde le secteur dans le même brouillon', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('companies')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.workedChip }))
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ workedOnly: true, sectors: withSector().sectors }),
      EXTRAS,
    )
  })

  it('sait dire NON : sans geste, le filtre n’est pas posé', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('companies')
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ workedOnly: false }), EXTRAS)
  })

  it('n’est PLUS sous Relation : une seule place (GA-26)', () => {
    render(<FilterRail {...props()} />)
    const dialog = openSection('relation')
    expect(dialog.queryByText(discoverFr.rail.workedLabel)).not.toBeInTheDocument()
  })
})

// #4294.7 — « Secteur privé », symétrique de « Secteur public » : même source (NAF), via le filtre d'exclusion.
describe('FilterRail — Secteur privé (#4294.7)', () => {
  const publicCodes = sectorCodesForGroup('public')

  it('cocher la puce exclut les secteurs du groupe public (NAF), sans toucher aux secteurs inclus', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('companies')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.privateSectorChip }))
    fireEvent.click(applyButton(dialog))
    const applied = onApply.mock.calls[0]?.[0] as UnifiedFilters
    expect(applied.excludeSectors).toEqual(expect.arrayContaining([...publicCodes]))
    expect(applied.sectors).toEqual(withSector().sectors)
  })

  it('sait dire NON : sans geste, aucun secteur public n’est exclu', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('companies')
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ excludeSectors: [] }), EXTRAS)
  })
})

describe('FilterRail — « N comptes » recalculé en direct (#4494.3)', () => {
  it('lit le compte sur le brouillon, et le recalcule à chaque coche', () => {
    const countFor = vi.fn((draft: UnifiedFilters) => (draft.excludeListed ? 3 : 12))
    render(<FilterRail {...props({ filters: withSector(), countFor })} />)
    const dialog = openSection('size')
    expect(dialog.getByTestId('framing-live-count')).toHaveTextContent('12 comptes')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.excludeListedChip }))
    expect(dialog.getByTestId('framing-live-count')).toHaveTextContent('3 comptes')
    expect(countFor).toHaveBeenLastCalledWith(expect.objectContaining({ excludeListed: true }), EXTRAS)
  })

  it('non calculable sans relancer : AUCUN chiffre, la raison dite (jamais « 0 compte »)', () => {
    render(<FilterRail {...props({ filters: withSector(), countFor: () => null })} />)
    const dialog = openFilters()
    const live = dialog.getByTestId('framing-live-count')
    expect(live).toHaveTextContent(F.accountsUnknown)
    expect(live.textContent).not.toMatch(/\d/)
  })
})

describe('FilterRail — #3878.1 / #3705 : une contradiction se dit AVANT le lancement', () => {
  it('CA min > CA max désactive « Explorer » ET « Appliquer et explorer », raison nommée aux deux endroits', () => {
    const filters = withSector({ revenueMin: '5000000', revenueMax: '1000000' })
    render(<FilterRail {...props({ filters })} />)
    expect(screen.getByRole('button', { name: discoverFr.explore.submit })).toBeDisabled()
    expect(screen.getByText(discoverFr.rail.inconsistentCriteria)).toBeInTheDocument()
    const dialog = openFilters()
    expect(applyButton(dialog)).toBeDisabled()
    expect(dialog.getByText(discoverFr.rail.inconsistentCriteria)).toBeInTheDocument()
  })

  it('un secteur coché ET exclu : même raison nommée', () => {
    render(<FilterRail {...props({ filters: withSector({ excludeSectors: ['software_tech'] }) })} />)
    expect(screen.getByText(discoverFr.rail.inconsistentCriteria)).toBeInTheDocument()
  })

  it('des critères compatibles ne montrent jamais la raison de contradiction', () => {
    render(<FilterRail {...props({ filters: withSector({ revenueMin: '1000000', revenueMax: '5000000' }) })} />)
    expect(screen.queryByText(discoverFr.rail.inconsistentCriteria)).not.toBeInTheDocument()
  })

  it('S.4 — un croisement d’écran posé seul : « Appliquer et explorer » grisé dit qu’il affine sans lancer', () => {
    render(<FilterRail {...props()} />)
    const dialog = openSection('relation')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.filters.decisionLevelValue.c_level }))
    expect(applyButton(dialog)).toBeDisabled()
    expect(dialog.getByText(discoverFr.rail.refineOnly)).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  Chaque filtre d'avant, dans SA rubrique                             */
/* ------------------------------------------------------------------ */

describe('FilterRail — aucun filtre perdu : chaque rubrique porte les siens (#4494.4)', () => {
  const R = discoverFr.rail
  const reg = discoverFr.registry
  const EXPECTED: Record<(typeof FRAMING_SECTIONS)[number], string[]> = {
    companies: [
      R.sectorsLabel,
      R.excludeSectorsLabel,
      R.privateSectorLabel,
      R.workedLabel,
      reg.ageLabel,
      R.legalFormLabel,
      R.revenueLabel,
      reg.nafLabel,
    ],
    territory: [reg.cityLabel, R.cityRadiusLabel, reg.departmentsLabel, R.siteBasisLabel, R.regionLabel],
    expertise: [R.keywordsLabel, R.externalRecourseObservedLabel, R.contractRecourseLabel],
    signals: [R.intentLabel, discoverFr.signalsMode.recencyLabel],
    relation: [discoverFr.filters.decisionLevel, R.fitLabel],
    size: [R.companyCategoryLabel, R.middleMarketLabel, R.excludeListedLabel, R.startupSegmentLabel, R.groupRoleLabel],
  }
  it.each(FRAMING_SECTIONS)('%s', section => {
    render(<FilterRail {...props()} />)
    const dialog = openSection(section)
    for (const label of EXPECTED[section]) expect(dialog.getByText(label), label).toBeInTheDocument()
  })

  it('« Augmentation de capital » est dans Signaux, UNE fois sur tout l’écran (GA-26)', () => {
    render(<FilterRail {...props()} />)
    expect(screen.queryByRole('button', { name: /^augmentation de capital$/i })).not.toBeInTheDocument()
    const dialog = openSection('signals')
    expect(dialog.getAllByRole('button', { name: /^augmentation de capital$/i })).toHaveLength(1)
  })

  it('les modalités de recrutement n’apparaissent qu’avec le signal « Recrutement » coché', () => {
    render(<FilterRail {...props()} />)
    const dialog = openSection('signals')
    expect(dialog.queryByText(discoverFr.rail.cdiOnlyLabel)).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: /^recrutement$/i }))
    for (const label of [
      discoverFr.rail.cdiOnlyLabel,
      discoverFr.rail.remotePolicyLabel,
      discoverFr.rail.seniorityLabel,
      discoverFr.rail.deliveryFitLabel,
    ])
      expect(dialog.getByText(label)).toBeInTheDocument()
  })

  it('#5000 — le filtre de contrat propose CDD et intérim, exclusifs entre eux', () => {
    render(<FilterRail {...props()} />)
    const dialog = openSection('signals')
    fireEvent.click(dialog.getByRole('button', { name: /^recrutement$/i }))
    const cdd = dialog.getByRole('button', { name: discoverFr.rail.cddOnlyChip })
    const interim = dialog.getByRole('button', { name: discoverFr.rail.interimOnlyChip })
    fireEvent.click(cdd)
    expect(cdd).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(interim)
    expect(interim).toHaveAttribute('aria-pressed', 'true')
    expect(cdd).toHaveAttribute('aria-pressed', 'false')
  })

  it('les filtres partenaires : seulement branchés ET en mode ESN (ou vue Partenaires)', () => {
    render(<FilterRail {...props({ partnerFilters: true })} />)
    let dialog = openSection('relation')
    expect(dialog.queryByText(discoverFr.rail.minAccountsSeenLabel)).not.toBeInTheDocument()
    cleanup()
    render(<FilterRail {...props({ partnerFilters: true, resultType: 'partners' })} />)
    dialog = openSection('relation')
    for (const label of [
      discoverFr.rail.minAccountsSeenLabel,
      discoverFr.rail.existingRelationshipLabel,
      discoverFr.rail.rank2OpeningLabel,
      discoverFr.rail.observedClientsLabel,
      discoverFr.rail.expertiseKnownLabel,
      discoverFr.rail.complementarityKnownLabel,
    ])
      expect(dialog.getByText(label)).toBeInTheDocument()
    cleanup()
    render(<FilterRail {...props({ resultType: 'partners' })} />)
    dialog = openSection('relation')
    expect(dialog.queryByText(discoverFr.rail.minAccountsSeenLabel)).not.toBeInTheDocument()
  })

  it('« vu sur N dossiers » vidé repose `null`, jamais 0', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ partnerFilters: true, resultType: 'partners', filters: withSector(), onApply })} />)
    const dialog = openSection('relation')
    const input = dialog.getByPlaceholderText(discoverFr.rail.minAccountsSeenPlaceholder)
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ minAccountsSeen: null }))
  })

  it('Théo decouvrir.A1 — « Comme tes comptes » ouvre la recherche par comptes comparables', () => {
    const onOpenSimilar = vi.fn()
    render(<FilterRail {...props({ onOpenSimilar })} />)
    const dialog = openSection('relation')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.similarToggle }))
    expect(onOpenSimilar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('FilterRail — les gestes de chaque rubrique écrivent le bon critère', () => {
  it('#3908 — plusieurs tailles se cochent ensemble (union, pas un remplacement)', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('size')
    fireEvent.click(dialog.getByRole('button', { name: 'ETI' }))
    fireEvent.click(dialog.getByRole('button', { name: 'GC' }))
    fireEvent.click(applyButton(dialog))
    const draft = onApply.mock.calls[0]?.[0] as UnifiedFilters
    const ranges = SIZE_BANDS.filter(band => band.code === 'ETI' || band.code === 'GC').flatMap(band => band.ranges)
    expect(draft.headcount).toEqual(expect.arrayContaining(ranges))
    expect(buildRegistryQuery(draft, Date.now())?.filters).toBeDefined()
  })

  it('#2642.1 — plusieurs régions ensemble ; « Toute la France » les retire d’un clic', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector({ region: ['11'] }), onApply })} />)
    const dialog = openSection('territory')
    fireEvent.click(dialog.getByRole('button', { name: 'Occitanie' }))
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ region: ['11', '76'] }), EXTRAS)
    const again = openSection('territory')
    fireEvent.click(again.getByRole('button', { name: discoverFr.rail.regionAll }))
    fireEvent.click(applyButton(again))
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ region: [] }), EXTRAS)
  })

  it('#3941.1 — « Startup » pose âge, forme et taille en un geste, et se retire de même', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('size')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.startupSegmentChip }))
    fireEvent.click(applyButton(dialog))
    const draft = onApply.mock.calls[0]?.[0] as UnifiedFilters
    expect(draft.age).not.toBe('any')
    expect(draft.legalForm).not.toBe('')
    expect(draft.headcount.length).toBeGreaterThan(0)
  })

  it('#4361.1 — « Middle market » pose ses bornes ET retire les cotées', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: withSector(), onApply })} />)
    const dialog = openSection('size')
    fireEvent.click(dialog.getByRole('button', { name: discoverFr.rail.middleMarketChip }))
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ excludeListed: true }), EXTRAS)
  })

  it('R22-DV4 — le champ Compétences garde l’espace tapé, et écrit offres ET techno', () => {
    const onApply = vi.fn()
    render(
      <FilterRail
        {...props({ filters: withSector({ keywords: 'archi ', technologiesObserved: 'archi ' }), onApply })}
      />,
    )
    const dialog = openSection('expertise')
    const field = dialog.getByPlaceholderText(/^ex\. SAP, data, cloud/) as HTMLInputElement
    expect(field.value).toBe('archi ')
    fireEvent.change(field, { target: { value: 'archi cyber' } })
    fireEvent.click(applyButton(dialog))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ keywords: 'archi cyber', technologiesObserved: 'archi cyber' }),
      EXTRAS,
    )
  })

  it('« Tout choisir » coche toute une famille de secteurs', () => {
    const onApply = vi.fn()
    render(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), city: 'Lyon' }, onApply })} />)
    const dialog = openFilters()
    const family = dialog.getAllByTestId(/^sector-family-/)[0] as HTMLElement
    fireEvent.click(within(family).getByRole('button', { name: /^tout choisir dans /i }))
    // Sous le plafond de secteurs d'une recherche, ce qui entre est coché ; ce qui n'entre pas est NOMMÉ (#3815).
    const checked = within(family)
      .getAllByRole('checkbox')
      .filter(box => (box as HTMLInputElement).checked)
    expect(checked.length).toBeGreaterThan(0)
    fireEvent.click(applyButton(dialog))
    expect((onApply.mock.calls[0]?.[0] as UnifiedFilters).sectors.length).toBe(checked.length)
  })

  it('#2291.2 — « recourt au freelance » coché DIT les comptes retirés faute d’observation ; zéro ne se dit pas', () => {
    render(
      <FilterRail
        {...props({
          filters: withSector({ contractRecourseObserved: true }),
          contractRecourseImpact: { removedCount: 5, unknownCount: 4 },
        })}
      />,
    )
    expect(openSection('expertise').getByText(/4 comptes retirés faute d’observation/)).toBeInTheDocument()
    cleanup()
    render(
      <FilterRail
        {...props({
          filters: withSector({ contractRecourseObserved: true }),
          contractRecourseImpact: { removedCount: 1, unknownCount: 0 },
        })}
      />,
    )
    expect(openSection('expertise').queryByText(/faute d’observation/)).not.toBeInTheDocument()
  })
})

describe('FilterRail — critère non honoré, dit à côté de SON champ', () => {
  it('nomme la CAPACITÉ, jamais le fournisseur, et seulement sur le champ concerné', () => {
    render(<FilterRail {...props({ filters: withSector(), unapplied: new Map([['sector', ['pappers']]]) })} />)
    const dialog = openFilters()
    expect(dialog.getByText(/non appliqué par la source de données d’entreprises/i)).toBeInTheDocument()
    expect(dialog.getAllByText(/non appliqué par/i)).toHaveLength(1)
    expect(screen.queryByText(/pappers/i)).not.toBeInTheDocument()
  })

  // #4588 (jumeau, lot DÉCOUVRIR-MOTEUR 27/10) — sur une liste VIDE, « les résultats sont plus larges que demandé »
  // affirme un élargissement qui n'a rien ramené : le champ dit seulement que le critère n'a pas été appliqué.
  it('liste vide : « non appliqué » sans affirmer des résultats plus larges', () => {
    render(
      <FilterRail
        {...props({ filters: withSector(), unapplied: new Map([['sector', ['pappers']]]), listEmpty: true })}
      />,
    )
    const dialog = openFilters()
    expect(dialog.getByText(/non appliqué par la source de données d’entreprises/i)).toBeInTheDocument()
    expect(dialog.queryByText(/plus larges que demandé/i)).not.toBeInTheDocument()
  })

  it('ne dit rien quand tout a été honoré, et jamais un vocabulaire de panne', () => {
    render(<FilterRail {...props({ filters: withSector() })} />)
    const dialog = openFilters()
    expect(dialog.queryByText(/non appliqué/i)).not.toBeInTheDocument()
    expect(dialog.queryByText(/résultats partiels|incomplète|n’a pas répondu/i)).not.toBeInTheDocument()
  })
})

describe('FilterRail — chaque signal dit ce qu’il capte (#4315.3)', () => {
  it.each(['tender', 'award', 'hiring'] as const)(
    'la case « %s » porte sa phrase, lisible au clavier et au toucher',
    source => {
      render(<FilterRail {...props()} />)
      const dialog = openSection('signals')
      const chip = dialog.getByRole('button', { name: discoverFr.signalTypes[source] })
      const sentence = discoverFr.rail.signalHint[source]
      expect(sentence.length).toBeGreaterThan(10)
      // Pour un lecteur d'écran : description accessible, pas seulement `title`.
      expect(chip).toHaveAccessibleDescription(sentence)
      // Au focus (clavier) ET au toucher (le toucher donne le focus) : la phrase s'affiche.
      fireEvent.focus(chip)
      expect(dialog.getByTestId('signal-hint')).toHaveTextContent(sentence)
    },
  )
})

describe('FilterRail — lisibilité des libellés et des entrées (#4299.1)', () => {
  it('les libellés et les aides du rail sont en contraste AA, plus en gris pâle', () => {
    render(<FilterRail {...props()} />)
    const dialog = openSection('size')
    const label = dialog.getByText(discoverFr.rail.companyCategoryLabel)
    expect(label.style.color).toBe('var(--text-secondary)')
    const hint = dialog.getByText(discoverFr.rail.companyCategoryHint.replace('{{brand}}', DEFAULT_BRAND_NAME))
    expect(hint.style.color).toBe('var(--text-secondary)')
  })

  it('les libellés de filtres sont en gras', () => {
    render(<FilterRail {...props()} />)
    const label = openSection('size').getByText(discoverFr.rail.companyCategoryLabel)
    expect(label.className).toContain('font-semibold')
  })

  it('sait dire NON : aucune aide ni consigne de la modale n’est en gris pâle (muted / ghost)', () => {
    render(<FilterRail {...props()} />)
    openFilters()
    const pale = Array.from(screen.getByRole('dialog').querySelectorAll<HTMLElement>('[style]')).filter(el =>
      /text-(muted|ghost)\)/.test(el.getAttribute('style') ?? ''),
    )
    // Les icônes décoratives (sans texte) gardent leur teinte : seul le TEXTE doit tenir le contraste AA.
    expect(pale.map(el => el.textContent?.trim()).filter(Boolean)).toEqual([])
  })

  it('une valeur saisie est en gras ; un champ vide ne l’est pas', () => {
    render(<FilterRail {...props({ filters: { ...emptyUnifiedFilters(), city: 'Lyon' } })} />)
    const dialog = openSection('territory')
    expect(dialog.getByDisplayValue('Lyon').className).toContain('font-semibold')
    expect(dialog.getByPlaceholderText(discoverFr.registry.departmentsPlaceholder).className).not.toContain(
      'font-semibold',
    )
  })
})

describe('FilterRail — compteur « inconnu » des clients observés (#1912)', () => {
  const partnerProps = (over: Partial<Parameters<typeof FilterRail>[0]>) =>
    props({ partnerFilters: true, resultType: 'partners', observedClientsUnknownCount: 3, ...over })

  it('ne s’affiche que le filtre COCHÉ, jamais sans compte inconnu', () => {
    render(<FilterRail {...partnerProps({})} />)
    expect(openSection('relation').queryByText(/3 ESN gard/)).not.toBeInTheDocument()
  })

  it('s’affiche quand le filtre est coché et le compte > 0 — jamais tu en silence (doctrine c65/GA-259)', () => {
    render(<FilterRail {...partnerProps({})} />)
    const dialog = openSection('relation')
    fireEvent.click(dialog.getByText(discoverFr.rail.observedClientsChip))
    expect(dialog.getByText(/3 ESN gard/)).toBeInTheDocument()
  })

  it('un compte à zéro ne se dit pas, même coché', () => {
    render(<FilterRail {...partnerProps({ observedClientsUnknownCount: 0 })} />)
    const dialog = openSection('relation')
    fireEvent.click(dialog.getByText(discoverFr.rail.observedClientsChip))
    expect(dialog.queryByText(/ESN gard/)).not.toBeInTheDocument()
  })
})
