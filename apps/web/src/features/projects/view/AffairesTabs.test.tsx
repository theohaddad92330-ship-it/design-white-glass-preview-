import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import { i18n } from '@/i18n'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: { children: ReactNode; to: string; search?: Record<string, string> }) => (
    <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to} {...rest}>
      {children}
    </a>
  ),
}))

const { AffairesTabs } = await import('./AffairesTabs')

afterEach(cleanup)

async function renderTabs(active: 'pipeline' | 'needs' | 'presentations') {
  await i18n.loadNamespaces('projects')
  render(
    <I18nextProvider i18n={i18n}>
      <AffairesTabs active={active} />
    </I18nextProvider>,
  )
}

describe('Affaires — les trois onglets de la maquette Théo (Pipeline · Besoins · Présentations)', () => {
  it('chaque onglet est un lien vers son écran existant, sans route neuve', async () => {
    await renderTabs('pipeline')
    expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/projects')
    // #4499 — le lien profond nommé : l'URL nue redirige vers le Pipe (F1-FIX #4344), l'onglet ne doit pas y boucler.
    expect(screen.getByRole('link', { name: 'Besoins' })).toHaveAttribute('href', '/projects/needs?onglet=besoins')
    expect(screen.getByRole('link', { name: 'Présentations' })).toHaveAttribute('href', '/projects/presentations')
  })

  it.each([
    ['pipeline', 'Pipeline'],
    ['needs', 'Besoins'],
    ['presentations', 'Présentations'],
  ] as const)("l'onglet actif (%s) est le seul annoncé comme page courante", async (active, name) => {
    await renderTabs(active)
    const current = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent(name)
  })
})
