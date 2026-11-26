import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Le lien est une navigation : on lit ce qu'il PORTE (cible + recherche), sans routeur réel.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) => (
    <a href={`${to}${search && Object.keys(search).length ? `?${new URLSearchParams(search)}` : ''}`}>{children}</a>
  ),
}))

const { DiscoverQuickPresetsDialog } = await import('./DiscoverQuickPresetsDialog')

/** #4285.3 — l'entrée « technologie » de Découvrir pré-remplit le radar avec ce qui est déjà tapé. */
describe('DiscoverQuickPresetsDialog — entrée radar (#4285.3)', () => {
  it('pré-remplit le radar avec la technologie suivie déjà tapée', () => {
    render(
      <DiscoverQuickPresetsDialog open onOpenChange={() => {}} onApply={() => {}} presets={[]} radarTechnology="SAP" />,
    )
    const link = screen.getAllByRole('link').find(a => a.getAttribute('href')?.startsWith('/discover/radar'))
    expect(link?.getAttribute('href')).toBe('/discover/radar?technology=SAP')
    expect(link?.textContent).toContain('SAP')
  })

  it('NON : sans technologie, le radar s’ouvre vide, comme avant', () => {
    render(<DiscoverQuickPresetsDialog open onOpenChange={() => {}} onApply={() => {}} presets={[]} />)
    const link = screen.getAllByRole('link').find(a => a.getAttribute('href')?.startsWith('/discover/radar'))
    expect(link?.getAttribute('href')).toBe('/discover/radar')
  })
})
