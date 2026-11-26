import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PLAN_FEATURE_KEYS, type RouteAccess } from '@bellum/contracts'
import { i18n } from '@/i18n'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { CapabilityBanner } = await import('./CapabilityBanner')

// PLAN-GATE #4381 — « Ce qui manque : talent_pool » : une clé technique brute
// affichée à Hamdi (EXTEAM). Le bandeau nomme la FONCTION, dans la langue de
// l'interface, pour TOUTES les clés de palier — et ne retombe jamais sur le code.
describe('PLAN-GATE #4381 — le bandeau nomme ce qui manque, jamais une clé brute', () => {
  const locked = (key: string): RouteAccess => ({ state: 'plan_locked', missing: [key] })

  it('nomme le Vivier en clair (FR)', async () => {
    await i18n.changeLanguage('fr')
    render(<CapabilityBanner access={locked('talent_pool')} />)

    expect(screen.getByText('Ce qui manque : le Vivier de talents')).toBeInTheDocument()
    expect(screen.queryByText(/talent_pool/)).not.toBeInTheDocument()
  })

  it.each(['fr', 'en'])('chaque clé de palier a un libellé lisible (%s)', async lang => {
    await i18n.changeLanguage(lang)
    for (const key of PLAN_FEATURE_KEYS) {
      const { unmount } = render(<CapabilityBanner access={locked(key)} />)
      const text = screen.getByText(/^(Ce qui manque|Missing) ?: /, { exact: false }).textContent ?? ''
      expect(text.replace(/^[^:]+: /, ''), `${key} (${lang})`).not.toBe(key)
      expect(text, `${key} (${lang})`).not.toMatch(/[a-z]+_[a-z]+/)
      unmount()
    }
    await i18n.changeLanguage('fr')
  })

  it('SAIT DIRE NON : une clé sans libellé ne s’affiche pas brute', async () => {
    await i18n.changeLanguage('fr')
    render(<CapabilityBanner access={locked('fonction_inventee')} />)

    expect(screen.queryByText(/fonction_inventee/)).not.toBeInTheDocument()
    expect(screen.getByText('Ce qui manque : une fonction de ton offre')).toBeInTheDocument()
  })

  it('une permission manquante ne montre pas son code non plus', async () => {
    await i18n.changeLanguage('fr')
    render(<CapabilityBanner access={{ state: 'permission', missing: ['finance:read'] }} />)

    expect(screen.queryByText(/finance:read/)).not.toBeInTheDocument()
  })
})
