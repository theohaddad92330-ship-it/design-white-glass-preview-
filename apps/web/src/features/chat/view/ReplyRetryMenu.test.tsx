import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReplyRetryMenu } from './ReplyRetryMenu'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function clipboardSpy() {
  const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /plus d.actions/i }))
}

/**
 * #1953.5 / #1953.6 / #1953.7 / #1953.9 / #1953.10 / #1953.11 / #1953.13
 *
 * Les cinq actions REPLIÉES derrière un déclencheur nommé (GA-30 : cinq boutons
 * côte à côte sous une bulle passeraient sous 44 px sur téléphone) — chacune un
 * `<button>` réel (GA-35), jamais un `<div onClick>`.
 */
describe('ReplyRetryMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  const baseProps = {
    text: 'Voici ce que je propose pour ce compte.',
    accountId: 'acc-1',
    conversationId: 'conv-9',
    messageId: 'msg-42',
    branchOf: null,
    dataOrigin: null,
    onRetry: vi.fn(),
    onEditLastMessage: vi.fn(),
    onAlternativeAngle: vi.fn(),
    retryDisabled: false,
  }

  it('le déclencheur porte un nom accessible (GA-32) et le menu est fermé par défaut', () => {
    render(<ReplyRetryMenu {...baseProps} />)
    expect(screen.getByRole('button', { name: /plus d.actions/i })).toBeInTheDocument()
    expect(screen.queryByText(/réessayer/i)).not.toBeInTheDocument()
  })

  it('#1953.5 — « Réessayer » appelle `onRetry`', async () => {
    const onRetry = vi.fn()
    render(<ReplyRetryMenu {...baseProps} onRetry={onRetry} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('#1953.6 / #1953.11 — « Modifier ma demande » appelle `onEditLastMessage`', async () => {
    const onEditLastMessage = vi.fn()
    render(<ReplyRetryMenu {...baseProps} onEditLastMessage={onEditLastMessage} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: /modifier ma demande/i }))
    expect(onEditLastMessage).toHaveBeenCalledTimes(1)
  })

  it('#1953.7 — « Répondre avec un autre angle » appelle `onAlternativeAngle`', async () => {
    const onAlternativeAngle = vi.fn()
    render(<ReplyRetryMenu {...baseProps} onAlternativeAngle={onAlternativeAngle} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: /autre angle/i }))
    expect(onAlternativeAngle).toHaveBeenCalledTimes(1)
  })

  it('#1953.13 — un tour en vol désactive réessayer / modifier / autre angle', async () => {
    render(<ReplyRetryMenu {...baseProps} retryDisabled />)
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: /réessayer/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /modifier ma demande/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /autre angle/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('#1953.9 — « Partager cette réponse » copie un lien qui porte le `messageId`', async () => {
    const writeText = clipboardSpy()
    render(<ReplyRetryMenu {...baseProps} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: /partager cette réponse/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toContain('messageId=msg-42')
  })

  it('#5032.15 — « Signaler un problème » ouvre le retour sur la réponse (revient sur #1953.10 : plus de signalement pré-rempli)', async () => {
    const onReport = vi.fn()
    render(<ReplyRetryMenu {...baseProps} onReport={onReport} />)
    await openMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: /signaler un problème/i }))
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  it('#5032.15 — sans `onReport`, aucune entrée « Signaler » ; sans reprise possible, ni Réessayer ni Modifier ni Autre angle', async () => {
    render(
      <ReplyRetryMenu
        accountId={null}
        conversationId={null}
        messageId={null}
        branchOf={null}
        dataOrigin={null}
        retryDisabled={false}
      />,
    )
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: /partager cette réponse/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /signaler un problème/i })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /réessayer/i })).toBeNull()
  })
})

/**
 * #2435.4 — SUR TÉLÉPHONE, LES MÊMES ACTIONS S'OUVRENT EN TIROIR DU BAS.
 *
 * Le `DropdownMenu` (Radix, ancré au bouton) fonctionne mais laisse le menu
 * flotter n'importe où sur un écran étroit — ni la cible tactile ni la
 * position n'y sont pensées pour le pouce. `Sheet` (`packages/ui`,
 * `side="bottom"`) est la primitive déjà utilisée ailleurs pour ce patron
 * (`ConversationsDrawer.tsx`).
 */
describe('ReplyRetryMenu — bottom sheet mobile (#2435.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  function stubMatchMedia(narrow: boolean): void {
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

  afterEach(() => vi.unstubAllGlobals())

  const baseProps = {
    text: 'Voici ce que je propose pour ce compte.',
    accountId: 'acc-1',
    conversationId: 'conv-9',
    messageId: 'msg-42',
    branchOf: null,
    dataOrigin: null,
    onRetry: vi.fn(),
    onEditLastMessage: vi.fn(),
    onAlternativeAngle: vi.fn(),
    retryDisabled: false,
  }

  it('le déclencheur ouvre un tiroir ancré en bas (pas un menu flottant)', async () => {
    stubMatchMedia(true)
    render(<ReplyRetryMenu {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /plus d.actions/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })

  it('« Réessayer » depuis le tiroir appelle `onRetry` ET referme le tiroir', async () => {
    stubMatchMedia(true)
    const onRetry = vi.fn()
    render(<ReplyRetryMenu {...baseProps} onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /plus d.actions/i }))
    await userEvent.click(await screen.findByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sur bureau, le déclencheur ouvre bien le menu Radix (pas un tiroir)', async () => {
    stubMatchMedia(false)
    render(<ReplyRetryMenu {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /plus d.actions/i }))
    expect(await screen.findByRole('menuitem', { name: /réessayer/i })).toBeInTheDocument()
  })
})
