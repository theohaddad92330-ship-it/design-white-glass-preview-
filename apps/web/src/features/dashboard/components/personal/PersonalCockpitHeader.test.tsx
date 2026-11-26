import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PersonalCockpitHeader } from './PersonalCockpitHeader'

/**
 * L'EN-TÊTE DE « MON COCKPIT » — copie exacte et résumé prouvable
 * (#2113.19, #2113.20, #2113.21, #2113.22).
 *
 * Le retour d'origine cite : « Ton portefeuille progresse, mais trois comptes
 * restent sans prochaine action. » Cette suite ne teste QUE la seconde
 * moitié : rien dans `CockpitTrajectory` ne porte de tendance, et affirmer
 * une progression serait une donnée inventée (voir le commentaire du
 * composant).
 */
describe('PersonalCockpitHeader', () => {
  it('porte le titre et le sous-titre exacts du retour (#2113.19, #2113.20)', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ta trajectoire commerciale, Théo.')
    expect(screen.getByText(/Prends du recul sur ton portefeuille/)).toBeInTheDocument()
  })

  it('nomme le compte réel de comptes sans prochaine action (#2113.21)', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" withoutNextAction={3} />)
    expect(await screen.findByTestId('cockpit-header-summary')).toHaveTextContent(
      '3 comptes restent sans prochaine action.',
    )
  })

  it('le CTA mène au filtre réel du portefeuille, avec le compte exact (#2113.22)', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" withoutNextAction={3} />)
    const cta = await screen.findByRole('link', { name: 'Voir les 3 écarts' })
    expect(cta).toHaveAttribute('href', '/accounts?headline=withoutNextAction')
  })

  it('ne prétend AUCUNE progression que la donnée ne prouve pas', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" withoutNextAction={3} />)
    await screen.findByTestId('cockpit-header-summary')
    expect(screen.queryByText(/progresse/i)).not.toBeInTheDocument()
  })

  it('non mesuré n’est pas zéro : aucune ligne, aucun geste (GA-18/19)', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" withoutNextAction={null} />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('cockpit-header-summary')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('zéro écart réel ne s’affiche pas non plus — rien à réparer, rien à dire', async () => {
    renderWithRouter(<PersonalCockpitHeader firstName="Théo" withoutNextAction={0} />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('cockpit-header-summary')).not.toBeInTheDocument()
  })
})
