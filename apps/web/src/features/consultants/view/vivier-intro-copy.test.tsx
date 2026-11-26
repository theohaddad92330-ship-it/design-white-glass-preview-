import { render, screen } from '@testing-library/react'
import fr from '@/i18n/locales/fr/consultants.json'
import en from '@/i18n/locales/en/consultants.json'

const firstName = { value: 'Antoine' }
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName.value }))

const { ScreenIntro } = await import('@/components/primitives/ScreenIntro')

/**
 * Refonte Théo (23/10/2026) — L'ENTÊTE DU VIVIER SE NOMME « Vivier ».
 *
 * La maquette de Théo (`c/talents-vivier`) ET notre maquette validée du 19/10
 * (`maq-talents-19-10`, `vivier.html#vivier-entete`) titrent toutes deux
 * « Vivier », avec la phrase de l'écran dessous. « Ton vivier, Antoine. »
 * (#2182.4) cède à ces deux sources concordantes : le titre ne dépend plus du
 * prénom, dans aucune langue — et ne laisse jamais traîner un gabarit.
 */
describe('Vivier — l’entête de la maquette', () => {
  beforeEach(() => {
    firstName.value = 'Antoine'
  })

  it('le titre est le même avec ou sans prénom, et ne porte aucun gabarit', () => {
    for (const bundle of [fr, en]) {
      expect(bundle.page.introTitle).not.toContain('{{')
      expect(bundle.page.introTitle).toBe(bundle.page.introTitleWithoutName)
    }
  })

  it('le h1 dit « Vivier » et la phrase de la maquette suit', () => {
    render(
      <ScreenIntro
        title={fr.page.introTitle}
        titleWithoutName={fr.page.introTitleWithoutName}
        subtitle={fr.page.introSubtitle}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Vivier$/)
    expect(
      screen.getByText(
        'Retrouver les bonnes expertises, vérifier la disponibilité, préparer le prochain positionnement.',
      ),
    ).toBeInTheDocument()
  })

  it('prénom inconnu — même titre, jamais « undefined »', () => {
    firstName.value = ''
    render(<ScreenIntro title={fr.page.introTitle} titleWithoutName={fr.page.introTitleWithoutName} />)
    const titre = screen.getByRole('heading', { level: 1 })
    expect(titre).toHaveTextContent(/^Vivier$/)
    expect(titre.textContent).not.toContain('undefined')
  })

  it('l’anglais est rédigé, pas recopié du français', () => {
    render(<ScreenIntro title={en.page.introTitle} titleWithoutName={en.page.introTitleWithoutName} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(fr.page.introTitle)
  })
})
