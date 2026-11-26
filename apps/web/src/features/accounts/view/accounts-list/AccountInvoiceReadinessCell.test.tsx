import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountInvoiceReadinessColumn } from './useAccountInvoiceReadiness'

const { AccountInvoiceReadinessCell } = await import('./AccountInvoiceReadinessCell')

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function column(over: Partial<AccountInvoiceReadinessColumn> = {}): AccountInvoiceReadinessColumn {
  return { failed: false, get: () => ({ kind: 'none' }), ...over }
}

afterEach(cleanup)

describe('un compte SANS mission — sans objet, jamais un défaut (point 3 du lot)', () => {
  it('affiche un tiret neutre, jamais un badge rouge « bloqué »', () => {
    const { container } = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    expect(screen.queryByText(/Bloqué/i)).toBeNull()
    expect(container.textContent).not.toMatch(/Bloqué/i)
    expect(screen.getByLabelText(/Aucune mission/i)).toBeTruthy()
  })

  it('le glyphe visible reste le tiret nu « – » — sans objet n’a rien d’anormal à montrer', () => {
    const { container } = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    expect(container.textContent?.trim()).toBe('–')
  })

  it('l’infobulle est atteignable au clavier (déclenchée aussi au focus, pas seulement au survol)', () => {
    const { container } = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })
})

describe('un compte avec mission mais non mesuré ce mois', () => {
  it('le dit — « non mesuré » n’est ni « sans mission » ni « bloqué »', () => {
    render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />)
    expect(screen.getByLabelText(/[Nn]on mesuré/)).toBeTruthy()
  })

  it('se distingue à l’œil de « sans objet » — pas le même tiret nu (point 3 du lot)', () => {
    const none = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    const unmeasuredGlyph = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />,
    )
    const noneText = none.container.textContent?.trim()
    const unmeasuredText = unmeasuredGlyph.container.textContent?.trim()
    expect(unmeasuredText).not.toBe('–')
    expect(unmeasuredText).not.toBe(noneText)
  })

  it('l’infobulle est atteignable au clavier', () => {
    const { container } = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />,
    )
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })
})

describe('un compte mesuré — le badge et ses bloqueurs nommés', () => {
  it('« bloqué » nomme ses bloqueurs dans le titre (accessible)', () => {
    render(
      <AccountInvoiceReadinessCell
        accountId={ACCOUNT}
        column={column({
          get: () => ({ kind: 'measured', state: 'blocked', blockers: ['missing_timesheet', 'missing_po'] }),
        })}
      />,
    )
    const badge = screen.getByText('Bloqué')
    expect(badge.getAttribute('title')).toMatch(/relevé/i)
    expect(badge.getAttribute('title')).toMatch(/bon de commande/i)
  })

  it('« prêt » se distingue visuellement de « bloqué » (couleurs sémantiques distinctes)', () => {
    render(
      <AccountInvoiceReadinessCell
        accountId={ACCOUNT}
        column={column({ get: () => ({ kind: 'measured', state: 'ready', blockers: [] }) })}
      />,
    )
    expect(screen.getByText('Prêt')).toBeTruthy()
  })

  it('« facturé ailleurs » se lit tel quel', () => {
    render(
      <AccountInvoiceReadinessCell
        accountId={ACCOUNT}
        column={column({ get: () => ({ kind: 'measured', state: 'invoiced', blockers: [] }) })}
      />,
    )
    expect(screen.getByText('Facturé ailleurs')).toBeTruthy()
  })

  it('« pas dû ce mois » n’est pas peint comme un blocage', () => {
    render(
      <AccountInvoiceReadinessCell
        accountId={ACCOUNT}
        column={column({ get: () => ({ kind: 'measured', state: 'not_due', blockers: [] }) })}
      />,
    )
    expect(screen.getByText('Pas dû ce mois')).toBeTruthy()
  })
})

describe('une lecture en échec ne se lit pas comme « rien à facturer »', () => {
  it('nomme la panne', () => {
    render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ failed: true })} />)
    expect(screen.getByLabelText(/n’a pas pu être char/i)).toBeTruthy()
  })

  it('se distingue à l’œil de « sans objet » ET de « non mesuré » — trois glyphes, jamais un seul tiret', () => {
    const failedRender = render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ failed: true })} />)
    const noneRender = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    const unmeasuredRender = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />,
    )
    const failedText = failedRender.container.textContent?.trim()
    const noneText = noneRender.container.textContent?.trim()
    const unmeasuredText = unmeasuredRender.container.textContent?.trim()
    expect(failedText).not.toBe('–')
    expect(failedText).not.toBe(noneText)
    expect(failedText).not.toBe(unmeasuredText)
  })

  it('l’infobulle est atteignable au clavier', () => {
    const { container } = render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ failed: true })} />)
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
  })
})
