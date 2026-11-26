import { render, screen } from '@testing-library/react'
import fr from '@/i18n/locales/fr/targets.json'
import en from '@/i18n/locales/en/targets.json'

const firstName = { value: 'Maëlle' }
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => firstName.value }))

const { ScreenIntro } = await import('@/components/primitives/ScreenIntro')

/**
 * #4088.1 — L'ENTÊTE DE « MES CIBLES » : « Ce qui bouge sur tes comptes ».
 *
 * (Remplace la garde de #2156.49, qui exigeait le prénom dans le titre : le
 * titre demandé par Louis le 12/10/2026 est sans prénom, la phrase se suffit.)
 * Le titre ne porte donc plus de gabarit `{{firstName}}` : un gabarit non
 * substitué écrirait `{{…}}` à l'écran. La garde prouve, EN RENDANT, que le
 * titre sort identique avec ou sans prénom connu, sans accroc ni « undefined ».
 */
describe('Mes cibles — l’entête « Ce qui bouge sur tes comptes » (#4088.1)', () => {
  beforeEach(() => {
    firstName.value = 'Maëlle'
  })

  it('le titre est le même avec ou sans prénom, et ne porte aucun gabarit', () => {
    for (const bundle of [fr, en]) {
      expect(bundle.page.introTitle).not.toContain('{{')
      expect(bundle.page.introTitleWithoutName).toBe(bundle.page.introTitle)
    }
  })

  it('le h1 et le sous-titre sont ceux demandés (FR)', () => {
    render(<ScreenIntro title={fr.page.introTitle} titleWithoutName={fr.page.introTitleWithoutName} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ce qui bouge sur tes comptes')
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('Maëlle')
  })

  // Refonte Théo (maquette validée `decouvrir/mes-cibles.html`) — la phrase sous le titre est celle de
  // Laura, au prénom : « Maëlle, ici tu suis tes comptes… ». Sans prénom connu, la forme sans prénom.
  it('la phrase de Laura porte le prénom, et sa forme sans prénom n’a aucun gabarit', () => {
    for (const bundle of [fr, en]) {
      expect(bundle.page.introSubtitle).toContain('{{firstName}}')
      expect(bundle.page.introSubtitleWithoutName).not.toContain('{{')
    }
    expect(fr.page.introSubtitle.replace('{{firstName}}', 'Maëlle')).toBe(
      'Maëlle, ici tu suis tes comptes : ce qui change, pourquoi ça compte, et quoi faire. Plus bas, les pistes que j’ai repérées attendent ta décision.',
    )
  })

  it('prénom inconnu — même titre, jamais « undefined »', () => {
    firstName.value = ''

    render(<ScreenIntro title={fr.page.introTitle} titleWithoutName={fr.page.introTitleWithoutName} />)

    const titre = screen.getByRole('heading', { level: 1 })
    expect(titre).toHaveTextContent('Ce qui bouge sur tes comptes')
    expect(titre.textContent).not.toContain('undefined')
  })

  it('l’anglais est rédigé, pas recopié du français', () => {
    render(<ScreenIntro title={en.page.introTitle} titleWithoutName={en.page.introTitleWithoutName} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is moving on your accounts')
    expect(en.page.introTitle).not.toBe(fr.page.introTitle)
  })
})
