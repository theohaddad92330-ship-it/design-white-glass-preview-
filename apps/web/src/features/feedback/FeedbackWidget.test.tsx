import { useState, type MouseEvent, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogTitle, Sheet, SheetContent } from '@bellum/ui'
import type * as BreadcrumbsModule from './breadcrumbs'
import type { Breadcrumb } from './breadcrumbs'
import type * as ConsoleBufferModule from './consoleBuffer'
import type * as NetworkBufferModule from './networkBuffer'
import type { NetworkFailure } from './networkBuffer'

// The picker reads the DOM under the cursor and the widget grabs a screenshot;
// both are stubbed so the test can drive the flow deterministically.
const createFeedback = vi.fn().mockResolvedValue({
  id: 'fb-1',
  created_at: '2026-07-20T00:00:00Z',
  github_issue_number: null,
  github_issue_url: null,
})

/**
 * #1960.7 — les tampons de contexte, pilotés par le test. Vides par défaut : les
 * tests d'avant ce lot voient exactement ce qu'ils voyaient (aucun tampon n'est
 * installé en jsdom).
 */
const buffers = vi.hoisted(() => ({
  network: [] as NetworkFailure[],
  breadcrumbs: [] as Breadcrumb[],
  console: '',
}))

vi.mock('./api', () => ({ feedbackApi: { create: (...args: unknown[]) => createFeedback(...args) } }))
vi.mock('./screenshot', () => ({ captureViewport: vi.fn().mockResolvedValue(null) }))
// #1960.10 — le dialogue « envoyé » porte un lien INTERNE vers « Mes
// signalements ». `Link` hors routeur jette : une ancre le remplace et reporte
// `to` sur `href`, pour que « la porte mène là » reste vérifiable.
// #3050 (26/09/2026) / #3775.5b (07/10/2026) — `useRouterState` lit le chemin
// courant pour masquer le bouton sur /chat (à toutes les largeurs depuis
// #3775.5b) ; par défaut un chemin qui ne masque rien, pour que les scénarios
// existants (hors #2117.84 / #3775.5b) restent inchangés.
const route = vi.hoisted(() => ({ pathname: '/accounts' }))
vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    Link: forwardRef<HTMLAnchorElement, { to: string; children?: ReactNode; onClick?: (event: MouseEvent) => void }>(
      ({ to, children, onClick, ...rest }, ref) => (
        <a
          ref={ref}
          href={to}
          {...rest}
          // Le routeur navigue sans recharger ; jsdom, lui, ne sait pas naviguer.
          onClick={event => {
            event.preventDefault()
            onClick?.(event)
          }}
        >
          {children}
        </a>
      ),
    ),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: route.pathname } }),
  }
})
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'dev@bellum.ai' } }),
}))
// #1960.10 — le widget lit `useIsDemo` (la charge crédits, donc React Query).
// `false` par défaut : tous les tests d'avant ce lot sont les TÉMOINS hors démo.
const demo = vi.hoisted(() => ({ isDemo: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.isDemo }))
vi.mock('./networkBuffer', async importOriginal => ({
  ...(await importOriginal<typeof NetworkBufferModule>()),
  getRecentNetworkFailures: () => buffers.network,
}))
vi.mock('./breadcrumbs', async importOriginal => ({
  ...(await importOriginal<typeof BreadcrumbsModule>()),
  getRecentBreadcrumbs: () => buffers.breadcrumbs,
}))
vi.mock('./consoleBuffer', async importOriginal => ({
  ...(await importOriginal<typeof ConsoleBufferModule>()),
  getRecentConsole: () => buffers.console,
}))

import { FeedbackWidget } from './FeedbackWidget'
import { requestReport } from './reportLink'
import { captureViewport } from './screenshot'

const SOURCE = 'apps/web/src/features/accounts/AccountCard.tsx:42:7'

/** The element the reporter points at — stamped by the source-tag Vite plugin. */
function mountTarget(): HTMLElement {
  const target = document.createElement('button')
  target.setAttribute('data-bellum-src', SOURCE)
  target.id = 'broken-cta'
  target.className = 'cta cta--primary'
  target.textContent = 'Lancer analyse'
  document.body.appendChild(target)
  return target
}

/** jsdom implements neither of these; the picker relies on both. */
function stubPointTargets(target: Element): void {
  document.elementsFromPoint = vi.fn(() => [target]) as unknown as typeof document.elementsFromPoint
  target.getBoundingClientRect = vi.fn(
    () =>
      ({
        x: 10,
        y: 20,
        width: 120,
        height: 40,
        top: 20,
        left: 10,
        right: 130,
        bottom: 60,
        toJSON: () => ({}),
      }) as DOMRect,
  )
}

function resetBuffers(): void {
  buffers.network = []
  buffers.breadcrumbs = []
  buffers.console = ''
}

