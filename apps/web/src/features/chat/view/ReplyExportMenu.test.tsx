import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const dataExit = vi.hoisted(() => ({
  value: { allowed: true, grant: {} } as { allowed: boolean; grant: object | null },
}))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit.value }))

const { hasReplyBlocks } = await import('./ReplyExportMenu')
const { ReplyRetryMenu } = await import('./ReplyRetryMenu')

// #5032.15 — « Exporter » vit dans le menu ⋯ du pied : les trois entrées s'y retrouvent, et rien d'autre ne change.
function ReplyExportMenu({ content }: { content: string }) {
  return (
    <ReplyRetryMenu
      exportContent={content}
      accountId={null}
      conversationId={null}
      messageId={null}
      branchOf={null}
      dataOrigin={null}
      retryDisabled={false}
    />
  )
}

const plan = {
  type: 'action_plan',
  title: 'Plan sur deux semaines',
  steps: [{ label: 'Qualifier le besoin cloud', when: 'Cette semaine' }],
}
const content = ['Voici le plan.', '```bellum-block', JSON.stringify(plan), '```'].join('\n')

function clipboardSpy() {
  const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('#3770 — copier / exporter une réponse riche', () => {
  beforeEach(() => {
    dataExit.value = { allowed: true, grant: {} }
  })

  it('ne se propose que pour une réponse à cartes', () => {
    expect(hasReplyBlocks(content)).toBe(true)
    expect(hasReplyBlocks('Juste du texte.')).toBe(false)
  })

  it('la copie structurée garde le titre et les étapes à cocher', async () => {
    const user = userEvent.setup()
    const writeText = clipboardSpy()
    render(<ReplyExportMenu content={content} />)
    await user.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Copier en version structurée' }))
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('## Plan sur deux semaines')
    expect(copied).toContain('- [ ] Qualifier le besoin cloud (Cette semaine)')
    expect(copied).not.toContain('bellum-block')
  })

  it('la version courte ne garde que le titre et le geste', async () => {
    const user = userEvent.setup()
    const writeText = clipboardSpy()
    render(<ReplyExportMenu content={content} />)
    await user.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Copier la version courte' }))
    expect(writeText.mock.calls[0]?.[0]).toContain('**Plan sur deux semaines**')
  })

  it('le fichier suit la règle d’espace : refusée, pas de téléchargement offert', async () => {
    dataExit.value = { allowed: false, grant: null }
    const user = userEvent.setup()
    render(<ReplyExportMenu content={content} />)
    await user.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    expect(await screen.findByRole('menuitem', { name: 'Copier la version courte' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Télécharger/ })).toBeNull()
  })

  /**
   * #3770 Reste (lot K06 07/10) — le geste lui-même n'était PROUVÉ que côté
   * refus (le test ci-dessus) : la règle d'espace masque bien le bouton,
   * mais rien ne vérifiait que « Télécharger en fichier Markdown » déclenche
   * RÉELLEMENT un fichier `.md`, nommé d'après le titre de la carte et
   * porteur de la copie structurée — pas seulement présent à l'écran.
   */
  it('autorisée, « Télécharger en fichier Markdown » déclenche un vrai fichier .md, nommé d’après le titre de la carte', async () => {
    const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:mock-reply-url')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()
    render(<ReplyExportMenu content={content} />)
    await user.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Télécharger en fichier Markdown' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    const written = await blob.text()
    expect(written).toContain('## Plan sur deux semaines')
    expect(written).toContain('- [ ] Qualifier le besoin cloud (Cette semaine)')
    expect(written).not.toContain('bellum-block')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    // Le lien PORTE le fichier au moment du clic (`a.download`, pas un attribut lu après coup).
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement
    expect(anchor.download).toBe('plan-sur-deux-semaines.md')
    expect(anchor.href).toBe('blob:mock-reply-url')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-reply-url')

    clickSpy.mockRestore()
  })
})
