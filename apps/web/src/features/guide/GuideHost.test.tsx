import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuideHost } from './GuideHost'
import { GUIDE_ANCHOR_ATTRIBUTE } from './guide-anchors'
import { useGuideStore } from './guide-store'
import { FEEDBACK_COACHMARK } from './guide-starters'

/**
 * LA CHAÎNE DE BOUT EN BOUT — parce qu'un moteur de guide monté nulle part ne
 * vaut rien, et qu'un moteur monté qui ne trouve jamais sa cible non plus.
 *
 * Ce test ne mesure PAS la géométrie : jsdom rend des rectangles à zéro, et un
 * test qui affirmerait une position y serait vert à tort. Le placement est
 * vérifié en pur dans `guide-spotlight-geometry.test.ts`. Ici on vérifie ce que
 * jsdom sait vraiment dire : est-ce que ça s'affiche, est-ce que ça se ferme,
 * est-ce que ça n'attrape pas les clics, et est-ce qu'une cible absente écarte
 * le pas au lieu de laisser une bulle sur du vide.
 */
vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: '/comptes' } }),
}))

function placeFeedbackButton() {
  const button = document.createElement('button')
  button.setAttribute(GUIDE_ANCHOR_ATTRIBUTE, 'retour.bouton-declencheur')
  button.textContent = 'Retour'
  document.body.appendChild(button)
  return button
}