describe('FeedbackWidget element picker', () => {
  beforeEach(() => {
    createFeedback.mockClear()
    document.body.innerHTML = ''
    resetBuffers()
  })

  it('shows only the highlight box — no selector, tag or source path on screen', async () => {
    const user = userEvent.setup()
    const target = mountTarget()
    stubPointTargets(target)

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))

    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })

    // The violet frame is drawn...
    const highlight = await screen.findByTestId('feedback-highlight')
    expect(highlight).toBeInTheDocument()

    // ...and nothing technical about the element is rendered anywhere.
    const overlay = document.querySelector('[data-bellum-capture-ignore]')!
    expect(overlay.textContent).not.toContain(SOURCE)
    expect(overlay.textContent).not.toContain('AccountCard.tsx')
    expect(overlay.textContent).not.toContain('button#broken-cta')
    expect(overlay.textContent).not.toContain('cta--primary')
  })

  // #1792 (bug trouvé en chemin, 09/09) — `document.addEventListener('click',
  // …, true)` du picker coupait la propagation AVANT de savoir où le clic
  // allait, donc son propre bouton « Sans pointer » ne recevait jamais son
  // `onClick` React. Sans le correctif, ce test reste bloqué sur
  // `findByRole('textbox')` (le formulaire ne s'ouvre jamais) et time out.
  it('un clic sur « Sans pointer » atteint son propre gestionnaire — la capture ne l’avale plus', async () => {
    const user = userEvent.setup()

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    await user.click(screen.getByRole('button', { name: 'Sans pointer' }))

    // La capture est passée par `onSkip` (élément = null) jusqu'au
    // formulaire — la seule façon d'y arriver est que le clic ait atteint
    // le gestionnaire React du bouton.
    await screen.findByRole('textbox')
  })

  it('names the hovered element for screen readers without showing it', async () => {
    const user = userEvent.setup()
    const target = mountTarget()
    stubPointTargets(target)

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })

    // A polite live region announces what is under the cursor in human terms.
    const status = await screen.findByRole('status', { name: /élément/i })
    expect(status.textContent).toContain('Lancer analyse')
    // ...but never the source path.
    expect(status.textContent).not.toContain(SOURCE)
  })

  it('still sends the full element context — source path included — to the API', async () => {
    const user = userEvent.setup()
    const target = mountTarget()
    stubPointTargets(target)

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })
    fireEvent.click(document, { clientX: 50, clientY: 30 })

    const textarea = await screen.findByRole('textbox')
    await user.type(textarea, 'Le bouton ne fait rien')
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))

    await waitFor(() => expect(createFeedback).toHaveBeenCalledTimes(1))
    const payload = createFeedback.mock.calls[0]![0] as {
      elementContext: { sourceFile: string; selector: string; tagName: string; classes: string; text: string }
    }
    expect(payload.elementContext.sourceFile).toBe(SOURCE)
    expect(payload.elementContext.tagName).toBe('button')
    expect(payload.elementContext.selector).toBe('#broken-cta')
    expect(payload.elementContext.classes).toBe('cta cta--primary')
    expect(payload.elementContext.text).toBe('Lancer analyse')
  })

  /** Envoie un retour complet et rend le dialogue de confirmation. */
  async function submitReport(): Promise<void> {
    const user = userEvent.setup()
    const target = mountTarget()
    stubPointTargets(target)

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })
    fireEvent.click(document, { clientX: 50, clientY: 30 })

    const textarea = await screen.findByRole('textbox')
    await user.type(textarea, 'Le bouton ne fait rien')
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
    await waitFor(() => expect(createFeedback).toHaveBeenCalled())
  }

  // #1960.12 — le lien menait vers un ticket d'un dépôt PRIVÉ : un client final
  // recevait une page qu'il ne peut pas ouvrir, sous le nom d'un outil tiers. On
  // donne la RÉFÉRENCE, en clair, et le seul lien reste dans l'application :
  // Réglages › Mes signalements (#1960.10).
  it('#1960.12 — annonce la RÉFÉRENCE du signalement, sans lien ni nom d’outil tiers', async () => {
    createFeedback.mockResolvedValueOnce({
      id: 'fb-2',
      created_at: '2026-08-14T00:00:00Z',
      github_issue_number: 913,
      github_issue_url: 'https://github.com/o/r/issues/913',
    })

    await submitReport()

    expect(await screen.findByText(/Signalement n° 913/)).toBeInTheDocument()
    // #1960.10 — un seul lien, INTERNE : la page où la référence se suit.
    // Aucun ne mène vers l'outil où vit le ticket.
    const links = screen.getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/settings/mes-signalements'])
    expect(screen.getByRole('dialog').textContent).not.toMatch(/github|issue/i)
  })

  it('#1960.10 — propose de suivre ses signalements, et le clic referme le dialogue', async () => {
    const user = userEvent.setup()
    await submitReport()

    const follow = await screen.findByRole('link', { name: 'Suivre mes signalements' })
    expect(follow).toHaveAttribute('href', '/settings/mes-signalements')
    await user.click(follow)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // Le défaut du 14/08 : le dialogue disait « L'issue a bien été enregistrée »
  // même quand GitHub avait refusé (jeton périmé) — le bêta-testeur croyait son
  // bug remonté alors qu'il dormait en base.
  it('dit qu’aucun numéro n’a été attribué au lieu d’en inventer un', async () => {
    await submitReport()

    expect(await screen.findByText(/aucun numéro n'a pu lui être attribué/)).toBeInTheDocument()
    expect(screen.queryByText(/Signalement n°/)).not.toBeInTheDocument()
    // Sans numéro, la page de suivi le montre quand même : le signalement y
    // figure. Mais rien ne sort de l'application.
    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/settings/mes-signalements'])
  })

  it('keeps the confirmation dialog free of source paths and selectors', async () => {
    const user = userEvent.setup()
    const target = mountTarget()
    stubPointTargets(target)

    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })
    fireEvent.click(document, { clientX: 50, clientY: 30 })

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).not.toContain(SOURCE)
    expect(dialog.textContent).not.toContain('AccountCard.tsx')
    expect(dialog.textContent).not.toContain('#broken-cta')
    expect(dialog.textContent).not.toContain('<button>')
  })
})

