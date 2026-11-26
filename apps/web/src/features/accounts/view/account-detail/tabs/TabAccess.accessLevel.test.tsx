import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess } from './TabAccess'

/**
 * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS SE NOMME : direct / rang 2 /
 * inconnu / rang 3+. Un ÉTAT, jamais une probabilité (doctrine refusée six
 * fois) : cette carte ne sert donc qu'un badge et sa raison, aucun chiffre.
 *
 * L'API dérive `accessLevel` (`AccountAccessService.landscape`, `@bellum/contracts`
 * `accountAccessLevel`) ; cet onglet le LIT, il ne le recalcule jamais.
 */

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

function landscape(accessLevel: string, accessLevelFact: unknown = null): Landscape {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    accessLevel,
    accessLevelFact,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('l’onglet Accès nomme l’accès au compte (#2646.1)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('affiche `rang 3 ou plus` — rang 1 concurrent en place, aucun partenaire déclaré', async () => {
    apiFetchMock.mockResolvedValue(landscape('rang3_plus'))
    mount()

    expect(await screen.findByText('Rang 3 ou plus')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Un rang 1 concurrent est en place et aucun partenaire n’est déclaré sur ce compte — pas de porte connue aujourd’hui.',
      ),
    ).toBeInTheDocument()
  })

  it('affiche `Accès direct` quand aucun rang 1 n’est en place', async () => {
    apiFetchMock.mockResolvedValue(landscape('direct'))
    mount()

    expect(await screen.findByText('Accès direct')).toBeInTheDocument()
  })

  it('affiche `Accès inconnu` — jamais `rang 3 ou plus` par défaut (GA-18/GA-19)', async () => {
    apiFetchMock.mockResolvedValue(landscape('inconnu'))
    mount()

    expect(await screen.findByText('Accès inconnu')).toBeInTheDocument()
    expect(screen.queryByText('Rang 3 ou plus')).not.toBeInTheDocument()
  })

  it('n’affiche aucune PROBABILITÉ — refusée six fois dans ce produit', async () => {
    apiFetchMock.mockResolvedValue(landscape('rang2'))
    const { container } = mount()

    await screen.findByText('Accès en rang 2')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/%/)
    expect(text).not.toMatch(/chance|probabilit/i)
  })

  it('nomme le FAIT qui fonde `rang3_plus` — l’entité verrouillée, sans partenaire (#2646.1, corrigé le 21/09/2026)', async () => {
    apiFetchMock.mockResolvedValue(landscape('rang3_plus', { kind: 'incumbent_without_partner', entities: ['DSI'] }))
    mount()

    expect(await screen.findByText('Rang 3 ou plus')).toBeInTheDocument()
    expect(screen.getByText('Fondé sur DSI : un rang 1 y est en place, sans partenaire déclaré.')).toBeInTheDocument()
  })

  it('nomme l’entité ET le partenaire qui fondent `rang2`', async () => {
    apiFetchMock.mockResolvedValue(
      landscape('rang2', { kind: 'incumbent_with_partner', entities: ['DSI'], partner: 'Sopra' }),
    )
    mount()

    expect(await screen.findByText('Accès en rang 2')).toBeInTheDocument()
    expect(
      screen.getByText('Fondé sur DSI : un rang 1 y est en place, et Sopra y est déclaré partenaire.'),
    ).toBeInTheDocument()
  })

  it('n’invente AUCUNE raison pour `inconnu` — le fait est `null`, rien ne se rend en plus de l’aide générique', async () => {
    apiFetchMock.mockResolvedValue(landscape('inconnu', null))
    mount()

    expect(await screen.findByText('Accès inconnu')).toBeInTheDocument()
    expect(screen.queryByText(/Fondé sur/)).not.toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais — la parité, pas la bonne volonté', () => {
    const paths = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
            paths(value, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix]

    const fr = paths(accessFr.level).sort()
    const en = paths(accessEn.level).sort()
    expect(fr.length).toBeGreaterThanOrEqual(8)
    expect(en).toEqual(fr)
  })
})
