import type { Account } from '@bellum/contracts'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountDetailStickyPrimaryAction } from './AccountDetailStickyPrimaryAction'

/**
 * #2117.66 — la barre sticky n'apparaît QUE quand la rangée d'action du hero
 * (`#account-hero-primary-action`) est HORS écran, jamais tant qu'elle est
 * visible : sinon la même action serait montrée deux fois (GA-26).
 */
class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = []
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverMock.instances.push(this)
  }

  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])

  emit(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const account = {
  id: '00000000-0000-0000-0000-0000000000aa',
  company_name: 'ACME Corp',
  website: null,
  siren: null,
  status: 'completed',
  commercial_status: 'opportunity',
  priority_gate: 'prioritised',
  raw_analysis: null,
} as unknown as Account

async function firstObserver(): Promise<IntersectionObserverMock> {
  await waitFor(() => expect(IntersectionObserverMock.instances.length).toBeGreaterThan(0))
  return IntersectionObserverMock.instances[0]!
}

describe('AccountDetailStickyPrimaryAction', () => {
  let sentinel: HTMLDivElement

  beforeEach(() => {
    IntersectionObserverMock.instances = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)
    sentinel = document.createElement('div')
    sentinel.id = 'account-hero-primary-action'
    document.body.appendChild(sentinel)
  })

  afterEach(() => {
    sentinel.remove()
    vi.unstubAllGlobals()
  })

  it("reste muette tant que l'action du hero est visible", async () => {
    renderWithRouter(<AccountDetailStickyPrimaryAction account={account} />, '/accounts/test-id')

    const observer = await firstObserver()
    act(() => observer.emit(true))

    expect(screen.queryByRole('region', { name: 'Action principale du dossier' })).not.toBeInTheDocument()
  })

  it("apparaît avec LE MÊME bouton d'action une fois l'action du hero hors écran", async () => {
    renderWithRouter(<AccountDetailStickyPrimaryAction account={account} />, '/accounts/test-id')

    const observer = await firstObserver()
    act(() => observer.emit(false))

    expect(await screen.findByRole('region', { name: 'Action principale du dossier' })).toBeInTheDocument()
    // #2117.6 — compte "completed" + gate "prioritised" : la branche du hero
    // est "Préparer le plan" (voir AccountDetailHeroPrimaryAction.test.tsx).
    expect(screen.getByRole('button', { name: 'Préparer le plan' })).toBeInTheDocument()
  })

  it('redevient muette si la rangée du hero revient à l’écran', async () => {
    renderWithRouter(<AccountDetailStickyPrimaryAction account={account} />, '/accounts/test-id')

    const observer = await firstObserver()
    act(() => observer.emit(false))
    expect(await screen.findByRole('region', { name: 'Action principale du dossier' })).toBeInTheDocument()

    act(() => observer.emit(true))
    expect(screen.queryByRole('region', { name: 'Action principale du dossier' })).not.toBeInTheDocument()
  })

  it('sans sentinelle du hero dans le document, ne monte aucun observateur ni barre', async () => {
    sentinel.remove()

    render(<AccountDetailStickyPrimaryAction account={account} />)

    // Laisse l'effet passer, s'il devait en monter un.
    await Promise.resolve()

    expect(IntersectionObserverMock.instances).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Action principale du dossier' })).not.toBeInTheDocument()
  })
})
