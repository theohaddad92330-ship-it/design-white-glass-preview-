import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemoryLedgerEntry } from '@bellum/contracts'

/**
 * #1962.2/.5/.7/.9/.10 — CHAQUE ÉLÉMENT PORTE L'ÉTIQUETTE DE SA NATURE.
 *
 * Sept natures sont écrites en base depuis ce lot. Sans étiquette à l'écran,
 * elles ne changeraient RIEN pour la personne : une hypothèse à vérifier se
 * lirait exactement comme un fait constaté, sur la même ligne, dans la même
 * section. L'étiquette est l'appelant de l'enum.
 *
 * `fact` ne porte PAS d'étiquette : c'était la nature de tout élément avant
 * #1962, et l'écrire sur chaque ligne ajouterait du bruit sans rien apprendre.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useUpdateFact: () => ({ mutate: vi.fn(), isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

const { MemoryFactRow } = await import('./MemoryFactRow')

function fact(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'f-1',
    layer: 'facts',
    text: 'Ils internalisent leur data',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: null,
    ...over,
  }
}

function renderRow(entry: MemoryLedgerEntry) {
  return render(
    <MemoryFactRow entry={entry} onForget={vi.fn()} forgetting={false} onSetScope={vi.fn()} settingScope={false} />,
  )
}

describe('MemoryFactRow — l’étiquette de nature (#1962)', () => {
  it('une observation sourcée le dit (#1962.7)', () => {
    renderRow(fact({ kind: 'sourced_observation' }))
    expect(screen.getByText('Observation sourcée')).toBeInTheDocument()
  })

  it('une hypothèse le dit (#1962.9/.15)', () => {
    renderRow(fact({ kind: 'hypothesis' }))
    expect(screen.getByText('Hypothèse à vérifier')).toBeInTheDocument()
  })

  it('un contexte temporaire le dit, même sans date (#1962.10)', () => {
    renderRow(fact({ kind: 'temporary_context' }))
    expect(screen.getByText('Contexte temporaire')).toBeInTheDocument()
  })

  it('une règle d’ESN le dit (#1962.5)', () => {
    renderRow(fact({ kind: 'workspace_rule', scope: 'workspace' }))
    expect(screen.getByText('Règle d’ESN')).toBeInTheDocument()
  })

  it('une préférence et une correction gardent leur nom (#1962.6)', () => {
    renderRow(fact({ kind: 'correction' }))
    expect(screen.getByText('Correction terrain')).toBeInTheDocument()
  })

  it('un objectif le dit (#2260.17)', () => {
    renderRow(fact({ kind: 'goal' }))
    expect(screen.getByText('Objectif')).toBeInTheDocument()
  })

  /**
   * Le témoin de ce que la garde N'ATTRAPE PAS : un fait, la nature de tout
   * élément avant #1962, ne porte pas d'étiquette — et une API plus ancienne
   * qui ne sert pas la nature n'en fait pas apparaître une devinée.
   */
  it('un fait n’affiche AUCUNE étiquette de nature — ni un élément servi sans nature', () => {
    const { container: withFact } = renderRow(fact({ kind: 'fact' }))
    expect(withFact.textContent ?? '').not.toMatch(/Observation sourcée|Hypothèse|Contexte temporaire|Règle d’ESN/)
    const { container: without } = renderRow(fact({ kind: undefined }))
    expect(without.textContent ?? '').not.toMatch(/Observation sourcée|Hypothèse|Contexte temporaire|Règle d’ESN/)
  })

  /**
   * #1962.9 — une hypothèse n'est pas un fait déclaré, et la ligne « pourquoi
   * elle pèse » doit le dire : sinon l'écran promet à la personne que Laura la
   * respecte « en priorité », ce que le prompt ne fait justement plus.
   */
  it('une hypothèse dit qu’elle éclaire sans trancher, jamais « respectée en priorité »', () => {
    const { container } = renderRow(fact({ kind: 'hypothesis' }))
    expect(screen.getByText(/ne tranche pas/)).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/en priorité/)
  })
})