beforeEach(() => {
  useGuideStore.setState({ session: null })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('l’hôte du guide, monté à la racine', () => {
  it('ne rend RIEN tant que personne n’a démarré une aide', () => {
    render(<GuideHost />)
    expect(screen.queryByTestId('guide-spotlight')).toBeNull()
  })

  it('désigne la cible quand on démarre le coachmark du socle', async () => {
    placeFeedbackButton()
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
    expect(await screen.findByTestId('guide-spotlight')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAccessibleName()
  })

  /**
   * #2214.16 (tranché sans Louis) — les mots qui changent la décision, en
   * semibold, jamais un paragraphe entier. `coachmark.retour.body` marque
   * désormais **la copie de l'écran** — le fait qui compte dans cette bulle.
   */
  it('met en semibold les mots qui comptent, sans jamais retirer d’asterisque du texte lu', async () => {
    placeFeedbackButton()
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
    const spotlight = await screen.findByTestId('guide-spotlight')
    const emphasis = within(spotlight).getByText("la copie de l'écran")
    expect(emphasis.tagName).toBe('SPAN')
    expect(spotlight.textContent).toContain(
      "Ce bouton est présent sur tous les écrans. Il ouvre un retour direct, avec la copie de l'écran où tu es.",
    )
    expect(spotlight.textContent).not.toContain('**')
  })

  /**
   * ⚠️ CE QUE CE TEST PROUVE, ET CE QU'IL NE PEUT PAS PROUVER — MESURÉ.
   *
   * Il prouve que l'aide ouverte ne DÉMONTE pas la cible et ne casse pas son
   * gestionnaire de clic. Il ne prouve PAS que le voile laisse passer les clics
   * (#2212.38) : vérifié en retirant `pointer-events-none` du conteneur, ce test
   * reste VERT. jsdom n'a pas de mise en page, donc une surcouche `fixed inset-0`
   * n'intercepte jamais rien ici — la garantie serait affirmée, pas mesurée.
   *
   * C'est GA-371 (`un-guide-ne-prend-jamais-la-main`) qui tient réellement
   * #2212.38, par lecture du code, et elle a été vue rouge sur ce retrait exact.
   * Le nom de ce test dit donc ce qu'il fait, pas ce qu'on aimerait qu'il fasse.
   */
  it('ne démonte pas la cible et ne casse pas son clic', async () => {
    const button = placeFeedbackButton()
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
    await screen.findByTestId('guide-spotlight')

    await userEvent.click(button)
    expect(clicked).toHaveBeenCalled()
  })

  /** #2212.40 — la sortie au pointeur. */
  it('se ferme par son bouton', async () => {
    placeFeedbackButton()
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
    await screen.findByTestId('guide-spotlight')

    await userEvent.click(screen.getByRole('button', { name: /fermer|close/i }))
    await waitFor(() => expect(screen.queryByTestId('guide-spotlight')).toBeNull())
    expect(useGuideStore.getState().session).toBeNull()
  })

  /** #2212.40 — la sortie au clavier, sans que le focus ait jamais été pris. */
  it('se ferme par Échap', async () => {
    placeFeedbackButton()
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
    await screen.findByTestId('guide-spotlight')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(useGuideStore.getState().session).toBeNull())
  })

  /**
   * #2212.37 — LA CIBLE ABSENTE. Rien n'est affiché, le pas est écarté, et le
   * fil se termine parce que c'était le seul pas. Surtout : aucune bulle posée
   * au hasard, et aucune cible inventée.
   */
  it('écarte le pas quand la cible n’est nulle part, sans rien afficher', async () => {
    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))

    await waitFor(() => expect(useGuideStore.getState().session).toBeNull(), { timeout: 4000 })
    expect(screen.queryByTestId('guide-spotlight')).toBeNull()
  })

  /**
   * #2212.36 — LE SECOURS SERT VRAIMENT. Le panneau de retour ouvert, le bouton
   * déclencheur n'est plus à l'écran : sans cible de secours, l'aide serait
   * écartée pour une raison qui n'a rien d'une panne.
   */
  it('retombe sur la cible de secours quand la principale n’est pas là', async () => {
    const panel = document.createElement('div')
    panel.setAttribute(GUIDE_ANCHOR_ATTRIBUTE, 'retour.panneau')
    document.body.appendChild(panel)

    render(<GuideHost />)
    act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))

    expect(await screen.findByTestId('guide-spotlight', {}, { timeout: 4000 })).toBeInTheDocument()
  })

  /**
   * #2212.5/#2212.11 — LE MODE `action-guidee` CONDUIT JUSQU'À L'ACTION RÉELLE.
   *
   * Le contrat (`GUIDE_MODES`, `packages/contracts/src/schemas/guide.ts:68-69`)
   * promet : « le guide montre, la personne clique. Il n'agit jamais à sa
   * place. » Un bouton « Suivant » qui avance tout seul romprait cette
   * promesse — il avancerait SANS que la cible réelle ait été cliquée. Ce mode
   * n'a donc pas de bouton « Suivant » : seul un clic sur la cible réelle
   * (celle que le halo désigne) fait avancer le fil.
   */
  describe('mode action-guidee (#2212.5, #2212.11)', () => {
    function twoStepActionGuidee() {
      return {
        mode: 'action-guidee' as const,
        level: 'walkthrough' as const,
        steps: [
          { anchor: 'retour.bouton-declencheur', titleKey: 'coachmark.retour.title', bodyKey: 'coachmark.retour.body' },
          { anchor: 'retour.panneau', titleKey: 'coachmark.retour.title', bodyKey: 'coachmark.retour.body' },
        ],
      }
    }

    it('n’affiche aucun bouton « Suivant » — le clic sur la cible est le seul chemin', async () => {
      placeFeedbackButton()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(twoStepActionGuidee()))
      await screen.findByTestId('guide-spotlight')

      expect(screen.queryByRole('button', { name: /suivant|next/i })).toBeNull()
    })

    it('le clic sur la cible réelle fait avancer le fil au pas suivant', async () => {
      const button = placeFeedbackButton()
      const businessClick = vi.fn()
      button.addEventListener('click', businessClick)
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(twoStepActionGuidee()))
      await screen.findByTestId('guide-spotlight')
      expect(useGuideStore.getState().session?.index).toBe(0)

      await userEvent.click(button)

      // #2212.5 — la vraie action métier s'est produite : le guide n'a pas agi
      // à sa place, il a seulement observé.
      expect(businessClick).toHaveBeenCalled()
      await waitFor(() => expect(useGuideStore.getState().session?.index).toBe(1))
    })

    it('le clic sur la cible du dernier pas TERMINE le fil', async () => {
      const panel = document.createElement('div')
      panel.setAttribute(GUIDE_ANCHOR_ATTRIBUTE, 'retour.panneau')
      document.body.appendChild(panel)
      render(<GuideHost />)
      act(() =>
        useGuideStore.getState().start({ ...twoStepActionGuidee(), steps: twoStepActionGuidee().steps.slice(1) }),
      )
      await screen.findByTestId('guide-spotlight')

      await userEvent.click(panel)

      await waitFor(() => expect(useGuideStore.getState().session).toBeNull())
    })

    it('le mode tutoriel garde son bouton « Suivant » — rien ne change hors action-guidee', async () => {
      placeFeedbackButton()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(FEEDBACK_COACHMARK))
      await screen.findByTestId('guide-spotlight')

      expect(screen.getByRole('button', { name: /terminer|finish/i })).toBeInTheDocument()
    })
  })

  /**
   * #2212.12 — LE RÉSULTAT RÉEL, PAS LE CLIC LUI-MÊME.
   *
   * Un pas qui déclare `awaitsResult` ne doit RIEN prouver du clic seul : le
   * moteur ne peut pas savoir si l'écriture asynchrone qu'il déclenche a
   * réussi. Il attend l'événement DOM réel, dispatché par le code métier —
   * jamais une minuterie, jamais une supposition sur le clic.
   */
  describe('un pas qui attend le résultat réel (#2212.12)', () => {
    const RESULT_EVENT = 'test:guide-result'

    function actionGuideeAwaitingResult() {
      return {
        mode: 'action-guidee' as const,
        level: 'walkthrough' as const,
        steps: [
          {
            anchor: 'retour.bouton-declencheur',
            titleKey: 'coachmark.retour.title',
            bodyKey: 'coachmark.retour.body',
            awaitsResult: { event: RESULT_EVENT },
          },
          { anchor: 'retour.panneau', titleKey: 'coachmark.retour.title', bodyKey: 'coachmark.retour.body' },
        ],
      }
    }

    it('le clic seul sur la cible n’avance PAS le fil', async () => {
      const button = placeFeedbackButton()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(actionGuideeAwaitingResult()))
      await screen.findByTestId('guide-spotlight')

      await userEvent.click(button)

      // Laisse une chance à un éventuel (mauvais) avancement asynchrone de se produire.
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(useGuideStore.getState().session?.index).toBe(0)
    })

    it('l’événement de résultat réel fait avancer le fil, le clic ne le casse pas', async () => {
      placeFeedbackButton()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(actionGuideeAwaitingResult()))
      await screen.findByTestId('guide-spotlight')

      act(() => window.dispatchEvent(new CustomEvent(RESULT_EVENT)))

      await waitFor(() => expect(useGuideStore.getState().session?.index).toBe(1))
    })

    it('un pas SANS `awaitsResult` garde l’avancement sur clic (#2212.14, inchangé)', async () => {
      const button = placeFeedbackButton()
      const businessClick = vi.fn()
      button.addEventListener('click', businessClick)
      render(<GuideHost />)
      act(() =>
        useGuideStore.getState().start({
          ...actionGuideeAwaitingResult(),
          steps: [
            {
              anchor: 'retour.bouton-declencheur',
              titleKey: 'coachmark.retour.title',
              bodyKey: 'coachmark.retour.body',
            },
          ],
        }),
      )
      await screen.findByTestId('guide-spotlight')

      await userEvent.click(button)

      expect(businessClick).toHaveBeenCalled()
      await waitFor(() => expect(useGuideStore.getState().session).toBeNull())
    })
  })

  /**
   * #2212.15 — LE CONTENU DE DÉCLENCHEMENT REMPLACE SUIVANT PAR UN CHOIX.
   */
  describe('un pas avec des actions de déclenchement (#2212.15)', () => {
    function placeSearchInput() {
      const input = document.createElement('input')
      input.setAttribute(GUIDE_ANCHOR_ATTRIBUTE, 'retour.bouton-declencheur')
      document.body.appendChild(input)
      return input
    }

    // Les libellés réutilisent des clés RÉELLES du catalogue (jamais une clé fictive créée pour le seul test).
    // #2212.15 (retrait) — `fill-and-advance` n'existe plus (garde #3646) : seul `advance` reste.
    const CHOICE_A = 'start.label'
    const CHOICE_B = 'coachmark.retour.title'
    function sessionWithActions() {
      return {
        mode: 'tutoriel' as const,
        level: 'coachmark' as const,
        steps: [
          {
            anchor: 'retour.bouton-declencheur',
            titleKey: 'coachmark.retour.title',
            bodyKey: 'coachmark.retour.body',
            actions: [
              { kind: 'advance' as const, labelKey: CHOICE_A },
              { kind: 'advance' as const, labelKey: CHOICE_B },
            ],
          },
        ],
      }
    }

    it('n’affiche ni « Suivant » ni « Précédent » — seuls les choix déclarés apparaissent', async () => {
      placeSearchInput()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(sessionWithActions()))
      await screen.findByTestId('guide-spotlight')

      expect(screen.queryByRole('button', { name: /^suivant$|^next$|^précédent$|^previous$/i })).toBeNull()
      expect(screen.getByRole('button', { name: /^Me montrer/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Dire ce qui ne va pas' })).toBeInTheDocument()
    })

    it('« advance » avance SANS rien remplir', async () => {
      const input = placeSearchInput()
      render(<GuideHost />)
      act(() => useGuideStore.getState().start(sessionWithActions()))
      await screen.findByTestId('guide-spotlight')

      await userEvent.click(screen.getByRole('button', { name: 'Dire ce qui ne va pas' }))

      expect(input.value).toBe('')
      await waitFor(() => expect(useGuideStore.getState().session).toBeNull())
    })
  })
})
