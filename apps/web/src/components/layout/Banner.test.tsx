import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Info } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { Banner, bannerActionClassName } from './Banner'

/**
 * THEO-REFONTE-COMPOSANTS — la grammaire `.t-banner` des maquettes appliquées, tenue à un endroit.
 */
describe('Banner — la forme `.t-banner`', () => {
  it('une carte : titre AU-DESSUS de la phrase, gestes à droite, croix nommée', () => {
    const onDismiss = vi.fn()
    render(
      <Banner
        tone="warning"
        icon={Info}
        title="Analyse en cours · Airbus"
        actions={<button type="button">Suivre</button>}
        onDismiss={onDismiss}
        dismissLabel="Masquer"
      >
        Étape 3 sur 5
      </Banner>,
    )
    const card = screen.getByRole('status')
    expect(card.className).toContain('rounded-card')
    expect(card.className).toContain('bg-[var(--warning-soft-bg)]')
    const title = screen.getByText('Analyse en cours · Airbus')
    expect(title.tagName).toBe('STRONG')
    const body = screen.getByText('Étape 3 sur 5')
    // L'ordre se lit dans le DOM : titre, puis phrase, puis le geste, puis la croix.
    const order = [
      title,
      body,
      screen.getByRole('button', { name: 'Suivre' }),
      screen.getByRole('button', { name: 'Masquer' }),
    ]
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(title.parentElement?.className).toContain('flex-col')
  })

  it('neutre = la surface de carte, pas un aplat', () => {
    render(<Banner title="Neutre" />)
    expect(screen.getByRole('status').className).toContain('bg-[var(--bellum-surface-1)]')
  })

  it('trois placements, une seule forme : `page` et `app` enveloppent la carte d’une gouttière, `card` non', () => {
    const { rerender } = render(<Banner title="T" />)
    expect(screen.getByRole('status').parentElement?.className).toContain('md:px-6')
    rerender(<Banner layout="app" title="T" />)
    expect(screen.getByRole('status').parentElement?.className).toContain('px-3')
    rerender(
      <div data-testid="host">
        <Banner layout="card" title="T" />
      </div>,
    )
    expect(screen.getByRole('status').parentElement).toBe(screen.getByTestId('host'))
  })

  it('un geste de bandeau garde 44 px au doigt et le texte principal', () => {
    const className = bannerActionClassName('danger')
    expect(className).toContain('pointer-coarse:min-h-11')
    expect(className).toContain('text-[var(--bellum-text-primary)]')
  })
})

/**
 * La garde : chaque bandeau du produit passe par `Banner`. Elle LIT les fichiers ; elle dit NON à un bandeau
 * qui repeint sa couleur en ligne (`style={{ background… }}`) ou qui oublie la primitive.
 */
const BANNER_FILES = [
  'components/layout/DemoModeBanner.tsx',
  'components/page/OnboardingRefreshBanner.tsx',
  'components/page/ReturnToConversationBanner.tsx',
  'components/access/CapabilityBanner.tsx',
  'features/banners/BannerBar.tsx',
  'features/auth/components/SessionUnavailableBanner.tsx',
  'features/billing/components/CheckoutReturnBanner.tsx',
  'features/billing/components/NoLicenseBanner.tsx',
  'features/billing/components/SubscribePromoBanner.tsx',
  'features/impersonation/ImpersonationBanner.tsx',
  'features/impersonation/WorkspaceImpersonationNotice.tsx',
  'features/mobile/InstallPromptBanner.tsx',
  'features/onboarding/components/WelcomeRedesignBanner.tsx',
] as const

const SRC = resolve(__dirname, '../..')

describe('garde — une seule grammaire de bandeau', () => {
  it.each(BANNER_FILES)('%s rend `<Banner`, sans couleur peinte en ligne', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8')
    expect(source).toMatch(/<Banner\b/)
    expect(source).not.toMatch(/style=\{\{[^}]*background/)
    expect(source).not.toMatch(/bg-amber-|bg-yellow-|bg-red-\d/)
  })

  it('sait dire NON : un bandeau peint à la main est attrapé', () => {
    const fake = `<div role="status" style={{ background: 'var(--warning-soft-bg)' }}>x</div>`
    expect(fake).not.toMatch(/<Banner\b/)
    expect(fake).toMatch(/style=\{\{[^}]*background/)
  })
})
