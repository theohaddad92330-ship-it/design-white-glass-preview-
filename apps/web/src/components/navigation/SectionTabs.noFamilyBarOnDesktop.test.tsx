import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #3585.2 — la barre de FAMILLE de Comptes (Comptes / Contacts / Mes cibles /
 * Découvrir) disparaît sur DESKTOP : ces pages sont dans la barre latérale.
 * Sur mobile elle reste, seule porte au doigt vers Contacts / Mes cibles /
 * Découvrir (la coque mobile n'a que quatre onglets).
 */

let isMobile = false
let currentPathname = '/accounts'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => currentPathname,
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'owner' } } }),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => isMobile }))
vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: vi.fn() }))
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

describe('SectionTabs — la barre de FAMILLE Comptes reste mobile ; sur desktop, chaque section porte SES onglets (#4491.2)', () => {
  // Revient sur #3585.2 (décision Louis 24/10, #4491.2) : sur desktop, Comptes, Contacts et Signaux sont des
  // entrées de la barre latérale ; chacune porte en haut SES onglets V22, jamais ceux de ses voisines.
  it('desktop : Comptes porte Portefeuille · Mes listes de cibles · Marché, sans Contacts ni Signaux', () => {
    isMobile = false
    currentPathname = '/accounts'
    render(<SectionTabs />)
    expect(screen.getByText('Portefeuille')).toBeInTheDocument()
    expect(screen.getByText('Mes listes de cibles')).toBeInTheDocument()
    expect(screen.getByText('Marché')).toBeInTheDocument()
    expect(screen.queryByText('Contacts')).not.toBeInTheDocument()
    expect(screen.queryByText('Signaux')).not.toBeInTheDocument()
  })

  it.each(['/contacts', '/signals', '/discover'])('desktop : aucune barre de famille sur %s', path => {
    isMobile = false
    currentPathname = path
    render(<SectionTabs />)
    expect(screen.queryByText('Portefeuille')).not.toBeInTheDocument()
    expect(screen.queryByText('Signaux')).not.toBeInTheDocument()
  })

  it.each(['/accounts', '/contacts', '/signals', '/discover'])(
    'mobile : la barre reste sur %s (seule porte vers ces pages)',
    path => {
      isMobile = true
      currentPathname = path
      render(<SectionTabs />)
      expect(screen.getByText('Contacts')).toBeInTheDocument()
      expect(screen.getByText('Signaux')).toBeInTheDocument()
      expect(screen.getByText('Découvrir')).toBeInTheDocument()
    },
  )

  it('mobile : la barre de Comptes ne porte plus « Mémoire collective » (lien retiré, #3661)', () => {
    isMobile = true
    currentPathname = '/accounts'
    render(<SectionTabs />)
    expect(screen.queryByText('Mémoire collective')).not.toBeInTheDocument()
  })

  it('une AUTRE section garde sa barre sur desktop (Missions, avec Prêt à facturer)', () => {
    isMobile = false
    currentPathname = '/missions/facturation'
    render(<SectionTabs />)
    expect(screen.getByText('Prêt à facturer')).toBeInTheDocument()
    // #4158.10 (Louis 14/10) — Équipe n'est plus un onglet de Pilotage ; Théo D (22/10) — Pilotage n'a
    // plus d'onglets du tout, ses sections sont des ancres dans la page.
    expect(screen.queryByText('Équipe')).not.toBeInTheDocument()
  })
})
