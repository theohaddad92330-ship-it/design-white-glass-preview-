import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: { id: string } }) => (
    <a href={to.replace('$id', params?.id ?? '')}>{children}</a>
  ),
}))

const { TalentObjectives } = await import('./TalentObjectives')

afterEach(cleanup)

// Théo C talents-fiche.N1 — deux objectifs distincts en tête de fiche.
describe('TalentObjectives — deux objectifs distincts', () => {
  it('« Comparer les besoins » ouvre la comparaison de la fiche', async () => {
    const onCompareNeeds = vi.fn()
    render(<TalentObjectives talentId="t-1" onCompareNeeds={onCompareNeeds} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Comparer les besoins/ }))
    expect(onCompareNeeds).toHaveBeenCalledTimes(1)
  })

  it('« Explorer les comptes » est un LIEN vers la page des comptes du talent', () => {
    render(<TalentObjectives talentId="t-1" onCompareNeeds={vi.fn()} />)
    const link = screen.getByRole('link', { name: /Explorer les comptes/ })
    expect(link.getAttribute('href')).toBe('/consultants/t-1/reverse-market')
  })

  it('dit pourquoi deux objectifs, sans promettre de besoin ni de mission', () => {
    render(<TalentObjectives talentId="t-1" onCompareNeeds={vi.fn()} />)
    expect(screen.getByText(/répondre à un besoin connu ou explorer des comptes compatibles/i)).toBeTruthy()
  })
})