/**
 * #1960.4 / .7 / .8 — QUAND LAURA OUVRE LE SIGNALEMENT.
 *
 * Laura écrit un lien `#signaler:<résumé>` ; son clic émet `requestReport`. Ce
 * que ces tests tiennent, pour les cinq critères de recette (#1960.15 → .19) :
 * le formulaire s'ouvre avec la description, TOUT ce qui accompagne le message
 * est montré, ce qui part est exactement ce qui a été montré, et rien ne part
 * avant le clic d'envoi.
 */
describe('#1960 — ouvert par Laura : pré-rempli, tout est montré, rien ne part sans clic', () => {
  const FAILURE: NetworkFailure = {
    time: '2026-09-12T10:00:00.000Z',
    method: 'GET',
    url: 'https://api.example/integrations',
    status: 401,
    error: null,
    durationMs: 120,
    correlationId: 'corr-1',
  }

  beforeEach(() => {
    createFeedback.mockClear()
    document.body.innerHTML = ''
    resetBuffers()
    window.history.replaceState(null, '', '/')
  })

  async function openFromLaura(message: string): Promise<HTMLElement> {
    render(<FeedbackWidget />)
    act(() => requestReport({ message }))
    return screen.findByRole('textbox')
  }

  it.each([
    ['1960.15 bug fonctionnel', 'Le bouton Enrichir ne fait rien'],
    ['1960.16 connecteur expiré', 'Mon CRM est déconnecté depuis ce matin'],
    ['1960.17 donnée fausse', "Le décideur affiché a quitté l'entreprise"],
    ['1960.18 facturation', "On m'a débité deux fois mes crédits"],
    ['1960.19 perte de session', 'Je suis déconnecté à chaque rafraîchissement'],
  ])('%s — le formulaire s’ouvre avec la description, et rien n’est envoyé', async (_case, message) => {
    const textbox = await openFromLaura(message)

    expect(textbox).toHaveValue(message)
    expect(screen.getByRole('region', { name: 'Ce qui sera envoyé' })).toBeInTheDocument()
    expect(createFeedback).not.toHaveBeenCalled()
  })

  it('#1960.7 — montre, avant l’envoi, tout ce qui accompagne le message, sans les secrets d’URL', async () => {
    window.history.replaceState(null, '', '/chat?t=jeton-secret#access_token=abc')
    buffers.network = [FAILURE]
    buffers.breadcrumbs = [
      { time: '2026-09-12T09:59:00.000Z', type: 'navigation', label: '/integrations' },
      { time: '2026-09-12T09:59:30.000Z', type: 'click', label: 'Reconnecter' },
    ]
    buffers.console = '[2026-09-12T10:00:00.000Z] ERROR: session expirée'

    await openFromLaura('Mon CRM est déconnecté')
    const preview = screen.getByRole('region', { name: 'Ce qui sera envoyé' })

    expect(preview).toHaveTextContent('dev@bellum.ai')
    expect(preview).toHaveTextContent('/chat?…#…')
    expect(preview).toHaveTextContent('1 appel en échec')
    expect(preview).toHaveTextContent('Tes 2 derniers gestes')
    expect(preview).toHaveTextContent('Les messages récents de la console')
    expect(preview).toHaveTextContent('Aucune erreur récente')
    // Le détail est là, à déplier : ce qui part se LIT, il ne se devine pas.
    expect(preview).toHaveTextContent('GET https://api.example/integrations → 401')
    expect(preview).toHaveTextContent('Reconnecter')
    expect(preview.textContent).not.toMatch(/jeton-secret|access_token/)
    expect(screen.getByRole('dialog').textContent).not.toMatch(/github|issue/i)
  })

  it('#1960.8 — envoie EXACTEMENT ce qui a été montré, et seulement au clic', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/chat?t=jeton-secret')
    buffers.network = [FAILURE]

    await openFromLaura('Mon CRM est déconnecté')
    // Un échec survenu APRÈS l'ouverture n'a pas été montré : il ne part pas.
    buffers.network = [FAILURE, { ...FAILURE, url: 'https://api.example/other', status: 500 }]
    expect(createFeedback).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
    await waitFor(() => expect(createFeedback).toHaveBeenCalledTimes(1))
    const payload = createFeedback.mock.calls[0]![0] as {
      message: string
      pageUrl: string
      networkFailures: NetworkFailure[]
      userEmail: string | null
    }
    expect(payload.message).toBe('Mon CRM est déconnecté')
    expect(payload.pageUrl).toMatch(/\/chat\?…$/)
    expect(payload.networkFailures).toEqual([FAILURE])
    expect(payload.userEmail).toBe('dev@bellum.ai')
    expect(JSON.stringify(payload)).not.toContain('jeton-secret')
  })

  it('#1960.8 — retirer la capture la retire de l’envoi', async () => {
    const user = userEvent.setup()
    vi.mocked(captureViewport).mockResolvedValueOnce('data:image/png;base64,AAAA')

    await openFromLaura('Écran vide sur la fiche')
    expect(await screen.findByAltText("Capture d'écran jointe")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer la capture' }))
    expect(screen.queryByAltText("Capture d'écran jointe")).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))
    await waitFor(() => expect(createFeedback).toHaveBeenCalledTimes(1))
    expect((createFeedback.mock.calls[0]![0] as { screenshot: string | null }).screenshot).toBeNull()
  })

  it('n’écrase pas un signalement déjà en cours d’écriture', async () => {
    const user = userEvent.setup()
    const textbox = await openFromLaura('Premier')
    await user.type(textbox, ' — détail ajouté')

    act(() => requestReport({ message: 'Second' }))

    expect(screen.getByRole('textbox')).toHaveValue('Premier — détail ajouté')
  })
})

