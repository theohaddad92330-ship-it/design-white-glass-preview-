import type { DiscoverAlertEvent } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscoverAlertsBlock } from './DiscoverAlertsBlock'

/**
 * #2097.21 (correctif) — mesuré en recette le 25/09 : « Alertes de Découvrir »
 * ne rendait AUCUNE image. On ne peut pas attendre une balise `<img>` —
 * `EntityAvatar` ne la monte qu'une fois l'image chargée, ce qui n'arrive
 * jamais sous jsdom (même limite que `company-lists-show-logos.test.tsx`) —
 * on espionne donc la fonction qui construit l'URL du logo.
 */
const logoRequests: Array<[unknown, unknown]> = []
vi.mock('@/lib/company-logo', () => ({
  companyLogoSrc: (logoUrl: unknown, website: unknown) => {
    logoRequests.push([logoUrl, website])
    return null
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function alert(partial: Partial<DiscoverAlertEvent>): DiscoverAlertEvent {
  return {
    id: 'evt-1',
    kind: 'new_signal',
    subjectId: 'acc-1',
    subjectLabel: 'Thales',
    sourceKind: 'public_information',
    occurredAt: '2026-09-24T08:00:00.000Z',
    surface: 'today',
    savedViewId: null,
    href: '/accounts/acc-1',
    logoUrl: null,
    website: null,
    ...partial,
  }
}

describe('DiscoverAlertsBlock — le logo du compte (#2097.21 correctif)', () => {
  beforeEach(() => {
    logoRequests.length = 0
  })

  it('demande le logo du compte pour une alerte `new_signal`', () => {
    render(<DiscoverAlertsBlock alerts={[alert({ website: 'https://www.thalesgroup.com' })]} lastEventAt={null} />)

    expect(screen.getByText('Thales')).toBeInTheDocument()
    expect(logoRequests).toContainEqual([null, 'https://www.thalesgroup.com'])
  })

  // #2151.19 — un besoin confirmé n'est pas un compte : lui donner un
  // monogramme d'entreprise afficherait une identité qu'on n'a pas mesurée.
  it('ne demande AUCUN logo pour un genre qui n’est pas un compte (`new_confirmed_need`)', () => {
    render(
      <DiscoverAlertsBlock
        alerts={[
          alert({
            id: 'evt-2',
            kind: 'new_confirmed_need',
            subjectId: 'need-1',
            subjectLabel: 'Besoin DevOps',
            href: '/projects/need-1',
          }),
        ]}
        lastEventAt={null}
      />,
    )

    expect(screen.getByText('Besoin DevOps')).toBeInTheDocument()
    expect(logoRequests).toEqual([])
  })
})
