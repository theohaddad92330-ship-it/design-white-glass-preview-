/**
 * #3845.1 — un menu/popover Radix sans max-height liée à l'espace Popper
 * disponible se dessine à sa hauteur NATURELLE : sur un viewport bas (le
 * rapport bêta vient d'une fenêtre 1470×698), Radix le pousse côté `top` et
 * son contenu dépasse hors écran (y négatif, mesuré sur le rapport) au lieu
 * de défiler — illisible.
 *
 * Radix Popper pose `--radix-<famille>-content-available-height` en style
 * inline sur CHAQUE Content/SubContent (visible dans le markup du rapport).
 * Il suffit de s'y accrocher en max-height et de remplacer `overflow-hidden`
 * par un scroll interne — la garde tient que `DropdownMenuContent`/
 * `DropdownMenuSubContent`, `ContextMenuContent`/`ContextMenuSubContent` et
 * `PopoverContent` (`packages/ui/src/components/`) le font.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const UI_SRC = join(__dirname, '../../../../packages/ui/src')

function readSource(relPath: string): string {
  return readFileSync(join(UI_SRC, relPath), 'utf8')
}

function clampOccurrences(source: string, family: string): number {
  const re = new RegExp(`max-h-\\[var\\(--radix-${family}-content-available-height\\)\\]`, 'g')
  return (source.match(re) ?? []).length
}

function scrollsInsteadOfClipping(source: string): boolean {
  return /overflow-y-auto/.test(source)
}

describe('GA — les menus et popovers Radix défilent dans l’espace disponible au lieu de déborder hors écran', () => {
  it('DropdownMenuContent et DropdownMenuSubContent (packages/ui/src/components/dropdown-menu.tsx)', () => {
    const source = readSource('components/dropdown-menu.tsx')
    expect(clampOccurrences(source, 'dropdown-menu'), 'Content ET SubContent portent le clamp').toBe(2)
    expect(scrollsInsteadOfClipping(source), 'overflow-y-auto (jamais overflow-hidden seul)').toBe(true)
  })

  it('ContextMenuContent et ContextMenuSubContent (packages/ui/src/components/context-menu.tsx)', () => {
    const source = readSource('components/context-menu.tsx')
    expect(clampOccurrences(source, 'context-menu'), 'Content ET SubContent portent le clamp').toBe(2)
    expect(scrollsInsteadOfClipping(source), 'overflow-y-auto (jamais overflow-hidden seul)').toBe(true)
  })

  it('PopoverContent (packages/ui/src/components/popover.tsx)', () => {
    const source = readSource('components/popover.tsx')
    expect(clampOccurrences(source, 'popover'), 'max-h-[var(--radix-popover-content-available-height)]').toBe(1)
    expect(scrollsInsteadOfClipping(source), 'overflow-y-auto').toBe(true)
  })

  it('SAIT DIRE NON — un contenu sans clamp ni scroll est détecté', () => {
    const snippet = `'z-picker min-w-[8rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md'`
    expect(clampOccurrences(snippet, 'dropdown-menu')).toBe(0)
    expect(scrollsInsteadOfClipping(snippet)).toBe(false)
  })
})