/**
 * #1960.10 — EN SALLE DE DÉMONSTRATION, LE WIDGET N'ENVOIE RIEN, ET LE DIT.
 *
 * Un visiteur qui essayait le bouton ouvrait un ticket RÉEL dans la file de
 * l'équipe. L'API refuse désormais (`feedback-demo-refusal.spec.ts`) ; l'écran
 * ne propose pas un envoi voué au refus : il dit que la démonstration n'envoie
 * pas de signalement — par le bouton comme par le lien de Laura.
 */
describe('#1960.10 — FeedbackWidget en salle de démonstration', () => {
  const DEMO_MESSAGE = /La démonstration n'envoie pas de signalement/

  beforeEach(() => {
    createFeedback.mockClear()
    vi.mocked(captureViewport).mockClear()
    document.body.innerHTML = ''
    resetBuffers()
    demo.isDemo = true
  })

  afterEach(() => {
    demo.isDemo = false
  })

  it('le bouton ouvre le message, sans viseur, sans capture, sans formulaire', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />)

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(DEMO_MESSAGE)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Envoyer le signalement' })).toBeNull()
    expect(screen.queryByTestId('feedback-highlight')).toBeNull()
    expect(captureViewport).not.toHaveBeenCalled()
    expect(createFeedback).not.toHaveBeenCalled()
  })

  it('le lien « Signaler ce problème » de Laura ouvre le même message, et rien ne part', async () => {
    render(<FeedbackWidget />)

    act(() => requestReport({ message: 'Le bouton Enrichir ne fait rien' }))

    expect(await screen.findByRole('dialog')).toHaveTextContent(DEMO_MESSAGE)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(captureViewport).not.toHaveBeenCalled()
    expect(createFeedback).not.toHaveBeenCalled()
  })

  it('le message se referme, et ne mène nulle part', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    await screen.findByRole('dialog')

    expect(screen.queryByRole('link')).toBeNull()
    // #1797 — la croix de fermeture porte désormais le MÊME nom accessible
    // (« Fermer ») que le bouton du message : deux commandes, un seul libellé.
    // Le bouton du message est le premier dans l'ordre du DOM (`DialogContent`
    // rend ses enfants avant sa croix), d'où l'index plutôt qu'un nom seul.
    await user.click(screen.getAllByRole('button', { name: 'Fermer' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // Témoin : le même geste hors démonstration ouvre le formulaire, jamais le message.
  it('témoin — hors démonstration, Laura ouvre le formulaire et non le message', async () => {
    demo.isDemo = false
    render(<FeedbackWidget />)

    act(() => requestReport({ message: 'Le bouton Enrichir ne fait rien' }))

    expect(await screen.findByRole('textbox')).toHaveValue('Le bouton Enrichir ne fait rien')
    expect(screen.queryByText(DEMO_MESSAGE)).toBeNull()
  })
})

/**
 * Mesuré à l'œil sur `/consultants` le 30/08/2026 : le bouton « Appliquer » du
 * tiroir « Plus de filtres » (ancré `side="right"`, action primaire en bas à
 * droite) était recouvert par le widget — même coin, `z-widget` (80) au-dessus
 * de `z-overlay` (60) où vit le tiroir. Monter le z-index du tiroir casserait
 * la raison d'être du widget (rester au-dessus du contenu ordinaire) ; le
 * réparer tiroir par tiroir se ré-oublierait au prochain. Le widget s'efface
 * donc pendant qu'UN tiroir — n'importe lequel, présent ou futur — occupe ce
 * coin, exactement comme il le fait déjà pour SON PROPRE dialogue. GA-205.
 */
describe('FeedbackWidget cède le coin bas-droite à un tiroir ouvert', () => {
  function Harness() {
    const [sheetOpen, setSheetOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setSheetOpen(open => !open)}>
          toggle-sheet
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" closeLabel="Fermer">
            Tiroir de test
          </SheetContent>
        </Sheet>
        <FeedbackWidget />
      </>
    )
  }

  it('se cache pendant qu’un tiroir AILLEURS dans l’app est ouvert, et revient une fois refermé', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)

    await user.click(screen.getByRole('button', { name: 'toggle-sheet' }))
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)

    // Fermeture au clavier, pas au clic : un tiroir ouvert verrouille le
    // scroll (`pointer-events: none` sur `<body>`, posé par Radix) — un clic
    // sur un bouton qui n'est pas DANS le tiroir n'atteindrait rien de
    // réaliste. Échap, lui, n'est jamais bloqué par `pointer-events`.
    await user.keyboard('{Escape}')
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('reste caché tant qu’au moins un des DEUX tiroirs ouverts n’est pas refermé', async () => {
    const user = userEvent.setup()

    // Les deux commencent OUVERTS : les ouvrir l'un après l'autre par un clic
    // ne marche pas non plus — Radix rend tout le reste de la page
    // `aria-hidden` dès qu'UN tiroir est ouvert, y compris le déclencheur du
    // second. La fermeture, elle, se fait au clavier (Échap ferme le tiroir
    // du DESSUS, donc B puis A) — ce que ce test vérifie vraiment : le
    // compteur ne retombe pas à zéro tant que les DEUX ne sont pas refermés.
    function TwoSheets() {
      const [a, setA] = useState(true)
      const [b, setB] = useState(true)
      return (
        <>
          <Sheet open={a} onOpenChange={setA}>
            <SheetContent side="right" closeLabel="Fermer">
              A
              <Sheet open={b} onOpenChange={setB}>
                <SheetContent side="right" closeLabel="Fermer">
                  B
                </SheetContent>
              </Sheet>
            </SheetContent>
          </Sheet>
          <FeedbackWidget />
        </>
      )
    }

    render(<TwoSheets />)
    // `hidden: true` : les deux tiroirs étant déjà ouverts au montage, Radix a
    // rendu tout le reste de la page — le déclencheur du widget compris —
    // `aria-hidden` dès le premier rendu. On veut la référence DOM, pas sa
    // visibilité pour un lecteur d'écran.
    const trigger = screen.getByRole('button', { name: 'Signaler un problème', hidden: true })
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)

    await user.keyboard('{Escape}') // ferme B (le dessus)
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/) // A est encore ouvert

    await user.keyboard('{Escape}') // ferme A
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })
})

