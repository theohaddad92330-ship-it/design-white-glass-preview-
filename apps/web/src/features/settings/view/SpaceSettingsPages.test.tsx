import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

vi.mock('@/features/business-units/view/BusinessUnitAdminView', () => ({
  BusinessUnitAdminView: () => <p>VUE-AGENCES</p>,
}))
vi.mock('@/features/legal-entities/view/LegalEntitiesView', () => ({ LegalEntitiesView: () => <p>VUE-SOCIETES</p> }))
vi.mock('@/features/team-guardrails/components/DoNotContactView', () => ({
  DoNotContactView: () => <p>VUE-NE-PAS-CONTACTER</p>,
}))
vi.mock('./WorkspaceRulesView', () => ({ WorkspaceRulesView: () => <p>VUE-ACCES</p> }))
vi.mock('./PipelineSlaView', () => ({ PipelineSlaView: () => <p>VUE-PIPELINE</p> }))
vi.mock('./CommercialLoadSettingsView', () => ({ CommercialLoadSettingsView: () => <p>VUE-CHARGE</p> }))
vi.mock('./ReverseMarketSettingsView', () => ({ ReverseMarketSettingsView: () => <p>VUE-MARCHE-INVERSE</p> }))
vi.mock('./FinanceSettingsView', () => ({ FinanceSettingsView: () => <p>VUE-MARGE</p> }))
vi.mock('@/features/expenses/view/ExpensePolicyEditor', () => ({ ExpensePolicyEditor: () => <p>VUE-FRAIS</p> }))
vi.mock('@/features/qualification-grid/view/QualificationGridSection', () => ({
  QualificationGridSection: () => <p>VUE-GRILLE</p>,
}))
vi.mock('./BetProfilesSection', () => ({ BetProfilesSection: () => <p>VUE-PARI</p> }))
vi.mock('./ChatEvalSamplingSection', () => ({ ChatEvalSamplingSection: () => <p>VUE-ECHANTILLONS</p> }))
vi.mock('@/features/catalogues/view/CataloguesPage', () => ({
  CataloguesView: ({ only }: { only?: readonly string[] }) => <p>CATALOGUES:{(only ?? []).join(',')}</p>,
}))
vi.mock('@/features/catalogues/view/SkillAliasQueue', () => ({ SkillAliasQueue: () => <p>VUE-ALIAS</p> }))
vi.mock('@/features/lexicon/view/LexiconPage', () => ({ LexiconView: () => <p>VUE-LEXIQUE</p> }))
vi.mock('./BrandingView', () => ({ BrandingView: () => <p>VUE-MARQUE</p> }))

const { SpaceBrandPage, SpaceCataloguesPage, SpacePerimetersPage, SpaceRulesPage } =
  await import('./SpaceSettingsPages')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

/**
 * Théo D settings-espace.R2 / R3 / R4 / R5 — les pages d'onglets de Mon espace MONTENT les vues qui portent déjà
 * chaque réglage. Aucun onglet ne recode un réglage ; aucun ne disparaît.
 */
describe('Réglages › Mon espace — pages à onglets', () => {
  it('Règles métier : les sept onglets de la maquette amendée, dans l’ordre', () => {
    render(<SpaceRulesPage tab="acces" onTabChange={vi.fn()} />)
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent)
    expect(tabs).toEqual(['Accès', 'Pipeline', 'Charge', 'Marché inversé', 'Frais', 'Marge', 'Qualité'])
  })

  it('Accès : les règles d’espace ET « Ne pas contacter » (A1) sur le même onglet', () => {
    render(<SpaceRulesPage tab="acces" onTabChange={vi.fn()} />)
    expect(screen.getByText('VUE-ACCES')).toBeInTheDocument()
    expect(screen.getByText('VUE-NE-PAS-CONTACTER')).toBeInTheDocument()
  })

  it('Frais : le barème de frais (HT-5) ; Qualité : grille, garde-fous, profils de pari, échantillons (A3)', () => {
    const { unmount } = render(<SpaceRulesPage tab="frais" onTabChange={vi.fn()} />)
    expect(screen.getByText('VUE-FRAIS')).toBeInTheDocument()
    unmount()

    render(<SpaceRulesPage tab="qualite" onTabChange={vi.fn()} />)
    expect(screen.getByText('VUE-GRILLE')).toBeInTheDocument()
    expect(screen.getByText('Garde-fous non négociables')).toBeInTheDocument()
    expect(screen.getByText('Aucun envoi sans toi')).toBeInTheDocument()
    expect(screen.getByText('VUE-PARI')).toBeInTheDocument()
    expect(screen.getByText('VUE-ECHANTILLONS')).toBeInTheDocument()
  })

  it('un clic sur un onglet demande SA clé à l’adresse', async () => {
    const onTabChange = vi.fn()
    render(<SpaceRulesPage tab="acces" onTabChange={onTabChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Marché inversé' }))
    expect(onTabChange).toHaveBeenCalledWith('marche-inverse')
  })

  it('Périmètres & sociétés : deux onglets, une vue chacun', () => {
    const { unmount } = render(<SpacePerimetersPage tab="agences" onTabChange={vi.fn()} />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Équipes & agences', 'Sociétés'])
    expect(screen.getByText('VUE-AGENCES')).toBeInTheDocument()
    unmount()
    render(<SpacePerimetersPage tab="societes" onTabChange={vi.fn()} />)
    expect(screen.getByText('VUE-SOCIETES')).toBeInTheDocument()
  })

  it('Catalogues : un catalogue par onglet, le vocabulaire gardant lexique, compétences à rapprocher et référentiels fermés', () => {
    const { unmount } = render(<SpaceCataloguesPage tab="comptes-ecartes" onTabChange={vi.fn()} />)
    expect(screen.getByText('CATALOGUES:account_park_reasons')).toBeInTheDocument()
    unmount()

    render(<SpaceCataloguesPage tab="vocabulaire" onTabChange={vi.fn()} />)
    expect(screen.getByText('VUE-LEXIQUE')).toBeInTheDocument()
    expect(screen.getByText('VUE-ALIAS')).toBeInTheDocument()
    // Rien ne se perd : les cinq référentiels fermés restent lisibles.
    expect(
      screen.getByText(
        'CATALOGUES:pipeline_stage_labels,submission_outcome_reasons,normalised_skills,offers,custom_fields',
      ),
    ).toBeInTheDocument()
  })

  it('Marque & documents : la vue de la marque, qui porte son propre en-tête', () => {
    render(<SpaceBrandPage />)
    expect(screen.getByText('VUE-MARQUE')).toBeInTheDocument()
  })

  it('chaque page à onglets porte UN en-tête (eyebrow · titre · phrase), avant ses onglets', () => {
    const { unmount } = render(<SpaceRulesPage tab="acces" onTabChange={vi.fn()} />)
    expect(screen.getByText('Paramètres · Espace')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Règles métier' })).toBeInTheDocument()
    expect(screen.getByText('Quelques règles explicites, sans refaire les parcours de travail.')).toBeInTheDocument()
    unmount()
    const perimeters = render(<SpacePerimetersPage tab="agences" onTabChange={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Périmètres de travail' })).toBeInTheDocument()
    perimeters.unmount()
    render(<SpaceCataloguesPage tab="motifs-perte" onTabChange={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Catalogues & vocabulaire' })).toBeInTheDocument()
  })
})
