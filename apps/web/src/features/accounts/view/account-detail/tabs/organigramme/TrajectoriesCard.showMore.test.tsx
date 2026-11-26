import type { Contact } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { TrajectoriesCard } from './TrajectoriesCard'

// #3592 — « les 10 plus importants, le reste tombe en voir plus » : sur 1 965
// contacts la carte faisait 2 572 px de haut. Chaque trajectoire montre ses 10
// premiers (déjà triés par priorité) ; le reste est replié derrière « Voir plus (N) ».
function contact(index: number): Contact {
  return {
    id: `c-${index}`,
    full_name: `Contact ${String(index).padStart(2, '0')}`,
    title: 'Directeur',
    decision_role: 'economic',
    priority: index,
  } as unknown as Contact
}

describe('TrajectoriesCard — 10 plus importants au total puis « Voir plus » (#3592)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('borne la carte entière à 10 lignes, sans perdre le reste', async () => {
    const contacts = Array.from({ length: 56 }, (_, i) => contact(i + 1))
    render(<TrajectoriesCard contacts={contacts} />)
    const card = screen.getByText('Trajectoires commerciales').closest('[data-slot="card"]') as HTMLElement
    const rows = () => within(card).getAllByRole('listitem').length
    expect(rows()).toBe(10)
    const more = within(card).getAllByRole('button', { name: /Voir plus/ })
    expect(more).toHaveLength(1)
    const hidden = Number(/\((\d+)\)/.exec(more[0]!.textContent ?? '')?.[1])
    await userEvent.click(more[0]!)
    expect(rows()).toBe(10 + hidden)
    await userEvent.click(within(card).getByRole('button', { name: 'Voir moins' }))
    expect(rows()).toBe(10)
  })

  it('ne montre aucun bouton quand 10 lignes ou moins', () => {
    render(<TrajectoriesCard contacts={Array.from({ length: 3 }, (_, i) => contact(i + 1))} />)
    expect(screen.queryByRole('button', { name: /Voir plus/ })).toBeNull()
  })
})
