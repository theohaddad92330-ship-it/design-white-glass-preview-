import { cleanup, render, screen } from '@testing-library/react'
import type { ProjectRow } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useLossReasons', () => ({ useLossReasons: () => ({ data: { items: [] } }) }))

import { StageMovePanel } from './StageMovePanel'

afterEach(cleanup)

// #3246 / #3210.3 (lot W9) — stratégie et modèle d'achat se saisissent à la PERTE seulement.
describe('StageMovePanel — stratégie et modèle d’achat à la perte (#3246)', () => {
  const project = { id: 'p-1', stage: 'negotiation' } as ProjectRow

  it('vers « perdu » : deux listes facultatives, nommées', () => {
    render(<StageMovePanel project={project} target="lost" hasMission={false} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getAllByRole('combobox', { name: /Stratégie d’approche/ })).toHaveLength(1)
    expect(screen.getAllByRole('combobox', { name: /Modèle d’achat/ })).toHaveLength(1)
  })

  it('vers une autre étape : aucune des deux listes', () => {
    render(
      <StageMovePanel project={project} target="qualified" hasMission={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    )
    expect(screen.queryByRole('combobox', { name: /Stratégie d’approche/ })).toBeNull()
  })
})
