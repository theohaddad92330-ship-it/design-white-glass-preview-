import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

let isMobile = false
vi.mock('@/features/mobile/useIsMobile', () => ({
  useIsMobile: () => isMobile,
}))

// #2451.9 — le composeur LIT désormais le mode par défaut de l'espace au
// montage (`GET /workspaces/laura-mode`, via `apiFetch`). Comme
// `LauraModeSettingsView.test.tsx`, on mock `@/lib/api` — le mock global de
// `apps/web/src/test/setup.ts` rend `{}` pour toute route, ce qui ferait
// silencieusement basculer le mode sur `undefined`.
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const { ContextModeSelector } = await import('./ContextModeSelector')
const { useContextModeStore, contextModeFor } = await import('../contextModeStore')

function renderSelector(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('#2451 / #2453 — ContextModeSelector (« Contexte de travail »)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    isMobile = false
    useContextModeStore.setState({ modes: {}, workspaceDefaultMode: 'my_activity' })
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({ defaultContextMode: 'my_activity', canEdit: false })
  })

  it('#2453.2 — nommé « Contexte de travail », « Mon activité » par défaut', () => {
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    const trigger = screen.getByRole('button', { name: /Contexte de travail : Mon activité/ })
    expect(trigger).toBeInTheDocument()
    expect(screen.queryByText(/user profile/i)).not.toBeInTheDocument()
  })

  it('#2451.4 — le choix décrit chaque mode en phrases, jamais en jargon de modèle', () => {
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Contexte de travail/ }))
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Neutre/ })).toBeInTheDocument()
    expect(screen.getByText(/ni ton profil, ni ton CRM/i)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/sonnet|tool call|token/i)
  })

  it('#2453.1 / #2451.6 — choisir Neutre ne vaut que pour CE fil et n’écrit rien côté serveur', () => {
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Contexte de travail/ }))
    // #2451.9 — le montage a pu LIRE le réglage d'espace (GET) ; ce qu'on
    // prouve ici, c'est que CHOISIR un mode n'appelle jamais une route qui écrit.
    const callsBeforeChoice = apiFetch.mock.calls.length
    fireEvent.click(screen.getByRole('radio', { name: /Neutre/ }))

    const modes = useContextModeStore.getState().modes
    expect(contextModeFor(modes, 'c-1')).toBe('neutral')
    // Une autre conversation (ou une nouvelle) repart sur le défaut.
    expect(contextModeFor(modes, 'c-2')).toBe('my_activity')
    expect(contextModeFor(modes, null)).toBe('my_activity')
    // Aucun appel de plus, et aucun appel qui écrit (PATCH/POST/PUT/DELETE).
    expect(apiFetch.mock.calls.length).toBe(callsBeforeChoice)
    for (const [args] of apiFetch.mock.calls) {
      expect((args as { method?: string }).method ?? 'GET').toBe('GET')
    }
    expect(screen.getByRole('button', { name: /Contexte de travail : Neutre/ })).toBeInTheDocument()
  })

  it('#2451.7 — sur mobile, le choix s’ouvre dans une feuille du bas', () => {
    isMobile = true
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Contexte de travail/ }))
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull()
  })

  it('sur bureau, c’est un popover — le témoin de la feuille du bas', () => {
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Contexte de travail/ }))
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
  })

  it('#3353 (LAU-UI-304) — le déclencheur se voit comme un vrai contrôle, pas comme du texte flottant', () => {
    // Louis, 29/09/2026 (issue #3353) : « un état sélectionné bien visible »,
    // « un menu plus propre ». Le déclencheur était un bouton `ghost` — sans
    // bordure, il se lisait comme un simple libellé au milieu des autres
    // textes de la barre plutôt que comme le contrôle qu'il est. `outline`
    // lui donne le même relief que les autres pastilles du composeur
    // (`ConnectedToolsStrip`, les amorces) — uniformisation demandée par
    // #3356 (LAU-UI-309) sur le même écran.
    renderSelector(<ContextModeSelector conversationId="c-1" />)
    const trigger = screen.getByRole('button', { name: /Contexte de travail/ })
    expect(trigger.className).toMatch(/\bborder\b/)
    expect(trigger.className).toMatch(/rounded-full/)
  })

  it('désactivé pendant un tour en vol', () => {
    renderSelector(<ContextModeSelector conversationId="c-1" disabled />)
    expect(screen.getByRole('button', { name: /Contexte de travail/ })).toBeDisabled()
  })

  it('#2451.9 — le mode réglé par l’espace remplace le défaut figé pour un fil SANS choix explicite', async () => {
    apiFetch.mockResolvedValue({ defaultContextMode: 'neutral', canEdit: false })
    renderSelector(<ContextModeSelector conversationId="c-new" />)

    expect(await screen.findByRole('button', { name: /Contexte de travail : Neutre/ })).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/laura-mode' })
  })

  it('#2451.9 / #2451.6 — un mode déjà choisi pour CE fil garde la priorité sur le réglage d’espace', async () => {
    apiFetch.mockResolvedValue({ defaultContextMode: 'neutral', canEdit: false })
    useContextModeStore.setState({ modes: { 'c-1': 'one_off_mission' }, workspaceDefaultMode: 'my_activity' })
    renderSelector(<ContextModeSelector conversationId="c-1" />)

    // Le fil a déjà un choix explicite : le réglage d'espace ne le rouvre pas,
    // même une fois la lecture du réglage arrivée.
    await screen.findByRole('button', { name: /Contexte de travail/ })
    expect(screen.getByRole('button', { name: /Contexte de travail : Mission ponctuelle/ })).toBeInTheDocument()
  })
})
