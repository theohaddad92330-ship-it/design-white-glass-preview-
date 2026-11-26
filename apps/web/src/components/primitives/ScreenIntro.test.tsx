import { render, screen } from '@testing-library/react'

const firstName = { value: 'Maëlle' }
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName.value }))

const { ScreenIntro } = await import('./ScreenIntro')

/**
 * L'ENTÊTE D'ÉCRAN — la forme demandée par NEUF retours du 02/09.
 *
 * Ce que la garde défend : que l'entête sache se passer du prénom. Les neuf
 * issues l'écrivent toutes avec un prénom en dur, et un écran qui afficherait
 * « Tes favoris, » suivi d'un vide serait pire que le titre nu.
 */
describe('l’entête d’un écran', () => {
  beforeEach(() => {
    firstName.value = 'Maëlle'
  })

  it('porte le titre personnalisé et son sous-titre', () => {
    render(
      <ScreenIntro
        title="Tes favoris, {{firstName}}"
        titleWithoutName="Tes favoris"
        subtitle="Retrouve ici ce que tu gardes sous la main."
      />,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tes favoris, Maëlle')
    expect(screen.getByText('Retrouve ici ce que tu gardes sous la main.')).toBeInTheDocument()
  })

  it('retombe sur la formule SANS prénom quand on ne le connaît pas', () => {
    firstName.value = ''

    render(<ScreenIntro title="Tes favoris, {{firstName}}" titleWithoutName="Tes favoris" subtitle="Peu importe." />)

    const titre = screen.getByRole('heading', { level: 1 })
    expect(titre).toHaveTextContent('Tes favoris')
    // Ni virgule orpheline, ni gabarit non substitué, ni « Utilisateur ».
    expect(titre.textContent).not.toMatch(/,\s*$/)
    expect(titre.textContent).not.toContain('{{')
    expect(titre.textContent).not.toContain('Utilisateur')
  })

  it('le titre est un h1 — un écran a UN titre, et il s’annonce', () => {
    render(<ScreenIntro title="X, {{firstName}}" titleWithoutName="X" subtitle="Y" />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('un sous-titre absent ne laisse pas de paragraphe vide', () => {
    const { container } = render(<ScreenIntro title="X, {{firstName}}" titleWithoutName="X" />)

    expect(container.querySelectorAll('p')).toHaveLength(0)
  })

  // #2476 — le slot `action` : partagé par les écrans dont l'entête de
  // `PageHeader` ne porte pas de titre (le nom « vit dans les onglets »),
  // pour que leur bouton d'entête ne se retrouve pas seul sur sa ligne.
  it('#2476 — sans action, le rendu reste EXACTEMENT celui d’avant (pas de rangée)', () => {
    const { container } = render(<ScreenIntro title="X, {{firstName}}" titleWithoutName="X" subtitle="Y" />)

    expect(container.querySelector('.justify-between')).toBeNull()
  })

  it('#2476 — avec une action, elle partage la ligne du titre', () => {
    render(
      <ScreenIntro
        title="X, {{firstName}}"
        titleWithoutName="X"
        subtitle="Y"
        action={<button type="button">Ajouter</button>}
      />,
    )

    const heading = screen.getByRole('heading', { level: 1 })
    const button = screen.getByRole('button', { name: 'Ajouter' })
    const row = heading.closest('.justify-between')
    expect(row).not.toBeNull()
    expect(row).toContainElement(button)
  })
})
