import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountFactLines } from './AccountFactLines'

// #4072 — un fait = date · TYPE · libellé · lien générique si URL.
describe('AccountFactLines', () => {
  it('rend date absolue · TYPE · libellé, un fait ancien toujours daté', () => {
    render(
      <AccountFactLines
        facts={[
          { date: '2025-08-01', kind: 'need', label: 'Développeur Java senior' },
          { date: '2024-02-15', kind: 'deal_lost', label: 'TMA' },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Développeur Java senior')).toBeTruthy()
    expect(items[0]!.querySelector('time')?.getAttribute('datetime')).toBe('2025-08-01')
    expect(items[0]!.textContent).toMatch(/2025/)
    expect(items[1]!.textContent).toMatch(/2024/)
    expect(items[1]!.textContent).toMatch(/Affaire perdue/i)
  })

  it('une absence ne fait aucune ligne', () => {
    const { container } = render(<AccountFactLines facts={[]} />)
    expect(container.firstChild).toBeNull()
    const undef = render(<AccountFactLines facts={undefined} />)
    expect(undef.container.firstChild).toBeNull()
  })

  it('un lien générique si URL, jamais le domaine ni une provenance', () => {
    render(
      <AccountFactLines
        facts={[{ date: '2026-09-01', kind: 'signal', label: 'Levée', url: 'https://bodacc.example/x' }]}
      />,
    )
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://bodacc.example/x')
    expect(link.textContent).not.toMatch(/bodacc|example/i)
    expect(link.className).toMatch(/min-h-11/)
  })

  it('le lien d’une offre dit « annonce »', () => {
    render(
      <AccountFactLines facts={[{ date: '2026-09-01', kind: 'hiring', label: 'Dev', url: 'https://example.org/o' }]} />,
    )
    expect(screen.getByRole('link').textContent).toMatch(/annonce/i)
  })

  it('ne rend pas plus de lignes que demandé', () => {
    render(
      <AccountFactLines
        max={1}
        facts={[
          { date: '2026-09-01', kind: 'signal', label: 'a' },
          { date: '2026-08-01', kind: 'signal', label: 'b' },
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
