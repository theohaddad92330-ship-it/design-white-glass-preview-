import type { Account } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignalPrograms, usableSignalPrograms } from './SignalPrograms'
import { rememberProgramsArrival } from './programsArrival'

function account(rawAnalysis: Record<string, unknown>): Account {
  return { id: 'a1', last_analyzed_at: null, raw_analysis: rawAnalysis } as unknown as Account
}

/**
 * #3677 — les programmes se lisent avec les signaux. La carte est celle de
 * `ItProgramsCard` (testée à part) ; on prouve ici ce que le déménagement
 * introduit : pas de carte vide, pas de titre vague transféré tel quel.
 */
describe('SignalPrograms — un programme utile se lit avec les signaux (#3677)', () => {
  it('rend un programme nommé avec son entité et son contexte', () => {
    render(
      <SignalPrograms
        account={account({
          program_names: [
            { name: 'Plan stratégique 2029', entity: 'Filiale paiement', budget: '400 M€', description: 'Refonte SI' },
          ],
        })}
      />,
    )

    expect(screen.getByText('Plan stratégique 2029')).toBeInTheDocument()
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
  })

  it('⚠️ sans programme : AUCUNE carte, AUCUNE ligne « non mesuré »', () => {
    const { container } = render(<SignalPrograms account={account({ program_names: [] })} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('un titre vague (« Climat ») seul n’est pas transféré tel quel', () => {
    const { container } = render(
      <SignalPrograms account={account({ program_names: [{ name: 'Climat', entity: null, budget: null }] })} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('sait dire NON : un nom d’un mot MAIS porté par une entité reste un programme', () => {
    expect(usableSignalPrograms([{ name: 'Atlas', entity: 'DSI groupe' }])).toHaveLength(1)
    expect(usableSignalPrograms([{ name: '   ', entity: 'DSI' }, null, undefined])).toHaveLength(0)
  })
})

/**
 * #3677 (recette prod 06/10) — `?tab=programs` atterrissait en haut de page, sans
 * défiler jusqu'à la carte « Programmes » : l'ancien lien doit mener AU programme.
 */
describe('SignalPrograms — l’ancien lien ?tab=programs mène à la carte (#3677)', () => {
  const PROGRAMS = { program_names: [{ name: 'Plan stratégique 2029', entity: 'Filiale paiement' }] }
  const scrollIntoView = vi.fn()

  afterEach(() => {
    window.history.replaceState(null, '', '/')
    scrollIntoView.mockReset()
  })

  function visit(search: string) {
    window.history.replaceState(null, '', `/accounts/a1${search}`)
    Element.prototype.scrollIntoView = scrollIntoView
    return render(<SignalPrograms account={account(PROGRAMS)} />)
  }

  it('défile jusqu’à la carte quand le lien est ?tab=programs (ou « programmes »)', () => {
    visit('?tab=programs')
    expect(document.getElementById('dossier-programs')).not.toBeNull()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('sait dire NON : un autre lien (?tab=veille) ne défile nulle part', () => {
    visit('?tab=veille')
    expect(screen.getByText('Plan stratégique 2029')).toBeInTheDocument()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('sans programme exploitable, le lien ne défile pas vers du vide', () => {
    window.history.replaceState(null, '', '/accounts/a1?tab=programs')
    Element.prototype.scrollIntoView = scrollIntoView
    render(<SignalPrograms account={account({ program_names: [] })} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  /**
   * #3677 — régression recette prod 08/10 : la bande « entonnoir + valeur
   * ajoutée » (#3709, 07/10) monte AU-DESSUS de cette carte sur le même
   * onglet, et sa carte de valeur (`KnownAccountValueCard`) n'apparaît
   * qu'après une lecture CRM asynchrone — donc APRÈS le seul retour que ce
   * composant posait. Un bloc qui finit de charger (et grossit) au-dessus de
   * l'ancre, longtemps après le premier retour, doit redéclencher un défilement.
   */
  it('un bloc qui finit de charger AU-DESSUS de l’ancre, après le premier retour, redéclenche un défilement', async () => {
    visit('?tab=programs')
    scrollIntoView.mockClear()

    const section = document.getElementById('dossier-programs')?.closest('section') ?? document.body
    const lateCard = document.createElement('div')
    lateCard.textContent = 'Ce que BellumAI ajoute'
    section.insertBefore(lateCard, section.firstChild)
    // Le `MutationObserver` livre ses mutations de façon asynchrone.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(scrollIntoView).toHaveBeenCalled()
  })

  /**
   * #3677 — régression recette prod 08/10 (Q #3899) : vu encore en haut de
   * page à +9 s, au-delà de l'ancienne fenêtre fixe de 4 s. Preuve que la
   * fenêtre couvre désormais une résolution tardive à +9 s.
   */
  it('une mutation bien après l’ancienne fenêtre fixe de 4 s (ex. +9 s) redéclenche quand même le défilement', async () => {
    vi.useFakeTimers()
    try {
      visit('?tab=programs')
      scrollIntoView.mockClear()

      await vi.advanceTimersByTimeAsync(9000)

      const section = document.getElementById('dossier-programs')?.closest('section') ?? document.body
      const lateCard = document.createElement('div')
      lateCard.textContent = 'Valeur connue sur ce compte'
      section.insertBefore(lateCard, section.firstChild)
      await vi.advanceTimersByTimeAsync(0)

      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * #3677.2 — régression recette prod 09/10 : carte « Projets et transformations »
   * à top=6063px, AUCUN défilement après 13 s. En prod réelle, `program_names`
   * arrive avec la requête de compte (asynchrone) ; si le routeur a déjà réécrit
   * `?tab=programs` en `?tab=veille` avant que les données n'arrivent, le signal
   * « on vient de l'ancien lien » ne doit pas se perdre.
   */
  it('les données de compte arrivent APRÈS que le routeur a réécrit ?tab=programs en ?tab=veille : le défilement a quand même lieu', () => {
    window.history.replaceState(null, '', '/accounts/a1?tab=programs')
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = render(<SignalPrograms account={account({ program_names: [] })} />)
    expect(scrollIntoView).not.toHaveBeenCalled()

    // Le routeur ancêtre (`AccountDetail`) réécrit l'URL en canonique avant que
    // la requête de compte (asynchrone) n'ait résolu `program_names`.
    window.history.replaceState(null, '', '/accounts/a1?tab=veille')
    rerender(<SignalPrograms account={account(PROGRAMS)} />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  /**
   * #3677.2 — recette prod 09/10 (code aef69661e9) : AUCUN défilement malgré le
   * `MutationObserver` déjà posé — un bloc voisin peut grandir SANS poser ni
   * retirer un nœud (une image qui finit de charger, une police qui bascule).
   * Un `ResizeObserver` sur le même conteneur couvre ce second chemin.
   */
  it('un conteneur voisin qui GRANDIT sans mutation de nœud (image, police) redéclenche le défilement', () => {
    const captured: { callback: ResizeObserverCallback | undefined } = { callback: undefined }
    class CapturingResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        captured.callback = callback
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    const previousResizeObserver = window.ResizeObserver
    window.ResizeObserver = CapturingResizeObserver as unknown as typeof ResizeObserver
    try {
      visit('?tab=programs')
      scrollIntoView.mockClear()

      expect(captured.callback).toBeDefined()
      captured.callback?.([] as ResizeObserverEntry[], {} as ResizeObserver)

      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      window.ResizeObserver = previousResizeObserver
    }
  })

  /**
   * #3677 (4e recette prod 09/10 : scrollY=0 à 15 s) — deux causes mesurées/connues, pas
   * encore couvertes : (1) le défilement DOUX est abandonné sans erreur par certains
   * environnements (mesuré sur /chat, `Chat.tsx` : `smooth` → reste à 0, `auto` → agit) ;
   * (2) `scrollRestoration` du routeur remet le défilement à 0 APRÈS la réécriture
   * `?tab=programs` → `?tab=veille`, donc après notre premier retour.
   */
  it('défile en instantané (auto), jamais en doux : le doux est abandonné en silence', () => {
    visit('?tab=programs')
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('si le routeur remet le défilement à 0 juste après la réécriture d’URL, la carte est rattrapée', () => {
    visit('?tab=programs')
    scrollIntoView.mockClear()
    window.dispatchEvent(new Event('scroll'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('sait dire NON : après un geste de l’utilisateur (molette), un retour en haut n’est pas contrarié', () => {
    visit('?tab=programs')
    window.dispatchEvent(new Event('wheel'))
    scrollIntoView.mockClear()
    window.dispatchEvent(new Event('scroll'))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  /**
   * #3677 (recette prod 10/10, Sanofi) — l'écran capture l'arrivée par l'ancien lien AVANT que
   * l'URL soit réécrite ; la carte, montée après (compte chargé, onglet veille), ne voit plus que
   * `?tab=veille`. Le verdict de l'écran doit suffire à défiler.
   */
  it('#3677 — URL déjà réécrite en ?tab=veille mais l’écran a vu ?tab=programs à l’ouverture : défile', () => {
    rememberProgramsArrival(true)
    try {
      visit('?tab=veille')
      expect(scrollIntoView).toHaveBeenCalled()
    } finally {
      rememberProgramsArrival(false)
    }
  })

  it('#3677 — sait dire NON : l’écran n’a pas vu l’ancien lien, ?tab=veille ne défile pas', () => {
    rememberProgramsArrival(false)
    visit('?tab=veille')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  /** sait dire NON : l'observateur finit par s'arrêter — il ne tourne pas indéfiniment. */
  it('passé sa fenêtre, l’observateur s’arrête et ne redéclenche plus rien', async () => {
    vi.useFakeTimers()
    try {
      visit('?tab=programs')
      scrollIntoView.mockClear()

      await vi.advanceTimersByTimeAsync(20000)

      const section = document.getElementById('dossier-programs')?.closest('section') ?? document.body
      const lateCard = document.createElement('div')
      lateCard.textContent = 'Un bloc qui finit de charger bien trop tard'
      section.insertBefore(lateCard, section.firstChild)
      await vi.advanceTimersByTimeAsync(0)

      expect(scrollIntoView).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
