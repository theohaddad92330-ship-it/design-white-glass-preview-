import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { chooseOption } from '@/test/select'
import { TalentFilters } from './TalentFilters'

/**
 * Les vues et filtres du vivier, montés pour de vrai.
 *
 * La leçon du chantier précédent : un composant peut être vert en test unitaire
 * et INERTE une fois monté (un `disabled` de trop avait tué un glisser-déposer
 * sous trois gardes vertes). On vérifie donc que cliquer produit bien le
 * changement de filtre attendu, pas seulement que la fonction pure est juste.
 *
 * #4500 (refonte V22) — la barre ne garde que la recherche, le bouton « Filtres »
 * et la bascule Liste · Cartes ; tout le reste vit dans la modale
 * (`TalentFilterDialog.test.tsx`), qui monte `SavedTalentViews` — ses trois hooks
 * sont hors sujet ici.
 */
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSavedView: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'me' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
type Props = Parameters<typeof TalentFilters>[0]

function draw(props: Partial<Props> = {}) {
  const onChange = vi.fn()
  const onView = vi.fn()
  const onLayoutChange = vi.fn()
  render(
    <TalentFilters
      query={{ skills: [] }}
      onChange={onChange}
      onView={onView}
      layout="list"
      onLayoutChange={onLayoutChange}
      {...props}
    />,
  )
  return { onChange, onView, onLayoutChange }
}

/** Les positions dans le document, pour vérifier un ORDRE sans dépendre du balisage. */
function before(a: HTMLElement, b: HTMLElement): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('TalentFilters — la barre allégée (#4500)', () => {
  it('la barre : recherche → « Filtres » → Liste · Cartes, et RIEN d’autre à plat', () => {
    cleanup()
    draw()
    const search = screen.getByLabelText('Rechercher un talent')
    const filters = screen.getByRole('button', { name: 'Filtres' })
    const cards = screen.getByRole('button', { name: 'Cartes' })
    expect(before(search, filters)).toBe(true)
    expect(before(filters, cards)).toBe(true)
    // Les filtres d'avant ne sont plus dans la barre : ils vivent dans la modale.
    for (const label of ['Vues rapides du vivier', 'Compétences', 'Secteur', 'Type de profil']) {
      expect(screen.queryByLabelText(label)).toBeNull()
    }
    expect(screen.queryByRole('button', { name: 'Afficher les archivés' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mes vues' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Plus de filtres/ })).toBeNull()
  })

  it('la recherche filtre sans ouvrir la modale', () => {
    cleanup()
    const { onChange } = draw()
    fireEvent.change(screen.getByLabelText('Rechercher un talent'), { target: { value: 'Kaczmarek' } })
    expect(onChange).toHaveBeenCalledWith({ q: 'Kaczmarek' })
  })

  it('« Filtres » ouvre la modale « Filtrer mon vivier »', () => {
    cleanup()
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    expect(screen.getByRole('dialog', { name: 'Filtrer mon vivier' })).toBeInTheDocument()
    expect(screen.getByLabelText('Séniorité')).toBeInTheDocument()
  })

  it('le bouton dit combien de critères sont posés — une vue rapide compte pour UN', () => {
    cleanup()
    draw({
      query: { skills: ['Java'], seniority: 'senior', availability: 'immediate', derived: 'available' },
      activeView: 'on_bench',
    })
    expect(screen.getByRole('button', { name: 'Filtres · 4' })).toBeInTheDocument()
  })

  it('appliquer la modale pose la vue ET ses critères', async () => {
    cleanup()
    const { onChange, onView } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }))
    await chooseOption(screen.getByLabelText('Vue rapide'), 'En intercontrat')
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les filtres' }))
    expect(onView).toHaveBeenCalledWith('on_bench')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ derived: 'available' }))
  })

  it('#2697 — la vue de disponibilité incertaine porte le MÊME libellé que le badge de fiche', () => {
    cleanup()
    draw({ query: { skills: [], derived: 'unknown' }, activeView: 'to_revalidate' })
    expect(screen.getByText('À confirmer')).toBeInTheDocument()
  })

  it('n’affiche la barre de rappel QUE quand un filtre est posé, et une vue s’y nomme UNE fois', () => {
    cleanup()
    draw()
    expect(screen.queryByText('Tout effacer')).toBeNull()
    cleanup()
    draw({ query: { skills: [], kind: 'candidate' }, activeView: 'candidates' })
    expect(screen.getByText('Tout effacer')).toBeInTheDocument()
    expect(screen.getAllByText('Candidats')).toHaveLength(1)
  })

  it('la barre de rappel nomme les critères posés, et « Tout effacer » les retire tous — archivés compris', () => {
    cleanup()
    const { onChange, onView } = draw({
      query: { skills: ['Java'], seniority: 'senior', availability: 'immediate', includeArchived: true },
    })
    expect(screen.getByText('Senior')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText('Compétences : Java')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tout effacer'))
    expect(onView).toHaveBeenCalledWith(null)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        availability: undefined,
        seniority: undefined,
        includeArchived: undefined,
        skills: [],
      }),
    )
  })

  it('la bascule « Cartes » change l’affichage', () => {
    cleanup()
    const { onLayoutChange } = draw()
    fireEvent.click(screen.getByRole('button', { name: 'Cartes' }))
    expect(onLayoutChange).toHaveBeenCalledWith('cards')
  })
})
