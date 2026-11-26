import { render, screen, within } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { ChatResponseContext } from './ContextDisclosure'

/**
 * #4016.L3.a — « Laura a lu ce fil » : une ligne sous la réponse, à l'AUTEUR du
 * tour seulement, qui dit le fait et jamais le corps. Sans lecture : rien.
 */
vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')

function context(toolsCalled: string[]): ChatResponseContext {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [],
    not_consulted: [],
    reasoning_trace: { tools_called: toolsCalled },
  }
}

function footer(toolsCalled: string[], ownTurn?: boolean) {
  return render(
    <ReplyFooter
      context={context(toolsCalled)}
      text="Il t'attend sur le budget."
      accountId={null}
      timestamp={null}
      ownTurn={ownTurn}
    />,
  )
}

function footerWithRouter(toolsCalled: string[], ownTurn: boolean) {
  return renderWithRouter(
    <ReplyFooter
      context={context(toolsCalled)}
      text="Il t'attend sur le budget."
      accountId={null}
      timestamp={null}
      ownTurn={ownTurn}
    />,
  )
}

describe('ReplyFooter — « Laura a lu ce fil » (#4016.L3.a)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  // #5032.9 — la version inline part : la mention n'apparaît QUE panneau Sources ouvert.
  it('le dit à l’auteur du tour dans le panneau seulement, sans exposer le moindre contenu du fil', async () => {
    const user = userEvent.setup()
    const { container } = footerWithRouter(['search_mailbox', 'read_mail_thread'], true)
    expect(container.querySelector('[data-mailbox-read]')).toBeNull()
    expect(screen.queryByText('Laura a lu ce fil')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(container.querySelector('[data-mailbox-read-source]')?.textContent).toMatch(/a lu un fil de ta messagerie/)
  })

  it('dit la même chose en anglais, dans le panneau', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    const { container } = footerWithRouter(['read_mail_thread'], true)
    await user.click(await screen.findByRole('button', { name: /^(Sources|Context)$/ }))
    expect(container.querySelector('[data-mailbox-read-source]')).not.toBeNull()
  })

  it('sait dire NON : un collègue (tour qui n’est pas le sien), ou aucune lecture de fil', () => {
    const colleague = footer(['read_mail_thread'], false)
    expect(screen.queryByText('Laura a lu ce fil')).not.toBeInTheDocument()
    colleague.unmount()
    const defaultProp = footer(['read_mail_thread'])
    expect(screen.queryByText('Laura a lu ce fil')).not.toBeInTheDocument()
    defaultProp.unmount()
    footer(['search_mailbox'], true)
    expect(screen.queryByText('Laura a lu ce fil')).not.toBeInTheDocument()
  })

  // #4016.3c — la mention vit aussi dans le panneau « Voir la source ».
  it('figure dans « Voir la source » pour l’auteur du tour, sans contenu de fil', async () => {
    const user = userEvent.setup()
    const { container } = footerWithRouter(['read_mail_thread'], true)
    expect(container.querySelector('[data-mailbox-read-source]')).toBeNull()
    await user.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    const line = container.querySelector('[data-mailbox-read-source]')
    expect(line?.textContent).toMatch(/a lu un fil de ta messagerie/)
    expect(within(container).getAllByText(/a lu/).length).toBe(1)
  })

  it('sait dire NON dans le panneau : collègue ou aucune lecture de fil', async () => {
    const user = userEvent.setup()
    const colleague = footerWithRouter(['read_mail_thread'], false)
    await user.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(colleague.container.querySelector('[data-mailbox-read-source]')).toBeNull()
    colleague.unmount()
    const none = footerWithRouter(['search_mailbox'], true)
    await user.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(none.container.querySelector('[data-mailbox-read-source]')).toBeNull()
  })
})
