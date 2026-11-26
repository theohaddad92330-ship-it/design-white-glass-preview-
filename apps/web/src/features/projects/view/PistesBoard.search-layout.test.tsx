import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mêmes doublures que PistesBoard.test.tsx : le tableau n'est pas l'objet ici, la barre d'outils l'est.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    hash?: string
  }) => (
    <a
      href={
        (params ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to) : to) +
        (hash ? `#${hash}` : '')
      }
    >
      {children}
    </a>
  ),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../portfolio/view/EmptyStateActions', () => ({
  DiscoverAction: () => <a href="/discover">Découvrir des comptes</a>,
  ImportNeedsAction: () => null,
}))
vi.mock('./CreateProjectDialog', () => ({
  CreateProjectDialog: ({ draft }: { draft: { label: string } }) => <div role="dialog">Brouillon : {draft.label}</div>,
}))

const needsRows = vi.fn()
const detectionsList = vi.fn()
const confirm = vi.fn()
const dismiss = vi.fn()
vi.mock('../portfolio/hooks/useAccountNeeds', () => ({ useAccountNeeds: () => needsRows() }))
vi.mock('../pipeline-detections/api', () => ({
  usePipelineDetections: () => detectionsList(),
  useConfirmPipelineDetection: () => ({ mutate: confirm, isPending: false }),
  useDismissPipelineDetection: () => ({ mutate: dismiss, isPending: false }),
}))

const { PistesBoard } = await import('./PistesBoard')

/**
 * #4503 /signals — le champ de recherche ne recouvre pas « Filtres ».
 *
 * jsdom ne pose aucune mise en page : on lit le mécanisme mesuré en démo (champ 930→1185 px, bouton dès 1105 px). Le champ
 * avait une largeur FIXE (`lg:w-64` = 256 px) dans une boîte `min-w-0` que les voisins écrasaient. Il tient désormais dans
 * sa boîte : largeur relative, boîte à plancher qui passe à la ligne.
 * AVANT : champ 255 px dans une boîte rétrécie à ~175 px → 80 px de chevauchement. APRÈS : champ = largeur de sa boîte (0 px de débord).
 */
const FIXED_WIDTH = /(^|\s)(?:[a-z-]+:)*w-(?:\d+(?:\.\d+)?|\[[^\]]+\]|px)(?=\s|$)/

describe('Pistes — #4503 le champ de recherche et le bouton filtres ne se superposent pas', () => {
  beforeEach(() => {
    needsRows.mockReturnValue({ data: [], isLoading: false, isError: false })
    detectionsList.mockReturnValue({ data: { items: [], autoDetect: 'on' }, isLoading: false })
  })

  it('le champ prend la largeur de sa boîte, à tous les paliers, sans largeur fixe', () => {
    render(<PistesBoard onOpenAccount={vi.fn()} />)
    const input = screen.getByPlaceholderText(/Rechercher un besoin/)
    expect(input.className).toMatch(/(^|\s)w-full(\s|$)/)
    expect(input.className).toMatch(/(^|\s)lg:w-full(\s|$)/)
    expect(input.className, input.className).not.toMatch(FIXED_WIDTH)
  })

  it('la boîte du champ a un plancher et ne se laisse pas écraser à zéro', () => {
    render(<PistesBoard onOpenAccount={vi.fn()} />)
    const box = screen.getByPlaceholderText(/Rechercher un besoin/).parentElement!.parentElement!
    expect(box.className).toMatch(/\bmin-w-40\b/)
    expect(box.className).not.toMatch(/\bmin-w-0\b/)
    // la rangée passe à la ligne plutôt que de comprimer ses enfants
    expect(box.parentElement!.className).toMatch(/\bflex-wrap\b/)
  })

  it('dit NON : la forme d’avant (`w-48 lg:w-64`) est reconnue comme largeur fixe', () => {
    expect('w-48 lg:w-64 h-9 pl-9').toMatch(FIXED_WIDTH)
    expect('lg:w-64').toMatch(FIXED_WIDTH)
    expect('w-full lg:w-full h-9').not.toMatch(FIXED_WIDTH)
  })
})
