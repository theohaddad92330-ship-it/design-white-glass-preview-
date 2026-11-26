import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScopeButton } from './ScopeButton'
import { NO_ACCOUNT_SCOPE, PORTFOLIO_SCOPE, type ChatScope } from './chat-scope'

/**
 * #1910.9 — LE NOM ACCESSIBLE DIT CE QUE LAURA LIT, PAS LE MOT DE CODE.
 *
 * Le libellé VISIBLE du bouton était déjà en langage métier (le nom du compte,
 * « Tout mon portefeuille », « Sans compte ») : c'est son `aria-label` —
 * entendu au lecteur d'écran, jamais lu à l'œil — qui disait « Changer la
 * portée », un mot de code. `scope` et `ChatScope` restent inchangés partout
 * ailleurs dans ce fichier : seule la PHRASE change.
 */
describe('ScopeButton — #1951.2 / #1951.3 un consultant, un besoin', () => {
  it('nomme le consultant sur lequel le fil est cadré', () => {
    render(
      <ScopeButton
        scope={{ kind: 'consultant', consultantId: 'c-1', label: 'Sophie Martin' }}
        accounts={[]}
        portfolioCount={5}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /ce que laura lit/i })).toHaveTextContent('Sophie Martin')
  })

  it('nomme le besoin, et retombe sur « Un besoin » plutôt qu’un identifiant', () => {
    const { unmount } = render(
      <ScopeButton
        scope={{ kind: 'need', needId: 'n-1', label: 'Data engineer · SNCF' }}
        accounts={[]}
        portfolioCount={5}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /ce que laura lit/i })).toHaveTextContent('Data engineer · SNCF')
    unmount()
    render(
      <ScopeButton
        scope={{ kind: 'need', needId: 'n-1', label: null }}
        accounts={[]}
        portfolioCount={5}
        onOpen={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /ce que laura lit/i })
    expect(button).toHaveTextContent('Un besoin')
    expect(button).not.toHaveTextContent('n-1')
  })

  it('ne dit jamais « tout le portefeuille » quand le fil est cadré sur un consultant', () => {
    render(
      <ScopeButton
        scope={{ kind: 'consultant', consultantId: 'c-1', label: null }}
        accounts={[]}
        portfolioCount={5}
        onOpen={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /ce que laura lit/i })
    expect(button).toHaveTextContent('Un consultant')
    expect(button).not.toHaveTextContent(/portefeuille/i)
  })
})

describe('ScopeButton — #1910.9 le nom accessible parle métier', () => {
  it('le nom accessible dit ce que Laura lit, jamais le mot « portée »', () => {
    render(<ScopeButton scope={PORTFOLIO_SCOPE} accounts={[]} portfolioCount={5} onOpen={vi.fn()} />)
    const bouton = screen.getByRole('button', { name: /ce que laura lit/i })
    expect(bouton.getAttribute('aria-label')?.toLowerCase()).not.toContain('portée')
  })

  it('le même bouton reste utilisable quelle que soit la portée choisie', () => {
    const scopes: ChatScope[] = [PORTFOLIO_SCOPE, NO_ACCOUNT_SCOPE, { kind: 'account', accountId: 'a1' }]
    for (const scope of scopes) {
      const { unmount } = render(<ScopeButton scope={scope} accounts={[]} portfolioCount={5} onOpen={vi.fn()} />)
      expect(screen.getByRole('button', { name: /ce que laura lit/i })).toBeInTheDocument()
      unmount()
    }
  })
})

/**
 * #4944 — /chat mobile 390 px : le bouton « Changer ce que Laura lit » était écrasé à 16 px
 * (libellé 0 px, icônes qui débordent). Sans navigateur ici, la garde pose ce qui l'empêche :
 * un plancher de 44 px qui ne cède jamais sa largeur (GA-35), et un libellé qui s'efface au
 * profit du seul nom accessible quand la place manque (sous `sm`), au lieu d'être écrasé.
 */
describe('ScopeButton — #4944 jamais écrasé dans l’en-tête étroit', () => {
  it('garde un plancher de 44 px et ne cède pas sa largeur', () => {
    render(<ScopeButton scope={PORTFOLIO_SCOPE} accounts={[]} portfolioCount={5} onOpen={vi.fn()} />)
    const bouton = screen.getByRole('button', { name: /ce que laura lit/i })
    expect(bouton.className).toContain('min-w-11')
    expect(bouton.className).toContain('shrink-0')
  })

  it('même avec le min-w-0 que l’en-tête passait, le plancher reste (la dernière classe ne le retire pas)', () => {
    render(
      <ScopeButton
        scope={PORTFOLIO_SCOPE}
        accounts={[]}
        portfolioCount={5}
        onOpen={vi.fn()}
        className="min-h-0 pointer-coarse:min-h-11"
      />,
    )
    expect(screen.getByRole('button', { name: /ce que laura lit/i }).className).toContain('min-w-11')
  })

  it('sous 768 px le libellé reste lu (lecteur d’écran) mais ne prend plus de place', () => {
    render(<ScopeButton scope={PORTFOLIO_SCOPE} accounts={[]} portfolioCount={5} onOpen={vi.fn()} />)
    const bouton = screen.getByRole('button', { name: /ce que laura lit/i })
    expect(bouton.querySelector('span.max-md\\:sr-only')).not.toBeNull()
    expect(bouton).toHaveTextContent(/tout mon espace/i)
  })
})
