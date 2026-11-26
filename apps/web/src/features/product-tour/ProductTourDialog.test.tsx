import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouterState } from '@tanstack/react-router'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PRODUCT_TOUR_STEPS } from './tour-steps'
import { useProductTourStore } from './product-tour-store'
import { ProductTour } from './ProductTour'

// Radix a besoin de ces API pointer, absentes de jsdom (même mise en garde que
// `bottom-anchored-overlays.test.tsx`).
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

/** Affiche le chemin courant du routeur — pour prouver qu'un clic NAVIGUE
 *  vraiment, pas seulement qu'il change un état. */
function LocationProbe() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  return <div data-testid="location">{pathname}</div>
}

function renderTour(path = '/dashboard') {
  return renderWithRouter(
    <>
      <LocationProbe />
      <ProductTour />
    </>,
    path,
  )
}

describe('#1787 · #1863.3 — la visite guidée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    useProductTourStore.setState({ phase: 'off', index: 0, hasVisited: false })
  })

  it('rien ne surgit sans que la personne l’ait demandé — au repos, elle ne rend rien', () => {
    renderTour()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Visite guidée en cours' })).toBeNull()
  })

  it('lancée, elle montre la PREMIÈRE étape avec le titre du catalogue et sa promesse', async () => {
    useProductTourStore.getState().start()
    renderTour()

    const dialog = await screen.findByRole('dialog')
    const first = PRODUCT_TOUR_STEPS[0]!
    expect(within(dialog).getByText(first.screen.label.fr)).toBeInTheDocument()
    expect(
      within(dialog).getByText(i18n.t(`tour.steps.${first.key}.promise`, { ns: 'onboarding' })),
    ).toBeInTheDocument()
  })

  it('#1863.3 — elle montre les choses DANS LE DÉTAIL : trois gestes concrets par écran', async () => {
    useProductTourStore.getState().start()
    renderTour()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(i18n.t('tour.whatYouCanDo', { ns: 'onboarding' }))).toBeInTheDocument()

    const actions = i18n.t('tour.steps.dashboard.does', { ns: 'onboarding', returnObjects: true }) as string[]
    expect(actions).toHaveLength(3)
    for (const action of actions) {
      expect(within(dialog).getByText(action)).toBeInTheDocument()
    }
  })

  it('« Écran suivant » avance, et « Écran précédent » est désactivé au premier écran', async () => {
    useProductTourStore.getState().start()
    renderTour()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Écran précédent' })).toBeDisabled()

    await user().click(within(dialog).getByRole('button', { name: 'Écran suivant' }))

    const second = PRODUCT_TOUR_STEPS[1]!
    expect(within(dialog).getByText(second.screen.label.fr)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Écran précédent' })).toBeEnabled()
  })

  it('elle ne BOUCLE jamais — « Écran suivant » se désactive à la dernière étape', async () => {
    useProductTourStore.setState({ phase: 'reading', index: PRODUCT_TOUR_STEPS.length - 1, hasVisited: false })
    renderTour()

    const dialog = await screen.findByRole('dialog')
    const last = PRODUCT_TOUR_STEPS[PRODUCT_TOUR_STEPS.length - 1]!
    expect(within(dialog).getByText(last.screen.label.fr)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Écran suivant' })).toBeDisabled()
  })

  it('Échap quitte la visite — pas de demi-état où elle continuerait sans rien afficher', async () => {
    useProductTourStore.getState().start()
    renderTour()
    await screen.findByRole('dialog')

    await user().keyboard('{Escape}')

    expect(useProductTourStore.getState().phase).toBe('off')
  })

  /**
   * ⚠️ LE DÉFAUT DU LOT, ET SA MESURE.
   *
   * Avant #1863.3 : cliquer « Ouvrir cet écran » appelait `onOpenChange(false)`
   * et naviguait. Mesuré, après le clic, `queryByRole('dialog')` rendait
   * `false` et le DOM ne portait plus AUCUNE trace de la visite — on obtenait
   * la page, et on perdait la visite en l'obtenant.
   */
  it('#1863.3 — ouvrir l’écran d’une étape NAVIGUE et garde le fil : la visite reste là, sur l’écran', async () => {
    useProductTourStore.getState().start()
    renderTour()
    const dialog = await screen.findByRole('dialog')

    // On avance d'une étape : partir de « Tableau de bord » alors qu'on y est
    // déjà ne prouverait aucune navigation.
    await user().click(within(dialog).getByRole('button', { name: 'Écran suivant' }))
    const second = PRODUCT_TOUR_STEPS[1]!

    const visitButton = within(dialog).getByRole('button', { name: `Ouvrir ${second.screen.label.fr}` })
    expect(visitButton.tagName).toBe('BUTTON')
    await user().click(visitButton)

    // La modale s'efface — on vient de demander à VOIR cet écran…
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('location')).toHaveTextContent(second.route)

    // … mais la visite, elle, est TOUJOURS LÀ, et elle sait où elle en est.
    const companion = await screen.findByRole('region', { name: 'Visite guidée en cours' })
    expect(within(companion).getByText(second.screen.label.fr)).toBeInTheDocument()
    // #2155 — « Mes cibles » a rejoint la visite : le total dérive du
    // catalogue plutôt que d'être recopié en dur, sinon CE test casse à
    // chaque étape ajoutée pour une raison qui n'a rien à voir avec lui.
    expect(within(companion).getByText(`Étape 2 sur ${PRODUCT_TOUR_STEPS.length}`)).toBeInTheDocument()
  })

  it('#1863.3 — depuis l’écran, « Écran suivant » EMMÈNE sur la page suivante sans rouvrir la modale', async () => {
    useProductTourStore.setState({ phase: 'visiting', index: 1, hasVisited: true })
    renderTour(PRODUCT_TOUR_STEPS[1]!.route)

    const companion = await screen.findByRole('region', { name: 'Visite guidée en cours' })
    await user().click(within(companion).getByRole('button', { name: 'Écran suivant' }))

    const third = PRODUCT_TOUR_STEPS[2]!
    expect(screen.getByTestId('location')).toHaveTextContent(third.route)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      within(screen.getByRole('region', { name: 'Visite guidée en cours' })).getByText(third.screen.label.fr),
    ).toBeInTheDocument()
  })

  it('#1863.3 — « Revoir le détail » rouvre la modale SUR LA MÊME étape', async () => {
    useProductTourStore.setState({ phase: 'visiting', index: 4, hasVisited: true })
    renderTour(PRODUCT_TOUR_STEPS[4]!.route)

    const companion = await screen.findByRole('region', { name: 'Visite guidée en cours' })
    await user().click(within(companion).getByRole('button', { name: 'Revoir le détail' }))

    const dialog = await screen.findByRole('dialog')
    const fifth = PRODUCT_TOUR_STEPS[4]!
    expect(within(dialog).getByText(fifth.screen.label.fr)).toBeInTheDocument()
    expect(useProductTourStore.getState().index).toBe(4)
  })

  it('#1863.3 — refermer ce détail REND LA MAIN à la barre : regarder deux fois ne coûte pas la visite', async () => {
    useProductTourStore.setState({ phase: 'reading', index: 4, hasVisited: true })
    renderTour(PRODUCT_TOUR_STEPS[4]!.route)
    await screen.findByRole('dialog')

    await user().keyboard('{Escape}')

    expect(useProductTourStore.getState().phase).toBe('visiting')
    expect(useProductTourStore.getState().index).toBe(4)
    expect(await screen.findByRole('region', { name: 'Visite guidée en cours' })).toBeInTheDocument()
  })

  it('#1863.3 — la visite SE TERMINE : au dernier écran, la barre propose « Terminer la visite »', async () => {
    useProductTourStore.setState({ phase: 'visiting', index: PRODUCT_TOUR_STEPS.length - 1, hasVisited: true })
    renderTour(PRODUCT_TOUR_STEPS[PRODUCT_TOUR_STEPS.length - 1]!.route)

    const companion = await screen.findByRole('region', { name: 'Visite guidée en cours' })
    expect(within(companion).queryByRole('button', { name: 'Écran suivant' })).toBeNull()

    await user().click(within(companion).getByRole('button', { name: 'Terminer la visite' }))

    expect(useProductTourStore.getState().phase).toBe('off')
    expect(screen.queryByRole('region', { name: 'Visite guidée en cours' })).toBeNull()
  })

  it('#1863.3 — « Quitter la visite » est un bouton NOMMÉ, pas une icône muette', async () => {
    useProductTourStore.setState({ phase: 'visiting', index: 2, hasVisited: true })
    renderTour(PRODUCT_TOUR_STEPS[2]!.route)

    const companion = await screen.findByRole('region', { name: 'Visite guidée en cours' })
    const quit = within(companion).getByRole('button', { name: 'Quitter la visite' })
    expect(quit.tagName).toBe('BUTTON')

    await user().click(quit)
    expect(useProductTourStore.getState().phase).toBe('off')
  })
})
