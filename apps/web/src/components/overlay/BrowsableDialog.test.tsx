import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ElementType, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

/**
 * ⚠️ Le Proxy MÉMORISE ses composants — sans ce cache, chaque accès à
 * `motion.div` rend une closure NEUVE : React démonte le sous-arbre à chaque
 * rendu et le test devient aveugle à toute interaction qui change un état.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const cached = motionComponents.get(prop)
        if (cached) return cached
        const Rendered = ({ children }: { children?: ReactNode } & Record<string, unknown>) => {
          const Component = prop as ElementType
          return <Component>{children}</Component>
        }
        motionComponents.set(prop, Rendered)
        return Rendered
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}))

const { BrowsableDialog } = await import('./BrowsableDialog')

const LIST = ['Nordia', 'Verlaine', 'Ostreim']

function Harness({
  onIndexChange = vi.fn(),
  onOpenChange = vi.fn(),
  index = 0,
  open = true,
}: {
  onIndexChange?: (index: number) => void
  onOpenChange?: (open: boolean) => void
  index?: number
  open?: boolean
}) {
  return (
    <BrowsableDialog
      open={open}
      onOpenChange={onOpenChange}
      index={index}
      total={LIST.length}
      onIndexChange={onIndexChange}
      contentKey={LIST[index] ?? 'none'}
      title={LIST[index] ?? ''}
      subtitle="Services"
      description="Le détail de l’élément choisi."
      labels={{ previous: 'Compte précédent', next: 'Compte suivant' }}
    >
      <p>Détail de {LIST[index]}</p>
    </BrowsableDialog>
  )
}

describe('BrowsableDialog — parcourir une liste sans refermer', () => {
  it('n’existe pas tant que rien n’est choisi — c’est TOUT le sujet de #1797', () => {
    render(<Harness open={false} />)
    // Compté AVANT toute ouverture : après, Radix pose `aria-hidden` sur le
    // reste de la page et un test qui compte alors peut se croire vert en ne
    // comptant rien.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText(/Détail de/)).toBeNull()
  })

  it('ouverte, elle porte son titre, son rang et le détail de l’élément', () => {
    render(<Harness index={1} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Verlaine')).toBeInTheDocument()
    expect(within(dialog).getByText('2 sur 3')).toBeInTheDocument()
    expect(within(dialog).getByText(/Détail de Verlaine/)).toBeInTheDocument()
  })

  it('les flèches sont des boutons NOMMÉS — pas des icônes muettes (GA-32)', () => {
    render(<Harness index={1} />)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Compte précédent' })).toHaveAttribute('type', 'button')
    expect(dialog.getByRole('button', { name: 'Compte suivant' })).toHaveAttribute('type', 'button')
  })

  it('« suivant » avance d’un rang, « précédent » recule d’un rang', async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    render(<Harness index={1} onIndexChange={onIndexChange} />)

    await user.click(screen.getByRole('button', { name: 'Compte suivant' }))
    expect(onIndexChange).toHaveBeenLastCalledWith(2)

    await user.click(screen.getByRole('button', { name: 'Compte précédent' }))
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
  })

  it('sait dire NON aux deux bouts : aucune flèche ne sort de la liste', async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    const { rerender } = render(<Harness index={0} onIndexChange={onIndexChange} />)

    const previous = screen.getByRole('button', { name: 'Compte précédent' })
    expect(previous).toBeDisabled()
    await user.click(previous)
    expect(onIndexChange).not.toHaveBeenCalled()

    rerender(<Harness index={2} onIndexChange={onIndexChange} />)
    const next = screen.getByRole('button', { name: 'Compte suivant' })
    expect(next).toBeDisabled()
    await user.click(next)
    expect(onIndexChange).not.toHaveBeenCalled()
  })

  it('les flèches du clavier parcourent la liste, comme les boutons', async () => {
    const user = userEvent.setup()
    const onIndexChange = vi.fn()
    render(<Harness index={1} onIndexChange={onIndexChange} />)

    await user.keyboard('{ArrowRight}')
    expect(onIndexChange).toHaveBeenLastCalledWith(2)

    await user.keyboard('{ArrowLeft}')
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
  })

  it('Échap referme', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Harness index={0} onOpenChange={onOpenChange} />)

    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('le focus ENTRE dans la modale — il ne reste pas sur la page derrière', () => {
    render(<Harness index={1} />)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  it('le rang s’annonce quand il change — un lecteur d’écran suit la navigation', () => {
    render(<Harness index={1} />)
    expect(screen.getByText('2 sur 3')).toHaveAttribute('aria-live', 'polite')
  })
})