/**
 * #2487 — Louis (`/contacts`) : « je ne peux pas faire remonter les problèmes
 * sur les modales... ça m'empêche de recetter les modales de l'appli ».
 *
 * Deux mécanismes Radix, indépendants, bloquaient le geste : (1) une modale
 * `Dialog` ouverte pose `pointer-events: none` sur `<body>` — le bouton du
 * widget, ailleurs dans le DOM, en hérite et devient inerte malgré son
 * `z-widget` (80) au-dessus de `z-overlay` (60) ; (2) même quand le clic
 * atteint le bouton, le `DismissableLayer` de la modale le voit comme un
 * `pointerdown` EXTÉRIEUR à son contenu et la referme. `useAnySheetOpen`
 * (GA-205) ne traite que les tiroirs (`Sheet`) — jamais les modales
 * (`Dialog`) : c'est le trou que #2487 signale.
 */
describe('#2487 — le widget reste utilisable pendant qu’une AUTRE modale est ouverte', () => {
  function Harness() {
    const [otherOpen, setOtherOpen] = useState(true)
    return (
      <>
        <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
          <DialogContent closeLabel="Fermer">
            <DialogTitle>Autre modale</DialogTitle>
            <button type="button">élément à pointer</button>
          </DialogContent>
        </Dialog>
        <FeedbackWidget />
      </>
    )
  }

  it('a la classe qui la protège de `pointer-events: none` (posé par la modale sur `<body>`)', () => {
    render(<Harness />)
    // #2487 mécanisme (1) — Radix pose `pointer-events: none` sur `<body>` le
    // temps qu'une modale MODALE est ouverte ; ce bouton, ailleurs dans le
    // DOM, en hérite comme tout le reste hors du contenu de la modale.
    // jsdom ne charge pas la feuille Tailwind réelle (`userEvent.click` ne
    // verrait donc jamais une classe utilitaire l'annuler) — on vérifie
    // donc la classe elle-même, exactement comme `ElementPicker` le fait
    // déjà pour sa propre barre d'indices (`pointer-events-auto`, ligne 120).
    const trigger = screen.getByRole('button', { name: 'Signaler un problème', hidden: true })
    expect(trigger.className).toMatch(/(?:^|\s)pointer-events-auto(?:\s|$)/)
  })

  it('même quand le clic ATTEINT le bouton, il ne ferme pas la modale déjà ouverte — et le widget s’ouvre vraiment', async () => {
    render(<Harness />)
    expect(screen.getByText('Autre modale')).toBeInTheDocument()
    // Radix attache son écouteur `pointerdown` du `DismissableLayer` dans un
    // `setTimeout(0)` (pour ne pas confondre le clic OUVRANT la modale avec
    // un clic EXTÉRIEUR) — sans ce tour d'horloge, le test « marcherait »
    // même sans le correctif, pour la MAUVAISE raison (l'écouteur de Radix
    // n'existe pas encore).
    await new Promise(resolve => setTimeout(resolve, 0))

    const trigger = screen.getByRole('button', { name: 'Signaler un problème', hidden: true })
    // #2487 mécanisme (2) — le `DismissableLayer` de la modale écoute un
    // `pointerdown` sur `document` : un clic ATTEINT (au sens JS — `fireEvent`
    // ne fait pas la vérification stricte `pointer-events` de `userEvent`,
    // testée séparément ci-dessus) mais EXTÉRIEUR à son contenu la referme.
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)

    // La modale visée par Louis reste ouverte…
    expect(screen.getByText('Autre modale')).toBeInTheDocument()
    // …et le viseur du widget s'est bien monté : le clic n'était pas inerte.
    expect(await screen.findByRole('status', { hidden: true })).toBeInTheDocument()
  })

  it('cliquer « Sans pointer », pendant qu’on pointe DANS une modale, ne la ferme pas non plus', async () => {
    render(<Harness />)
    await new Promise(resolve => setTimeout(resolve, 0))

    const trigger = screen.getByRole('button', { name: 'Signaler un problème', hidden: true })
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)

    // La barre d'indices du viseur (`ElementPicker`) a SON PROPRE portail,
    // lui aussi hors du contenu de la modale visée — même mécanisme, même
    // correctif (`ElementPicker.tsx`).
    const skip = await screen.findByRole('button', { name: 'Sans pointer', hidden: true })
    fireEvent.pointerDown(skip)
    fireEvent.click(skip)

    expect(screen.getByText('Autre modale')).toBeInTheDocument()
  })

  it('témoin — un clic sur le voile de LA MODALE (son propre extérieur) la ferme toujours', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    // Le voile (`DialogOverlay`) est la seule zone « hors contenu, dans le
    // portail » qui garde `pointer-events: auto` : c'est le vrai geste
    // « clic extérieur » d'une modale Radix, pas un élément random de la
    // page (que Radix rend de toute façon inerte tant que la modale est
    // ouverte — `pointer-events: none` en cascade depuis `<body>`).
    const [overlay] = document.getElementsByClassName('bg-black/80')
    expect(overlay).toBeTruthy()

    await user.click(overlay)

    expect(screen.queryByText('Autre modale')).not.toBeInTheDocument()
  })
})

/** Un `File` jsdom minimal. */
function makeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type })
}

/**
 * Ouvre le widget jusqu'au formulaire — même recette que `submitReport()`
 * plus haut (pointer un élément stub). Le chemin « Sans pointer » a son
 * propre test ciblé ci-dessus ; celui-ci continue de pointer un élément stub
 * pour exercer `elementContext`, que « Sans pointer » ne renseigne jamais.
 */
async function openForm(
  userOptions?: Parameters<typeof userEvent.setup>[0],
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup(userOptions)
  const target = mountTarget()
  stubPointTargets(target)
  render(<FeedbackWidget />)
  await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
  fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })
  fireEvent.click(document, { clientX: 50, clientY: 30 })
  await screen.findByRole('textbox')
  return user
}

/**
 * #1792 — un fichier ou une image collée, en plus de la capture automatique.
 */
describe('FeedbackWidget — pièces jointes', () => {
  beforeEach(() => {
    createFeedback.mockClear()
    document.body.innerHTML = ''
    resetBuffers()
  })

  it('joint un fichier choisi via le sélecteur, en base64 BRUT', async () => {
    const user = await openForm()
    const input = screen.getByLabelText('Pièces jointes') as HTMLInputElement
    const file = makeFile('contexte.png', 'image/png', 12)

    await user.upload(input, file)
    expect(await screen.findByText('contexte.png')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'Voici le contexte')
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))

    await waitFor(() => expect(createFeedback).toHaveBeenCalledTimes(1))
    const payload = createFeedback.mock.calls[0]![0] as {
      attachments: { name: string; mimeType: string; dataBase64: string }[]
    }
    expect(payload.attachments).toHaveLength(1)
    expect(payload.attachments[0]?.name).toBe('contexte.png')
    expect(payload.attachments[0]?.mimeType).toBe('image/png')
    expect(payload.attachments[0]?.dataBase64).not.toContain('data:')
    expect(payload.attachments[0]?.dataBase64).not.toContain(';base64,')
  })

  it('un fichier collé (Ctrl/Cmd+V) rejoint la liste des pièces', async () => {
    await openForm()
    const file = makeFile('collé.png', 'image/png', 8)
    const clipboardData = {
      items: [{ kind: 'file', getAsFile: () => file }],
    } as unknown as DataTransfer

    fireEvent.paste(screen.getByRole('textbox'), { clipboardData })

    expect(await screen.findByText('collé.png')).toBeInTheDocument()
  })

  // #1792 — GESTE 2 : glisser-déposer sur le panneau. Trois gestes, un seul
  // chemin de code (`addAttachments`) — la preuve que celui-ci n'est pas
  // câblé à moitié.
  it('un fichier glissé-déposé sur le panneau rejoint la liste des pièces', async () => {
    await openForm()
    const file = makeFile('glissé.png', 'image/png', 8)
    const dataTransfer = {
      items: [{ kind: 'file', getAsFile: () => file }],
    } as unknown as DataTransfer

    fireEvent.drop(screen.getByRole('textbox'), { dataTransfer })

    expect(await screen.findByText('glissé.png')).toBeInTheDocument()
  })

  // ⚠️ Preuve que la garde sait dire NON, PAR LE MÊME chemin que le collage et
  // le sélecteur : un type hors liste blanche déposé par glisser-déposer est
  // refusé avec le MÊME motif — la validation vit dans `rejectAttachment`,
  // jamais dans le geste qui l'a déclenchée.
  it('refuse par glisser-déposer un type hors liste blanche, avec le même motif que les deux autres gestes', async () => {
    await openForm()
    const file = makeFile('logo.svg', 'image/svg+xml', 10)
    const dataTransfer = {
      items: [{ kind: 'file', getAsFile: () => file }],
    } as unknown as DataTransfer

    fireEvent.drop(screen.getByRole('textbox'), { dataTransfer })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'logo.svg — type de fichier non accepté (images, PDF ou texte uniquement).',
    )
    expect(screen.queryByText('logo.svg')).not.toBeInTheDocument()
  })

  it('affiche une invite pendant le survol du glisser-déposer, et la retire au dépôt', async () => {
    await openForm()
    const panel = screen.getByRole('textbox').closest('div.space-y-4') as HTMLElement
    const file = makeFile('glissé.png', 'image/png', 8)
    const dataTransfer = { items: [{ kind: 'file', getAsFile: () => file }] } as unknown as DataTransfer

    fireEvent.dragEnter(panel, { dataTransfer })
    expect(await screen.findByText("Dépose le fichier pour l'ajouter au signalement")).toBeInTheDocument()

    fireEvent.drop(panel, { dataTransfer })
    await screen.findByText('glissé.png')
    expect(screen.queryByText("Dépose le fichier pour l'ajouter au signalement")).not.toBeInTheDocument()
  })

  // Un collage de TEXTE ordinaire (aucun fichier dans le presse-papiers) ne
  // doit jamais être intercepté par le gestionnaire de pièces jointes.
  it('ne bloque pas un collage de texte ordinaire dans le message', async () => {
    await openForm()
    const clipboardData = { items: [{ kind: 'string', getAsFile: () => null }] } as unknown as DataTransfer

    const event = fireEvent.paste(screen.getByRole('textbox'), { clipboardData })

    expect(event).toBe(true) // `preventDefault` n'a PAS été appelé
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** ⚠️ Preuve que la garde sait dire NON : un type hors liste blanche est refusé, à l'écran, avec un motif. */
  it('refuse un type hors liste blanche et le dit à l’écran', async () => {
    // `applyAccept: false` — un utilisateur RÉEL peut choisir « Tous les
    // fichiers » dans le sélecteur du système et outrepasser `accept` ; ce
    // test vise justement le cas où la validation CÔTÉ ÉCRAN doit rattraper
    // ce que l'attribut HTML ne bloque qu'en apparence.
    const user = await openForm({ applyAccept: false })
    const input = screen.getByLabelText('Pièces jointes') as HTMLInputElement
    const file = makeFile('logo.svg', 'image/svg+xml', 10)

    await user.upload(input, file)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'logo.svg — type de fichier non accepté (images, PDF ou texte uniquement).',
    )
    expect(screen.queryByText('logo.svg')).not.toBeInTheDocument()
  })

  /** ⚠️ Preuve que la garde sait dire NON : un fichier trop gros est refusé, à l'écran, avec un motif. */
  it('refuse un fichier au-delà du plafond par fichier et le dit à l’écran', async () => {
    const user = await openForm()
    const input = screen.getByLabelText('Pièces jointes') as HTMLInputElement
    const file = makeFile('trop-gros.png', 'image/png', 4_000_001)

    await user.upload(input, file)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'trop-gros.png dépasse la taille maximale par fichier (4 Mo).',
    )
  })

  it('retire une pièce jointe déjà ajoutée', async () => {
    const user = await openForm()
    const input = screen.getByLabelText('Pièces jointes') as HTMLInputElement
    await user.upload(input, makeFile('a.png', 'image/png', 10))
    await screen.findByText('a.png')

    await user.click(screen.getByRole('button', { name: 'Retirer a.png' }))

    expect(screen.queryByText('a.png')).not.toBeInTheDocument()
  })

  it('repart à zéro entre deux ouvertures du widget', async () => {
    const user = await openForm()
    const input = screen.getByLabelText('Pièces jointes') as HTMLInputElement
    await user.upload(input, makeFile('a.png', 'image/png', 10))
    await screen.findByText('a.png')

    // Ferme puis rouvre : `start()` doit repartir sans la pièce précédente.
    await user.keyboard('{Escape}')
    const secondTarget = mountTarget()
    stubPointTargets(secondTarget)
    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }))
    fireEvent.mouseMove(document, { clientX: 50, clientY: 30 })
    fireEvent.click(document, { clientX: 50, clientY: 30 })
    await screen.findByRole('textbox')

    expect(screen.queryByText('a.png')).not.toBeInTheDocument()
  })

  // La capture automatique (champ `screenshot`) reste un chemin séparé,
  // inchangé : un envoi sans pièce jointe ne porte pas `attachments` non vide.
  it('un envoi sans pièce jointe part avec `attachments` vide — la capture automatique n’est pas affectée', async () => {
    const user = await openForm()
    await user.type(screen.getByRole('textbox'), 'Rien à joindre')
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }))

    await waitFor(() => expect(createFeedback).toHaveBeenCalledTimes(1))
    const payload = createFeedback.mock.calls[0]![0] as { attachments: unknown[]; screenshot: string | null }
    expect(payload.attachments).toEqual([])
  })
})

/**
 * #2117.84 — RECETTE IPHONE DU 25/09 : LE BOUTON FLOTTANT RECOUVRE DU
 * CONTENU CLIQUABLE SUR TOUTES LES PAGES.
 *
 * Le bouton avait été posé en bas-GAUCHE sous 768px (déjà déplacé une fois
 * pour fuir un chevauchement à droite, #1417 — voir le commentaire de
 * `FeedbackWidget.tsx`). Mesuré à nouveau : à gauche, il recouvre plutôt la
 * rangée d'icônes du hero, les lignes de liste et le premier libellé de
 * « Laura garde en tête » — du contenu qui commence, lui, presque toujours à
 * gauche. La rangée d'onglets et l'espace bas-droite restent, eux, le seul
 * endroit du produit qu'aucun contenu n'occupe en PERMANENCE au même écran
 * (contrairement au score/à la portée, ancrés à droite mais scrollables).
 * Sous 768px seulement (`useIsMobile`), le bouton revient donc à DROITE,
 * aligné avec le bureau, et RÉTRÉCIT (40px plutôt que 44) pour réduire encore
 * la surface qu'il couvre. Desktop inchangé.
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
function stubMatchMediaForWidget(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

describe('#2117.84 — sous 768px, le déclencheur revient à droite et rétrécit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    route.pathname = '/accounts'
  })

  it('reste à droite et rétrécit sur mobile', () => {
    stubMatchMediaForWidget(true)
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).toContain('right-4')
    expect(trigger.className).not.toContain('left-4')
    expect(trigger.className).toContain('h-10')
    expect(trigger.className).toContain('w-10')
  })

  it('garde sa taille de bureau — non-régression', () => {
    stubMatchMediaForWidget(false)
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).toContain('right-4')
    expect(trigger.className).toContain('h-11')
    expect(trigger.className).toContain('w-11')
  })
})

/**
 * #3775.5b — lot J31 (#3775) laissait « reste » : sur /chat BUREAU, ce bouton
 * partageait toujours le coin bas-droite avec « Envoyer » (`composerFeedbackGutter`
 * vide, voir `chat-surface.ts`) — seul /chat MOBILE le taisait (#3050). Le
 * signalement y reste accessible par le menu « + » du composer
 * (`ComposerToolsMenu`, `requestReport`) et par l'en-tête du fil.
 */
describe('#3775.5b — /chat tait ce bouton à TOUTES les largeurs', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    route.pathname = '/accounts'
  })

  it('bureau, sur /chat : le bouton est caché (`hidden`), pas seulement sur mobile', () => {
    stubMatchMediaForWidget(false)
    route.pathname = '/chat'
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('mobile, sur /chat : toujours caché — non-régression de #3050', () => {
    stubMatchMediaForWidget(true)
    route.pathname = '/chat'
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('ailleurs que sur /chat, en bureau : le bouton reste visible', () => {
    stubMatchMediaForWidget(false)
    route.pathname = '/accounts'
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })

  it('ailleurs que sur /chat, en mobile : le bouton reste visible — non-régression de #3050', () => {
    stubMatchMediaForWidget(true)
    route.pathname = '/accounts'
    render(<FeedbackWidget />)
    const trigger = screen.getByRole('button', { name: 'Signaler un problème' })
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })
})
